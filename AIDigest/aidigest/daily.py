"""DAILY: curated feeds -> dedupe -> deterministic relevance -> ONE Claude curation ->
validate -> Postgres -> digest. Gated on readiness; at most one run per UTC day.

Run ownership (M2): claiming the day writes a random owner token and a lease. A heartbeat
extends the lease while the run is alive; another process may take the day over only after
the lease expires. The owner re-checks ownership before the AI call and stores + completes
in ONE transaction that locks its run row and requires `owner = token AND status = 'running'`,
so a resumed stale run can neither call the AI nor write anything. The whole run is bounded
by a budget (M1) that is shorter than the lease, and attempts per day are capped (M6)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from aidigest.ai import bounded_str, finite_number, parse_json_array
from aidigest.db import readiness
from aidigest.errors import AIDigestError, DeadlineError, StorageError
from aidigest.feeds import DEFAULT_PARSE_TIMEOUT, FeedItem, collect_feeds, url_id
from aidigest.prompts import evidence_block, system_prompt

log = logging.getLogger(__name__)

MAX_CANDIDATES = 12
MIN_CANDIDATE_SCORE = 25
MIN_FINAL_SCORE = 55
MAX_ADJUSTMENT = 15
MIN_CONFIDENCE = 0.75
MAX_KNOWLEDGE_PER_ITEM = 3


@dataclass(frozen=True)
class DailyConfig:
    budget_seconds: float = 900.0
    lease_seconds: float = 1200.0
    heartbeat_seconds: float = 60.0
    max_attempts: int = 3
    parse_timeout: float = DEFAULT_PARSE_TIMEOUT

    def __post_init__(self):
        if self.lease_seconds <= self.budget_seconds:
            raise ValueError("the lease (stale-takeover window) must be longer than the run budget")
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")

    @classmethod
    def from_settings(cls, s) -> "DailyConfig":
        return cls(budget_seconds=s.aidigest_daily_budget_seconds, lease_seconds=s.aidigest_daily_lease_seconds,
                   heartbeat_seconds=s.aidigest_daily_heartbeat_seconds, max_attempts=s.aidigest_daily_max_attempts,
                   parse_timeout=s.aidigest_parse_timeout_seconds)


class LostLease(Exception):
    """This process no longer owns the run (another process took the day over)."""


def _db_text(value: str | None) -> str | None:
    return value.replace("\x00", "")[:1500] if value else value


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


async def _claim(engine: AsyncEngine, run_key: str, trigger: str, now: datetime,
                 cfg: DailyConfig) -> tuple[str, str | None, str | None]:
    """Atomically claim the day. Returns (outcome, run_id, owner_token)."""
    run_id, owner = str(uuid.uuid4()), secrets.token_hex(16)
    lease = timedelta(seconds=cfg.lease_seconds)
    async with engine.begin() as conn:
        await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": run_key})
        # Only an EXPIRED lease may be taken over (rows without a lease: by age).
        await conn.execute(text(
            "UPDATE aidigest.runs SET status='failed', error='abandoned', completed_at=:now "
            "WHERE run_key=:key AND status='running' "
            "AND (lease_until < :now OR (lease_until IS NULL AND created_at < :cutoff))"),
            {"key": run_key, "now": now, "cutoff": now - lease})
        attempts = (await conn.execute(text(
            "SELECT count(*) FROM aidigest.runs WHERE run_key=:key AND status='failed'"), {"key": run_key})).scalar()
        if attempts >= cfg.max_attempts:
            return "attempts_exhausted", None, None
        claimed = (await conn.execute(text(
            "INSERT INTO aidigest.runs (id, kind, run_key, trigger, status, owner, lease_until, created_at) "
            "VALUES (:id, 'daily', :key, :trigger, 'running', :owner, :lease_until, :now) "
            "ON CONFLICT (run_key) WHERE status IN ('running', 'completed') DO NOTHING RETURNING id"),
            {"id": run_id, "key": run_key, "trigger": trigger, "owner": owner, "lease_until": now + lease,
             "now": now})).scalar()
    return ("claimed", run_id, owner) if claimed else ("duplicate", None, None)


async def refresh_lease(engine: AsyncEngine, run_id: str, owner: str, lease_until: datetime) -> bool:
    async with engine.begin() as conn:
        result = await conn.execute(text(
            "UPDATE aidigest.runs SET lease_until=:lease WHERE id=:id AND owner=:owner AND status='running'"),
            {"lease": lease_until, "id": run_id, "owner": owner})
        return result.rowcount == 1


async def _heartbeat(engine, run_id, owner, clock, cfg: DailyConfig) -> None:
    while True:
        await asyncio.sleep(cfg.heartbeat_seconds)
        try:
            if not await refresh_lease(engine, run_id, owner, clock() + timedelta(seconds=cfg.lease_seconds)):
                log.warning("DAILY %s lost its lease; heartbeat stopped", run_id)
                return
        except SQLAlchemyError:
            log.exception("DAILY lease heartbeat failed")


async def _assert_owner(engine: AsyncEngine, run_id: str, owner: str) -> None:
    async with engine.connect() as conn:
        row = (await conn.execute(text(
            "SELECT 1 FROM aidigest.runs WHERE id=:id AND owner=:owner AND status='running'"),
            {"id": run_id, "owner": owner})).scalar()
    if row is None:
        raise LostLease(run_id)


async def _new_candidates(engine: AsyncEngine, items: list[FeedItem]) -> list[FeedItem]:
    ranked = [i for i in sorted(items, key=lambda i: i.score, reverse=True) if i.score >= MIN_CANDIDATE_SCORE]
    if not ranked:
        return []
    async with engine.connect() as conn:
        known = set((await conn.execute(
            text("SELECT url FROM aidigest.articles WHERE url = ANY(:urls)"),
            {"urls": [i.url for i in ranked]})).scalars())
    return [i for i in ranked if i.url not in known][:MAX_CANDIDATES]


async def _store_and_complete(engine: AsyncEngine, run_id: str, owner: str, selected: list[dict[str, Any]],
                             now: datetime, candidates: int, errors_text: str | None) -> tuple[int, int]:
    """One transaction: lock our run row (owner + running), insert, mark completed.
    Finding 4: count rows actually inserted (RETURNING), not attempted inserts."""
    accepted = knowledge_saved = 0
    async with engine.begin() as conn:
        mine = (await conn.execute(text(
            "SELECT id FROM aidigest.runs WHERE id=:id AND owner=:owner AND status='running' FOR UPDATE"),
            {"id": run_id, "owner": owner})).scalar()
        if mine is None:
            raise LostLease(run_id)
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
        await conn.execute(text(
            "UPDATE aidigest.runs SET status='completed', candidates=:candidates, accepted=:accepted, error=:error, "
            "completed_at=:done WHERE id=:id AND owner=:owner AND status='running'"),
            {"candidates": candidates, "accepted": accepted, "error": _db_text(errors_text),
             "done": datetime.now(timezone.utc), "id": run_id, "owner": owner})
    return accepted, knowledge_saved


async def _finish_failed(engine: AsyncEngine, run_id: str, owner: str, error: str) -> None:
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "UPDATE aidigest.runs SET status='failed', error=:error, completed_at=:done "
                "WHERE id=:id AND owner=:owner AND status='running'"),
                {"error": _db_text(error), "done": datetime.now(timezone.utc), "id": run_id, "owner": owner})
    except SQLAlchemyError:
        log.exception("Could not record failed DAILY run %s", run_id)


async def _execute(engine, ai, fetcher, run_id: str, owner: str, run_key: str, now: datetime,
                   cfg: DailyConfig) -> dict:
    items, source_errors = await collect_feeds(fetcher, parse_timeout=cfg.parse_timeout)
    errors_text = " | ".join(source_errors) or None
    candidates = await _new_candidates(engine, items)
    selected: list[dict[str, Any]] = []
    if candidates:
        await _assert_owner(engine, run_id, owner)  # never spend an AI call on a run we no longer own
        system, user = build_daily_prompt(candidates)
        raw = await ai.complete(system=system, user=user)  # the single AI call
        selected = validate_daily_selection(parse_json_array(raw), candidates)
    accepted, knowledge_saved = await _store_and_complete(
        engine, run_id, owner, selected, now, len(candidates), errors_text)
    return {"status": "completed", "run_id": run_id, "run_key": run_key, "candidates": len(candidates),
            "accepted": accepted, "knowledge_saved": knowledge_saved, "source_errors": source_errors}


async def run_daily(engine: AsyncEngine, ai, fetcher, *, trigger: str, now: datetime | None = None,
                    config: DailyConfig | None = None) -> dict:
    cfg = config or DailyConfig()
    clock = (lambda: now) if now is not None else (lambda: datetime.now(timezone.utc))
    started = clock()
    run_key = f"daily:{started.astimezone(timezone.utc).date().isoformat()}"

    state = await readiness(engine)  # findings 9/10: never run on a broken schema
    if not state["ready"]:
        log.error("DAILY skipped: SCHEMA_NOT_READY (missing %s)", state["missing_tables"])
        await _record_not_ready(engine, run_key, trigger, started, state["missing_tables"])
        return {"status": "schema_not_ready", "run_key": run_key, "missing_tables": state["missing_tables"]}

    outcome, run_id, owner = await _claim(engine, run_key, trigger, started, cfg)
    if outcome == "attempts_exhausted":
        log.warning("DAILY %s: %d failed attempts today; not retrying", run_key, cfg.max_attempts)
        return {"status": "attempts_exhausted", "run_key": run_key, "max_attempts": cfg.max_attempts}
    if outcome == "duplicate":
        log.info("DAILY %s already running or completed; skipping", run_key)
        return {"status": "duplicate", "run_key": run_key}

    heartbeat = asyncio.create_task(_heartbeat(engine, run_id, owner, clock, cfg))
    try:
        return await asyncio.wait_for(
            _execute(engine, ai, fetcher, run_id, owner, run_key, started, cfg), cfg.budget_seconds)
    except LostLease:
        log.warning("DAILY %s lost its lease to another run; exiting without side effects", run_id)
        return {"status": "lost_lease", "run_id": run_id, "run_key": run_key}
    except TimeoutError as exc:
        await _finish_failed(engine, run_id, owner, f"run budget of {cfg.budget_seconds:g}s exceeded")
        raise DeadlineError(f"DAILY run budget of {cfg.budget_seconds:g}s exceeded") from exc
    except Exception as exc:
        message = str(exc) if isinstance(exc, AIDigestError) else f"{type(exc).__name__}: {exc}"
        await _finish_failed(engine, run_id, owner, message)
        if isinstance(exc, SQLAlchemyError):
            raise StorageError("Database error during DAILY run") from exc
        raise
    finally:
        heartbeat.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat
