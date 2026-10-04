"""Shared fixtures for AIDigest tests.

DB tests run against a REAL Postgres. If AIDIGEST_TEST_DATABASE_URL is not set,
a private throwaway cluster is initdb'd under /tmp and started on a dedicated
port, then stopped and deleted at the end of the session. If Postgres cannot be
started the fixture raises, so the tests ERROR - they never skip.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from tests.fakes import PROXY_SECRET, FakeAI, FakeFetcher, make_settings

PG_BIN = Path(os.environ.get("AIDIGEST_PG_BIN", "/usr/lib/postgresql/16/bin"))
PG_DIR = Path(os.environ.get("AIDIGEST_PG_DIR", "/tmp/aidg_pg"))
# Below the kernel ephemeral range (32768-60999), so an outbound client socket can never
# hold the port, and outside 55432 / 555xx-556xx (owned by other agents).
# Round 3 M2: the suite must pass against a database NOT named "postgres" as well.
PG_DBNAME = os.environ.get("AIDIGEST_TEST_DBNAME", "postgres")
PG_PORTS = ([int(os.environ["AIDIGEST_PG_PORT"])] if os.environ.get("AIDIGEST_PG_PORT")
            else list(range(29650, 29660)))


# ── No skips, ever ────────────────────────────────────────────────────────────
@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.skipped:
        report.outcome = "failed"
        report.longrepr = f"Skipped tests are not allowed in AIDigest: {report.longrepr}"


def _as_postgres(cmd: list[str]) -> subprocess.CompletedProcess:
    if os.geteuid() == 0:
        cmd = ["runuser", "-u", "postgres", "--", *cmd]
    # cwd=PG_DIR: the postgres user may not be able to read the caller's working directory.
    return subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120, cwd=PG_DIR)


@pytest.fixture(scope="session")
def pg_url():
    external = os.environ.get("AIDIGEST_TEST_DATABASE_URL")
    if external:
        yield external
        return

    if not (PG_BIN / "initdb").exists():
        raise RuntimeError(f"Postgres binaries not found at {PG_BIN}; DB tests cannot run")
    if PG_DIR.exists():
        shutil.rmtree(PG_DIR)
    PG_DIR.mkdir(mode=0o700)
    if os.geteuid() == 0:
        shutil.chown(PG_DIR, "postgres", "postgres")
    data = PG_DIR / "data"
    _as_postgres([str(PG_BIN / "initdb"), "-D", str(data), "-A", "trust", "-U", "postgres", "--no-sync"])
    port = None
    for candidate in PG_PORTS:
        try:
            _as_postgres([
                str(PG_BIN / "pg_ctl"), "-D", str(data), "-l", str(PG_DIR / "pg.log"), "-w", "start",
                "-o", f"-p {candidate} -k {PG_DIR} -c listen_addresses=127.0.0.1 -c fsync=off",
            ])
            port = candidate
            break
        except subprocess.CalledProcessError:
            continue  # port busy: try the next one
    if port is None:
        log = (PG_DIR / "pg.log").read_text() if (PG_DIR / "pg.log").exists() else ""
        shutil.rmtree(PG_DIR, ignore_errors=True)
        raise RuntimeError(f"Could not start test Postgres on ports {PG_PORTS}: {log[-2000:]}")
    try:
        if PG_DBNAME != "postgres":
            _as_postgres([str(PG_BIN / "createdb"), "-h", str(PG_DIR), "-p", str(port), "-U", "postgres",
                          PG_DBNAME])
        url = f"postgresql+asyncpg://postgres@127.0.0.1:{port}/{PG_DBNAME}"
        yield url
    finally:
        try:
            _as_postgres([str(PG_BIN / "pg_ctl"), "-D", str(data), "-m", "fast", "-w", "stop"])
        finally:
            time.sleep(0.2)
            shutil.rmtree(PG_DIR, ignore_errors=True)


@pytest.fixture
async def engine(pg_url):
    from aidigest.db import apply_schema

    eng = create_async_engine(pg_url, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS aidigest CASCADE"))
    await apply_schema(eng)
    yield eng
    await eng.dispose()


@pytest.fixture
def fake_ai():
    return FakeAI()


@pytest.fixture
def fake_fetcher():
    return FakeFetcher()


@pytest.fixture
def settings(pg_url):
    return make_settings(aidigest_database_url=pg_url)


@pytest.fixture
async def app(settings, engine, fake_ai, fake_fetcher):
    from aidigest.app import create_app

    application = create_app(settings, engine=engine, ai=fake_ai, fetcher=fake_fetcher)
    async with application.router.lifespan_context(application):
        yield application


AUTH = {"X-AIDigest-User": "operator@adapt.cloud", "X-AIDigest-Proxy-Secret": PROXY_SECRET}


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://aidigest", headers=AUTH) as c:
        yield c


@pytest.fixture
async def anon_client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://aidigest") as c:
        yield c
