from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List
from services.voice_auth import (
    enroll_student,
    verify_student,
    list_profiles,
    delete_profile,
    parent_override,
)
from services.transcription import transcribe_audio
from core.security import decode_token

router = APIRouter(prefix="/voice", tags=["voice"])
security = HTTPBearer()


def _auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return payload


def _require_parent(auth: dict = Depends(_auth)) -> dict:
    if auth.get("role") != "parent":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Parent access required")
    return auth


# ── Enrollment (parent only) ─────────────────────────────────────────────────

@router.post("/enroll")
async def enroll(
    student_name: str = Form(...),
    samples: List[UploadFile] = File(..., description="2–5 WAV audio samples"),
    _: dict = Depends(_require_parent),
):
    """
    Enrol a student's voice from 2–5 audio samples (WAV, recorded in the browser).
    Stores a voice embedding for future verification.
    """
    if len(samples) < 2:
        raise HTTPException(status_code=400, detail="Please provide at least 2 audio samples")
    if len(samples) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 samples per enrolment")

    audio_bytes_list = [await s.read() for s in samples]

    try:
        result = enroll_student(student_name, audio_bytes_list)
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ── Verification (child at session start) ────────────────────────────────────

@router.post("/verify")
async def verify(
    student_name: str = Form(...),
    audio: UploadFile = File(..., description="WAV recording of the passphrase"),
    auth: dict = Depends(_auth),
):
    """
    Verify a student's voice against their stored profile.
    Returns confidence score + level (high/medium/low) + a decision.
    Both parent and child tokens are accepted.
    """
    audio_bytes = await audio.read()
    result = verify_student(student_name, audio_bytes)
    return result


# ── Parent override (approve medium-confidence session) ───────────────────────

@router.post("/override")
async def override_verification(
    student_name: str = Form(...),
    _: dict = Depends(_require_parent),
):
    """Parent approves a session that hit medium confidence without re-recording."""
    return parent_override(student_name)


# ── Profile management (parent only) ─────────────────────────────────────────

@router.get("/profiles")
async def get_profiles(_: dict = Depends(_require_parent)):
    return {"enrolled_students": list_profiles()}


@router.delete("/profiles/{student_name}")
async def remove_profile(student_name: str, _: dict = Depends(_require_parent)):
    if delete_profile(student_name):
        return {"deleted": student_name}
    raise HTTPException(status_code=404, detail="Profile not found")


# ── Fallback STT (optional, used when Web Speech API is unavailable) ──────────

@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(default="en"),
    auth: dict = Depends(_auth),
):
    """
    Server-side Whisper transcription fallback.
    Prefer the browser's Web Speech API for real-time use; use this for
    Firefox, offline environments, or high-accuracy verification phrases.
    """
    audio_bytes = await audio.read()
    result = await transcribe_audio(audio_bytes, language=language)
    return result
