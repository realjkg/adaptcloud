"""HTTP surface: readiness (finding 1), operator trigger, digest, knowledge."""

import httpx
from sqlalchemy import text

from aidigest.feeds import SOURCES
from tests.conftest import AUTH
from tests.fakes import rss

FEED = [{"title": "Agent governance FinOps security", "url": "https://news.example/x", "description": "pricing"}]
SELECTED = [{
    "id": __import__("hashlib").sha256(b"https://news.example/x").hexdigest(), "lead": "L", "summary": "S",
    "why_adapt": "W", "next_move": "N", "category": "C", "score_adjustment": 0, "knowledge": [],
}]


async def test_startup_applies_schema_and_status_ready(settings, engine, fake_ai, fake_fetcher):
    from aidigest.app import create_app

    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA aidigest CASCADE"))
    app = create_app(settings, engine=engine, ai=fake_ai, fetcher=fake_fetcher)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t", headers=AUTH) as c:
            r = await c.get("/ops/status")
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True
    assert sorted(body["required_tables"]) == ["articles", "knowledge", "runs", "tasks"]
    assert body["missing_tables"] == []
    assert body["schema"] == "aidigest"


async def test_schema_apply_is_idempotent(engine):
    from aidigest.db import apply_schema, readiness

    await apply_schema(engine)
    await apply_schema(engine)
    assert (await readiness(engine))["ready"] is True


async def test_tables_live_in_aidigest_schema_only(engine):
    async with engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT table_schema FROM information_schema.tables WHERE table_name IN "
            "('articles','knowledge','tasks','runs')"))).scalars().all()
    assert set(rows) == {"aidigest"}


async def test_ops_status_reports_missing_tables(client, engine):
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE aidigest.runs"))
    r = await client.get("/ops/status")
    assert r.status_code == 503
    assert r.json()["ready"] is False
    assert r.json()["missing_tables"] == ["runs"]


async def test_run_daily_endpoint_and_duplicate(client, fake_ai, fake_fetcher):
    fake_fetcher.pages[SOURCES[0].url] = rss(FEED)
    fake_ai.queue_json(SELECTED)
    r = await client.post("/ops/run-daily")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed" and r.json()["accepted"] == 1
    r2 = await client.post("/ops/run-daily")
    assert r2.status_code == 409
    assert len(fake_ai.calls) == 1


async def test_run_daily_endpoint_not_ready(client, engine, fake_ai):
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE aidigest.knowledge"))
    r = await client.post("/ops/run-daily")
    assert r.status_code == 503
    assert r.json()["status"] == "schema_not_ready"
    assert fake_ai.calls == []


async def test_run_daily_endpoint_ai_failure_is_502(client, fake_ai, fake_fetcher):
    from aidigest.errors import AIError

    fake_fetcher.pages[SOURCES[0].url] = rss(FEED)
    fake_ai.queue(AIError("overloaded"))
    r = await client.post("/ops/run-daily")
    assert r.status_code == 502


async def _insert_article(engine, url, title, score=80, id_=None):
    async with engine.begin() as conn:
        await conn.execute(text(
            "INSERT INTO aidigest.articles (id,url,source,title,lead,summary,why_adapt,next_move,category,score,"
            "created_at) VALUES (:id,:url,'Src',:title,'Lead','Sum','Why','Next','Cat',:score,now())"),
            {"id": id_ or url, "url": url, "title": title, "score": score})


async def test_digest_html_escapes_and_only_links_https(client, engine):
    await _insert_article(engine, "javascript:alert(1)", "<script>alert(1)</script>")
    await _insert_article(engine, "https://ok.example/a", "Fine & dandy")
    r = await client.get("/digest")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert r.headers["cache-control"] == "no-store"
    assert "<script>alert(1)</script>" not in r.text
    assert "&lt;script&gt;" in r.text
    assert 'href="javascript:' not in r.text
    assert 'href="https://ok.example/a"' in r.text
    assert "THE BIG 3" in r.text


async def test_digest_json(client, engine):
    await _insert_article(engine, "https://ok.example/a", "A")
    r = await client.get("/digest.json")
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["url"] == "https://ok.example/a"
    assert set(rows[0]) >= {"title", "url", "source", "lead", "summary", "why_adapt", "next_move", "category", "score"}


async def test_read_endpoint_db_failure_is_503(client, engine):
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE aidigest.articles"))
    assert (await client.get("/digest.json")).status_code == 503


async def test_knowledge_query(client, engine):
    async with engine.begin() as conn:
        for i, (topic, statement) in enumerate([("finops", "Token pricing fell"), ("other", "100% sure"),
                                                ("misc", "nothing")]):
            await conn.execute(text(
                "INSERT INTO aidigest.knowledge (id, topic, statement, source_url, confidence, created_at) "
                "VALUES (:id, :t, :s, 'https://k.example/', 0.9, now())"), {"id": str(i), "t": topic, "s": statement})
    assert (await client.get("/knowledge")).status_code == 400
    assert (await client.get("/knowledge?q=a")).status_code == 400
    assert (await client.get("/knowledge?q=" + "a" * 201)).status_code == 400
    r = await client.get("/knowledge?q=FinOps")
    assert [k["topic"] for k in r.json()] == ["finops"]
    r = await client.get("/knowledge", params={"q": "%%"})
    assert r.json() == []
    r = await client.get("/knowledge", params={"q": "0%"})
    assert [k["topic"] for k in r.json()] == ["other"]


async def test_root_lists_endpoints(client):
    r = await client.get("/")
    assert "POST /agent/tasks" in r.json()["endpoints"]
