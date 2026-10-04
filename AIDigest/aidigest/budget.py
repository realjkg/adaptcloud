"""One absolute deadline per DAILY run and per TASK (PR review 4177765160, 4177765211).

The deadline is taken when the run starts. Every step - readiness, the claim or task-row insert
(including its advisory-lock wait), the run itself and the final status recording - gets only the
time that is left. A slice at the end (`reserve`) is kept back for recording a failure, so even a
run that used up its working time can still mark itself failed before the budget ends.

Two layers enforce it:
  * client side: `run_within` runs each step as a task and waits for it with a timeout. At the
    deadline the step is cancelled and ABANDONED: its cleanup is not awaited. When the database
    freezes at TCP level, SQLAlchemy's shielded close and asyncpg's cancel request can take a long
    time, and awaiting them would make the budget meaningless (review of ae012a0, M1). The abandoned
    connection is closed and handed back to the pool within aidigest.db.ABANDONED_RELEASE_SECONDS;
  * DB side: `db_tx` opens every transaction with `SET LOCAL statement_timeout` a little below the
    time left, and `lock_timeout` a little below that (so a lock wait is reported as such), so
    Postgres itself ends a lock wait or a slow statement and the backend does not stay queued.
A DB-side timeout (SQLSTATE 55P03 lock_not_available, 57014 query_canceled) counts as the budget
running out only when it arrives at the budget's own deadline (within ATTRIBUTION_SECONDS of it);
earlier ones - an operator's pg_cancel_backend - and any TimeoutError raised inside a step (e.g. a
connect timeout) keep their own error (review of ae012a0, L6). Limit: an operator cancel landing in
those last ATTRIBUTION_SECONDS (0.5 s) is reported as the deadline.
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
# Postgres gives up this much before the client-side deadline, so its error (with the SQLSTATE that
# says what ran out) arrives before the client abandons the step, even on a loaded machine ...
DB_MARGIN_SECONDS = 0.25
LOCK_EARLIER_SECONDS = 0.1   # ... and a lock wait this much earlier still (55P03, not 57014)
ATTRIBUTION_SECONDS = 0.5  # a DB timeout this close to the deadline (or later) is the budget's own
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


def _abandon(task: asyncio.Future) -> None:
    """Cancel without waiting for the cleanup; retrieve whatever it ends with (no warnings)."""
    task.cancel()
    task.add_done_callback(lambda t: t.cancelled() or t.exception())


async def run_within(budget: Budget, step: Awaitable[Any], what: str, *, reserve: bool = False) -> Any:
    """Run `step` in the time left (incl. the reserved slice if `reserve`); DeadlineError otherwise.
    Returns at the deadline even if the step's cleanup hangs (it is abandoned, not awaited)."""
    timeout = budget.left(reserve)
    if timeout <= 0:
        if asyncio.iscoroutine(step):
            step.close()   # never started
        raise DeadlineError(f"Time budget of {budget.seconds:g}s exhausted before {what}")
    task = asyncio.ensure_future(step)
    try:
        done, _ = await asyncio.wait({task}, timeout=timeout)
    except asyncio.CancelledError:
        _abandon(task)
        raise
    if not done:
        _abandon(task)
        raise DeadlineError(f"Time budget of {budget.seconds:g}s exhausted during {what}")
    if task.cancelled():
        raise asyncio.CancelledError()
    exc = task.exception()
    if exc is None:
        return task.result()
    if isinstance(exc, DBAPIError) and is_db_timeout(exc) and budget.left(reserve) <= ATTRIBUTION_SECONDS:
        raise DeadlineError(f"Time budget of {budget.seconds:g}s exhausted during {what} (database)") from exc
    raise exc


@contextlib.asynccontextmanager
async def db_tx(engine, budget: Budget | None, *, reserve: bool = False) -> AsyncIterator[Any]:
    """A transaction whose lock waits and statements end before the budget does.
    Without a budget (endpoints, the lease heartbeat) it is a plain transaction."""
    async with engine.begin() as conn:
        if budget is not None:
            left = budget.left(reserve)
            statement_ms = max(2, int((left - DB_MARGIN_SECONDS) * 1000))
            lock_ms = max(1, statement_ms - int(LOCK_EARLIER_SECONDS * 1000))
            # is_local=true: SET LOCAL, gone at COMMIT/ROLLBACK (the pooled session is reused)
            await conn.execute(text("SELECT set_config('lock_timeout', :lock, true), "
                                    "set_config('statement_timeout', :stmt, true)"),
                               {"lock": f"{lock_ms}ms", "stmt": f"{statement_ms}ms"})
        yield conn
