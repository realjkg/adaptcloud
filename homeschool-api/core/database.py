"""
Async SQLAlchemy setup.

Tables carry no plaintext — every BYTEA column holding user data is
AES-256-GCM encrypted by core/encryption.py before it reaches the driver.

Startup sequence (main.py lifespan):
  1. create_tables() — idempotent CREATE TABLE IF NOT EXISTS
  2. init_server_key() — loads SERVER_KEY into encryption module
"""

import os
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import Depends
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _build_engine():
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        db_path = os.environ.get("SQLITE_PATH", "./bede.db")
        url = f"sqlite+aiosqlite:///{db_path}"

    is_sqlite = url.startswith("sqlite")

    if is_sqlite:
        from sqlalchemy.pool import StaticPool
        return create_async_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

    return create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )


engine = _build_engine()
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def _enable_wal() -> None:
    url = str(engine.url)
    if not url.startswith("sqlite"):
        return
    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        await conn.exec_driver_sql("PRAGMA synchronous=NORMAL")


class Base(DeclarativeBase):
    pass


class Family(Base):
    __tablename__ = "families"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    display_name_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    prf_input: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class FamilyKey(Base):
    __tablename__ = "family_keys"

    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        primary_key=True,
    )
    family_salt: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    wrapped_key_server: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)
    wrapped_key_recovery: Mapped[bytes] = mapped_column(LargeBinary, nullable=True)
    key_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class FamilyUser(Base):
    __tablename__ = "family_users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class PasskeyCredential(Base):
    __tablename__ = "passkey_credentials"

    credential_id: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("family_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    public_key_cbor: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sign_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    transports: Mapped[str] = mapped_column(String(200), nullable=True)
    backed_up: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    prf_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    code_hash: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    event_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class StudentConfig(Base):
    __tablename__ = "student_configs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_name: Mapped[str] = mapped_column(String(100), nullable=False)
    config_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class VoiceProfile(Base):
    __tablename__ = "voice_profiles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    student_name: Mapped[str] = mapped_column(String(100), nullable=False)
    profile_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class NarrationAssessment(Base):
    __tablename__ = "narration_assessments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    student_name: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(50), nullable=False)
    session_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    assessment_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class LearnerProfile(Base):
    __tablename__ = "learner_profiles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    student_name: Mapped[str] = mapped_column(String(100), nullable=False)
    session_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    profile_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class SessionTranscript(Base):
    __tablename__ = "session_transcripts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    family_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("families.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    student_name: Mapped[str] = mapped_column(String(100), nullable=False)
    session_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    subjects: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    transcript_enc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class EncryptionConfig(Base):
    """Retained for desktop/LAN backward compatibility. No FK to families."""
    __tablename__ = "encryption_config"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


async def create_tables() -> None:
    await _enable_wal()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
