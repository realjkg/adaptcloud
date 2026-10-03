"""Curated feed registry, RSS/Atom parsing and deterministic Adapt relevance scoring.

Feeds are untrusted. Every scanner here is LINEAR in the input size (str.find based,
each step advances, any missing terminator ends the scan) so a hostile 1 MB body cannot
stall the process (H1). Parsing also runs in a worker thread under a deadline, so the
event loop stays responsive while it runs. No XML entity-expanding parser is used."""

from __future__ import annotations

import asyncio
import hashlib
import html
import re
import string
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from aidigest.errors import UpstreamError


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
MAX_ENTITY_ROUNDS = 5
DEFAULT_PARSE_TIMEOUT = 10.0

# Round 2 L6: parsers get their own small pool, separate from the default executor that
# getaddrinfo uses, so a burst of slow parses cannot starve DNS. Python threads cannot be
# killed: a parse that misses its deadline finishes in the background (linear time, so at most
# ~0.2 s per MB) while its pool slot stays busy; the pool never grows past PARSE_WORKERS and
# requests queued behind it are cancelled by their own deadline before they start.
PARSE_WORKERS = 4
PARSE_EXECUTOR = ThreadPoolExecutor(max_workers=PARSE_WORKERS, thread_name_prefix="aidigest-parse")

# Round 2 L1: int() refuses > 4300 decimal digits (ValueError inside html.unescape); any
# charref this long is not a real character anyway. Linear: anchored on "&#", no backtracking.
_LONG_CHARREF = re.compile(r"&#(?:[xX][0-9a-fA-F]{9,}|[0-9]{9,});?")

# ASCII-only lower-casing keeps string length (and therefore indices) identical;
# str.lower() can change length for some non-ASCII characters.
_ASCII_LOWER = str.maketrans(string.ascii_uppercase, string.ascii_lowercase)
_TAG_START = frozenset(string.ascii_letters + "/!?")
_NAME_END = frozenset(" \t\r\n/>")


@dataclass(frozen=True)
class FeedItem:
    id: str
    source: str
    title: str
    url: str
    published_at: datetime | None
    description: str
    score: int


def _lower(value: str) -> str:
    return value.translate(_ASCII_LOWER)


def _unwrap_cdata(value: str) -> str:
    out, i = [], 0
    while True:
        j = value.find("<![CDATA[", i)
        if j < 0:
            out.append(value[i:])
            return "".join(out)
        out.append(value[i:j])
        k = value.find("]]>", j + 9)
        if k < 0:                       # unclosed CDATA: keep its content as text
            out.append(value[j + 9:])
            return "".join(out)
        out.append(value[j + 9:k])
        i = k + 3


def _strip_tags(value: str) -> str:
    lower = _lower(value)
    n = len(value)
    out, i = [], 0
    while i < n:
        j = value.find("<", i)
        if j < 0:
            out.append(value[i:])
            break
        out.append(value[i:j])
        if j + 1 >= n or value[j + 1] not in _TAG_START:
            out.append("<")             # a lone '<' is text
            i = j + 1
            continue
        if value.startswith("<!--", j):
            k = value.find("-->", j + 4)
            if k < 0:                   # unclosed comment: drop the rest
                break
            out.append(" ")
            i = k + 3
            continue
        skip_to = None
        for name in ("script", "style"):
            end = j + 1 + len(name)
            if lower.startswith(name, j + 1) and (end >= n or not lower[end].isalnum()):
                k = lower.find("</" + name, end)
                g = value.find(">", k) if k >= 0 else -1
                skip_to = g + 1 if g >= 0 else n   # unclosed script/style: drop the rest
                break
        if skip_to is None:
            k = value.find(">", j + 1)
            if k < 0:                   # no '>' anywhere after: the rest is text
                out.append(value[j:])
                break
            skip_to = k + 1
        out.append(" ")
        i = skip_to
    return "".join(out)


def clean_text(value: str) -> str:
    """Strip markup and decode entities in linear time. Entities are decoded to a fixed
    point (L7) so double-encoded markup cannot survive in a misleading form; NUL bytes are
    removed (M3)."""
    value = _strip_tags(_unwrap_cdata(value))
    for _ in range(MAX_ENTITY_ROUNDS):
        decoded = html.unescape(_LONG_CHARREF.sub("\ufffd", value))
        if decoded == value:
            break
        value = decoded
    value = value.replace("\x00", "")
    return " ".join(value.split())


