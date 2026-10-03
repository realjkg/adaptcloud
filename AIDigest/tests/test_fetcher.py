"""SSRF controls of the guarded fetcher. No real network: injected resolver + MockTransport."""

import httpx
import pytest

from aidigest.errors import UnsafeURLError, UpstreamError
from aidigest.fetcher import GuardedFetcher, is_public_address, validate_url

PUBLIC_V4 = "93.184.216.34"
PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946"


def resolver_for(table):
    calls = []

    async def resolve(host):
        calls.append(host)
        answer = table[host]
        if isinstance(answer, Exception):
            raise answer
        if callable(answer):
            return answer()
        return list(answer)

    resolve.calls = calls
    return resolve


def fetcher(handler, table, **kw):
    kw.setdefault("max_bytes", 1000)
    kw.setdefault("max_redirects", 2)
    return GuardedFetcher(resolver=resolver_for(table), transport=httpx.MockTransport(handler), timeout=5, **kw)


# ── Static URL validation ────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/",                      # not HTTPS
        "ftp://example.com/",
        "https://user:pw@example.com/",             # credentials
        "https://user@example.com/",
        "https://:pw@example.com/",
        "https://93.184.216.34/",                   # IPv4 literal
        "https://[::1]/",                           # IPv6 literal
        "https://[2606:2800:220:1::1]/",
        "https://2130706433/",                      # integer IPv4 form
        "https://0x7f000001/",                      # hex IPv4 form
        "https://127.1/",                           # short IPv4 form
        "https://localhost/",
        "https://LOCALHOST./",
        "https://api.localhost/",
        "https://metadata.google.internal/computeMetadata/v1/",
        "https://metadata/",
        "https://db.internal/",
        "https://printer.local/",
        "https://example.com:8443/",                # non-443 port
        "https:///nohost",
        "not a url",
        "",
    ],
)
def test_validate_url_rejects(url):
    with pytest.raises(UnsafeURLError):
        validate_url(url)


@pytest.mark.parametrize("url", ["https://example.com/a?b=c", "https://Example.COM:443/x", "https://sub.example.org"])
def test_validate_url_accepts(url):
    validate_url(url)


@pytest.mark.parametrize(
    "ip",
    ["10.0.0.5", "172.16.1.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
     "224.0.0.1", "192.0.2.1", "255.255.255.255", "::1", "::", "fc00::1", "fd00:ec2::254", "fe80::1",
     "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a9fe:a9fe", "2002:7f00:1::1", "ff02::1"],
)
def test_non_public_addresses(ip):
    assert not is_public_address(ip)


@pytest.mark.parametrize("ip", [PUBLIC_V4, "8.8.8.8", PUBLIC_V6])
def test_public_addresses(ip):
    assert is_public_address(ip)


# ── DNS-stage checks and IP pinning ──────────────────────────────────────────
@pytest.mark.parametrize(
    "answers",
    [["10.0.0.5"], ["127.0.0.1"], ["169.254.169.254"], ["::1"], ["fd00::1"],
     [PUBLIC_V4, "10.0.0.5"], ["::ffff:10.0.0.1"]],
)
async def test_rejects_host_resolving_to_private_address(answers):
    hits = []
    f = fetcher(lambda req: hits.append(req) or httpx.Response(200, text="x"), {"evil.example": answers})
    with pytest.raises(UnsafeURLError):
        await f.fetch("https://evil.example/")
    assert hits == []


async def test_resolution_failure_is_upstream_error():
    f = fetcher(lambda req: httpx.Response(200), {"nx.example": OSError("NXDOMAIN")})
    with pytest.raises(UpstreamError):
        await f.fetch("https://nx.example/")


async def test_empty_resolution_is_rejected():
    f = fetcher(lambda req: httpx.Response(200), {"empty.example": []})
    with pytest.raises((UnsafeURLError, UpstreamError)):
        await f.fetch("https://empty.example/")


async def test_connects_to_validated_ip_with_host_and_sni():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, text="<p>hello</p>", headers={"content-type": "text/html"})

    f = fetcher(handler, {"example.com": [PUBLIC_V4]})
    result = await f.fetch("https://example.com/page?x=1")
    assert result.text == "<p>hello</p>"
    assert result.url == "https://example.com/page?x=1"
    req = seen[0]
    assert req.method == "GET"
    assert req.url.host == PUBLIC_V4
    assert req.url.scheme == "https"
    assert req.url.path == "/page" and req.url.query == b"x=1"
    assert req.headers["host"] == "example.com"
    assert req.extensions.get("sni_hostname") == "example.com"


async def test_ipv6_answer_is_pinned_with_brackets():
    seen = []
    f = fetcher(lambda req: seen.append(req) or httpx.Response(200, text="ok"), {"v6.example": [PUBLIC_V6]})
    await f.fetch("https://v6.example/")
    assert seen[0].url.host == PUBLIC_V6
    assert seen[0].headers["host"] == "v6.example"


