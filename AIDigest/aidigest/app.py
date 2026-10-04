"""FastAPI application factory. The Claude client, fetcher and engine are injectable
so tests never touch the real Claude API or the internet."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from aidigest import __version__
from aidigest.ai import AIClient, BoundedAI, build_anthropic_ai
from aidigest.auth import AuthMiddleware
from aidigest.config import Settings
from aidigest.daily import DailyConfig, run_daily
from aidigest.db import apply_schema, make_engine, readiness
from aidigest.digest import digest_html, digest_rows
from aidigest.errors import AIDigestError, RateLimitError
from aidigest.fetcher import GuardedFetcher
from aidigest.scheduler import scheduler_loop
from aidigest.tasks import TaskConfig, TaskRequest, get_task, run_task

log = logging.getLogger(__name__)

ENDPOINTS = [
    "GET /health", "GET /ops/status", "POST /ops/run-daily", "GET /digest", "GET /digest.json",
    "GET /knowledge?q=finops", "POST /agent/tasks", "GET /agent/tasks/{id}",
]
NO_STORE = {"cache-control": "no-store"}
DIGEST_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"


def create_app(settings: Settings, *, engine: AsyncEngine | None = None, ai: AIClient | None = None,
               fetcher=None) -> FastAPI:
    owns_engine = engine is None
    engine = engine or make_engine(settings.aidigest_database_url)
    # M6: one global cap on concurrent AI calls, shared by DAILY and TASK.
    ai = BoundedAI(ai or build_anthropic_ai(settings), max_concurrency=settings.aidigest_ai_max_concurrency)
    fetcher = fetcher or GuardedFetcher(
        max_bytes=settings.aidigest_fetch_max_bytes,
        max_redirects=settings.aidigest_fetch_max_redirects,
        timeout=settings.aidigest_fetch_timeout_seconds,
        total_timeout=settings.aidigest_fetch_total_seconds,
    )
    daily_config = DailyConfig.from_settings(settings)
    task_config = TaskConfig.from_settings(settings)

    async def scheduled_daily() -> dict:
        return await run_daily(engine, ai, fetcher, trigger="schedule", config=daily_config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            await apply_schema(engine)  # idempotent CREATE ... IF NOT EXISTS
        except Exception:
            log.critical("Schema application failed; /ops/status will report SCHEMA_NOT_READY", exc_info=True)
        try:
            state = await readiness(engine)
            log.info("AIDigest readiness: ready=%s missing=%s", state["ready"], state["missing_tables"])
        except Exception:
            log.critical("Readiness check failed at startup", exc_info=True)
        task = None
        if settings.aidigest_scheduler_enabled:
            task = asyncio.create_task(scheduler_loop(scheduled_daily, settings.daily_hour, settings.daily_minute,
                                                      catch_up=True))
        app.state.scheduler_task = task
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
            if owns_engine:
                await engine.dispose()

    app = FastAPI(title="Adapt Cloud AIDigest", version=__version__, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine = engine
    app.state.ai = ai
    app.state.fetcher = fetcher
    app.state.scheduled_daily = scheduled_daily
    app.state.scheduler_task = None
    app.add_middleware(AuthMiddleware, proxy_secret=settings.aidigest_proxy_secret)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("cache-control", "no-store")
        response.headers.setdefault("x-content-type-options", "nosniff")
        response.headers.setdefault("referrer-policy", "no-referrer")
        response.headers.setdefault("x-frame-options", "DENY")
        return response

    @app.exception_handler(AIDigestError)
    async def _aidigest_error(_request: Request, exc: AIDigestError):
        body = {"error": str(exc)}
        headers = dict(NO_STORE)
        if getattr(exc, "missing_tables", None):
            body["missing_tables"] = exc.missing_tables
        if isinstance(exc, RateLimitError):
            headers["retry-after"] = str(exc.retry_after)
        return JSONResponse(body, status_code=exc.status_code, headers=headers)

    @app.exception_handler(SQLAlchemyError)
    async def _db_error(_request: Request, exc: SQLAlchemyError):
        log.error("Database error: %s", type(exc).__name__)
        return JSONResponse({"error": "Database unavailable"}, status_code=503, headers=NO_STORE)

    def who(request: Request) -> str:
        return request.state.user

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/ops/status")
    async def ops_status(request: Request):
        state = await readiness(engine)
        return JSONResponse({"service": "AIDigest", "version": __version__, "authenticated_as": who(request),
                             **state}, status_code=200 if state["ready"] else 503)

    @app.post("/ops/run-daily")
    async def ops_run_daily():
        result = await run_daily(engine, ai, fetcher, trigger="operator", config=daily_config)
        status = {"completed": 200, "duplicate": 409, "schema_not_ready": 503, "attempts_exhausted": 429,
                  "lost_lease": 409}[result["status"]]
        headers = {"retry-after": "3600"} if status == 429 else None
        return JSONResponse(result, status_code=status, headers=headers)

    @app.get("/digest")
    async def digest_page():
        return HTMLResponse(digest_html(await digest_rows(engine)),
                            headers={**NO_STORE, "content-security-policy": DIGEST_CSP})

    @app.get("/digest.json")
    async def digest_json():
        return JSONResponse(jsonable(await digest_rows(engine)))

    @app.get("/knowledge")
    async def knowledge(q: str | None = None):
        q = (q or "").strip()
        if "\x00" in q:
            return JSONResponse({"error": "q must not contain NUL characters"}, status_code=400)
        if not 2 <= len(q) <= 200:
            return JSONResponse({"error": "Use ?q= with 2-200 characters"}, status_code=400)
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        async with engine.connect() as conn:
            rows = await conn.execute(text(
                "SELECT topic, statement, source_url, confidence, created_at FROM aidigest.knowledge "
                "WHERE topic ILIKE :q OR statement ILIKE :q ORDER BY created_at DESC LIMIT 30"), {"q": like})
            return JSONResponse(jsonable([dict(r) for r in rows.mappings()]))

    @app.post("/agent/tasks")
    async def create_task(body: TaskRequest, request: Request):
        return JSONResponse(await run_task(engine, ai, fetcher, who(request), body, task_config))

    @app.get("/agent/tasks/{task_id}")
    async def read_task(task_id: str, request: Request):
        # Per-user (DESIGN.md section 16): only the caller's own task; anyone else's is a plain 404.
        row = await get_task(engine, task_id, who(request))
        if row is None:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        return JSONResponse(jsonable(row))

    @app.get("/")
    async def index():
        return {"service": "Adapt Cloud AIDigest", "endpoints": ENDPOINTS}

    return app


def jsonable(value):
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(value)
