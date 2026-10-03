"""TASK: authenticated user -> strict validation -> deterministic mode -> bounded read-only
evidence -> ONE Claude synthesis -> validate -> optional source-backed knowledge -> Postgres."""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from aidigest.ai import bounded_str, finite_number, parse_json_object
from aidigest.db import readiness
from aidigest.errors import AIDigestError, AIError, NotReadyError, StorageError, UnsafeURLError
from aidigest.feeds import clean_text, collect_feeds, url_id
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


async def _knowledge_evidence(engine: AsyncEngine, task: str) -> list[dict]:
    terms = extract_terms(task)
    if not terms:
        return []
    async with engine.connect() as conn:
        rows = await conn.execute(text(
            "SELECT topic, statement, source_url FROM aidigest.knowledge "
            "WHERE lower(topic || ' ' || statement) LIKE :p ORDER BY created_at DESC LIMIT 12"),
            {"p": "%" + "%".join(terms) + "%"})
        return [{"kind": "knowledge", "source": r.topic, "url": r.source_url, "text": r.statement} for r in rows]


async def _digest_evidence(engine: AsyncEngine) -> list[dict]:
    async with engine.connect() as conn:
        rows = await conn.execute(text(
            "SELECT title, url, summary, why_adapt FROM aidigest.articles "
            "ORDER BY created_at DESC, score DESC LIMIT 10"))
        return [{"kind": "digest", "source": r.title, "url": r.url,
                 "text": f"{r.summary} Why Adapt cares: {r.why_adapt}"} for r in rows]


async def gather_evidence(engine: AsyncEngine, fetcher, req: TaskRequest, mode: str) -> list[dict]:
    """Finding 6: explicit URLs take the first evidence slots; the cap is applied afterwards."""
    evidence: list[dict] = []
    for url in req.urls[:MAX_URLS]:
        page = await fetcher.fetch(url)
        evidence.append({"kind": "url", "source": validate_url(page.url).host, "url": page.url,
                         "text": clean_text(page.text)[:MAX_URL_TEXT]})
    evidence.extend(await _knowledge_evidence(engine, req.task))
    if mode != "knowledge_lookup":
        evidence.extend(await _digest_evidence(engine))
    if not req.urls and mode in FEED_MODES:
        items, _errors = await collect_feeds(fetcher)
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


def sanitize_task_result(parsed: dict, observed: set[str], persist: bool) -> tuple[dict, list[dict]]:
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
            if not isinstance(source_url, str) or source_url not in observed:
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


async def _save_knowledge(engine: AsyncEngine, knowledge: list[dict], now: datetime) -> int:
    saved = 0
    async with engine.begin() as conn:
        for k in knowledge:
            row = (await conn.execute(text(
                "INSERT INTO aidigest.knowledge (id, topic, statement, source_url, confidence, created_at) "
                "VALUES (:id, :topic, :statement, :url, :confidence, :now) ON CONFLICT DO NOTHING RETURNING id"),
                {"id": url_id(k["source_url"] + k["topic"] + k["statement"]), "topic": k["topic"],
                 "statement": k["statement"], "url": k["source_url"], "confidence": k["confidence"],
                 "now": now})).scalar()
            saved += row is not None
    return saved


async def _finish_task(engine, task_id: str, status: str, *, result=None, error=None) -> None:
    async with engine.begin() as conn:
        await conn.execute(text(
            "UPDATE aidigest.tasks SET status=:status, result_json=:result, error=:error, completed_at=:done "
            "WHERE id=:id"),
            {"status": status, "result": json.dumps(result) if result is not None else None, "error": error,
             "done": datetime.now(timezone.utc), "id": task_id})


async def run_task(engine: AsyncEngine, ai, fetcher, requested_by: str, req: TaskRequest) -> dict:
    state = await readiness(engine)  # finding 9: gate BEFORE creating a task row
    if not state["ready"]:
        raise NotReadyError(state["missing_tables"])

    mode = resolve_mode(req.task, req.mode, req.urls)
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO aidigest.tasks (id, requested_by, request_text, mode, status, created_at) "
                "VALUES (:id, :by, :req, :mode, 'running', :now)"),
                {"id": task_id, "by": requested_by[:320], "req": req.task, "mode": mode, "now": now})
    except SQLAlchemyError as exc:
        raise StorageError("Could not create task") from exc

    try:
        evidence = await gather_evidence(engine, fetcher, req, mode)
        observed = {e["url"] for e in evidence if e.get("url")}
        system, user = build_task_prompt(mode, req.task, evidence)
        raw = await ai.complete(system=system, user=user)  # the single AI call
        result, knowledge = sanitize_task_result(parse_json_object(raw), observed, req.persist_knowledge)
        result["knowledge_saved"] = await _save_knowledge(engine, knowledge, now)
        await _finish_task(engine, task_id, "completed", result=result)
        return {"id": task_id, "status": "completed", "mode": mode, "result": result}
    except Exception as exc:  # finding 8: classify, record on the task row, re-raise mapped
        if isinstance(exc, AIDigestError):
            mapped: AIDigestError = exc
        elif isinstance(exc, SQLAlchemyError):
            mapped = StorageError("Database error while running task")
        else:
            log.exception("Unexpected error in task %s", task_id)
            mapped = AIDigestError("Internal error")
        detail = str(exc) if isinstance(exc, AIDigestError) else f"{type(exc).__name__}: {exc}"
        try:
            await _finish_task(engine, task_id, "failed", error=f"{mapped.status_code}: {detail}"[:1500])
        except SQLAlchemyError:
            log.exception("Could not record failure for task %s", task_id)
        if mapped is exc:
            raise
        raise mapped from exc


async def get_task(engine: AsyncEngine, task_id: str) -> dict | None:
    try:
        uuid.UUID(task_id)
    except ValueError:
        return None
    async with engine.connect() as conn:
        row = (await conn.execute(text(
            "SELECT id, requested_by, request_text, mode, status, result_json, error, created_at, completed_at "
            "FROM aidigest.tasks WHERE id=:id"), {"id": task_id})).mappings().first()
    if row is None:
        return None
    out = dict(row)
    out["result"] = json.loads(out.pop("result_json")) if out.get("result_json") else None
    return out