async def test_dns_rebinding_cannot_swap_address_after_validation():
    """Resolver answers public first, private afterwards. Only one lookup per hop is made and the
    connection goes to the validated public address, never to a re-resolved one."""
    answers = iter([[PUBLIC_V4], ["127.0.0.1"], ["127.0.0.1"]])
    seen = []
    table = {"rebind.example": lambda: next(answers)}
    f = fetcher(lambda req: seen.append(req) or httpx.Response(200, text="ok"), table)
    await f.fetch("https://rebind.example/")
    assert f.resolver.calls == ["rebind.example"]
    assert [r.url.host for r in seen] == [PUBLIC_V4]


# ── Redirects ────────────────────────────────────────────────────────────────
async def test_redirects_are_followed_and_revalidated():
    def handler(req):
        if req.headers["host"] == "a.example":
            return httpx.Response(302, headers={"location": "https://b.example/final"})
        return httpx.Response(200, text="done")

    f = fetcher(handler, {"a.example": [PUBLIC_V4], "b.example": ["8.8.8.8"]})
    result = await f.fetch("https://a.example/start")
    assert result.text == "done"
    assert result.url == "https://b.example/final"
    assert f.resolver.calls == ["a.example", "b.example"]


async def test_relative_redirect_is_resolved_against_current_url():
    def handler(req):
        if req.url.path == "/start":
            return httpx.Response(301, headers={"location": "/next"})
        return httpx.Response(200, text="rel")

    f = fetcher(handler, {"a.example": [PUBLIC_V4]})
    result = await f.fetch("https://a.example/start")
    assert result.url == "https://a.example/next"


@pytest.mark.parametrize(
    "location, table",
    [
        ("http://b.example/", {}),                                   # downgrade to http
        ("https://127.0.0.1/", {}),                                  # IP literal
        ("https://localhost/", {}),                                  # localhost
        ("https://user:pw@b.example/", {}),                          # credentials
        ("https://internal.example/", {"internal.example": ["10.1.2.3"]}),   # private after DNS
        ("https://meta.example/", {"meta.example": ["169.254.169.254"]}),
    ],
)
async def test_redirect_to_unsafe_target_is_rejected(location, table):
    hits = []

    def handler(req):
        hits.append(req.headers["host"])
        return httpx.Response(302, headers={"location": location})

    f = fetcher(handler, {"a.example": [PUBLIC_V4], **table})
    with pytest.raises(UnsafeURLError):
        await f.fetch("https://a.example/")
    assert hits == ["a.example"]


async def test_too_many_redirects():
    count = {"n": 0}

    def handler(req):
        count["n"] += 1
        return httpx.Response(302, headers={"location": f"https://a.example/{count['n']}"})

    f = fetcher(handler, {"a.example": [PUBLIC_V4]}, max_redirects=2)
    with pytest.raises(UpstreamError, match="redirect"):
        await f.fetch("https://a.example/")
    assert count["n"] == 3  # original + 2 redirects, then stop


async def test_redirect_without_location():
    f = fetcher(lambda req: httpx.Response(302), {"a.example": [PUBLIC_V4]})
    with pytest.raises(UpstreamError):
        await f.fetch("https://a.example/")


async def test_non_success_status_is_upstream_error():
    f = fetcher(lambda req: httpx.Response(500, text="boom"), {"a.example": [PUBLIC_V4]})
    with pytest.raises(UpstreamError, match="500"):
        await f.fetch("https://a.example/")


# ── Size cap (finding 5) ─────────────────────────────────────────────────────
async def test_size_cap_rejects_declared_content_length_before_reading():
    consumed = {"chunks": 0}

    async def body():
        for _ in range(3):
            consumed["chunks"] += 1
            yield b"x" * 10

    def handler(req):
        return httpx.Response(200, headers={"content-length": "5000"}, content=body())

    f = fetcher(handler, {"a.example": [PUBLIC_V4]}, max_bytes=1000)
    with pytest.raises(UpstreamError, match="too large"):
        await f.fetch("https://a.example/")
    assert consumed["chunks"] == 0


async def test_streaming_cap_aborts_chunked_body_without_content_length():
    consumed = {"chunks": 0}

    async def body():
        for _ in range(10_000):
            consumed["chunks"] += 1
            yield b"y" * 100

    f = fetcher(lambda req: httpx.Response(200, content=body()), {"a.example": [PUBLIC_V4]}, max_bytes=1000)
    with pytest.raises(UpstreamError, match="too large"):
        await f.fetch("https://a.example/")
    assert consumed["chunks"] <= 12  # stopped right after crossing 1000 bytes, not after buffering 1 MB


async def test_streaming_cap_aborts_when_content_length_lies():
    consumed = {"chunks": 0}

    async def body():
        for _ in range(10_000):
            consumed["chunks"] += 1
            yield b"z" * 100

    f = fetcher(lambda req: httpx.Response(200, headers={"content-length": "10"}, content=body()),
                {"a.example": [PUBLIC_V4]}, max_bytes=1000)
    with pytest.raises(UpstreamError, match="too large"):
        await f.fetch("https://a.example/")
    assert consumed["chunks"] <= 12


async def test_body_exactly_at_cap_is_allowed():
    f = fetcher(lambda req: httpx.Response(200, content=b"a" * 1000), {"a.example": [PUBLIC_V4]}, max_bytes=1000)
    result = await f.fetch("https://a.example/")
    assert len(result.text) == 1000
