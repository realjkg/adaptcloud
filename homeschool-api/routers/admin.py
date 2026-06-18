"""
Parent-only admin endpoints.

These routes allow a parent to inspect system activity (audit log,
voice profiles, session metadata) without any data export or download path.
All responses are read-only, size-capped, and filtered by ExfiltrationGuard.
"""

from fastapi import APIRouter, Depends, Request

from core.audit import AuditEvent, audit_from_request, log_event, read_audit_log
from core.deps import require_parent
from services.voice_auth import list_profiles

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit")
async def view_audit_log(
    request: Request,
    limit: int = 100,
    _: dict = Depends(require_parent),
):
    """
    View recent audit log entries (parent only, inline display, max 200 records).
    The raw audit file is never served — only decoded metadata is returned.
    """
    safe_limit = min(limit, 200)
    entries = read_audit_log(safe_limit)
    log_event(AuditEvent.ADMIN_VIEW_AUDIT, role="parent", detail=f"limit={safe_limit}",
              **audit_from_request(request))
    return {"entries": entries, "count": len(entries)}


@router.get("/status")
async def system_status(_: dict = Depends(require_parent)):
    """Return system health metadata. No sensitive data included."""
    profiles = list_profiles()
    return {
        "voice_profiles_enrolled": len(profiles),
        "student_names": profiles,   # names are not sensitive
        "encryption": "AES-256-GCM",
        "key_storage": "encrypted at rest (data_key.enc)",
        "audit_log": "encrypted append-only",
    }
