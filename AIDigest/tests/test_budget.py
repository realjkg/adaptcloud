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
        with pytest.raises(DeadlineError):
            await run_within(budget, wait_for_lock(), "test step")
        waiting = (await holder.execute(text(
            "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted"))).scalar()
        await holder.execute(text("SELECT pg_advisory_unlock_all()"))
    assert waiting == 0   # the waiting backend is gone, not left queued behind the lock


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
