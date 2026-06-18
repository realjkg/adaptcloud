"""
Encrypted append-only audit log.

Each entry is independently AES-256-GCM encrypted and written as a length-
prefixed record so partial reads are safe. The log file cannot be decrypted
without the DATA_KEY, which itself requires the MASTER_SECRET.

Audit events cover every authentication attempt, every API call, and every
access denial — enabling a parent to review who accessed the system and when.
"""

import json
import logging
import struct
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

AUDIT_FILE = Path("audit.enc")
_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _write_entry(entry: dict) -> None:
    from core.encryption import encrypt

    try:
        blob = encrypt(json.dumps(entry, separators=(",", ":")).encode())
        # Prefix with 4-byte big-endian length so we can read records back
        with _lock:
            with open(AUDIT_FILE, "ab") as f:
                f.write(struct.pack(">I", len(blob)) + blob)
    except Exception as e:
        # Never let audit failure crash the system — just warn
        log.warning("Audit write failed: %s", e)


def _read_entries(limit: int = 200) -> list[dict]:
    from core.encryption import decrypt

    if not AUDIT_FILE.exists():
        return []

    entries = []
    try:
        data = AUDIT_FILE.read_bytes()
        offset = 0
        while offset < len(data):
            if offset + 4 > len(data):
                break
            length = struct.unpack(">I", data[offset:offset + 4])[0]
            offset += 4
            if offset + length > len(data):
                break
            blob = data[offset:offset + length]
            offset += length
            try:
                entry = json.loads(decrypt(blob))
                entries.append(entry)
            except Exception:
                entries.append({"_corrupt": True})
    except Exception as e:
        log.error("Audit read failed: %s", e)

    return entries[-limit:]


# ── Public API ───────────────────────────────────────────────────────────────

class AuditEvent:
    AUTH_SUCCESS = "auth.success"
    AUTH_FAILURE = "auth.failure"
    VOICE_ENROLL = "voice.enroll"
    VOICE_VERIFY_PASS = "voice.verify.pass"
    VOICE_VERIFY_FAIL = "voice.verify.fail"
    VOICE_OVERRIDE = "voice.parent_override"
    SESSION_START = "session.start"
    SESSION_END = "session.end"
    TUTOR_CHAT = "tutor.chat"
    ADMIN_VIEW_AUDIT = "admin.view_audit"
    ACCESS_DENIED = "access.denied"
    TOKEN_INVALID = "token.invalid"
    TOKEN_FINGERPRINT_MISMATCH = "token.fingerprint_mismatch"
    RATE_LIMITED = "rate_limited"
    SUSPICIOUS_REQUEST = "suspicious_request"


def log_event(
    event: str,
    *,
    ip: str = "unknown",
    user_agent: str = "",
    role: Optional[str] = None,
    student_name: Optional[str] = None,
    success: bool = True,
    detail: str = "",
) -> None:
    entry = {
        "ts": _now_iso(),
        "event": event,
        "ip": ip,
        "ua": user_agent[:200],
        "success": success,
    }
    if role:
        entry["role"] = role
    if student_name:
        entry["student"] = student_name
    if detail:
        entry["detail"] = detail[:500]

    _write_entry(entry)


def read_audit_log(limit: int = 100) -> list[dict]:
    """
    Read the most recent audit entries (parent-only, in-UI display only).
    Returns metadata — never raw audio or embeddings.
    """
    entries = _read_entries(limit)
    # Sanitise: strip any accidentally logged sensitive fields
    safe_fields = {"ts", "event", "ip", "ua", "success", "role", "student", "detail"}
    return [{k: v for k, v in e.items() if k in safe_fields} for e in entries]


def audit_from_request(request) -> dict:
    """Extract loggable fields from a FastAPI Request."""
    return {
        "ip": (request.client.host if request.client else "unknown"),
        "user_agent": request.headers.get("user-agent", ""),
    }
