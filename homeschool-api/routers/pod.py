"""
Pod session management.

The parent saves each student's config before the day's sessions begin.
Students then load their config from the server after passkey login, keyed
by their name from the session URL. All configs are AES-256-GCM encrypted
at rest using the family's DATA_KEY — no plaintext student data is written
to the database, and no cross-family data can be accessed.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import StudentConfig, get_db
from core.deps import get_family_data_key, require_auth, require_parent
from core.encryption import decrypt_json, encrypt_json
from models.schemas import PodConfigsRequest, SessionConfig

router = APIRouter(prefix="/pod", tags=["pod"])


@router.post("/configs", status_code=204)
async def save_pod_configs(
    req: PodConfigsRequest,
    auth: dict = Depends(require_parent),
    data_key: bytes = Depends(get_family_data_key),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Parent saves all student configs for today's pod. Upserts per student name."""
    family_id = auth["family_id"]
    for config in req.configs:
        enc = encrypt_json(config.model_dump(), data_key)
        result = await db.execute(
            select(StudentConfig).where(
                StudentConfig.family_id == family_id,
                StudentConfig.student_name == config.student_name,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            db.add(StudentConfig(
                family_id=family_id,
                student_name=config.student_name,
                config_enc=enc,
            ))
        else:
            row.config_enc = enc
    await db.commit()


@router.get("/configs", response_model=list[SessionConfig])
async def list_pod_configs(
    auth: dict = Depends(require_parent),
    data_key: bytes = Depends(get_family_data_key),
    db: AsyncSession = Depends(get_db),
) -> list[SessionConfig]:
    """Parent retrieves their family's student configs for the dashboard."""
    family_id = auth["family_id"]
    result = await db.execute(
        select(StudentConfig).where(StudentConfig.family_id == family_id)
    )
    rows = result.scalars().all()
    return [SessionConfig(**decrypt_json(row.config_enc, data_key)) for row in rows]


@router.get("/configs/{student_name}", response_model=SessionConfig)
async def get_student_config(
    student_name: str,
    auth: dict = Depends(require_auth),
    data_key: bytes = Depends(get_family_data_key),
    db: AsyncSession = Depends(get_db),
) -> SessionConfig:
    """Any authenticated family member can fetch their own student config."""
    family_id = auth["family_id"]
    result = await db.execute(
        select(StudentConfig).where(
            StudentConfig.family_id == family_id,
            StudentConfig.student_name == student_name,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No configuration found for '{student_name}' — ask a parent to set up today's pod.",
        )
    return SessionConfig(**decrypt_json(row.config_enc, data_key))


@router.delete("/configs/{student_name}", status_code=204)
async def delete_student_config(
    student_name: str,
    auth: dict = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Parent removes a student from the pod."""
    family_id = auth["family_id"]
    result = await db.execute(
        select(StudentConfig).where(
            StudentConfig.family_id == family_id,
            StudentConfig.student_name == student_name,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
