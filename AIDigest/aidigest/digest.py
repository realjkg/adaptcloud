"""Digest rendering: THE BIG 3 followed by WORTH KNOWING. All values are HTML-escaped and
only https:// source links are rendered as links."""

import html
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def digest_rows(engine: AsyncEngine, limit: int = 8) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        rows = await conn.execute(text(
            "SELECT title, url, source, published_at, lead, summary, why_adapt, next_move, category, score "
            "FROM aidigest.articles ORDER BY created_at DESC, score DESC LIMIT :limit"), {"limit": limit})
        return [dict(r) for r in rows.mappings()]


def _esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def digest_html(rows: list[dict[str, Any]]) -> str:
    parts = []
    for i, r in enumerate(rows):
        url = str(r.get("url") or "")
        link = f'<a href="{_esc(url)}" rel="noopener noreferrer">Read full source &rarr;</a>' \
            if url.startswith("https://") else _esc(url)
        parts.append(
            "<article>"
            f"<div class=k>{'THE BIG 3' if i < 3 else 'WORTH KNOWING'} &middot; {_esc(r.get('category'))}</div>"
            f"<h2>{i + 1}. {_esc(r.get('title'))}</h2>"
            f"<p class=lead>{_esc(r.get('lead'))}</p>"
            f"<p>{_esc(r.get('summary'))}</p>"
            f"<p><b>Why Adapt cares:</b> {_esc(r.get('why_adapt'))}</p>"
            f"<p><b>Next move:</b> {_esc(r.get('next_move'))}</p>"
            f"<p class=s>{_esc(r.get('source'))} &middot; {link}</p>"
            "</article>"
        )
    body = "".join(parts) or "<p>No curated items yet.</p>"
    return (
        "<!doctype html><html lang=en><meta charset=utf-8>"
        "<meta name=viewport content='width=device-width,initial-scale=1'><title>Adapt Cloud AIDigest</title>"
        "<style>body{font-family:Georgia,serif;max-width:800px;margin:auto;padding:32px 20px;color:#171717;"
        "line-height:1.55}header{border-bottom:2px solid #171717}.k,.s{font:700 .75rem system-ui;"
        "text-transform:uppercase;letter-spacing:.06em}.lead{font-weight:700}article{padding:22px 0;"
        "border-bottom:1px solid #ddd}a{color:inherit}</style>"
        "<header><div class=k>ADAPT CLOUD</div><h1>AI DIGEST</h1><p>Executive AI &amp; cloud intelligence</p>"
        f"</header>{body}</html>"
    )
