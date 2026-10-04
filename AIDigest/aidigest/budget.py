"""One absolute deadline per DAILY run and per TASK (PR review 4177765160, 4177765211).

The deadline is taken when the run starts. Every step - readiness, the claim or task-row insert
(including its advisory-lock wait), the run itself and the final status recording - gets only the
time that is left. A slice at the end (`reserve`) is kept back for recording a failure, so even a
run that used up its working time can still mark itself failed before the budget ends.

Two layers enforce it:
  * client side: `run_within` wraps each step in `asyncio.wait_for` (a DB that never answers);
  * DB side: `db_tx` opens every transaction with `SET LOCAL lock_timeout` and `statement_timeout`
    a little below the time left, so a lock wait or a slow statement is ended by Postgres itself
    and the backend does not stay queued behind the lock.
A DB-side timeout (SQLSTATE 55P03 lock_not_available, 57014 query_canceled) is reported as the
budget running out (DeadlineError), like the client-side one.
"""

from __future__ import annotations

import asyncio
import contextlib
import time
from typing import Any, AsyncIterator, Awaitable

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from aidigest.errors import DeadlineError

RESERVE_SECONDS = 5.0      # kept back for recording a failure (at most half the budget)
DB_MARGIN_SECONDS = 0.1    # Postgres gives up this much before the client-side deadline
TIMEOUT_SQLSTATES = frozenset({"55P03", "57014"})


class Budget:
    def __init__(self, seconds: float):
        self.seconds = seconds
        self.reserve = min(RESERVE_SECONDS, seconds / 2)
        self.deadline = time.monotonic() + seconds

    def remaining(self) -> float:
        """Time until the absolute deadline."""
        return max(0.0, self.deadline - time.monotonic())

    def work_left(self) -> float:
        """Time for normal steps: everything but the reserved slice."""
        return max(0.0, self.remaining() - self.reserve)

    def left(self, reserve: bool) -> float:
        return self.remaining() if reserve else self.work_left()


def is_db_timeout(exc: BaseException) -> bool:
    """A lock_timeout / statement_timeout raised by Postgres (through SQLAlchemy's DBAPIError)."""
    seen: BaseException | None = exc
    for _ in range(4):
        if seen is None:
            return False
        if getattr(seen, "sqlstate", None) in TIMEOUT_SQLSTATES:
            return True
        seen = getattr(seen, "orig", None) or seen.__cause__
    return False


async def run_within(budget: Budget, step: Awaitable[Any], what: str, *, reserve: bool = False) -> Any:
    """Run `step` in the time left (incl. the reserved slice if `reserve`); DeadlineError otherwise."""
    timeout = budget.left(reserve)
    if timeout <= 0:
        if asyncio.iscoroutine(step):
            step.close()   # never started
        raise DeadlineError(f"Time budget of {budget.seconds:g}s exhausted before {what}")
    try:
        return await asyncio.wait_for(step, timeout)
    except TimeoutError as exc:
        raise DeadlineError(f"Time budget of {budget.seconds:g}s exhausted during {what}") from exc
    except DBAPIError as exc:
        if is_db_timeout(exc):
            raise DeadlineError(f"Time budget of {budget.seconds:g}s exhausted during {what} (database)") from exc
        raise


@contextlib.asynccontextmanager
async def db_tx(engine, budget: Budget | None, *, reserve: bool = False) -> AsyncIterator[Any]:
    """A transaction whose lock waits and statements end before the budget does.
    Without a budget (endpoints, the lease heartbeat) it is a plain transaction."""
    async with engine.begin() as conn:
        if budget is not None:
            ms = max(1, int((budget.left(reserve) - DB_MARGIN_SECONDS) * 1000))
            await conn.execute(text("SELECT set_config('lock_timeout', :v, true), "
                                    "set_config('statement_timeout', :v, true)"), {"v": f"{ms}ms"})
        yield conn
