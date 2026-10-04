"""Postgres access: engine, idempotent schema application, readiness.

Uses SQLAlchemy Core with explicit SQL against schema "aidigest" so that
schema.sql stays the single source of truth for the data model."""

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

SCHEMA = "aidigest"
REQUIRED_TABLES = ("articles", "knowledge", "tasks", "runs")
SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema.sql"
# Arbitrary constant: serialises concurrent schema application across replicas.
_SCHEMA_LOCK_KEY = 0x41494447


def make_engine(url: str) -> AsyncEngine:
    if not url:
        raise RuntimeError("AIDIGEST_DATABASE_URL is not set. Provide a postgresql+asyncpg://... connection string.")
    return create_async_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5)


def schema_statements() -> list[str]:
    lines = [ln for ln in SCHEMA_FILE.read_text().splitlines() if not ln.strip().startswith("--")]
    cleaned = "\n".join(ln.split("--", 1)[0] for ln in lines)
    return [stmt.strip() for stmt in cleaned.split(";") if stmt.strip()]


async def apply_schema(engine: AsyncEngine) -> None:
    """CREATE ... IF NOT EXISTS for every object, in one transaction, under an advisory lock.

    CREATE SCHEMA is skipped when the schema already exists (M8): Postgres checks the
    database-level CREATE privilege even for IF NOT EXISTS, and the least-privilege role
    only owns schema "aidigest"."""
    async with engine.begin() as conn:
        await conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _SCHEMA_LOCK_KEY})
        exists = (await conn.execute(
            text("SELECT 1 FROM pg_namespace WHERE nspname = :s"), {"s": SCHEMA})).scalar() is not None
        for statement in schema_statements():
            if exists and statement.upper().startswith("CREATE SCHEMA"):
                continue
            await conn.execute(text(statement))


async def readiness(engine: AsyncEngine, budget=None) -> dict:
    from aidigest.budget import db_tx

    async with db_tx(engine, budget) as conn:
        rows = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema = :s ORDER BY table_name"),
            {"s": SCHEMA},
        )
        present = [r[0] for r in rows]
    missing = [t for t in REQUIRED_TABLES if t not in present]
    return {
        "ready": not missing,
        "schema": SCHEMA,
        "required_tables": list(REQUIRED_TABLES),
        "present_tables": present,
        "missing_tables": missing,
    }
