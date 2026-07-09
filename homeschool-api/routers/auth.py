"""
WebAuthn passkey authentication — no passwords or PINs.

Endpoints:
  POST /auth/register/begin      → registration options (with PRF extension)
  POST /auth/register/complete   → create family + passkey + issue JWT
  POST /auth/login/begin         → authentication options (with PRF extension)
  POST /auth/login/complete      → verify assertion + issue JWT
  POST /auth/child/enroll/begin  → child registration options (parent JWT required)
  POST /auth/child/enroll/complete
  POST /auth/child/login/begin   → child authentication options
  POST /auth/child/login/complete → issue child-scoped JWT
  GET  /auth/validate            → check JWT validity
  POST /auth/logout              → client-side (returns 200, token discarded by client)
"""

import base64
import json
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import webauthn
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)
from webauthn.helpers.cose import COSEAlgorithmIdentifier

from core.audit import AuditEvent, audit_from_request, log_event
from core.config import settings
from core.database import (
    Family,
    FamilyKey,
    FamilyUser,
    PasskeyCredential,
    RecoveryCode,
    get_db,
)
from core.encryption import (
    derive_server_wrap_key,
    encrypt_json,
    generate_data_key,
    generate_recovery_codes,
    hash_recovery_code,
    new_family_salt,
    new_prf_input,
    wrap_data_key,
)
from core.middleware import compute_fingerprint
from core.security import create_access_token, decode_token, validate_fingerprint
from models.schemas import (
    ChildEnrollBeginRequest,
    ChildEnrollCompleteRequest,
    ChildLoginBeginRequest,
    ChildLoginCompleteRequest,
    LoginCompleteRequest,
    PasskeyTokenResponse,
    RegisterBeginRequest,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer()

# In-process challenge stores. For multi-instance deployments these must move
# to Redis — a single-process assumption is documented here intentionally.
_challenges: dict[str, tuple[bytes, float]] = {}
_reg_state: dict[str, tuple] = {}
_auth_state: dict[str, tuple] = {}
_CHALLENGE_TTL = 300


def _store_challenge(session_id: str, challenge: bytes) -> None:
    _challenges[session_id] = (challenge, time.time() + _CHALLENGE_TTL)
    expired = [k for k, (_, exp) in _challenges.items() if time.time() > exp]
    for k in expired:
        _challenges.pop(k, None)


def _consume_challenge(session_id: str) -> Optional[bytes]:
    entry = _challenges.pop(session_id, None)
    if not entry:
        return None
    challenge, expires = entry
    return None if time.time() > expires else challenge


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _from_b64url(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


def _add_prf_extension(options_dict: dict, prf_input: bytes) -> dict:
    options_dict.setdefault("extensions", {})
    options_dict["extensions"]["prf"] = {
        "eval": {"first": _b64url(prf_input)}
    }
    return options_dict


@router.post("/register/begin")
async def register_begin(req: RegisterBeginRequest):
    prf_input = new_prf_input()
    family_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    options = webauthn.generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=user_id.encode(),
        user_name=req.family_name,
        user_display_name=req.parent_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[COSEAlgorithmIdentifier.ECDSA_SHA_256],
    )

    session_id = secrets.token_urlsafe(24)
    expires = time.time() + _CHALLENGE_TTL
    _reg_state[session_id] = (
        options.challenge,
        prf_input,
        family_id,
        user_id,
        req.family_name,
        req.parent_name,
        expires,
    )

    options_dict = json.loads(webauthn.options_to_json(options))
    _add_prf_extension(options_dict, prf_input)

    return {"session_id": session_id, "options": options_dict}


@router.post("/register/complete", response_model=RegisterCompleteResponse)
async def register_complete(
    req: RegisterCompleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    state = _reg_state.pop(req.session_id, None)
    if not state:
        raise HTTPException(status_code=400, detail="Registration session expired or not found")

    challenge, prf_input, family_id, user_id, family_name, parent_name, expires = state
    if time.time() > expires:
        raise HTTPException(status_code=400, detail="Registration session expired")

    try:
        verified = webauthn.verify_registration_response(
            credential=webauthn.helpers.parse_registration_credential_json(
                json.dumps(req.credential)
            ),
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            require_user_verification=True,
        )
    except Exception as exc:
        ctx = audit_from_request(request)
        await log_event(AuditEvent.AUTH_FAILURE, success=False, detail=str(exc)[:200], **ctx)
        raise HTTPException(status_code=400, detail="Credential verification failed")

    family_salt = new_family_salt()
    data_key = generate_data_key()
    server_wrap_key = derive_server_wrap_key(family_id, family_salt)
    wrapped_key_server = wrap_data_key(data_key, server_wrap_key)

    display_name_enc = encrypt_json({"name": family_name}, data_key)

    family = Family(
        id=family_id,
        display_name_enc=display_name_enc,
        prf_input=prf_input,
    )
    db.add(family)

    family_key = FamilyKey(
        family_id=family_id,
        family_salt=family_salt,
        wrapped_key_server=wrapped_key_server,
    )
    db.add(family_key)

    parent_user = FamilyUser(
        id=user_id,
        family_id=family_id,
        display_name=parent_name,
        role="parent",
    )
    db.add(parent_user)

    prf_capable = bool(req.wrapped_key_prf)
    passkey = PasskeyCredential(
        credential_id=verified.credential_id,
        user_id=user_id,
        family_id=family_id,
        public_key_cbor=verified.credential_public_key,
        sign_count=verified.sign_count,
        backed_up=verified.credential_backed_up,
        prf_capable=prf_capable,
    )
    db.add(passkey)

    recovery_codes = generate_recovery_codes(8)
    for code in recovery_codes:
        code_hash = hash_recovery_code(code, family_id)
        db.add(RecoveryCode(family_id=family_id, code_hash=code_hash))

    await db.commit()

    ctx = audit_from_request(request)
    fp = compute_fingerprint(ctx["ip"], ctx["user_agent"])
    token = create_access_token(
        {"sub": user_id, "role": "parent", "family_id": family_id, "user_id": user_id},
        fingerprint=fp,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    await log_event(AuditEvent.AUTH_SUCCESS, role="parent", success=True, **ctx)

    return RegisterCompleteResponse(
        access_token=token,
        role="parent",
        family_id=family_id,
        user_id=user_id,
        recovery_codes=recovery_codes,
    )


@router.post("/login/begin")
async def login_begin():
    options = webauthn.generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    session_id = secrets.token_urlsafe(24)
    _store_challenge(session_id, options.challenge)
    options_dict = json.loads(webauthn.options_to_json(options))
    return {"session_id": session_id, "options": options_dict}


@router.post("/login/complete", response_model=PasskeyTokenResponse)
async def login_complete(
    req: LoginCompleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    challenge = _consume_challenge(req.session_id)
    if challenge is None:
        raise HTTPException(status_code=400, detail="Authentication session expired or not found")

    raw_id = req.credential.get("id") or req.credential.get("rawId")
    if not raw_id:
        raise HTTPException(status_code=400, detail="Missing credential id")

    credential_id_bytes = _from_b64url(raw_id)

    result = await db.execute(
        select(PasskeyCredential).where(PasskeyCredential.credential_id == credential_id_bytes)
    )
    cred_row = result.scalar_one_or_none()
    if cred_row is None:
        ctx = audit_from_request(request)
        await log_event(AuditEvent.AUTH_FAILURE, success=False, detail="credential not found", **ctx)
        raise HTTPException(status_code=401, detail="Credential not recognised")

    result = await db.execute(
        select(FamilyUser).where(FamilyUser.id == cred_row.user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    try:
        verified = webauthn.verify_authentication_response(
            credential=webauthn.helpers.parse_authentication_credential_json(
                json.dumps(req.credential)
            ),
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=cred_row.public_key_cbor,
            credential_current_sign_count=cred_row.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        ctx = audit_from_request(request)
        await log_event(AuditEvent.AUTH_FAILURE, success=False, detail=str(exc)[:200], **ctx)
        raise HTTPException(status_code=401, detail="Assertion verification failed")

    cred_row.sign_count = verified.new_sign_count
    cred_row.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    ctx = audit_from_request(request)
    fp = compute_fingerprint(ctx["ip"], ctx["user_agent"])
    role = user.role
    token = create_access_token(
        {
            "sub": user.id,
            "role": role,
            "family_id": user.family_id,
            "user_id": user.id,
        },
        fingerprint=fp,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    await log_event(AuditEvent.AUTH_SUCCESS, role=role, success=True, **ctx)

    return PasskeyTokenResponse(
        access_token=token,
        role=role,
        family_id=user.family_id,
        user_id=user.id,
    )


async def _require_parent_jwt(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    ctx = audit_from_request(request)
    fp = compute_fingerprint(ctx["ip"], ctx["user_agent"])
    if not validate_fingerprint(payload, fp):
        raise HTTPException(status_code=401, detail="Session fingerprint mismatch")
    if payload.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Parent authorisation required")
    return payload


@router.post("/child/enroll/begin")
async def child_enroll_begin(
    req: ChildEnrollBeginRequest,
    auth: dict = Depends(_require_parent_jwt),
    db: AsyncSession = Depends(get_db),
):
    family_id = auth["family_id"]

    child_user = FamilyUser(
        family_id=family_id,
        display_name=req.child_name,
        role="child",
    )
    db.add(child_user)
    await db.commit()
    await db.refresh(child_user)

    options = webauthn.generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name=settings.webauthn_rp_name,
        user_id=child_user.id.encode(),
        user_name=req.child_name,
        user_display_name=req.child_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        supported_pub_key_algs=[COSEAlgorithmIdentifier.ECDSA_SHA_256],
    )

    session_id = secrets.token_urlsafe(24)
    expires = time.time() + _CHALLENGE_TTL
    _reg_state[session_id] = (
        options.challenge,
        None,
        family_id,
        child_user.id,
        req.child_name,
        req.child_name,
        expires,
    )

    options_dict = json.loads(webauthn.options_to_json(options))
    return {
        "session_id": session_id,
        "child_id": child_user.id,
        "options": options_dict,
    }


@router.post("/child/enroll/complete")
async def child_enroll_complete(
    req: ChildEnrollCompleteRequest,
    auth: dict = Depends(_require_parent_jwt),
    db: AsyncSession = Depends(get_db),
):
    state = _reg_state.pop(req.session_id, None)
    if not state:
        raise HTTPException(status_code=400, detail="Enrollment session expired or not found")

    challenge, _, family_id, child_id, _, _, expires = state
    if time.time() > expires:
        raise HTTPException(status_code=400, detail="Enrollment session expired")

    if family_id != auth["family_id"]:
        raise HTTPException(status_code=403, detail="Family mismatch")

    try:
        verified = webauthn.verify_registration_response(
            credential=webauthn.helpers.parse_registration_credential_json(
                json.dumps(req.credential)
            ),
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            require_user_verification=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Credential verification failed")

    passkey = PasskeyCredential(
        credential_id=verified.credential_id,
        user_id=child_id,
        family_id=family_id,
        public_key_cbor=verified.credential_public_key,
        sign_count=verified.sign_count,
        backed_up=False,
        prf_capable=False,
    )
    db.add(passkey)
    await db.commit()

    return {"child_id": child_id, "enrolled": True}


@router.post("/child/login/begin")
async def child_login_begin(
    req: ChildLoginBeginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyUser).where(
            FamilyUser.id == req.child_id,
            FamilyUser.family_id == req.family_id,
            FamilyUser.role == "child",
        )
    )
    child = result.scalar_one_or_none()
    if child is None:
        raise HTTPException(status_code=404, detail="Child not found in family")

    result = await db.execute(
        select(PasskeyCredential).where(PasskeyCredential.user_id == req.child_id)
    )
    child_creds = result.scalars().all()
    if not child_creds:
        raise HTTPException(status_code=400, detail="No passkeys enrolled for this child")

    allow_creds = [
        PublicKeyCredentialDescriptor(id=cred.credential_id)
        for cred in child_creds
    ]
    options = webauthn.generate_authentication_options(
        rp_id=settings.webauthn_rp_id,
        allow_credentials=allow_creds,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    session_id = secrets.token_urlsafe(24)
    expires = time.time() + _CHALLENGE_TTL
    _auth_state[session_id] = (options.challenge, req.child_id, req.family_id, expires)

    options_dict = json.loads(webauthn.options_to_json(options))
    return {"session_id": session_id, "options": options_dict}


@router.post("/child/login/complete", response_model=PasskeyTokenResponse)
async def child_login_complete(
    req: ChildLoginCompleteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    state = _auth_state.pop(req.session_id, None)
    if not state:
        raise HTTPException(status_code=400, detail="Authentication session expired or not found")

    challenge, child_id, family_id, expires = state
    if time.time() > expires:
        raise HTTPException(status_code=400, detail="Authentication session expired")

    raw_id = req.credential.get("id") or req.credential.get("rawId")
    if not raw_id:
        raise HTTPException(status_code=400, detail="Missing credential id")

    credential_id_bytes = _from_b64url(raw_id)

    result = await db.execute(
        select(PasskeyCredential).where(
            PasskeyCredential.credential_id == credential_id_bytes,
            PasskeyCredential.user_id == child_id,
        )
    )
    cred_row = result.scalar_one_or_none()
    if cred_row is None:
        raise HTTPException(status_code=401, detail="Credential not recognised")

    try:
        verified = webauthn.verify_authentication_response(
            credential=webauthn.helpers.parse_authentication_credential_json(
                json.dumps(req.credential)
            ),
            expected_challenge=challenge,
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=settings.webauthn_origin,
            credential_public_key=cred_row.public_key_cbor,
            credential_current_sign_count=cred_row.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        ctx = audit_from_request(request)
        await log_event(AuditEvent.AUTH_FAILURE, success=False, detail=str(exc)[:200], **ctx)
        raise HTTPException(status_code=401, detail="Assertion verification failed")

    cred_row.sign_count = verified.new_sign_count
    cred_row.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    ctx = audit_from_request(request)
    fp = compute_fingerprint(ctx["ip"], ctx["user_agent"])
    token = create_access_token(
        {
            "sub": child_id,
            "role": "child",
            "family_id": family_id,
            "user_id": child_id,
        },
        fingerprint=fp,
        expires_delta=timedelta(minutes=settings.child_token_expire_minutes),
    )

    await log_event(AuditEvent.AUTH_SUCCESS, role="child", success=True, **ctx)

    return PasskeyTokenResponse(
        access_token=token,
        role="child",
        family_id=family_id,
        user_id=child_id,
    )


@router.get("/validate")
async def validate_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    payload = decode_token(credentials.credentials)
    if not payload:
        await log_event(AuditEvent.TOKEN_INVALID, **audit_from_request(request), success=False)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    ctx = audit_from_request(request)
    fp = compute_fingerprint(ctx["ip"], ctx["user_agent"])
    if not validate_fingerprint(payload, fp):
        await log_event(
            AuditEvent.TOKEN_FINGERPRINT_MISMATCH,
            role=payload.get("role"),
            success=False,
            **ctx,
        )
        raise HTTPException(
            status_code=401,
            detail="Session fingerprint mismatch — please log in again",
        )

    return {
        "role": payload.get("role"),
        "family_id": payload.get("family_id"),
        "user_id": payload.get("user_id"),
        "valid": True,
    }


@router.post("/logout")
async def logout():
    return {"logged_out": True}
