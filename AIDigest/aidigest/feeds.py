"""Curated feed registry, RSS/Atom parsing and deterministic Adapt relevance scoring.

Feeds are untrusted. Parsing is regex-based on bounded input (the fetcher caps the
body), never an XML entity-expanding parser."""

from __future__ import annotations

import asyncio
import hashlib
import html
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime


@dataclass(frozen=True)
class Source:
    name: str
    url: str


SOURCES: tuple[Source, ...] = (
    Source("OpenAI News", "https://openai.com/news/rss.xml"),
    Source("GitHub Changelog", "https://github.blog/changelog/feed/"),
    Source("AWS Machine Learning", "https://aws.amazon.com/blogs/machine-learning/feed/"),
    Source("Cloudflare Blog", "https://blog.cloudflare.com/rss/"),
)

KEYWORDS: tuple[tuple[str, int], ...] = (
    ("finops", 18), ("token", 12), ("inference", 12), ("pricing", 12), ("cost", 10),
    ("agent", 18), ("agentic", 18), ("mcp", 12), ("tool calling", 10),
    ("governance", 16), ("compliance", 12), ("policy", 8), ("audit", 8),
    ("security", 16), ("identity", 10), ("access", 8), ("vulnerability", 10),
    ("observability", 14), ("reliability", 14), ("telemetry", 10), ("evaluation", 8),
    ("aws", 8), ("azure", 8), ("google cloud", 8), ("cloudflare", 8), ("github", 9),
    ("enterprise", 10), ("procurement", 10), ("production", 8), ("regulation", 10), ("nist", 10),
    ("healthcare", 7), ("biotech", 7), ("industrial", 7), ("construction", 7), ("transportation", 7),
    ("real estate", 7),
)

MAX_ITEMS_PER_FEED = 25
MAX_DESCRIPTION = 1800


@dataclass(frozen=True)
class FeedItem:
    id: str
    source: str
    title: str
    url: str
    published_at: datetime | None
    description: str
    score: int


_CDATA = re.compile(r"<!\[CDATA\[([\s\S]*?)\]\]>")
_SCRIPT = re.compile(r"<script[\s\S]*?</script>", re.I)
_STYLE = re.compile(r"<style[\s\S]*?</style>", re.I)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def clean_text(value: str) -> str:
    value = _CDATA.sub(r"\1", value)
    value = _SCRIPT.sub(" ", value)
    value = _STYLE.sub(" ", value)
    value = _TAG.sub(" ", value)
    value = html.unescape(value)
    return _WS.sub(" ", value).strip()


def _tag(block: str, name: str) -> str:
    match = re.search(r"<" + re.escape(name) + r"(?:\s[^>]*)?>([\s\S]*?)</" + re.escape(name) + ">", block, re.I)
    return clean_text(match.group(1)) if match else ""


def _atom_link(block: str) -> str:
    alternate = re.search(r"<link\b[^>]*rel=[\"']alternate[\"'][^>]*href=[\"']([^\"']+)[\"'][^>]*/?\s*>", block, re.I)
    any_link = re.search(r"<link\b[^>]*href=[\"']([^\"']+)[\"'][^>]*/?\s*>", block, re.I)
    if alternate:
        return html.unescape(alternate.group(1))
    if any_link:
        return html.unescape(any_link.group(1))
    return _tag(block, "link")


def _parse_date(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def url_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def score_text(title: str, description: str) -> int:
    text = f"{title} {description}".lower()
    score = 15
    for term, weight in KEYWORDS:
        if term in text:
            score += weight
    return min(100, score)


def parse_feed(xml: str, source_name: str) -> list[FeedItem]:
    rss = re.findall(r"<item\b[\s\S]*?</item>", xml, re.I)
    atom = re.findall(r"<entry\b[\s\S]*?</entry>", xml, re.I)
    blocks = rss or atom
    out: list[FeedItem] = []
    for block in blocks[:MAX_ITEMS_PER_FEED]:
        title = _tag(block, "title")
        url = (_tag(block, "link") if rss else _atom_link(block)).strip()
        description = (
            _tag(block, "description") or _tag(block, "summary") or _tag(block, "content")
            or _tag(block, "content:encoded")
        )[:MAX_DESCRIPTION]
        if not title or not re.match(r"^https://", url, re.I):
            continue
        date = _tag(block, "pubDate") or _tag(block, "published") or _tag(block, "updated")
        out.append(FeedItem(
            id=url_id(url), source=source_name, title=title[:500], url=url, published_at=_parse_date(date),
            description=description, score=score_text(title, description),
        ))
    return out


async def collect_feeds(fetcher) -> tuple[list[FeedItem], list[str]]:
    """Fetch every curated source through the guarded fetcher; dedupe by URL."""

    async def one(source: Source) -> list[FeedItem]:
        result = await fetcher.fetch(source.url)
        return parse_feed(result.text, source.name)

    settled = await asyncio.gather(*(one(s) for s in SOURCES), return_exceptions=True)
    items: dict[str, FeedItem] = {}
    errors: list[str] = []
    for source, result in zip(SOURCES, settled, strict=True):
        if isinstance(result, BaseException):
            if not isinstance(result, Exception):
                raise result
            errors.append(f"{source.name}: {result}")
            continue
        for item in result:
            items.setdefault(item.url, item)
    return list(items.values()), errors
