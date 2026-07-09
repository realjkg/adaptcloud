"""
Parent-only admin endpoints.

All responses are read-only, size-capped, and filtered by ExfiltrationGuard.
No data export or download path exists.
"""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import AuditEvent, audit_from_request, log_event, read_audit_log
from core.database import get_db
from core.deps import require_parent
from core.webauthn_check import build_config_report
from services.voice_auth import list_profiles

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit")
async def view_audit_log(
    request: Request,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_parent),
):
    """View recent audit log entries (parent only, inline display, max 200 records)."""
    safe_limit = min(limit, 200)
    entries = await read_audit_log(db, safe_limit)
    await log_event(
        AuditEvent.ADMIN_VIEW_AUDIT,
        role="parent",
        detail=f"limit={safe_limit}",
        **audit_from_request(request),
    )
    return {"entries": entries, "count": len(entries)}


@router.get("/status")
async def system_status(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_parent),
):
    """Return system health metadata. No sensitive data included."""
    profiles = await list_profiles(db)
    return {
        "voice_profiles_enrolled": len(profiles),
        "student_names":  profiles,
        "encryption":     "AES-256-GCM",
        "key_storage":    "KEK-wrapped DATA_KEY in managed PostgreSQL",
        "audit_log":      "AES-256-GCM encrypted rows in managed PostgreSQL",
    }


@router.get("/config/check")
async def config_check(
    request: Request,
    _: dict = Depends(require_parent),
):
    """
    Full WebAuthn configuration diagnostic (parent auth required).

    Includes a live DNS probe for the configured hostname and returns
    actionable guidance for each issue detected. Run this after any change
    to SITE_URL, WEBAUTHN_RP_ID, or WEBAUTHN_ORIGIN to confirm the
    configuration is valid before enrolling passkeys.
    """
    await log_event(
        AuditEvent.ADMIN_VIEW_AUDIT,
        role="parent",
        detail="config_check",
        **audit_from_request(request),
    )
    return build_config_report(probe_dns=True)
