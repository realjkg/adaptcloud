"""Review of d23075f, M-1: the reserved slice and the timeout floors have killing tests.

Once the working time is spent, the failure record still has to run: db_tx(reserve=True) keeps the
statement timeout close to the time that is left, and never lets it reach 0 (= unlimited) or go
negative, however little is left. A trigger adds ~50 ms of latency to the failure-record write; with
reserve=False the 2 ms floor would cancel it and the row would stay `running`.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from tests.fakes import FakeAI, FakeFetcher

SLEEP = 0.05          # latency the trigger adds to the failure-record write


def _budget_in_reserve(seconds: float = 2.0, remaining: float = 0.9):
    """A Budget whose working time is spent (work_left == 0) with `remaining` seconds to the deadline."""
    from aidigest.budget import Budget
    budget = Budget(seconds)
    budget.deadline = time.monotonic() + remaining
    assert budget.work_left() == 0 and 0 < budget.remaining() <= remaining
    return budget


async def _timeouts(engine, budget, reserve):
    """(lock ms, statement ms, left-before ms, left-after ms): what db_tx sends to Postgres, read from
    the statement it executes (a SELECT inside a 2 ms transaction could itself time out on a loaded
    machine). set_config runs before the timeouts apply, so Postgres still validates every value."""
    from sqlalchemy import event

    from aidigest.budget import db_tx
    sent: list = []
    sync = engine.sync_engine

    def capture(conn, cursor, statement, parameters, context, executemany):
        if "set_config('lock_timeout'" in statement:
            sent.append(parameters)
    event.listen(sync, "before_cursor_execute", capture)
    try:
        before = budget.left(reserve) * 1000
        async with db_tx(engine, budget, reserve=reserve):
            pass
        after = budget.left(reserve) * 1000
    finally:
        event.remove(sync, "before_cursor_execute", capture)
    assert len(sent) == 1, sent
    lock, stmt, _idle = (_ms(v) for v in sent[0])
    return lock, stmt, before, after


def _ms(setting: str) -> int:
    import re
    value, unit = re.fullmatch(r"(\d+)(ms|s|min)?", setting).groups()
    return int(value) * {"ms": 1, "s": 1000, "min": 60_000, None: 1}[unit]


# ── the floors: never 0 (unlimited), never negative, however little time is left ──────────
@pytest.mark.parametrize("reserve", [True, False])
@pytest.mark.parametrize("remaining", [0.2, 0.05, 0.0])
async def test_db_tx_timeouts_keep_a_positive_floor_when_almost_no_time_is_left(engine, reserve, remaining):
    from aidigest.budget import Budget
    budget = Budget(0.4)
    budget.deadline = time.monotonic() + remaining
    lock, stmt, _, _ = await _timeouts(engine, budget, reserve)
    assert stmt >= 2, f"statement_timeout {stmt} ms: 0 would mean unlimited"
    assert 1 <= lock < stmt, (lock, stmt)


# ── the reserve flag: the reserved slice is usable for reserve=True and not otherwise ─────
async def test_db_tx_reserve_true_uses_the_whole_time_left_minus_the_margin(engine):
    from aidigest.budget import DB_MARGIN_SECONDS, LOCK_EARLIER_SECONDS
    budget = _budget_in_reserve(2.0, 0.9)
    lock, stmt, before, after = await _timeouts(engine, budget, reserve=True)
    margin = DB_MARGIN_SECONDS * 1000
    assert after - margin - 1 <= stmt <= before - margin, (stmt, before, after)     # ~650 ms
    assert abs((stmt - lock) - LOCK_EARLIER_SECONDS * 1000) <= 1, (lock, stmt)


async def test_db_tx_reserve_false_cannot_use_the_reserved_slice(engine):
    budget = _budget_in_reserve(2.0, 0.9)
    lock, stmt, _, _ = await _timeouts(engine, budget, reserve=False)
    assert stmt == 2 and lock == 1, (lock, stmt)                          # only the floors are left


async def test_db_tx_timeouts_are_the_margin_below_the_working_time(engine):
    from aidigest.budget import DB_MARGIN_SECONDS, LOCK_EARLIER_SECONDS, Budget
    budget = Budget(4.0)                                                  # reserve 2 s, work ~2 s
    lock, stmt, before, after = await _timeouts(engine, budget, reserve=False)
    margin = DB_MARGIN_SECONDS * 1000
    assert after - margin - 1 <= stmt <= before - margin, (stmt, before, after)
    assert lock < stmt and abs((stmt - lock) - LOCK_EARLIER_SECONDS * 1000) <= 1, (lock, stmt)


# ── a failure record that is slow on the DB must still land, from inside the reserved slice ──
SLOW_TRIGGER = [   # one statement per execute (asyncpg prepares each)
    "CREATE FUNCTION aidigest.slow_write() RETURNS trigger LANGUAGE plpgsql AS "
    "$$ BEGIN PERFORM pg_sleep({sleep}); RETURN NEW; END $$",
    "CREATE TRIGGER slow_failed_runs BEFORE UPDATE OR INSERT ON aidigest.runs FOR EACH ROW "
    "WHEN (NEW.status IN ('failed', 'schema_not_ready')) EXECUTE FUNCTION aidigest.slow_write()",
    "CREATE TRIGGER slow_failed_tasks BEFORE UPDATE ON aidigest.tasks FOR EACH ROW "
    "WHEN (NEW.status = 'failed') EXECUTE FUNCTION aidigest.slow_write()",
]


@pytest.fixture
async def slow_failure_writes(engine):
    async with engine.begin() as conn:
        for statement in SLOW_TRIGGER:
            await conn.execute(text(statement.replace("{sleep}", str(SLEEP))))


async def _scalar(engine, sql, **params):
    async with engine.connect() as conn:
        return (await conn.execute(text(sql), params)).scalar()


async def test_mark_failed_lands_when_the_work_slice_is_spent_and_the_db_is_slow(engine, slow_failure_writes):
    from aidigest.daily import _finish_failed
    run_id, owner = str(uuid.uuid4()), "owner-token"
    async with engine.begin() as conn:
        await conn.execute(text(
            "INSERT INTO aidigest.runs (id, kind, run_key, trigger, status, owner, lease_until, created_at) "
            "VALUES (:id, 'daily', 'daily:2026-01-01', 'operator', 'running', :o, now() + interval '1 hour', now())"),
            {"id": run_id, "o": owner})
    await _finish_failed(engine, run_id, owner, "boom", _budget_in_reserve())
    assert await _scalar(engine, "SELECT status FROM aidigest.runs WHERE id=:id", id=run_id) == "failed"


async def test_record_not_ready_lands_when_the_work_slice_is_spent_and_the_db_is_slow(engine, slow_failure_writes):
    from aidigest.daily import _record_not_ready
    await _record_not_ready(engine, "daily:2026-01-01", "operator", datetime.now(timezone.utc), ["knowledge"],
                            _budget_in_reserve())
    assert await _scalar(engine, "SELECT count(*) FROM aidigest.runs WHERE status='schema_not_ready'") == 1


async def test_abandon_task_row_lands_when_the_work_slice_is_spent_and_the_db_is_slow(engine, slow_failure_writes):
    from aidigest.tasks import _abandon_task_row
    task_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(text(
            "INSERT INTO aidigest.tasks (id, requested_by, request_text, mode, status, created_at) "
            "VALUES (:id, 'op', 'x', 'knowledge', 'running', now())"), {"id": task_id})
    await _abandon_task_row(engine, task_id, "op", _budget_in_reserve())
    assert await _scalar(engine, "SELECT status FROM aidigest.tasks WHERE id=:id", id=task_id) == "failed"


async def test_a_task_that_runs_out_of_work_time_is_recorded_failed_even_if_the_db_is_slow(engine, slow_failure_writes):
    """End to end: the AI call outlasts the working time; the failure record uses the reserved slice."""
    from aidigest.errors import DeadlineError
    from aidigest.tasks import TaskConfig, TaskRequest, run_task

    async def hang():
        await asyncio.sleep(30)

    with pytest.raises(DeadlineError):
        await run_task(engine, FakeAI(on_call=hang), FakeFetcher(), "operator@adapt.cloud",
                       TaskRequest(task="Summarize this knowledge"), TaskConfig(budget_seconds=2.0))
    rows = (await _scalar(engine, "SELECT string_agg(status, ',') FROM aidigest.tasks"))
    assert rows == "failed", rows
