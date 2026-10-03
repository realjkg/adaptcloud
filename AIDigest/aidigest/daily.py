"""DAILY: curated feeds -> dedupe -> deterministic relevance -> ONE Claude curation ->
validate -> Postgres -> digest. Gated on readiness; at most one run per UTC day."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from aidigest.ai import bounded_str, finite_number, parse_json_array
from aidigest.db import readiness
from aidigest.errors import AIDigestError, StorageError
from aidigest.feeds import FeedItem, collect_feeds, url_id
from aidigest.prompts import evidence_block, system_prompt

log = logging.getLogger(__name__)

MAX_CANDIDATES = 12
MIN_CANDIDATE_SCORE = 25
MIN_FINAL_SCORE = 55
MAX_ADJUSTMENT = 15
MIN_CONFIDENCE = 0.75
MAX_KNOWLEDGE_PER_ITEM = 3
ABANDON_AFTER = timedelta(hours=2)


def build_daily_prompt(candidates: list[FeedItem]) -> tuple[str, str]:
    system = system_prompt(
        "You are AIDigest, the editorial curator of Adapt Cloud's executive AI & cloud digest. "
        "The candidate stories are supplied inside <evidence>."
    )
    payload = [
        {"id": c.id, "source": c.source, "title": c.title, "url": c.url,
         "published_at": c.published_at.isoformat() if c.published_at else None,
         "description": c.description, "score": c.score}
        for c in candidates
    ]
    user = (
        "Curate the strongest candidates for a concise executive digest. Return a JSON array only. "
        "Each element is an object with: id (copied exactly from one candidate), url (copied exactly from "
        "the same candidate), lead (one original sentence), summary (short and factual), why_adapt, "
        "next_move, category, score_adjustment (a number from -15 to 15), knowledge (array of "
        "{topic, statement, confidence} with confidence a number from 0 to 1). Use only the supplied "
        "metadata; do not copy source prose. Omit candidates that are not relevant.\n\n"
        "Candidates:\n" + evidence_block(payload)
    )
    return system, user


def validate_daily_selection(selected: list[Any], candidates: list[FeedItem]) -> list[dict[str, Any]]:
    """Every id must be an input candidate id, every URL that candidate's URL, every number finite."""
    by_id = {c.id: c for c in candidates}
    accepted: dict[str, dict[str, Any]] = {}
    for row in selected:
        if not isinstance(row, dict):
            continue
        cid = row.get("id")
        if not isinstance(cid, str) or cid not in by_id or cid in accepted:
            continue
        cand = by_id[cid]
        if "url" in row and row["url"] != cand.url:
            continue
        adjustment = finite_number(row.get("score_adjustment"))
        if adjustment is None:
            continue
        adjustment = max(-MAX_ADJUSTMENT, min(MAX_ADJUSTMENT, adjustment))
        final_score = int(max(0, min(100, round(cand.score + adjustment))))
        if final_score < MIN_FINAL_SCORE:
            continue
        lead = bounded_str(row.get("lead"), 320)
        summary = bounded_str(row.get("summary"), 900)
        why = bounded_str(row.get("why_adapt"), 900)
        next_move = bounded_str(row.get("next_move"), 320)
        category = bounded_str(row.get("category"), 100) or "AI Intelligence"
        if not (lead and summary and why and next_move):
            continue
        knowledge = []
        raw_knowledge = row.get("knowledge") if isinstance(row.get("knowledge"), list) else []
        for point in raw_knowledge:
            if not isinstance(point, dict):
                continue
            confidence = finite_number(point.get("confidence"))
            if confidence is None or confidence < MIN_CONFIDENCE or confidence > 1:
                continue
            if "source_url" in point and point["source_url"] != cand.url:
                continue
            topic = bounded_str(point.get("topic"), 120)
            statement = bounded_str(point.get("statement"), 600)
            if topic and statement:
                knowledge.append({"topic": topic, "statement": statement, "confidence": confidence})
        accepted[cid] = {
            "candidate": cand, "lead": lead, "summary": summary, "why_adapt": why, "next_move": next_move,
            "category": category, "score": final_score, "knowledge": knowledge[:MAX_KNOWLEDGE_PER_ITEM],
        }
    return list(accepted.values())


async def _record_not_ready(engine: AsyncEngine, run_key: str, trigger: str, now: datetime, missing) -> None:
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO aidigest.runs (id, kind, run_key, trigger, status, error, created_at, completed_at) "
                "VALUES (:id, 'daily', :key, :trigger, 'schema_not_ready', :error, :now, :now)"),
                {"id": str(uuid.uuid4()), "key": run_key, "trigger": trigger, "now": now,
                 "error": "SCHEMA_NOT_READY: missing " + ", ".join(missing)})
    except SQLAlchemyError:
        log.exception("Could not record SCHEMA_NOT_READY run (runs table unavailable)")


