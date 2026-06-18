import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.encryption import initialize_encryption
from core.middleware import ExfiltrationGuard, RateLimitMiddleware, SecurityHeadersMiddleware
from routers import admin, auth, tutor, voice

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ── Startup: initialise encryption before any requests are served ─────────────
try:
    initialize_encryption(settings.master_secret)
    log.info("Encryption initialised ✓")
except RuntimeError as e:
    log.critical("FATAL: %s", e)
    sys.exit(1)

# ── FastAPI app ───────────────────────────────────────────────────────────────
# API docs are disabled in production — /docs would expose all routes to anyone
# with network access, and the Swagger UI has historically been an attack surface.
app = FastAPI(
    title="Sage Homeschool Tutor API",
    description="Secure agentic AI tutor — Charlotte Mason + Socratic method",
    version="2.0.0",
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url="/redoc" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)

# ── Middleware stack (applied in reverse order of declaration) ────────────────
# Outermost → SecurityHeaders → ExfiltrationGuard → RateLimit → CORS → routes

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(ExfiltrationGuard)

app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,   # explicit whitelist, never "*"
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],     # no PUT/PATCH — reduces attack surface
    allow_headers=["Authorization", "Content-Type"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(tutor.router)
app.include_router(voice.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    """Public health check — returns no sensitive information."""
    return {"status": "ok"}
