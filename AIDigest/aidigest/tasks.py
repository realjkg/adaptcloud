"""TASK: authenticated user -> strict validation -> deterministic mode -> bounded read-only
evidence -> ONE Claude synthesis -> validate -> optional source-backed knowledge -> Postgres."""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from aidigest.ai import bounded_str, finite_number, parse_json_object
from aidigest.budget import Budget, db_tx, is_db_timeout, run_within
from aidigest.db import readiness
from aidigest.errors import (
    AIDigestError,
    AIError,
    DeadlineError,
    NotReadyError,
    RateLimitError,
    StorageError,
    UnsafeURLError,
)
from aidigest.feeds import DEFAULT_PARSE_TIMEOUT, clean_text, collect_feeds, run_parser, url_id
from aidigest.fetcher import validate_url
from aidigest.prompts import evidence_block, system_prompt

log = logging.getLogger(__name__)

Mode = Literal["auto", "research", "compare", "summarize", "knowledge_lookup", "build_brief", "opportunity_analysis"]
FEED_MODES = {"research", "compare", "opportunity_analysis", "build_brief"}
ACTION_TYPES = {"REVIEW", "EXPERIMENT", "CUSTOMER_DISCUSSION", "CONTENT", "WATCH"}
MAX_URLS = 3
MAX_EVIDENCE = 24
MAX_URL_TEXT = 14_000
MAX_KNOWLEDGE_SAVED = 4
MIN_CONFIDENCE = 0.75
STOPWORDS = {"this", "that", "with", "from", "what", "recent", "latest", "adapt", "cloud"}


@dataclass(frozen=True)
class TaskConfig:
    budget_seconds: float = 600.0
    hourly_limit: int = 20
    parse_timeout: float = DEFAULT_PARSE_TIMEOUT

    @classmethod
    def from_settings(cls, s) -> "TaskConfig":
        return cls(budget_seconds=s.aidigest_task_budget_seconds, hourly_limit=s.aidigest_task_hourly_limit,
                   parse_timeout=s.aidigest_parse_timeout_seconds)


