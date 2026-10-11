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
Limits (review of d23075f, L-1, L-2): the timeouts are per statement and set once, at the start of
the transaction, from the time left then; a later transaction of the same run gets fresh values from
the time left at ITS start, so an abandoned backend can outlive the deadline by up to about one budget
(it is ended by the idle-in-transaction timeout above, or by its own statement timeout). A
network that is frozen at TCP level can keep an abandoned connection - and an advisory lock it holds -
until idle_in_transaction_session_timeout fires on the server or TCP gives up on the client; new
requests meanwhile hit lock_timeout and get a 504. Also, DAILY's final `finally` waits for its
heartbeat at most HEARTBEAT_STOP_SECONDS and never past the deadline (review of 432f908), so a DAILY
call returns within the budget plus only the scheduling slack, like a TASK call.
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
IDLE_IN_TX_GRACE_SECONDS = 1.0   # a transaction idle this long past the time left is abandoned: Postgres ends it
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


def db_timeouts_ms(left: float) -> tuple[int, int, int]:
    """(lock_timeout, statement_timeout, idle_in_transaction_session_timeout) in ms for `left` seconds.
    The floors keep both timeouts above 0 (0 means unlimited in Postgres) and non-negative however little
    time is left."""
    statement_ms = max(2, int((left - DB_MARGIN_SECONDS) * 1000))
    lock_ms = max(1, statement_ms - int(LOCK_EARLIER_SECONDS * 1000))
    # An abandoned step leaves its transaction open on a connection nobody will use again; if
    # the network is frozen it cannot even be closed. Postgres ends it itself (releasing its
    # advisory locks) once it has been idle past the time left plus a grace period.
    idle_ms = int((left + IDLE_IN_TX_GRACE_SECONDS) * 1000)
    return lock_ms, statement_ms, idle_ms


@contextlib.asynccontextmanager
async def db_tx(engine, budget: Budget | None, *, reserve: bool = False) -> AsyncIterator[Any]:
    """A transaction whose lock waits and statements end before the budget does.
    Without a budget (endpoints, the lease heartbeat) it is a plain transaction."""
    async with engine.begin() as conn:
        if budget is not None:
            lock_ms, statement_ms, idle_ms = db_timeouts_ms(budget.left(reserve))
            # is_local=true: SET LOCAL, gone at COMMIT/ROLLBACK (the pooled session is reused)
            await conn.execute(text("SELECT set_config('lock_timeout', :lock, true), "
                                    "set_config('statement_timeout', :stmt, true), "
                                    "set_config('idle_in_transaction_session_timeout', :idle, true)"),
                               {"lock": f"{lock_ms}ms", "stmt": f"{statement_ms}ms", "idle": f"{idle_ms}ms"})
        yield conn
