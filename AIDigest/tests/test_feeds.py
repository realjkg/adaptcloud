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