class TaskRequest(BaseModel):
    """Finding 7: strict runtime validation of the request body."""

    model_config = ConfigDict(extra="forbid", strict=True)

    task: str = Field(min_length=4, max_length=4000)
    mode: Mode = "auto"
    urls: list[str] = Field(default_factory=list, max_length=MAX_URLS)
    persist_knowledge: bool = True

    @field_validator("task")
    @classmethod
    def _task_not_blank(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("task must not contain NUL characters")
        value = value.strip()
        if len(value) < 4:
            raise ValueError("task must contain at least 4 non-blank characters")
        return value

    @field_validator("urls")
    @classmethod
    def _urls_https(cls, value: list[str]) -> list[str]:
        for url in value:
            try:
                validate_url(url)
            except UnsafeURLError as exc:
                raise ValueError(f"{url!r}: {exc}") from None
        return value


def resolve_mode(task: str, mode: str, urls: list[str]) -> str:
    if mode != "auto":
        return mode
    if urls:
        return "summarize"
    t = task.lower()
    if re.search(r"compare|versus|difference", t):
        return "compare"
    if re.search(r"opportunit|customer|buyer|procurement", t):
        return "opportunity_analysis"
    if re.search(r"brief|memo|executive", t):
        return "build_brief"
    if re.search(r"knowledge|previous|history|already know", t):
        return "knowledge_lookup"
    return "research"


def extract_terms(task: str) -> list[str]:
    words = re.sub(r"[^a-z0-9\s-]", " ", task.lower()).split()
    return [w for w in words if len(w) > 3 and w not in STOPWORDS][:5]


async def _knowledge_evidence(engine: AsyncEngine, task: str, budget: Budget | None = None) -> list[dict]:
    terms = extract_terms(task)
    if not terms:
        return []
    async with db_tx(engine, budget) as conn:
        rows = await conn.execute(text(
            "SELECT topic, statement, source_url FROM aidigest.knowledge "
            "WHERE lower(topic || ' ' || statement) LIKE :p ORDER BY created_at DESC LIMIT 12"),
            {"p": "%" + "%".join(terms) + "%"})
        return [{"kind": "knowledge", "source": r.topic, "url": r.source_url, "text": r.statement} for r in rows]


async def _digest_evidence(engine: AsyncEngine, budget: Budget | None = None) -> list[dict]:
    async with db_tx(engine, budget) as conn:
        rows = await conn.execute(text(
            "SELECT title, url, summary, why_adapt FROM aidigest.articles "
            "ORDER BY created_at DESC, score DESC LIMIT 10"))
        return [{"kind": "digest", "source": r.title, "url": r.url,
                 "text": f"{r.summary} Why Adapt cares: {r.why_adapt}"} for r in rows]


async def gather_evidence(engine: AsyncEngine, fetcher, req: TaskRequest, mode: str,
                          parse_timeout: float = DEFAULT_PARSE_TIMEOUT, budget: Budget | None = None) -> list[dict]:
    """Finding 6: explicit URLs take the first evidence slots; the cap is applied afterwards.
    Page cleaning runs in a worker thread under a deadline (H1)."""
    evidence: list[dict] = []
    for url in req.urls[:MAX_URLS]:
        page = await fetcher.fetch(url)
        cleaned = await run_parser(clean_text, page.text, timeout=parse_timeout)
        evidence.append({"kind": "url", "source": validate_url(page.url).host, "url": page.url,
                         "text": cleaned[:MAX_URL_TEXT]})
    evidence.extend(await _knowledge_evidence(engine, req.task, budget))
    if mode != "knowledge_lookup":
        evidence.extend(await _digest_evidence(engine, budget))
    if not req.urls and mode in FEED_MODES:
        items, _errors = await collect_feeds(fetcher, parse_timeout=parse_timeout)
        for item in sorted(items, key=lambda i: i.score, reverse=True)[:8]:
            evidence.append({"kind": "feed", "source": f"{item.source}: {item.title}", "url": item.url,
                             "text": item.description})
    return evidence[:MAX_EVIDENCE]


def build_task_prompt(mode: str, task: str, evidence: list[dict]) -> tuple[str, str]:
    system = system_prompt(
        "You are AIDigest, Adapt Cloud's bounded research analyst. You answer one task using only the "
        "evidence supplied inside <evidence>. You have no tools and cannot take actions."
    )
    user = (
        f"Task mode: {mode}\n"
        f"User task: {task}\n\n"
        "Return one JSON object: {\"answer\": string, \"factual_findings\": [string], "
        "\"adapt_implications\": [string], \"recommended_actions\": [{\"type\": \"REVIEW|EXPERIMENT|"
        "CUSTOMER_DISCUSSION|CONTENT|WATCH\", \"text\": string}], \"citations\": [url], "
        "\"knowledge\": [{\"topic\": string, \"statement\": string, \"source_url\": url, "
        "\"confidence\": number 0-1}]}. Cite and attribute knowledge only to URLs that appear in the "
        "evidence.\n\nEvidence:\n" + evidence_block(evidence)
    )
    return system, user


def _strings(value: Any, limit: int, count: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [bounded_str(v, limit) for v in value if isinstance(v, str) and v.strip()][:count]


def sanitize_task_result(parsed: dict, observed: set[str], persist: bool,
                         fetched: set[str] | None = None) -> tuple[dict, list[dict]]:
    """Citations must be URLs present in the evidence (`observed`); durable knowledge must come
    from a URL actually fetched in THIS task (`fetched`, L7)."""
    fetched = observed if fetched is None else fetched
    answer = bounded_str(parsed.get("answer"), 6000)
    if not answer:
        raise AIError("Model output has no answer")
    actions = []
    raw_actions = parsed.get("recommended_actions") if isinstance(parsed.get("recommended_actions"), list) else []
    for action in raw_actions:
        if isinstance(action, dict) and action.get("type") in ACTION_TYPES and bounded_str(action.get("text"), 600):
            actions.append({"type": action["type"], "text": bounded_str(action["text"], 600)})
    citations: list[str] = []
    raw_citations = parsed.get("citations") if isinstance(parsed.get("citations"), list) else []
    for url in raw_citations:
        if isinstance(url, str) and url in observed and url not in citations:
            citations.append(url)
    result = {
        "answer": answer,
        "factual_findings": _strings(parsed.get("factual_findings"), 1000, 12),
        "adapt_implications": _strings(parsed.get("adapt_implications"), 1000, 12),
        "recommended_actions": actions[:8],
        "citations": citations[:12],
    }
    knowledge: list[dict] = []
    raw_knowledge = parsed.get("knowledge") if isinstance(parsed.get("knowledge"), list) else []
    if persist:
        for point in raw_knowledge:
            if not isinstance(point, dict):
                continue
            source_url = point.get("source_url")
            if not isinstance(source_url, str) or source_url not in fetched:
                continue
            confidence = finite_number(point.get("confidence"))
            if confidence is None or confidence < MIN_CONFIDENCE or confidence > 1:
                continue
            topic = bounded_str(point.get("topic"), 120)
            statement = bounded_str(point.get("statement"), 600)
            if topic and statement:
                knowledge.append({"topic": topic, "statement": statement, "source_url": source_url,
                                  "confidence": confidence})
    return result, knowledge[:MAX_KNOWLEDGE_SAVED]


async def _save_knowledge(engine: AsyncEngine, knowledge: list[dict], now: datetime,
                          budget: Budget | None = None) -> int:
    saved = 0
    async with db_tx(engine, budget) as conn:
        for k in knowledge:
            row = (await conn.execute(text(
                "INSERT INTO aidigest.knowledge (id, topic, statement, source_url, confidence, created_at) "
                "VALUES (:id, :topic, :statement, :url, :confidence, :now) ON CONFLICT DO NOTHING RETURNING id"),
                {"id": url_id(k["source_url"] + k["topic"] + k["statement"]), "topic": k["topic"],
                 "statement": k["statement"], "url": k["source_url"], "confidence": k["confidence"],
                 "now": now})).scalar()
            saved += row is not None
    return saved


async def _finish_task(engine, task_id: str, status: str, *, result=None, error=None,
                       budget: Budget | None = None, reserve: bool = False) -> None:
    async with db_tx(engine, budget, reserve=reserve) as conn:
        await conn.execute(text(
            "UPDATE aidigest.tasks SET status=:status, result_json=:result, error=:error, completed_at=:done "
            "WHERE id=:id"),
            {"status": status, "result": json.dumps(result) if result is not None else None, "error": error,
             "done": datetime.now(timezone.utc), "id": task_id})


async def _create_task_row(engine: AsyncEngine, task_id: str, requested_by: str, req: TaskRequest, mode: str,
                           now: datetime, hourly_limit: int, budget: Budget | None = None) -> None:
    """Insert the task row unless the user's hourly cap is reached (M6). The per-user advisory
    lock makes count-then-insert atomic across concurrent requests and workers; waiting for it is
    bounded by the task budget (lock_timeout)."""
    try:
        async with db_tx(engine, budget) as conn:
            await conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": "task:" + requested_by})
            recent = (await conn.execute(text(
                "SELECT count(*) FROM aidigest.tasks WHERE requested_by=:by AND created_at > :since"),
                {"by": requested_by, "since": now - timedelta(hours=1)})).scalar()
            if recent >= hourly_limit:
                raise RateLimitError(f"Task limit of {hourly_limit} per hour reached", retry_after=3600)
            await conn.execute(text(
                "INSERT INTO aidigest.tasks (id, requested_by, request_text, mode, status, created_at) "
                "VALUES (:id, :by, :req, :mode, 'running', :now)"),
                {"id": task_id, "by": requested_by, "req": req.task, "mode": mode, "now": now})
    except SQLAlchemyError as exc:
        if is_db_timeout(exc):
            raise   # the budget ran out while waiting: reported as a deadline by run_within
        raise StorageError("Could not create task") from exc


async def _execute_task(engine, ai, fetcher, req: TaskRequest, mode: str, now: datetime, cfg: TaskConfig,
                        budget: Budget | None = None) -> dict:
    evidence = await gather_evidence(engine, fetcher, req, mode, cfg.parse_timeout, budget)
    observed = {e["url"] for e in evidence if e.get("url")}
    fetched = {e["url"] for e in evidence if e["kind"] == "url"}
    system, user = build_task_prompt(mode, req.task, evidence)
    raw = await ai.complete(system=system, user=user)  # the single AI call
    result, knowledge = sanitize_task_result(parse_json_object(raw), observed, req.persist_knowledge, fetched)
    result["knowledge_saved"] = await _save_knowledge(engine, knowledge, now, budget)
    return result


async def run_task(engine: AsyncEngine, ai, fetcher, requested_by: str, req: TaskRequest,
                   config: TaskConfig | None = None) -> dict:
    cfg = config or TaskConfig()
    # Review 4177765211: ONE absolute deadline for everything below, taken at entry.
    budget = Budget(cfg.budget_seconds)
    over = f"Task budget of {cfg.budget_seconds:g}s exceeded"
    try:
        state = await run_within(budget, readiness(engine, budget), "readiness")
    except DeadlineError as exc:
        raise DeadlineError(f"{over} (database not answering)") from exc
    if not state["ready"]:  # finding 9: gate BEFORE creating a task row
        raise NotReadyError(state["missing_tables"])

    mode = resolve_mode(req.task, req.mode, req.urls)
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    requested_by = _normalise_user(requested_by)
    try:
        await run_within(budget, _create_task_row(engine, task_id, requested_by, req, mode, now, cfg.hourly_limit,
                                                  budget), "task creation")
    except DeadlineError as exc:   # no row exists: nothing to record, the caller gets 504
        raise DeadlineError(f"{over} (waiting to create the task)") from exc

    try:
        result = await run_within(budget, _execute_task(engine, ai, fetcher, req, mode, now, cfg, budget), "the task")
        await run_within(budget, _finish_task(engine, task_id, "completed", result=result, budget=budget),
                         "recording the result")
        return {"id": task_id, "status": "completed", "mode": mode, "result": result}
    except Exception as exc:  # finding 8: classify, record on the task row, re-raise mapped
        if isinstance(exc, DeadlineError):
            mapped: AIDigestError = DeadlineError(over)
        elif isinstance(exc, AIDigestError):
            mapped = exc
        elif isinstance(exc, SQLAlchemyError):
            mapped = StorageError("Database error while running task")
        else:
            log.exception("Unexpected error in task %s", task_id)
            mapped = AIDigestError("Internal error")
        detail = str(mapped) if isinstance(exc, DeadlineError) else (
            str(exc) if isinstance(exc, AIDigestError) else f"{type(exc).__name__}: {exc}")
        try:   # the reserved slice: recording the failure cannot outlast the budget either
            await run_within(budget, _finish_task(
                engine, task_id, "failed", error=f"{mapped.status_code}: {detail}".replace("\x00", "")[:1500],
                budget=budget, reserve=True), "recording the failure", reserve=True)
        except (SQLAlchemyError, DeadlineError):
            log.exception("Could not record failure for task %s", task_id)
        if mapped is exc:
            raise
        raise mapped from exc


def _normalise_user(user: str) -> str:
    """The form stored in tasks.requested_by; reads compare against the same form."""
    return user.replace("\x00", "")[:320]


async def get_task(engine: AsyncEngine, task_id: str, requested_by: str) -> dict | None:
    """The task only if `requested_by` created it (PR review 4177765103). Another user's task is
    None, exactly like an unknown id, so its existence is not revealed."""
    try:
        uuid.UUID(task_id)
    except ValueError:
        return None
    async with db_tx(engine, None) as conn:
        row = (await conn.execute(text(
            "SELECT id, requested_by, request_text, mode, status, result_json, error, created_at, completed_at "
            "FROM aidigest.tasks WHERE id=:id AND requested_by=:by"),
            {"id": task_id, "by": _normalise_user(requested_by)})).mappings().first()
    if row is None:
        return None
    out = dict(row)
    out["result"] = json.loads(out.pop("result_json")) if out.get("result_json") else None
    return out
