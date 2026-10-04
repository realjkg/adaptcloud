"""H1: feed/HTML parsing must be linear-time and must never block the event loop.

Each adversarial input is processed at the full 1 MB fetch cap in a CHILD process with a
hard wall-clock budget (subprocess.run kills it on timeout), so a quadratic regression
fails the test instead of hanging the suite."""

import asyncio
import signal
import subprocess
import sys
import textwrap
import time
from pathlib import Path

import pytest

from aidigest.feeds import SOURCES, collect_feeds
from tests.fakes import FakeFetcher, rss

ROOT = Path(__file__).resolve().parent.parent
N = 1_000_000          # the fetcher's default byte cap
BUDGET_SECONDS = 6.0   # CPU seconds for one parse; linear parsing of 1 MB takes well under a second
WALL_CLOCK_KILL = 120  # hang guard only (the CPU budget above is the real limit)
CHILD_CPU_LIMIT = 4 * int(BUDGET_SECONDS)   # CPU seconds for all six samples of one child

ADVERSARIAL = {
    "lt-run": "'<' * N",
    "item-open-run": "'<item' * (N // 5)",
    "item-tag-unclosed": "'<item>' * (N // 6)",
    "item-title-lt": "'<item><title>' + '<' * N",
    "title-open-run": "'<item>' + '<title' * (N // 6)",
    "script-open-run": "'<script' * (N // 7)",
    "script-unclosed": "'<script>' + 'a' * N",
    "style-open-run": "'<style' * (N // 6)",
    "style-unclosed": "'<item><description><style>' + 'b' * N",
    "cdata-open-run": "'<![CDATA[' * (N // 9)",
    "cdata-unclosed": "'<item><title><![CDATA[' + 'c' * N",
    "comment-open-run": "'<!--' * (N // 4)",
    "nested-tags": "'<a<b<c' * (N // 6)",
    "tag-no-close": "'<a ' + 'x' * N",
    "atom-href-run": "'<entry><link href=\"' * (N // 19)",
    "atom-link-long": "'<entry><title>t</title><link rel=\"alternate\" href=\"' + 'x' * N",
    "atom-rel-run": "'<entry><link ' + 'rel=\"alternate\" ' * (N // 16)",
    "entity-run": "'<item><title>' + '&amp;' * (N // 5)",
    "double-entity-run": "'<item><title>' + '&amp;lt;' * (N // 8)",
    "ampersand-run": "'<item><title>' + '&' * N",
    "pubdate-long": "'<item><title>t</title><link>https://x.example/</link><pubDate>' + '1' * N",
    "charref-huge": "'<item><title>&#' + '1' * N + ';</title>'",       # round 2 L1: int() digit limit
    "charref-run": "'<item><title>' + '&#1111111111;' * (N // 13)",
}


@pytest.mark.parametrize("name", list(ADVERSARIAL))
def test_adversarial_input_parses_within_budget(name):
    """Hard budget (child killed) AND near-linear scaling: str.find is memchr-fast, so a
    quadratic rescan of 1 MB can still finish in a few seconds - the 4x size step exposes it
    (linear ~4x, quadratic ~16x)."""
    # Review of ae012a0: CPU time of the child (other load on the machine does not count), min of 3
    # samples per size; a sample that already exceeds the budget stops the child at once, so a
    # quadratic parser fails fast. The wall-clock kill (WALL_CLOCK_KILL) only guards against hangs.
    code = textwrap.dedent(f"""
        import resource, sys, time
        # all six samples together get CHILD_CPU_LIMIT CPU seconds; a quadratic parser is killed
        # by the kernel (SIGXCPU) when it runs out, however loaded the machine is
        resource.setrlimit(resource.RLIMIT_CPU, ({CHILD_CPU_LIMIT}, {CHILD_CPU_LIMIT} + 5))
        from aidigest.feeds import clean_text, parse_feed
        def run(N):
            data = {ADVERSARIAL[name]}
            assert len(data) >= N * 0.9
            t = time.process_time()
            parse_feed(data, "src")
            clean_text(data)
            took = time.process_time() - t
            if took > {BUDGET_SECONDS}:
                print(f"OVER {{took:.2f}}")
                sys.exit(0)
            return took
        quarter = min(run({N // 4}) for _ in range(3))
        full = min(run({N}) for _ in range(3))
        print(f"{{quarter:.4f}} {{full:.4f}}")
    """)
    try:
        proc = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True,
                              timeout=WALL_CLOCK_KILL)
    except subprocess.TimeoutExpired:
        pytest.fail(f"{name}: parsing did not finish within {WALL_CLOCK_KILL}s wall-clock (child killed)")
    assert proc.returncode != -signal.SIGXCPU, f"{name}: the parses used up {CHILD_CPU_LIMIT}s of CPU (non-linear parser)"
    assert proc.returncode == 0, proc.stderr[-2000:]
    assert not proc.stdout.startswith("OVER"), f"{name}: one parse of up to 1 MB took {proc.stdout.split()[1]}s CPU " \
                                                f"(budget {BUDGET_SECONDS}s) - non-linear parser"
    quarter, full = map(float, proc.stdout.split())
    assert full <= max(1.0, 8 * quarter), f"{name}: {quarter:.3f}s at N/4 -> {full:.3f}s at N (super-linear)"


