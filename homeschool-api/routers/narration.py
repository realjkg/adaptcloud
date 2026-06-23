"""
Narration assessment history and learner-profile endpoints.

All assessment data is AES-256-GCM encrypted at rest using the family's
DATA_KEY — the DB never holds plaintext narration scores or profile notes,
and all queries are scoped to the authenticated family.

Routes:
  GET  /narration/{student}/assessments     — parent: score history
  GET  /narration/{student}/profile         — parent or child: current learner profile
  POST /narration/{student}/profile         — trigger profile synthesis (after session 3+)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import LearnerProfile, NarrationAssessment, get_db
from core.deps import get_family_data_key, require_auth, require_parent
from core.encryption import decrypt_json, encrypt_json
from services.ai_service import synthesize_learner_profile

router = APIRouter(prefix="/narration", tags=["narration"])


@router.get("/{student_name}/assessments")
async def get_assessments(
    student_name: str,
    limit: int = Query(default=30, le=100),
    auth: dict = Depends(require_parent),
    data_key: bytes = Depends(get_family_data_key),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Parent retrieves narration assessment history for a student (most recent first)."""
    family_id = auth["family_id"]
    result = await db.execute(
        select(NarrationAssessment)
        .where(
            NarrationAssessment.family_id == family_id,
            NarrationAssessment.student_name == student_name,
        )
        .order_by(NarrationAssessment.session_date.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return [decrypt_json(row.assessment_enc, data_key) for row in rows]


@router.get("/{student_name}/profile")
async def get_profile(
    student_name: str,
    auth: dict = Depends(require_auth),
    data_key: bytes = Depends(get_family_data_key),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the current learner profile for a student (parent or child token)."""
    family_id = auth["family_id"]
    result = await db.execute(
        select(LearnerProfile).where(
            LearnerProfile.family_id == family_id,
            LearnerProfile.student_name == student_name,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No learner profile yet — complete 3+ sessions to build one.",
        )
    return decrypt_json(row.profile_enc, data_key)


@router.post("/{student_name}/profile")
async def build_profile(
    student_name: str,
    session_count: int = Query(..., ge=3, description="Total sessions completed so far"),
    auth: dict = Depends(require_auth),
    data_key: bytes = Depends(get_family_data_key),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Synthesize (or refresh) the stable learner profile from accumulated assessments.
    Frontend calls this at the end of session 3 and optionally thereafter.
    Requires at least 3 assessments on record.
    """
    family_id = auth["family_id"]
    result = await db.execute(
        select(NarrationAssessment)
        .where(
            NarrationAssessment.family_id == family_id,
            NarrationAssessment.student_name == student_name,
        )
        .order_by(NarrationAssessment.session_date.desc())
        .limit(30)
    )
    rows = result.scalars().all()

    if len(rows) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Only {len(rows)} narration(s) recorded — need at least 3 to build a profile.",
        )

    assessments = [decrypt_json(row.assessment_enc, data_key) for row in rows]
    profile = await synthesize_learner_profile(student_name, assessments, session_count)
    profile["session_count_assessed"] = session_count
    profile["assessed_at"] = datetime.now(timezone.utc).isoformat()

    enc = encrypt_json(profile, data_key)
    existing = await db.execute(
        select(LearnerProfile).where(
            LearnerProfile.family_id == family_id,
            LearnerProfile.student_name == student_name,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        db.add(LearnerProfile(
            family_id=family_id,
            student_name=student_name,
            session_count=session_count,
            profile_enc=enc,
        ))
    else:
        row.profile_enc = enc
        row.session_count = session_count

    await db.commit()
    return profile
