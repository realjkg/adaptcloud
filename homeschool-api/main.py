import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import create_tables, engine
from core.encryption import init_server_key
from core.middleware import ExfiltrationGuard, RateLimitMiddleware, SecurityHeadersMiddleware, WriteAnomalyMiddleware
from core.webauthn_check import build_config_report
from routers import admin, auth, catalog, narration, pod, transcripts, tutor, voice

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await create_tables()

        if settings.server_key:
            init_server_key(settings.server_key)
            log.info("Server encryption key loaded")
        else:
            log.warning(
                "SERVER_KEY is not set — per-family encryption unavailable. "
                "Acceptable in desktop/offline mode only."
            )
    except Exception as exc:
        log.critical("FATAL startup error: %s", exc)
        sys.exit(1)

    yield

    await engine.dispose()
    log.info("Database connections closed")


app = FastAPI(
    title="Bede Homeschool Tutor API",
    description="Secure agentic AI tutor — Charlotte Mason + Socratic method",
    version="4.0.0",
    lifespan=lifespan,
    docs_url="/docs"        if settings.api_docs_enabled else None,
    redoc_url="/redoc"      if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)

# Middleware applied in reverse declaration order:
# Outermost → SecurityHeaders → ExfiltrationGuard → RateLimit → WriteAnomaly → CORS → routes
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(ExfiltrationGuard)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(WriteAnomalyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(tutor.router)
app.include_router(narration.router)
app.include_router(transcripts.router)
app.include_router(voice.router)
app.include_router(admin.router)
app.include_router(pod.router)
app.include_router(catalog.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/config")
async def public_config():
    """
    Public endpoint — returns WebAuthn configuration and security tier.

    No authentication required: browsers need the rp_id/origin to start the
    passkey ceremony before any login exists. Returns the same data available
    in the browser's own window.location, so there is no sensitive disclosure.

    Use GET /admin/config/check (parent auth) for the full diagnostic report
    including a live DNS probe.
    """
    return build_config_report(probe_dns=False)
