"""
Centralised FastAPI dependencies for authentication, authorisation, and
per-family encryption key loading.

Every protected endpoint uses Depends(require_auth) or Depends(require_parent).
Endpoints that read/write encrypted family data also use Depends(get_family_data_key).

These dependencies validate:
  1. JWT signature + expiry
  2. Device fingerprint match (IP + User-Agent bound at token issuance)
  3. Role authorisation (for parent-only routes)
  4. Family encryption key retrieval (loaded fresh per-request, never cached)
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.audit import AuditEvent, audit_from_request, log_event
from core.database import FamilyKey, get_db
from core.middleware import compute_fingerprint
from core.security import decode_token, validate_fingerprint

_bearer = HTTPBearer()


async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    ctx = audit_from_request(request)

    payload = decode_token(credentials.credentials)
    if not payload:
        await log_event(AuditEvent.TOKEN_INVALID, success=False, **ctx)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session — please log in again",
        )

    fp = compute_fingerprint(ctx["ip"], ctx["user_agent"])
    if not validate_fingerprint(payload, fp):
        await log_event(
            AuditEvent.TOKEN_FINGERPRINT_MISMATCH,
            role=payload.get("role"),
            success=False,
            **ctx,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session cannot be used from a different device — please log in again",
        )

    return payload


async def require_parent(auth: dict = Depends(require_auth)) -> dict:
    if auth.get("role") != "parent":
        await log_event(
            AuditEvent.ACCESS_DENIED,
            role=auth.get("role"),
            success=False,
            detail="Parent-only endpoint",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires parent authorisation",
        )
    return auth


async def get_family_data_key(
    auth: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> bytes:
    """Load and unwrap the family DATA_KEY for the current request. Never cached."""
    family_id = auth.get("family_id")
    if not family_id:
        raise HTTPException(status_code=403, detail="No family context in token")

    result = await db.execute(
        select(FamilyKey).where(FamilyKey.family_id == family_id)
    )
    fkey = result.scalar_one_or_none()
    if fkey is None:
        raise HTTPException(status_code=500, detail="Family encryption key not found")

    if fkey.wrapped_key_server:
        from core.encryption import derive_server_wrap_key, unwrap_data_key
        wrap_key = derive_server_wrap_key(family_id, fkey.family_salt)
        return unwrap_data_key(fkey.wrapped_key_server, wrap_key)

    raise HTTPException(status_code=500, detail="No valid key path available for family")
