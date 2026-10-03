"""In-process scheduler (replaces the Cron trigger). Finding 10."""

import asyncio
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from aidigest.scheduler import next_run_after, scheduler_loop

UTC = timezone.utc


@pytest.mark.parametrize(
    "now, expected",
    [
        (datetime(2026, 10, 3, 12, 29, 59, tzinfo=UTC), datetime(2026, 10, 3, 12, 30, tzinfo=UTC)),
        (datetime(2026, 10, 3, 12, 30, tzinfo=UTC), datetime(2026, 10, 4, 12, 30, tzinfo=UTC)),
        (datetime(2026, 10, 3, 23, 0, tzinfo=UTC), datetime(2026, 10, 4, 12, 30, tzinfo=UTC)),
        (datetime(2026, 12, 31, 13, 0, tzinfo=UTC), datetime(2027, 1, 1, 12, 30, tzinfo=UTC)),
    ],
)
def test_next_run_after(now, expected):
    assert next_run_after(now, 12, 30) == expected


async def test_scheduler_loop_sleeps_until_slot_and_survives_job_errors():
    times = iter([datetime(2026, 10, 3, 12, 0, tzinfo=UTC), datetime(2026, 10, 3, 12, 31, tzinfo=UTC),
                  datetime(2026, 10, 4, 12, 31, tzinfo=UTC)])
    sleeps, runs = [], []

    async def fake_sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) > 2:
            raise asyncio.CancelledError

    async def job():
        runs.append(1)
        raise RuntimeError("job failed")

    with pytest.raises(asyncio.CancelledError):
        await scheduler_loop(job, 12, 30, now=lambda: next(times), sleep=fake_sleep)
    assert sleeps[:2] == [30 * 60, 23 * 3600 + 59 * 60]
    assert len(runs) == 2


async def test_scheduled_job_gates_on_readiness(app, engine, fake_ai, fake_fetcher):
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE aidigest.tasks"))
    result = await app.state.scheduled_daily()
    assert result["status"] == "schema_not_ready"
    assert fake_ai.calls == [] and fake_fetcher.calls == []
    async with engine.connect() as conn:
        row = (await conn.execute(text("SELECT status, trigger FROM aidigest.runs"))).one()
    assert tuple(row) == ("schema_not_ready", "schedule")


async def test_lifespan_starts_and_stops_scheduler(settings, engine, fake_ai, fake_fetcher):
    from aidigest.app import create_app

    app = create_app(settings.model_copy(update={"aidigest_scheduler_enabled": True}),
                     engine=engine, ai=fake_ai, fetcher=fake_fetcher)
    async with app.router.lifespan_context(app):
        task = app.state.scheduler_task
        assert task is not None and not task.done()
    assert task.cancelled() or task.done()


async def test_lifespan_without_scheduler(app):
    assert app.state.scheduler_task is None


# ── L4: catch-up after a restart past the slot ───────────────────────────────
@pytest.mark.parametrize("hour, minute, expect_immediate", [(13, 0, True), (12, 30, True), (12, 0, False)])
async def test_scheduler_catches_up_once_on_startup(hour, minute, expect_immediate):
    events = []
    clock = iter([datetime(2026, 10, 3, hour, minute, tzinfo=UTC)] * 3)

    async def fake_sleep(seconds):
        events.append("sleep")
        raise asyncio.CancelledError

    async def job():
        events.append("job")

    with pytest.raises(asyncio.CancelledError):
        await scheduler_loop(job, 12, 30, now=lambda: next(clock), sleep=fake_sleep, catch_up=True)
    assert events == (["job", "sleep"] if expect_immediate else ["sleep"])