def test_clean_text_behaviour_preserved():
    from aidigest.feeds import clean_text

    assert clean_text("<p>Hello <b>world</b></p>") == "Hello world"
    assert clean_text("a<script>alert(1)</script>b") == "a b"
    assert clean_text("a<STYLE type=x>p{}</style >b") == "a b"
    assert clean_text("<![CDATA[<p>inside</p>]]>") == "inside"
    assert clean_text("x <!-- hidden --> y") == "x y"
    assert clean_text("5 < 6 and 7 > 3") == "5 < 6 and 7 > 3"
    assert clean_text("tail <unclosed") == "tail <unclosed"
    assert clean_text("&amp;lt;/evidence&amp;gt;") == "</evidence>"   # L7: decoded to a fixed point
    assert clean_text("a\x00b") == "ab"                                   # M3


# ── Off-loop parsing and deadline ────────────────────────────────────────────
def _slow_parse(seconds):
    def parse(xml, source_name):
        time.sleep(seconds)  # blocks whichever thread runs it
        return []
    return parse


async def _health_heartbeat(client, stop: asyncio.Event) -> float:
    """Hit /health continuously; return the largest gap between consecutive successful answers."""
    worst, last = 0.0, time.monotonic()
    while not stop.is_set():
        assert (await client.get("/health")).status_code == 200
        await asyncio.sleep(0.02)
        now = time.monotonic()
        worst, last = max(worst, now - last), now
    return worst


async def _with_heartbeat(client, work):
    stop = asyncio.Event()
    beat = asyncio.create_task(_health_heartbeat(client, stop))
    await asyncio.sleep(0.05)
    try:
        result = await work
    finally:
        stop.set()
    return result, await beat


async def test_health_stays_responsive_while_feeds_are_parsed(app, client, fake_ai, fake_fetcher, monkeypatch):
    """Parsing runs in a worker thread: /health keeps answering while a DAILY run parses."""
    import aidigest.feeds as feeds

    monkeypatch.setattr(feeds, "parse_feed", _slow_parse(1.0))
    for s in SOURCES:
        fake_fetcher.pages[s.url] = rss([])
    run, worst = await _with_heartbeat(client, client.post("/ops/run-daily"))
    assert run.status_code == 200
    assert worst < 0.3, f"/health blocked for {worst:.2f}s during parsing"


async def test_parse_deadline_bounds_a_slow_parse(monkeypatch):
    import aidigest.feeds as feeds

    monkeypatch.setattr(feeds, "parse_feed", _slow_parse(1.5))
    fetcher = FakeFetcher({s.url: rss([]) for s in SOURCES})
    t = time.monotonic()
    items, errors = await collect_feeds(fetcher, parse_timeout=0.2)
    elapsed = time.monotonic() - t
    assert items == []
    assert len(errors) == len(SOURCES) and all("deadline" in e for e in errors)
    assert elapsed < 1.0


async def test_task_page_cleaning_runs_off_loop(monkeypatch, client, fake_ai, fake_fetcher):
    """The TASK path cleans fetched pages in a worker thread too."""
    import aidigest.tasks as tasks

    def slow_clean(text):
        time.sleep(1.0)
        return "cleaned"

    monkeypatch.setattr(tasks, "clean_text", slow_clean)
    fake_fetcher.pages["https://a.example/x"] = "<p>x</p>"
    fake_ai.queue('{"answer": "ok"}')
    r, worst = await _with_heartbeat(
        client, client.post("/agent/tasks", json={"task": "Summarize this", "urls": ["https://a.example/x"]}))
    assert r.status_code == 200, r.text
    assert worst < 0.3, f"/health blocked for {worst:.2f}s while cleaning a page"
