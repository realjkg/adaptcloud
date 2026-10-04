"""Challenger review of ae012a0, M1: the budget must hold when the database freezes at TCP level.

A real asyncio TCP proxy sits between the production engine (aidigest.db.make_engine: QueuePool,
pre-ping) and Postgres. freeze() keeps every socket open but stops forwarding, the way a stalled
network path or a hung host looks to the client. Connections frozen once stay dead; after thaw()
only NEW connections are forwarded again.

Every call is run as a task and waited for without awaiting its cleanup, so a test can never hang
on the code it is testing; whatever is still stuck is unblocked when the proxy closes its sockets.
"""

from __future__ import annotations

import asyncio
import time
from urllib.parse import urlsplit

import pytest

from tests.fakes import FakeAI, FakeFetcher, rss

BUDGET = 2.0
MARGIN = 1.0          # the call returns within BUDGET + MARGIN
GUARD = 25.0          # how long a test waits before it calls the call hung


class FreezingProxy:
    def __init__(self, host: str, port: int):
        self.target = (host, port)
        self.frozen = False
        self.links: list[dict] = []
        self.server: asyncio.base_events.Server | None = None
        self.port = 0

    async def start(self) -> None:
        self.server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]

    async def _handle(self, reader, writer):
        link = {"frozen": self.frozen, "writers": [writer]}
        self.links.append(link)
        try:
            up_reader, up_writer = await asyncio.open_connection(*self.target)
        except OSError:
            writer.close()
            return
        link["writers"].append(up_writer)

        async def pump(src, dst):
            try:
                while data := await src.read(65536):
                    if link["frozen"]:
                        continue                # swallowed: the socket stays open, nothing arrives
                    dst.write(data)
                    await dst.drain()
            except (OSError, asyncio.CancelledError):
                pass

        await asyncio.gather(pump(reader, up_writer), pump(up_reader, writer))

    def freeze(self) -> None:
        self.frozen = True
        for link in self.links:
            link["frozen"] = True

    def thaw(self) -> None:
        self.frozen = False             # new connections only; frozen ones stay dead

    async def close(self) -> None:
        for link in self.links:
            for w in link["writers"]:
                w.transport.abort()
        self.server.close()
        await self.server.wait_closed()


@pytest.fixture
async def proxy(pg_url):
    parts = urlsplit(pg_url)
    p = FreezingProxy(parts.hostname, parts.port)
    await p.start()
    yield p
    await p.close()


@pytest.fixture
async def frozen_engine(proxy, pg_url, engine):   # `engine` applies the schema on a direct connection
    from aidigest.db import make_engine
    parts = urlsplit(pg_url)
    eng = make_engine(parts._replace(netloc=f"{parts.username}@127.0.0.1:{proxy.port}").geturl())
    yield eng
    await proxy.close()                               # unblock anything still stuck before disposing
    await asyncio.wait_for(eng.dispose(), 10)


async def returns_within(coro, limit: float = GUARD):
    """(outcome, elapsed); outcome is "HUNG" if the call did not return within `limit` seconds.
    The call is never awaited past that point (a hung cleanup cannot hang the test)."""
    task = asyncio.ensure_future(coro)
    start = time.monotonic()
    done, _ = await asyncio.wait({task}, timeout=limit)
    elapsed = time.monotonic() - start
    if not done:
        task.cancel()
        task.add_done_callback(lambda t: t.cancelled() or t.exception())
        return "HUNG", elapsed
    exc = task.exception()
    return (exc if exc is not None else task.result()), elapsed


def _task(engine, ai):
    from aidigest.tasks import TaskConfig, TaskRequest, run_task
    return run_task(engine, ai, FakeFetcher(), "operator@adapt.cloud", TaskRequest(task="Summarize this knowledge"),
                    TaskConfig(budget_seconds=BUDGET))


def _daily(engine, ai, heartbeat=3600.0):
    from aidigest.daily import DailyConfig, run_daily
    from aidigest.feeds import SOURCES
    feed = rss([{"title": f"Agent governance FinOps security update {i}", "url": f"https://news.example/{i}",
                 "description": "Inference pricing for enterprise agents"} for i in range(3)])
    return run_daily(engine, ai, FakeFetcher({SOURCES[0].url: feed}), trigger="operator",
                     config=DailyConfig(budget_seconds=BUDGET, lease_seconds=60, heartbeat_seconds=heartbeat))


def _answer_task():
    ai = FakeAI()
    ai.queue_json({"answer": "Short answer.", "factual_findings": [], "adapt_implications": [],
                   "recommended_actions": [], "citations": [], "knowledge": []})
    return ai


