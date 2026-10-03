"""Test doubles: no test may call the real Claude API or the internet."""

from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

PROXY_SECRET = "test-proxy-secret-0123456789abcdef0123456789abcdef"


def make_settings(**overrides):
    from aidigest.config import Settings

    values = dict(
        _env_file=None,
        anthropic_api_key="sk-ant-test-not-a-real-key",
        aidigest_database_url="postgresql+asyncpg://unused@127.0.0.1:1/unused",
        aidigest_proxy_secret=PROXY_SECRET,
        aidigest_scheduler_enabled=False,
        production="false",
    )
    values.update(overrides)
    return Settings(**values)


class FakeAI:
    """Records every call; returns queued responses (str or Exception). Tracks peak concurrency."""

    def __init__(self, responses: list[Any] | None = None,
                 on_call: Callable[[], Awaitable[None]] | None = None):
        self.responses = list(responses or [])
        self.calls: list[dict[str, str]] = []
        self.on_call = on_call
        self.in_flight = 0
        self.max_in_flight = 0

    def queue(self, response: Any) -> None:
        self.responses.append(response)

    def queue_json(self, payload: Any) -> None:
        self.responses.append(json.dumps(payload))

    async def complete(self, *, system: str, user: str) -> str:
        self.calls.append({"system": system, "user": user})
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        try:
            if self.on_call is not None:
                await self.on_call()
        finally:
            self.in_flight -= 1
        if not self.responses:
            raise AssertionError("FakeAI called more times than responses were queued")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeFetcher:
    """Maps URL -> text (or Exception). Unknown URLs raise UpstreamError."""

    def __init__(self, pages: dict[str, Any] | None = None, gate=None):
        self.pages = dict(pages or {})
        self.calls: list[str] = []
        self.gate = gate  # optional asyncio.Event: every fetch waits for it

    async def fetch(self, url: str):
        from aidigest.errors import UpstreamError
        from aidigest.fetcher import FetchResult

        self.calls.append(url)
        if self.gate is not None:
            await self.gate.wait()
        page = self.pages.get(url)
        if page is None:
            raise UpstreamError(f"fake: no page for {url}")
        if isinstance(page, Exception):
            raise page
        return FetchResult(url=url, status=200, content_type="text/html", text=page)


def rss(items: list[dict[str, str]]) -> str:
    body = "".join(
        "<item>"
        f"<title>{i['title']}</title>"
        f"<link>{i['url']}</link>"
        f"<description>{i.get('description', '')}</description>"
        f"<pubDate>{i.get('date', 'Fri, 02 Oct 2026 10:00:00 GMT')}</pubDate>"
        "</item>"
        for i in items
    )
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>{body}</channel></rss>'
