"""M8: AIDigest runs as a dedicated least-privilege role.

The role owns a pre-created schema "aidigest", has no database-level CREATE and cannot
read public.*; startup schema application must still succeed and readiness be true."""

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from aidigest.daily import run_daily
from aidigest.db import apply_schema, readiness
from aidigest.feeds import SOURCES
from tests.fakes import FakeAI, FakeFetcher, rss

ROLE = "aidigest_app_test"


def as_role(url: str, role: str) -> str:
    """Same server and database, different login role (round 3 M2: no string surgery on the URL)."""
    u = make_url(url)
    return URL.create(u.drivername, username=role, host=u.host, port=u.port, database=u.database,
                      query=u.query).render_as_string(hide_password=False)


async def current_db(conn) -> str:
    return (await conn.execute(text("SELECT current_database()"))).scalar()


@pytest.fixture
async def least_privilege_url(pg_url):
    admin = create_async_engine(pg_url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS aidigest CASCADE"))
        await conn.execute(text(f"DROP ROLE IF EXISTS {ROLE}"))
        await conn.execute(text(f"CREATE ROLE {ROLE} LOGIN"))
        # The documented one-time DBA step: the schema is created for (and owned by) the role.
        await conn.execute(text(f"CREATE SCHEMA aidigest AUTHORIZATION {ROLE}"))
        await conn.execute(text(f'REVOKE CREATE ON DATABASE "{await current_db(conn)}" FROM PUBLIC, {ROLE}'))
        await conn.execute(text("CREATE TABLE IF NOT EXISTS public.homeschool_secret (v text)"))
        await conn.execute(text("REVOKE ALL ON public.homeschool_secret FROM PUBLIC"))
    yield as_role(pg_url, ROLE)
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
        result = await run_daily(eng, FakeAI(), FakeFetcher({SOURCES[0].url: rss([])}), trigger="operator")
        assert result["status"] == "completed"
        with pytest.raises(ProgrammingError, match="permission denied"):
            async with eng.connect() as conn:
                await conn.execute(text("SELECT * FROM public.homeschool_secret"))
        with pytest.raises(ProgrammingError, match="permission denied"):
            async with eng.begin() as conn:
                await conn.execute(text("CREATE SCHEMA aidigest_other"))
    finally:
        await eng.dispose()


# ── Round 2 L4: the README SQL, run verbatim by a non-superuser CREATEROLE admin ─
README = Path(__file__).resolve().parent.parent / "README.md"


def documented_role_sql() -> list[str]:
    text_ = README.read_text()
    section = text_.index("### Least-privilege database role")
    start = text_.index("```sql", section) + len("```sql")
    block = text_[start:text_.index("```", start)]
    lines = [ln.split("--", 1)[0] for ln in block.splitlines()]
    return [stmt.strip() for stmt in "\n".join(lines).split(";") if stmt.strip()]


async def test_documented_role_sql_works_for_non_superuser_admin(pg_url):
    su = create_async_engine(pg_url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    async with su.connect() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS aidigest CASCADE"))
        for role in ("aidigest_app", "dba_admin"):
            exists = (await conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname=:r"), {"r": role})).scalar()
            if exists:
                await conn.execute(text(f"DROP OWNED BY {role}"))
                await conn.execute(text(f"DROP ROLE {role}"))
        # A typical managed-Postgres admin: CREATEROLE + CREATE on the database, not a superuser.
        await conn.execute(text("CREATE ROLE dba_admin LOGIN CREATEROLE"))
        dbname = await current_db(conn)
        await conn.execute(text(f'GRANT CREATE ON DATABASE "{dbname}" TO dba_admin'))
        await conn.execute(text("CREATE TABLE IF NOT EXISTS public.homeschool_secret (v text)"))
        await conn.execute(text("REVOKE ALL ON public.homeschool_secret FROM PUBLIC"))
    admin = create_async_engine(as_role(pg_url, "dba_admin"), poolclass=NullPool,
                                isolation_level="AUTOCOMMIT")
    app_engine = create_async_engine(as_role(pg_url, "aidigest_app"), poolclass=NullPool)
    try:
        statements = documented_role_sql()
        assert statements, "README role SQL block not found"
        async with admin.connect() as conn:
            assert (await conn.execute(text("SELECT rolsuper FROM pg_roles WHERE rolname = current_user"))).scalar() \
                is False
            for stmt in statements:
                stmt = (stmt.replace("<generate a strong password>", "pw-for-test")
                        .replace("<dbname>", f'"{dbname}"').replace("<admin>", "dba_admin"))
                await conn.execute(text(stmt))
        await apply_schema(app_engine)
        assert (await readiness(app_engine))["ready"] is True
        async with app_engine.connect() as conn:
            assert (await conn.execute(text(
                "SELECT has_database_privilege(current_user, current_database(), 'CREATE')"))).scalar() is False
        with pytest.raises(ProgrammingError, match="permission denied"):
            async with app_engine.connect() as conn:
                await conn.execute(text("SELECT * FROM public.homeschool_secret"))
    finally:
        await app_engine.dispose()
        await admin.dispose()
        async with su.connect() as conn:
            await conn.execute(text("DROP SCHEMA IF EXISTS aidigest CASCADE"))
            await conn.execute(text("DROP TABLE IF EXISTS public.homeschool_secret"))
            for role in ("aidigest_app", "dba_admin"):
                await conn.execute(text(f"DROP OWNED BY {role}"))
                await conn.execute(text(f"DROP ROLE {role}"))
        await su.dispose()


def test_as_role_rebuilds_the_url():
    # str.replace("postgres@", ...) would rewrite the password here instead of the user.
    url = "postgresql+asyncpg://admin:xpostgres@127.0.0.1:29650/aidigest_it"
    assert as_role(url, "aidigest_app") == "postgresql+asyncpg://aidigest_app@127.0.0.1:29650/aidigest_it"
