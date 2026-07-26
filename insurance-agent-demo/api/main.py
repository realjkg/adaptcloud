"""FastAPI entrypoint for the insurance agent demo.

Endpoints:
  GET  /health            liveness
  POST /triage            {narrative} → structured triage decision + claim record
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.config import settings
from services import triage as triage_svc

logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("insurance-agent-demo")

app = FastAPI(title="Adapt Cloud Insurance Agent — demo API", version="0.1.0")

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )


class TriageRequest(BaseModel):
    narrative: str = Field(..., min_length=10, max_length=2000, description="FNOL free-text narrative.")


@app.get("/health")
def health():
    return {"status": "ok", "mode": settings.mode}


@app.post("/triage")
async def triage(body: TriageRequest):
    try:
        return await triage_svc.triage(body.narrative)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        log.exception("triage failed")
        raise HTTPException(status_code=502, detail=f"triage failed: {e}")