def _selection():
    import hashlib
    url = "https://news.example/0"
    ai = FakeAI()
    ai.queue_json([{"id": hashlib.sha256(url.encode()).hexdigest(), "url": url, "lead": "Lead.",
                    "summary": "Summary.", "why_adapt": "Why.", "next_move": "Move.", "category": "Gov",
                    "score_adjustment": 5, "knowledge": []}])
    return ai


def _assert_on_time(outcome, elapsed):
    from aidigest.errors import DeadlineError
    assert outcome != "HUNG", f"still running after {elapsed:.1f}s (budget {BUDGET}s)"
    assert isinstance(outcome, DeadlineError), repr(outcome)
    assert elapsed < BUDGET + MARGIN, f"{elapsed:.2f}s for a {BUDGET}s budget"


async def test_task_returns_within_budget_when_db_freezes_before_the_run(proxy, frozen_engine):
    proxy.freeze()
    _assert_on_time(*await returns_within(_task(frozen_engine, _answer_task())))


async def test_task_returns_within_budget_when_db_freezes_during_the_ai_call(proxy, frozen_engine):
    ai = _answer_task()

    async def freeze():
        proxy.freeze()
    ai.on_call = freeze
    _assert_on_time(*await returns_within(_task(frozen_engine, ai)))


async def test_daily_returns_within_budget_when_db_freezes_before_the_run(proxy, frozen_engine):
    proxy.freeze()
    _assert_on_time(*await returns_within(_daily(frozen_engine, _selection())))


async def test_daily_returns_within_budget_when_db_freezes_during_the_ai_call(proxy, frozen_engine):
    ai = _selection()

    async def freeze():
        proxy.freeze()
    ai.on_call = freeze
    _assert_on_time(*await returns_within(_daily(frozen_engine, ai)))


async def test_daily_returns_within_budget_when_db_freezes_during_a_lease_refresh(proxy, frozen_engine):
    """heartbeat 0.3 s: the AI call outlives two refreshes, then the DB freezes so the next refresh
    hangs inside the heartbeat task; the run must still end (its heartbeat wait is bounded)."""
    ai = _selection()

    async def slow_then_freeze():
        await asyncio.sleep(0.7)
        proxy.freeze()
        await asyncio.sleep(0.5)       # a refresh starts while frozen
    ai.on_call = slow_then_freeze
    _assert_on_time(*await returns_within(_daily(frozen_engine, ai, heartbeat=0.3)))


async def test_abandoned_connections_are_released_within_the_bound(proxy, frozen_engine):
    """Repeated freezes must not exhaust the pool (5 + 5 overflow): every connection a deadline
    abandons is closed and handed back within aidigest.db.ABANDONED_RELEASE_SECONDS, even while the
    database stays frozen. Then, once the database answers again, the service recovers."""
    from aidigest.db import ABANDONED_RELEASE_SECONDS
    for _ in range(6):                  # each run strands its run connection mid-transaction
        proxy.thaw()
        ai = _answer_task()

        async def freeze():
            proxy.freeze()
        ai.on_call = freeze
        _assert_on_time(*await returns_within(_task(frozen_engine, ai)))
    pool = frozen_engine.pool
    deadline = time.monotonic() + ABANDONED_RELEASE_SECONDS + 2
    while pool.checkedout() and time.monotonic() < deadline:
        await asyncio.sleep(0.2)
    assert pool.checkedout() == 0, f"{pool.checkedout()} connections still held after the bound (pool exhaustion)"
    proxy.thaw()
    for _attempt in range(8):           # stale pooled connections from before the freeze are discarded
        outcome, _ = await returns_within(_task(frozen_engine, _answer_task()))
        if isinstance(outcome, dict):
            break
    assert isinstance(outcome, dict) and outcome["status"] == "completed", outcome


def test_bounded_cancel_targets_the_pinned_asyncpg_internals():
    """aidigest.db.BoundedCancelConnection overrides asyncpg's private Connection._cancel(waiter);
    asyncpg is hash-pinned, and this fails loudly if an upgrade changes that method."""
    import inspect

    import asyncpg

    from aidigest.db import BoundedCancelConnection
    assert asyncpg.__version__ == "0.31.0"
    assert list(inspect.signature(asyncpg.Connection._cancel).parameters) == ["self", "waiter"]
    assert inspect.iscoroutinefunction(asyncpg.Connection._cancel)
    assert issubclass(BoundedCancelConnection, asyncpg.Connection)