def _find_elements(xml: str, lower: str, name: str, limit: int) -> list[str]:
    open_tok, close_tok = "<" + name, "</" + name + ">"
    out, i, n = [], 0, len(lower)
    while len(out) < limit:
        j = lower.find(open_tok, i)
        if j < 0:
            break
        after = j + len(open_tok)
        if after < n and lower[after] not in _NAME_END:
            i = after                   # e.g. "<items" or "<item<item": not this element
            continue
        k = lower.find(close_tok, after)
        if k < 0:
            break
        out.append(xml[j:k + len(close_tok)])
        i = k + len(close_tok)
    return out


def _tag(block: str, lower: str, name: str) -> str:
    open_tok = "<" + name
    i, n = 0, len(lower)
    while True:
        j = lower.find(open_tok, i)
        if j < 0:
            return ""
        after = j + len(open_tok)
        if after < n and lower[after] not in _NAME_END:
            i = after
            continue
        g = lower.find(">", after)
        if g < 0 or lower[g - 1] == "/":
            return ""
        k = lower.find("</" + name + ">", g + 1)
        if k < 0:
            return ""
        return clean_text(block[g + 1:k])


def _attributes(tag_body: str) -> dict[str, str]:
    """Linear attribute scanner for one tag body (between '<link' and '>')."""
    attrs: dict[str, str] = {}
    i, n = 0, len(tag_body)
    while i < n:
        while i < n and tag_body[i] in " \t\r\n/":
            i += 1
        start = i
        while i < n and tag_body[i] not in " \t\r\n=/":
            i += 1
        name = _lower(tag_body[start:i])
        while i < n and tag_body[i] in " \t\r\n":
            i += 1
        if i >= n or tag_body[i] != "=":
            if not name:
                i += 1
            continue
        i += 1
        while i < n and tag_body[i] in " \t\r\n":
            i += 1
        if i < n and tag_body[i] in "\"'":
            end = tag_body.find(tag_body[i], i + 1)
            if end < 0:                 # unterminated quote: stop scanning
                break
            value, i = tag_body[i + 1:end], end + 1
        else:
            start = i
            while i < n and tag_body[i] not in " \t\r\n":
                i += 1
            value = tag_body[start:i]
        if name and name not in attrs:
            attrs[name] = value
    return attrs


def _atom_link(block: str, lower: str) -> str:
    first_href = ""
    i, n = 0, len(lower)
    while True:
        j = lower.find("<link", i)
        if j < 0:
            break
        after = j + 5
        if after < n and lower[after] not in _NAME_END:
            i = after
            continue
        g = lower.find(">", after)
        if g < 0:
            break
        attrs = _attributes(block[after:g])
        href = attrs.get("href", "")
        if href:
            if _lower(attrs.get("rel", "")) == "alternate":
                return html.unescape(href)
            first_href = first_href or href
        i = g + 1
    return html.unescape(first_href) if first_href else _tag(block, lower, "link")


def _parse_date(value: str) -> datetime | None:
    value = value[:64]
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
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
    lower = _lower(xml)
    rss = _find_elements(xml, lower, "item", MAX_ITEMS_PER_FEED)
    blocks = rss or _find_elements(xml, lower, "entry", MAX_ITEMS_PER_FEED)
    out: list[FeedItem] = []
    for block in blocks:
        blower = _lower(block)
        title = _tag(block, blower, "title")
        url = (_tag(block, blower, "link") if rss else _atom_link(block, blower)).strip()
        description = (
            _tag(block, blower, "description") or _tag(block, blower, "summary")
            or _tag(block, blower, "content") or _tag(block, blower, "content:encoded")
        )[:MAX_DESCRIPTION]
        if not title or _lower(url[:8]) != "https://":
            continue
        date = _tag(block, blower, "pubdate") or _tag(block, blower, "published") or _tag(block, blower, "updated")
        out.append(FeedItem(
            id=url_id(url), source=source_name, title=title[:500], url=url, published_at=_parse_date(date),
            description=description, score=score_text(title, description),
        ))
    return out


async def run_parser(func, *args, timeout: float):
    """Run a CPU-bound parser in a worker thread under a deadline (keeps the loop responsive)."""
    loop = asyncio.get_running_loop()
    try:
        return await asyncio.wait_for(loop.run_in_executor(PARSE_EXECUTOR, func, *args), timeout)
    except TimeoutError as exc:
        raise UpstreamError(f"Parsing exceeded the {timeout:g}s deadline") from exc


async def collect_feeds(fetcher, *, parse_timeout: float = DEFAULT_PARSE_TIMEOUT) -> tuple[list[FeedItem], list[str]]:
    """Fetch every curated source through the guarded fetcher; parse off-loop; dedupe by URL."""

    async def one(source: Source) -> list[FeedItem]:
        result = await fetcher.fetch(source.url)
        return await run_parser(parse_feed, result.text, source.name, timeout=parse_timeout)

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
