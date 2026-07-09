#!/usr/bin/env python3
"""
Bede Local Stdio Server — NDJSON transport for Electron desktop.

No HTTP, no TLS, no per-family auth. Local trust model: the process owner
is trusted. Python ↔ Node communicate via newline-delimited JSON on
stdin/stdout. Logs go to stderr so they never corrupt the NDJSON stream.

Protocol
--------
Request  (Node → Python):
  {"id":"req-1","method":"tutor.chat","params":{...}}\n

Streaming response (Python → Node, for tutor.chat):
  {"id":"req-1","type":"text","content":"..."}\n     (0-N times)
  {"id":"req-1","type":"tool","tool":"...","content":"..."}\n  (0-N times)
  {"id":"req-1","type":"done"}\n

Non-streaming response:
  {"id":"req-1","type":"result","data":{...}}\n

Error:
  {"id":"req-1","type":"error","message":"..."}\n

Ready signal (emitted once at startup):
  {"type":"ready","version":"1.0"}\n
"""

import asyncio
import json
import logging
import os
import sys

# DATABASE_URL default: empty string → database.py falls back to SQLite
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("SITE_URL", "http://localhost")
os.environ.setdefault("PRODUCTION", "false")

# Import after env defaults are set so Settings picks them up
from core.config import settings
from core.database import AsyncSessionLocal, StudentConfig, create_tables, engine
from core.encryption import encrypt_json, decrypt_json, init_server_key
from models.schemas import (
    ChatMessage,
    SessionConfig,
    SessionSummaryRequest,
    Subject,
)
from services.ai_service import (
    SAFEGUARDING_RESPONSE,
    check_safeguarding,
    generate_session_summary,
    stream_tutor_response,
)
from sqlalchemy import delete as sa_delete, select

log = logging.getLogger(__name__)

_LOCAL_FAMILY_ID = "local"
_DATA_KEY: bytes = b""


# ── Crypto ─────────────────────────────────────────────────────────────────────

def _derive_local_data_key() -> bytes:
    """Derive a stable per-device data key from SERVER_KEY via HKDF."""
    from Crypto.Protocol.KDF import HKDF
    from Crypto.Hash import SHA256

    if settings.server_key:
        master = bytes.fromhex(settings.server_key)
    else:
        # No SERVER_KEY → generate a random key (data won't survive restarts)
        log.warning("SERVER_KEY not set — local data key is ephemeral this session")
        master = os.urandom(32)

    return HKDF(
        master=master,
        key_len=32,
        salt=b"\x00" * 32,
        hashmod=SHA256,
        context=b"bede-local-data-key-v1",
    )


# ── Output ─────────────────────────────────────────────────────────────────────

def _write(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


# ── Method handlers ────────────────────────────────────────────────────────────

async def handle_tutor_chat(req_id: str, params: dict) -> None:
    try:
        config = SessionConfig(**params["session_config"])
        subject = Subject(params["current_subject"])
        history = [ChatMessage(**m) for m in params.get("conversation_history", [])]
        message = params["child_message"]

        if check_safeguarding(message):
            _write({"id": req_id, "type": "text", "content": SAFEGUARDING_RESPONSE})
            _write({"id": req_id, "type": "done"})
            return

        # db=None → assessment saving skipped (no family context in local mode)
        async for sse_chunk in stream_tutor_response(
            config=config,
            subject=subject,
            history=history,
            child_message=message,
            db=None,
        ):
            # SSE format: "data: {...}\n\n" — parse and re-emit as NDJSON
            if sse_chunk.startswith("data: "):
                payload = json.loads(sse_chunk[6:])
                _write({"id": req_id, **payload})
    except Exception:
        log.exception("tutor.chat error for req %s", req_id)
        _write({"id": req_id, "type": "error", "message": "Tutor stream failed"})


async def handle_tutor_summary(req_id: str, params: dict) -> None:
    try:
        req = SessionSummaryRequest(**params)
        summary = await generate_session_summary(req)
        _write({"id": req_id, "type": "result", "data": {"summary": summary}})
    except Exception as exc:
        _write({"id": req_id, "type": "error", "message": str(exc)})


async def handle_pod_list(req_id: str, _params: dict) -> None:
    try:
        async with AsyncSessionLocal() as db:
            rows = (
                await db.execute(
                    select(StudentConfig).where(
                        StudentConfig.family_id == _LOCAL_FAMILY_ID
                    )
                )
            ).scalars().all()
            configs = [decrypt_json(row.config_enc, _DATA_KEY) for row in rows]
        _write({"id": req_id, "type": "result", "data": configs})
    except Exception as exc:
        _write({"id": req_id, "type": "error", "message": str(exc)})


async def handle_pod_get(req_id: str, params: dict) -> None:
    try:
        name = params["name"]
        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(StudentConfig).where(
                        StudentConfig.family_id == _LOCAL_FAMILY_ID,
                        StudentConfig.student_name == name,
                    )
                )
            ).scalar_one_or_none()
        if row is None:
            _write({"id": req_id, "type": "error", "message": "Not found"})
            return
        _write({"id": req_id, "type": "result", "data": decrypt_json(row.config_enc, _DATA_KEY)})
    except Exception as exc:
        _write({"id": req_id, "type": "error", "message": str(exc)})


