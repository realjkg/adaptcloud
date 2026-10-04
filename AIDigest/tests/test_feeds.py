"""Feed parsing and deterministic scoring."""

from aidigest.feeds import SOURCES, collect_feeds, parse_feed, score_text
from tests.fakes import FakeFetcher, rss


def test_sources_are_https():
    assert SOURCES and all(s.url.startswith("https://") for s in SOURCES)


def test_parse_rss():
    xml = rss([
        {"title": "Agent <b>governance</b> &amp; FinOps", "url": "https://ex.com/a", "description": "<p>cost</p>"},
        {"title": "No link", "url": "javascript:alert(1)"},
        {"title": "", "url": "https://ex.com/empty-title"},
    ])
    items = parse_feed(xml, "Src")
    assert len(items) == 1
    item = items[0]
    assert item.title == "Agent governance & FinOps"
    assert item.url == "https://ex.com/a"
    assert item.description == "cost"
    assert item.source == "Src"
    assert item.published_at is not None
    assert len(item.id) == 64


def test_parse_atom():
    xml = ('<feed><entry><title>Inference pricing</title>'
           '<link rel="alternate" href="https://ex.com/atom"/><summary>s</summary>'
           '<updated>2026-10-01T00:00:00Z</updated></entry></feed>')
    items = parse_feed(xml, "Atom")
    assert [i.url for i in items] == ["https://ex.com/atom"]


def test_score_text():
    assert score_text("Agentic FinOps governance", "") > score_text("Cats", "")
    assert score_text("x " * 10 + " ".join(["finops agent governance security inference pricing"] * 3), "") <= 100


async def test_collect_feeds_dedupes_and_reports_errors():
    a, b = SOURCES[0].url, SOURCES[1].url
    item = {"title": "Agent governance", "url": "https://ex.com/same"}
    fetcher = FakeFetcher({a: rss([item]), b: rss([item])})
    items, errors = await collect_feeds(fetcher)
    assert [i.url for i in items] == ["https://ex.com/same"]
    assert len(errors) == len(SOURCES) - 2


# ── Round 2 L5: per-feed bounds ───────────────────────────────────────────────
def test_at_most_25_items_per_feed():
    xml = rss([{"title": f"Agent {i}", "url": f"https://ex.com/{i}"} for i in range(30)])
    assert len(parse_feed(xml, "s")) == 25


def test_description_capped_at_1800_chars():
    xml = rss([{"title": "Agent", "url": "https://ex.com/a", "description": "word " * 1000}])
    assert len(parse_feed(xml, "s")[0].description) == 1800


# ── Round 2 L6: dedicated, bounded parser executor ────────────────────────────
async def test_parsing_uses_dedicated_bounded_executor():
    import threading
    import time

    import aidigest.feeds as feeds
    from aidigest.errors import UpstreamError

    names = []

    def record(*_):
        names.append(threading.current_thread().name)
        return []

    await feeds.run_parser(record, "x", timeout=5)
    assert names and names[0].startswith("aidigest-parse")

    def slow(*_):
        time.sleep(0.3)

    for _ in range(12):                      # repeated timeouts cannot grow the pool
        try:
            await feeds.run_parser(slow, timeout=0.01)
        except UpstreamError:
            pass
    assert feeds.PARSE_EXECUTOR._max_workers == feeds.PARSE_WORKERS <= 4
    assert len(feeds.PARSE_EXECUTOR._threads) <= feeds.PARSE_WORKERS
