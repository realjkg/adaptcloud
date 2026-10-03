"""M8: AIDigest runs as a dedicated least-privilege role.

The role owns a pre-created schema "aidigest", has no database-level CREATE and cannot
read public.*; startup schema application must still succeed and readiness be true."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from aidigest.daily import run_daily
from aidigest.db import apply_schema, readiness
from tests.fakes import FakeAI, FakeFetcher

ROLE = "aidigest_app_test"


@pytest.fixture
async def least_privilege_url(pg_url):
    admin = create_async_engine(pg_url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS aidigest CASCADE"))
        await conn.execute(text(f"DROP ROLE IF EXISTS {ROLE}"))
        await conn.execute(text(f"CREATE ROLE {ROLE} LOGIN"))
        # The documented one-time DBA step: the schema is created for (and owned by) the role.
        await conn.execute(text(f"CREATE SCHEMA aidigest AUTHORIZATION {ROLE}"))
        await conn.execute(text(f"REVOKE CREATE ON DATABASE postgres FROM PUBLIC, {ROLE}"))
        await conn.execute(text("CREATE TABLE IF NOT EXISTS public.homeschool_secret (v text)"))
        await conn.execute(text("REVOKE ALL ON public.homeschool_secret FROM PUBLIC"))
    yield pg_url.replace("postgres@", f"{ROLE}@", 1)
    async with admin.connect() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS aidigest CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS public.homeschool_secret"))
        await conn.execute(text(f"DROP OWNED BY {ROLE}"))
        await conn.execute(text(f"DROP ROLE {ROLE}"))
    await admin.dispose()


async def test_least_privilege_role_is_ready(least_privilege_url):
    eng = create_async_engine(least_privilege_url, poolclass=NullPool)
    try:
        async with eng.connect() as conn:
            assert (await conn.execute(text("SELECT current_user"))).scalar() == ROLE
            has_db_create = (await conn.execute(text(
                "SELECT has_database_privilege(current_user, current_database(), 'CREATE')"))).scalar()
        assert has_db_create is False
        await apply_schema(eng)          # must not need CREATE on the database
        await apply_schema(eng)          # idempotent
        state = await readiness(eng)
        assert state["ready"] is True, state
        result = await run_daily(eng, FakeAI(), FakeFetcher(), trigger="operator")
        assert result["status"] == "completed"
        with pytest.raises(ProgrammingError, match="permission denied"):
            async with eng.connect() as conn:
                await conn.execute(text("SELECT * FROM public.homeschool_secret"))
        with pytest.raises(ProgrammingError, match="permission denied"):
            async with eng.begin() as conn:
                await conn.execute(text("CREATE SCHEMA aidigest_other"))
    finally:
        await eng.dispose()