async def handle_pod_save(req_id: str, params: dict) -> None:
    try:
        configs = params.get("configs", [])
        async with AsyncSessionLocal() as db:
            for config_dict in configs:
                name = config_dict.get("student_name", "")
                enc = encrypt_json(config_dict, _DATA_KEY)
                row = (
                    await db.execute(
                        select(StudentConfig).where(
                            StudentConfig.family_id == _LOCAL_FAMILY_ID,
                            StudentConfig.student_name == name,
                        )
                    )
                ).scalar_one_or_none()
                if row is None:
                    db.add(StudentConfig(
                        family_id=_LOCAL_FAMILY_ID,
                        student_name=name,
                        config_enc=enc,
                    ))
                else:
                    row.config_enc = enc
            await db.commit()
        _write({"id": req_id, "type": "result", "data": None})
    except Exception as exc:
        _write({"id": req_id, "type": "error", "message": str(exc)})


async def handle_pod_delete(req_id: str, params: dict) -> None:
    try:
        name = params["name"]
        async with AsyncSessionLocal() as db:
            await db.execute(
                sa_delete(StudentConfig).where(
                    StudentConfig.family_id == _LOCAL_FAMILY_ID,
                    StudentConfig.student_name == name,
                )
            )
            await db.commit()
        _write({"id": req_id, "type": "result", "data": None})
    except Exception as exc:
        _write({"id": req_id, "type": "error", "message": str(exc)})


async def handle_auth_validate(req_id: str, _params: dict) -> None:
    """Local trust model — always authorised."""
    _write({
        "id": req_id,
        "type": "result",
        "data": {"role": "parent", "family_id": _LOCAL_FAMILY_ID},
    })


HANDLERS: dict = {
    "tutor.chat":    handle_tutor_chat,
    "tutor.summary": handle_tutor_summary,
    "pod.list":      handle_pod_list,
    "pod.get":       handle_pod_get,
    "pod.save":      handle_pod_save,
    "pod.delete":    handle_pod_delete,
    "auth.validate": handle_auth_validate,
}


# ── Main ───────────────────────────────────────────────────────────────────────

async def main() -> None:
    global _DATA_KEY

    logging.basicConfig(
        level=logging.WARNING,
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    await create_tables()

    if settings.server_key:
        init_server_key(settings.server_key)
    _DATA_KEY = _derive_local_data_key()

    # Signal ready to the Node.js host
    _write({"type": "ready", "version": "1.0"})

    # Wire stdin as an async stream
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            raw = await reader.readline()
            if not raw:
                break  # EOF — Node closed stdin

            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            request = json.loads(line)
            req_id  = request.get("id", "")
            method  = request.get("method", "")
            params  = request.get("params") or {}

            handler = HANDLERS.get(method)
            if handler:
                asyncio.create_task(handler(req_id, params))
            else:
                _write({"id": req_id, "type": "error", "message": f"Unknown method: {method}"})

        except json.JSONDecodeError:
            _write({"type": "error", "message": "JSON decode error"})
        except Exception:
            log.exception("Dispatch error")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
