"""PR review 4177765160/4177765211: one absolute deadline per run, DB-side timeouts inside it."""

import asyncio
import re

import pytest
from sqlalchemy import text


def _ms(setting: str) -> float:
    value, unit = re.fullmatch(r"(\d+)(ms|s|min)?", setting).groups()
    return int(value) * {"ms": 1, "s": 1000, "min": 60_000, None: 1}[unit]


async def test_db_tx_sets_local_timeouts_that_fit_the_remaining_budget(engine):
    from aidigest.budget import Budget, db_tx
    budget = Budget(2.0)
    async with db_tx(engine, budget) as conn:
        lock = (await conn.execute(text("SELECT current_setting('lock_timeout')"))).scalar()
        stmt = (await conn.execute(text("SELECT current_setting('statement_timeout')"))).scalar()
    for value in (lock, stmt):
        assert 0 < _ms(value) <= 2000 * (1 - 0) - 1, value
        assert _ms(value) <= budget.work_left() * 1000 + 50, value
    async with engine.connect() as conn:   # SET LOCAL: nothing leaks into the next transaction
        assert (await conn.execute(text("SELECT current_setting('lock_timeout')"))).scalar() == "0"


async def test_db_tx_without_budget_sets_nothing(engine):
    from aidigest.budget import db_tx
    async with db_tx(engine, None) as conn:
        assert (await conn.execute(text("SELECT current_setting('statement_timeout')"))).scalar() == "0"


async def test_db_side_lock_timeout_ends_a_lock_wait_as_a_deadline(engine):
    """The DB ends the wait itself (lock_timeout), before the client-side deadline, and it is
    reported as the budget running out."""
    from aidigest.budget import Budget, db_tx, run_within
    from aidigest.errors import DeadlineError
    async with engine.connect() as holder:
        await holder.execute(text("SELECT pg_advisory_lock(42)"))

        async def wait_for_lock():
            async with db_tx(engine, budget) as conn:
                await conn.execute(text("SELECT pg_advisory_xact_lock(42)"))

        budget = Budget(1.0)
        with pytest.raises(DeadlineError) as excinfo:
            await run_within(budget, wait_for_lock(), "test step")
        waiting = (await holder.execute(text(
            "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted"))).scalar()
        await holder.execute(text("SELECT pg_advisory_unlock_all()"))
    assert waiting == 0   # the waiting backend is gone, not left queued behind the lock
    # Review of ae012a0, L1: Postgres itself ended the wait (55P03 lock_not_available in the cause),
    # i.e. the DB-side lock_timeout fired before the client-side deadline.
    from aidigest.budget import is_db_timeout
    assert is_db_timeout(excinfo.value.__cause__), repr(excinfo.value.__cause__)
    assert excinfo.value.__cause__.orig.sqlstate == "55P03"


def test_budget_reserves_a_slice_for_recording_failure():
    from aidigest.budget import Budget
    big, small = Budget(900.0), Budget(1.0)
    assert big.reserve == 5.0 and 0 < small.reserve <= 0.5
    assert big.work_left() <= 900.0 - 5.0 + 0.01


async def test_expired_budget_raises_without_running_the_step():
    from aidigest.budget import Budget, run_within
    from aidigest.errors import DeadlineError
    budget = Budget(0.01)
    await asyncio.sleep(0.05)
    ran = []

    async def step():
        ran.append(1)

    with pytest.raises(DeadlineError):
        await run_within(budget, step(), "late step")
    assert ran == []


# ── Review of ae012a0, M2: the timeouts are transaction-local on a REUSED pooled connection ──
async def test_db_tx_timeouts_do_not_leak_into_the_next_transaction_on_the_same_session(pg_url, engine):
    """Production uses a QueuePool: a session-level (non-LOCAL) timeout would stay on the connection
    and cut short whatever runs on it next. One pooled connection, two transactions, same backend."""
    from sqlalchemy.ext.asyncio import create_async_engine

    from aidigest.budget import Budget, db_tx
    pooled = create_async_engine(pg_url, pool_size=1, max_overflow=0)
    try:
        async with db_tx(pooled, Budget(5.0)) as conn:
            pid_inside = (await conn.execute(text("SELECT pg_backend_pid()"))).scalar()
            inside = (await conn.execute(text("SELECT current_setting('lock_timeout')"))).scalar()
        async with pooled.connect() as conn:
            pid_after = (await conn.execute(text("SELECT pg_backend_pid()"))).scalar()
            after = [(await conn.execute(text(f"SELECT current_setting('{name}')"))).scalar()
                     for name in ("lock_timeout", "statement_timeout")]
    finally:
        await pooled.dispose()
    assert pid_inside == pid_after, "not the same pooled session: the test proves nothing"
    assert inside != "0"
    assert after == ["0", "0"], after


# ── Review of ae012a0, L6: only the budget's own timeout becomes a DeadlineError ──
async def test_a_timeout_raised_inside_a_step_is_not_the_budget():
    """E.g. an asyncpg connect timeout: it keeps its own type (and status), it is not a deadline."""
    from aidigest.budget import Budget, run_within

    async def step():
        raise TimeoutError("connect timed out")

    with pytest.raises(TimeoutError, match="connect timed out"):
        await run_within(Budget(30.0), step(), "connecting")


async def test_an_operator_cancel_is_not_the_budget(engine):
    """pg_cancel_backend by an operator (57014, long before our deadline) keeps its own error."""
    from sqlalchemy.exc import DBAPIError

    from aidigest.budget import Budget, db_tx, run_within
    from aidigest.errors import DeadlineError
    budget = Budget(30.0)
    pid = asyncio.get_running_loop().create_future()

    async def step():
        async with db_tx(engine, budget) as conn:
            pid.set_result((await conn.execute(text("SELECT pg_backend_pid()"))).scalar())
            await conn.execute(text("SELECT pg_sleep(20)"))

    async def operator():
        target = await pid
        await asyncio.sleep(0.3)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT pg_cancel_backend(:p)"), {"p": target})

    cancel = asyncio.create_task(operator())
    with pytest.raises(DBAPIError) as excinfo:
        await run_within(budget, step(), "a long statement")
    await cancel
    assert not isinstance(excinfo.value, DeadlineError)
    assert excinfo.value.orig.sqlstate == "57014"


async def test_our_own_statement_timeout_is_the_budget(engine):
    from aidigest.budget import Budget, db_tx, is_db_timeout, run_within
    from aidigest.errors import DeadlineError
    budget = Budget(1.0)

    async def step():
        async with db_tx(engine, budget) as conn:
            await conn.execute(text("SELECT pg_sleep(5)"))

    with pytest.raises(DeadlineError) as excinfo:
        await run_within(budget, step(), "a long statement")
    assert is_db_timeout(excinfo.value.__cause__) and excinfo.value.__cause__.orig.sqlstate == "57014"
