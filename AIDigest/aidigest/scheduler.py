"""In-process DAILY scheduler (replaces the Cloudflare Cron trigger). Times are UTC.

Duplicate protection does not depend on this loop: run_daily claims the day in
Postgres, so restarts, extra workers or an operator trigger cannot double-run."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

log = logging.getLogger(__name__)


def next_run_after(now: datetime, hour: int, minute: int) -> datetime:
    now = now.astimezone(timezone.utc)
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


async def scheduler_loop(
    job: Callable[[], Awaitable[object]],
    hour: int,
    minute: int,
    *,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    while True:
        current = now()
        target = next_run_after(current, hour, minute)
        log.info("Next DAILY run at %s", target.isoformat())
        await sleep((target - current).total_seconds())
        try:
            result = await job()
            log.info("Scheduled DAILY finished: %s", result)
        except Exception:
            log.exception("Scheduled DAILY failed")
