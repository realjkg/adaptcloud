"""Auth matrix: Caddy basic_auth -> X-AIDigest-User + proxy shared secret. Fail closed."""

import httpx
import pytest

from tests.fakes import PROXY_SECRET

USER = "operator@adapt.cloud"

PROTECTED = [
    ("GET", "/ops/status"),
    ("POST", "/ops/run-daily"),
    ("GET", "/digest"),
    ("GET", "/digest.json"),
    ("GET", "/knowledge?q=finops"),
    ("POST", "/agent/tasks"),
    ("GET", "/agent/tasks/00000000-0000-0000-0000-000000000000"),
    ("GET", "/"),
    ("GET", "/does-not-exist"),
    ("GET", "/docs"),
    ("GET", "/openapi.json"),
    ("POST", "/health"),
]


def _client(app, headers):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://aidigest", headers=headers)


async def test_health_is_public_and_not_sensitive(anon_client):
    r = await anon_client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.parametrize("method, path", PROTECTED)
@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-headers"),
        pytest.param({"X-AIDigest-User": USER}, id="user-without-secret"),
        pytest.param({"X-AIDigest-Proxy-Secret": PROXY_SECRET}, id="secret-without-user"),
        pytest.param({"X-AIDigest-User": "", "X-AIDigest-Proxy-Secret": PROXY_SECRET}, id="empty-user"),
        pytest.param({"X-AIDigest-User": "   ", "X-AIDigest-Proxy-Secret": PROXY_SECRET}, id="blank-user"),
        pytest.param({"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": "wrong"}, id="wrong-secret"),
        pytest.param({"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": PROXY_SECRET[:-1]}, id="prefix-secret"),
        pytest.param({"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": PROXY_SECRET + "x"}, id="long-secret"),
        pytest.param({"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": ""}, id="empty-secret"),
    ],
)
async def test_protected_routes_reject_without_valid_proxy_auth(app, method, path, headers):
    async with _client(app, headers) as c:
        r = await c.request(method, path, json={"task": "anything at all"} if method == "POST" else None)
    assert r.status_code == 401, (method, path, headers, r.text)
    assert USER not in r.text


async def test_valid_proxy_headers_are_accepted_and_identity_used(client):
    r = await client.get("/ops/status")
    assert r.status_code == 200
    assert r.json()["authenticated_as"] == "operator@adapt.cloud"


async def test_forged_user_header_from_other_container_rejected(app):
    """A container on the compose network can set X-AIDigest-User but does not know the secret."""
    async with _client(app, {"X-AIDigest-User": "admin"}) as c:
        r = await c.get("/digest.json")
    assert r.status_code == 401


async def test_service_without_configured_secret_rejects_everything(settings, engine, fake_ai, fake_fetcher):
    from aidigest.app import create_app

    app = create_app(settings.model_copy(update={"aidigest_proxy_secret": ""}),
                     engine=engine, ai=fake_ai, fetcher=fake_fetcher)
    async with app.router.lifespan_context(app):
        for headers in ({"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": ""},
                        {"X-AIDigest-User": USER}):
            async with _client(app, headers) as c:
                assert (await c.get("/ops/status")).status_code == 401
        async with _client(app, {}) as c:
            assert (await c.get("/health")).status_code == 200


async def test_proxy_secret_uses_constant_time_compare(app, monkeypatch):
    import aidigest.auth as auth

    calls = []
    real = auth.hmac.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(auth.hmac, "compare_digest", spy)
    async with _client(app, {"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": "nope"}) as c:
        assert (await c.get("/ops/status")).status_code == 401
    async with _client(app, {"X-AIDigest-User": USER, "X-AIDigest-Proxy-Secret": PROXY_SECRET}) as c:
        assert (await c.get("/ops/status")).status_code == 200
    assert len(calls) == 2
    assert all(isinstance(a, bytes) and isinstance(b, bytes) for a, b in calls)