async def _claim(engine: AsyncEngine, run_key: str, trigger: str, now: datetime) -> str | None:
    """Atomically claim the day. Returns the run id, or None if a run is in flight or completed."""
    run_id = str(uuid.uuid4())
    async with engine.begin() as conn:
        await conn.execute(text(
            "UPDATE aidigest.runs SET status='failed', error='abandoned', completed_at=:now "
            "WHERE run_key=:key AND status='running' AND created_at < :cutoff"),
            {"key": run_key, "now": now, "cutoff": now - ABANDON_AFTER})
        claimed = await conn.execute(text(
            "INSERT INTO aidigest.runs (id, kind, run_key, trigger, status, created_at) "
            "VALUES (:id, 'daily', :key, :trigger, 'running', :now) "
            "ON CONFLICT (run_key) WHERE status IN ('running', 'completed') DO NOTHING RETURNING id"),
            {"id": run_id, "key": run_key, "trigger": trigger, "now": now})
        return claimed.scalar()


async def _new_candidates(engine: AsyncEngine, items: list[FeedItem]) -> list[FeedItem]:
    ranked = [i for i in sorted(items, key=lambda i: i.score, reverse=True) if i.score >= MIN_CANDIDATE_SCORE]
    if not ranked:
        return []
    async with engine.connect() as conn:
        known = set((await conn.execute(
            text("SELECT url FROM aidigest.articles WHERE url = ANY(:urls)"),
            {"urls": [i.url for i in ranked]})).scalars())
    return [i for i in ranked if i.url not in known][:MAX_CANDIDATES]


async def _store(engine: AsyncEngine, selected: list[dict[str, Any]], now: datetime) -> tuple[int, int]:
    """Finding 4: count rows actually inserted (RETURNING), not attempted inserts."""
    accepted = knowledge_saved = 0
    async with engine.begin() as conn:
        for item in selected:
            cand: FeedItem = item["candidate"]
            inserted = (await conn.execute(text(
                "INSERT INTO aidigest.articles (id, url, source, title, published_at, lead, summary, why_adapt, "
                "next_move, category, score, created_at) VALUES (:id, :url, :source, :title, :published_at, "
                ":lead, :summary, :why_adapt, :next_move, :category, :score, :now) "
                "ON CONFLICT DO NOTHING RETURNING id"),
                {"id": cand.id, "url": cand.url, "source": cand.source, "title": cand.title,
                 "published_at": cand.published_at, "lead": item["lead"], "summary": item["summary"],
                 "why_adapt": item["why_adapt"], "next_move": item["next_move"], "category": item["category"],
                 "score": item["score"], "now": now})).scalar()
            if inserted is None:
                continue
            accepted += 1
            for k in item["knowledge"]:
                saved = (await conn.execute(text(
                    "INSERT INTO aidigest.knowledge (id, topic, statement, source_url, confidence, created_at) "
                    "VALUES (:id, :topic, :statement, :url, :confidence, :now) ON CONFLICT DO NOTHING RETURNING id"),
                    {"id": url_id(cand.url + k["topic"] + k["statement"]), "topic": k["topic"],
                     "statement": k["statement"], "url": cand.url, "confidence": k["confidence"],
                     "now": now})).scalar()
                knowledge_saved += saved is not None
    return accepted, knowledge_saved


async def _finish(engine, run_id, status, *, candidates=0, accepted=0, error=None) -> None:
    async with engine.begin() as conn:
        await conn.execute(text(
            "UPDATE aidigest.runs SET status=:status, candidates=:candidates, accepted=:accepted, error=:error, "
            "completed_at=:done WHERE id=:id"),
            {"status": status, "candidates": candidates, "accepted": accepted, "error": error,
             "done": datetime.now(timezone.utc), "id": run_id})


async def run_daily(engine: AsyncEngine, ai, fetcher, *, trigger: str, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    run_key = f"daily:{now.astimezone(timezone.utc).date().isoformat()}"

    state = await readiness(engine)  # findings 9/10: never run on a broken schema
    if not state["ready"]:
        log.error("DAILY skipped: SCHEMA_NOT_READY (missing %s)", state["missing_tables"])
        await _record_not_ready(engine, run_key, trigger, now, state["missing_tables"])
        return {"status": "schema_not_ready", "run_key": run_key, "missing_tables": state["missing_tables"]}

    run_id = await _claim(engine, run_key, trigger, now)
    if run_id is None:
        log.info("DAILY %s already running or completed; skipping", run_key)
        return {"status": "duplicate", "run_key": run_key}

    try:
        items, source_errors = await collect_feeds(fetcher)
        errors_text = " | ".join(source_errors)[:1500] or None
        candidates = await _new_candidates(engine, items)
        accepted = knowledge_saved = 0
        if candidates:
            system, user = build_daily_prompt(candidates)
            raw = await ai.complete(system=system, user=user)  # the single AI call
            selected = validate_daily_selection(parse_json_array(raw), candidates)
            accepted, knowledge_saved = await _store(engine, selected, now)
        await _finish(engine, run_id, "completed", candidates=len(candidates), accepted=accepted, error=errors_text)
        return {"status": "completed", "run_id": run_id, "run_key": run_key, "candidates": len(candidates),
                "accepted": accepted, "knowledge_saved": knowledge_saved, "source_errors": source_errors}
    except Exception as exc:
        message = str(exc) if isinstance(exc, AIDigestError) else f"{type(exc).__name__}: {exc}"
        try:
            await _finish(engine, run_id, "failed", error=message[:1500])
        except SQLAlchemyError:
            log.exception("Could not record failed DAILY run %s", run_id)
        if isinstance(exc, SQLAlchemyError):
            raise StorageError("Database error during DAILY run") from exc
        raise
