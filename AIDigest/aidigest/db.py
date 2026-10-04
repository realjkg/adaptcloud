"""Postgres access: engine, idempotent schema application, readiness.

Uses SQLAlchemy Core with explicit SQL against schema "aidigest" so that
schema.sql stays the single source of truth for the data model."""

import asyncio
from pathlib import Path

import asyncpg
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

SCHEMA = "aidigest"
REQUIRED_TABLES = ("articles", "knowledge", "tasks", "runs")
SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema.sql"
# Arbitrary constant: serialises concurrent schema application across replicas.
_SCHEMA_LOCK_KEY = 0x41494447


# Review of ae012a0, M1: a database that freezes at TCP level (sockets open, nothing answers).
# The run budget abandons the stuck step at its deadline (aidigest.budget.run_within); these bounds
# make sure the ABANDONED connection does not stay checked out of the pool:
CONNECT_TIMEOUT_SECONDS = 5.0  # a new connection: the asyncpg handshake is bounded
CLOSE_TIMEOUT_SECONDS = 2.0    # closing a connection: bounded, then the socket is aborted
# A step abandoned mid-statement is cancelled; SQLAlchemy then invalidates the connection and closes
# it (BoundedCloseConnection: <= 2 s, then aborted) and the pool discards it. A step abandoned while
# connecting gives up after the connect timeout. So an abandoned connection holds a pool slot for at
# most ABANDONED_RELEASE_SECONDS. A frozen run abandons at most two (the run's, and the failure
# record's or the DAILY heartbeat's): the pool (5 + 5 overflow) fills only with > 5 frozen runs per
# 5 s, and even then a checkout waits inside the next run's budget, which still ends on time.
ABANDONED_RELEASE_SECONDS = max(CONNECT_TIMEOUT_SECONDS, CLOSE_TIMEOUT_SECONDS)


class BoundedCloseConnection(asyncpg.Connection):
    """asyncpg.Connection whose close() always ends within CLOSE_TIMEOUT_SECONDS (or the given timeout).

    Closing a connection whose statement was cancelled first waits - without any timeout - for
    asyncpg's cancel request (a separate connection) and for the server to answer the cancelled
    statement. Against a frozen server neither ever happens, so the close (shielded inside
    SQLAlchemy's invalidation) would never finish and the connection would stay checked out of the
    pool for good. After the bound the connection is aborted instead (terminate(): the socket is
    closed and asyncpg's pending cancel request is cancelled)."""

    async def close(self, *, timeout=None):
        try:
            await asyncio.wait_for(super().close(timeout=timeout),
                                   CLOSE_TIMEOUT_SECONDS if timeout is None else timeout)
        except TimeoutError:
            self.terminate()


def make_engine(url: str) -> AsyncEngine:
    if not url:
        raise RuntimeError("AIDIGEST_DATABASE_URL is not set. Provide a postgresql+asyncpg://... connection string.")
    return create_async_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5,
                               connect_args={"timeout": CONNECT_TIMEOUT_SECONDS,
                                             "connection_class": BoundedCloseConnection})


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
