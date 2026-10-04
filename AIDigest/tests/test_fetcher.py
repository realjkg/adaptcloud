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


# ── L2: reserved and IPv4-embedding IPv6 ranges ──────────────────────────────
@pytest.mark.parametrize(
    "ip",
    ["::7f00:1", "::a9fe:a9fe", "::ffff:0:7f00:1", "::ffff:0:a9fe:a9fe", "64:ff9b:1::a9fe:a9fe", "100::1",
     "240.0.0.1", "2001:db8::1", "::8.8.8.8", "::ffff:0:8.8.8.8"],
)
def test_reserved_and_ipv4_embedding_ranges_are_not_public(ip):
    assert not is_public_address(ip)


# ── M3: control characters in URLs ───────────────────────────────────────────
@pytest.mark.parametrize("url", ["https://a\x00b.example/", "https://example.com/a\x00b", "https://example.com/\r\nX: y"])
def test_validate_url_rejects_control_characters(url):
    with pytest.raises(UnsafeURLError):
        validate_url(url)


# ── L1: never use environment proxies (they would bypass IP pinning) ─────────
async def test_client_ignores_environment_proxies(monkeypatch):
    import aidigest.fetcher as fetcher_mod

    seen = {}
    real = fetcher_mod.httpx.AsyncClient

    def spy(*args, **kwargs):
        seen.update(kwargs)
        return real(*args, **kwargs)

    monkeypatch.setattr(fetcher_mod.httpx, "AsyncClient", spy)
    f = fetcher(lambda req: httpx.Response(200, text="ok"), {"a.example": [PUBLIC_V4]})
    await f.fetch("https://a.example/")
    assert seen.get("trust_env") is False
    assert seen.get("follow_redirects") is False


# ── M1: total deadline per fetch (slowloris) ─────────────────────────────────
async def test_trickling_body_hits_total_deadline():
    import asyncio
    import time

    async def trickle():
        for _ in range(50):          # 5 s in total; the deadline must stop it at 0.5 s
            yield b"x"
            await asyncio.sleep(0.1)

    f = fetcher(lambda req: httpx.Response(200, content=trickle()), {"a.example": [PUBLIC_V4]},
                total_timeout=0.5)
    t = time.monotonic()
    with pytest.raises(UpstreamError, match="deadline"):
        await f.fetch("https://a.example/")
    assert time.monotonic() - t < 1.5


async def test_slow_dns_hits_total_deadline():
    import asyncio

    async def slow_resolve(host):
        await asyncio.sleep(5)
        return [PUBLIC_V4]

    f = GuardedFetcher(resolver=slow_resolve, transport=httpx.MockTransport(lambda r: httpx.Response(200)),
                       timeout=5, total_timeout=0.3)
    with pytest.raises(UpstreamError, match="deadline"):
        await f.fetch("https://a.example/")


# ── M4: mid-body timeout, unknown charset, IDN hosts ─────────────────────────
async def test_read_timeout_mid_body_is_upstream_error():
    async def body():
        yield b"partial"
        raise httpx.ReadTimeout("read timed out")

    f = fetcher(lambda req: httpx.Response(200, content=body()), {"a.example": [PUBLIC_V4]})
    with pytest.raises(UpstreamError):
        await f.fetch("https://a.example/")


async def test_unknown_charset_falls_back_to_utf8():
    f = fetcher(lambda req: httpx.Response(200, content="café".encode(),
                                           headers={"content-type": "text/html; charset=x-bogus-9"}),
                {"a.example": [PUBLIC_V4]})
    assert (await f.fetch("https://a.example/")).text == "café"


async def test_idn_host_uses_idna_for_dns_host_header_and_sni():
    seen = []
    f = fetcher(lambda req: seen.append(req) or httpx.Response(200, text="ok"),
                {"xn--bcher-kva.example": [PUBLIC_V4]})
    await f.fetch("https://bücher.example/x")
    assert f.resolver.calls == ["xn--bcher-kva.example"]
    assert seen[0].headers["host"] == "xn--bcher-kva.example"
    assert seen[0].extensions["sni_hostname"] == "xn--bcher-kva.example"


@pytest.mark.parametrize("url", ["https://ｌｏｃａｌｈｏｓｔ/",
                                 "https://xn--localhost-.localhost/"])
def test_idn_spoofs_of_local_names_rejected(url):
    with pytest.raises(UnsafeURLError):
        validate_url(url)


# ── M5: compression cannot bypass the byte cap ───────────────────────────────
def streamed(data: bytes, chunk: int = 65536):
    """A body that arrives over the wire in chunks (what real transports deliver)."""
    async def gen():
        for i in range(0, len(data), chunk):
            yield data[i:i + chunk]
    return gen()


def _gzip_bomb(decoded_bytes: int) -> bytes:
    import zlib

    comp = zlib.compressobj(9, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
    chunk = b"\0" * (1 << 20)
    out = [comp.compress(chunk) for _ in range(decoded_bytes >> 20)]
    out.append(comp.flush())
    return b"".join(out)


async def test_requests_identity_encoding():
    seen = []
    f = fetcher(lambda req: seen.append(req) or httpx.Response(200, text="ok"), {"a.example": [PUBLIC_V4]})
    await f.fetch("https://a.example/")
    assert seen[0].headers["accept-encoding"] == "identity"


async def test_gzip_bomb_is_capped_on_decoded_bytes_with_bounded_memory():
    import tracemalloc

    bomb = _gzip_bomb(200 << 20)  # 200 MB of zeros, ~200 KB on the wire
    assert len(bomb) < 1_000_000
    f = fetcher(lambda req: httpx.Response(200, content=streamed(bomb), headers={"content-encoding": "gzip"}),
                {"a.example": [PUBLIC_V4]}, max_bytes=1_000_000)
    tracemalloc.start()
    try:
        with pytest.raises(UpstreamError, match="too large"):
            await f.fetch("https://a.example/")
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert peak < 12_000_000, f"peak {peak} bytes while decoding a gzip bomb"


async def test_small_gzip_body_is_decoded():
    import gzip

    f = fetcher(lambda req: httpx.Response(200, content=streamed(gzip.compress(b"hello gzip")),
                                           headers={"content-encoding": "gzip"}), {"a.example": [PUBLIC_V4]})
    assert (await f.fetch("https://a.example/")).text == "hello gzip"


@pytest.mark.parametrize("encoding", ["br", "zstd", "gzip, br", "compress"])
async def test_unsupported_content_encoding_rejected(encoding):
    f = fetcher(lambda req: httpx.Response(200, content=streamed(b"xx"), headers={"content-encoding": encoding}),
                {"a.example": [PUBLIC_V4]})
    with pytest.raises(UpstreamError, match="encoding"):
        await f.fetch("https://a.example/")


async def test_corrupt_gzip_is_upstream_error():
    f = fetcher(lambda req: httpx.Response(200, content=streamed(b"not gzip at all"),
                                           headers={"content-encoding": "gzip"}),
                {"a.example": [PUBLIC_V4]})
    with pytest.raises(UpstreamError):
        await f.fetch("https://a.example/")


# ── PR review 4177765193: compressed bodies must be complete and end where the stream ends ──
def _compressed(encoding: str, data: bytes) -> bytes:
    import gzip
    import zlib
    return gzip.compress(data) if encoding in ("gzip", "x-gzip") else zlib.compress(data)


_TEXT = b"a complete body of plain text " * 40


@pytest.mark.parametrize("encoding", ["gzip", "x-gzip", "deflate"])
@pytest.mark.parametrize("chunk", [7, 65536])
@pytest.mark.parametrize("damage", ["truncated", "trailing-garbage", "two-streams"])
async def test_incomplete_or_padded_compressed_body_is_rejected(encoding, chunk, damage):
    """A truncated stream would otherwise come back as a silently partial body; bytes after the end
    of the compressed stream are not part of the body either."""
    body = _compressed(encoding, _TEXT)
    wire = {"truncated": body[: len(body) // 2], "trailing-garbage": body + b"GARBAGE",
            "two-streams": body + body}[damage]
    f = fetcher(lambda req: httpx.Response(200, content=streamed(wire, chunk), headers={"content-encoding": encoding}),
                {"a.example": [PUBLIC_V4]}, max_bytes=100_000)
    with pytest.raises(UpstreamError, match="(?i)truncated|trailing"):
        await f.fetch("https://a.example/")


@pytest.mark.parametrize("encoding", ["gzip", "x-gzip", "deflate"])
@pytest.mark.parametrize("chunk", [1, 7, 65536])
async def test_complete_compressed_body_is_decoded(encoding, chunk):
    f = fetcher(lambda req: httpx.Response(200, content=streamed(_compressed(encoding, _TEXT), chunk),
                                           headers={"content-encoding": encoding}),
                {"a.example": [PUBLIC_V4]}, max_bytes=100_000)
    assert (await f.fetch("https://a.example/")).text == _TEXT.decode()


@pytest.mark.parametrize("encoding", ["gzip", "deflate"])
async def test_pre_read_compressed_body_is_refused(encoding):
    """An in-process transport hands over a body httpx already decoded, without checking that the
    stream was complete (a truncated gzip comes back as a few bytes): it cannot be verified."""
    truncated = _compressed(encoding, _TEXT)[:30]
    f = fetcher(lambda req: httpx.Response(200, content=truncated, headers={"content-encoding": encoding}),
                {"a.example": [PUBLIC_V4]}, max_bytes=100_000)
    with pytest.raises(UpstreamError, match="(?i)verif"):
        await f.fetch("https://a.example/")


# ── L2: the explicit policy layer, tested independently of ipaddress.is_global ─
@pytest.mark.parametrize(
    "ip",
    ["4000::1",                                  # reserved only (stdlib calls it global)
     "::7f00:1", "::8.8.8.8",                    # IPv4-compatible ::/96
     "::ffff:0:7f00:1",                          # IPv4-translated
     "64:ff9b:1::a9fe:a9fe", "100::1", "2001:db8::1",
     # IPv4-mapped addresses are judged as plain IPv4 by is_public_address (round 2 M3), see
     # test_ipv4_mapped_decided_by_embedded_ipv4.
     "2002:7f00:1::1", "2002:a9fe:a9fe::1",              # 6to4 of private
     "2001:0:4136:e378:8000:63bf:80ff:fffe",             # Teredo, client 127.0.0.1
     "240.0.0.1", "224.0.0.1", "ff02::1"],
)
def test_policy_layer_blocks_without_relying_on_stdlib_tables(ip):
    import ipaddress

    from aidigest.fetcher import policy_blocks

    assert policy_blocks(ipaddress.ip_address(ip))


@pytest.mark.parametrize("ip", [PUBLIC_V4, "8.8.8.8", PUBLIC_V6, "2002:808:808::1", "::ffff:8.8.8.8"])
def test_policy_layer_allows_public_and_public_embedded(ip):
    import ipaddress

    from aidigest.fetcher import policy_blocks

    assert not policy_blocks(ipaddress.ip_address(ip))


def test_reserved_but_stdlib_global_address_is_rejected():
    import ipaddress

    assert ipaddress.ip_address("4000::1").is_global  # the stdlib alone would allow it
    assert not is_public_address("4000::1")


# ═════════════════════════ challenger round 2 ═════════════════════════════════
ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent

_CHUNK_CHILD = """
import asyncio, gzip, os, resource, sys, time, httpx
resource.setrlimit(resource.RLIMIT_CPU, (30, 35))   # all samples together: 30 CPU s, then SIGXCPU
from aidigest.fetcher import GuardedFetcher

async def resolve(host):
    return ["93.184.216.34"]

def make(body, encoding):
    async def gen():
        for i in range(len(body)):
            yield body[i:i + 1]          # one byte per wire chunk
    headers = {{"content-encoding": encoding}} if encoding else {{}}
    return GuardedFetcher(resolver=resolve, max_bytes=2_000_000, timeout=60, total_timeout=600,
                          transport=httpx.MockTransport(lambda r: httpx.Response(200, content=gen(), headers=headers)))

def plain(n):
    return os.urandom(n // 2).hex().encode()[:n]   # ~2:1 compressible text

async def run(n, encoding):
    raw = plain(2 * n) if encoding else plain(n)       # hex text gzips ~2:1 -> ~n wire bytes either way
    body = gzip.compress(raw) if encoding else raw
    t = time.process_time()        # CPU time of this process: other load on the machine does not count
    result = await make(body, encoding).fetch("https://a.example/")
    assert result.text.encode() == raw
    return time.process_time() - t, len(body)

async def best(n, enc):            # min of 3 samples: noise only ever adds time
    samples = [await run(n, enc) for _ in range(3)]
    return min(s[0] for s in samples), samples[0][1]

async def main():
    enc = sys.argv[1] or None
    q, nq = await best({n} // 4, enc)
    f, nf = await best({n}, enc)
    print(f"{{q:.4f}} {{f:.4f}} {{nq}} {{nf}}")

asyncio.run(main())
"""


@pytest.mark.parametrize("encoding", ["gzip", ""])
def test_200k_one_byte_chunks_are_linear(encoding):
    """M1 (round 2): per-chunk work must be O(1); 200k one-byte wire chunks, and linear growth from
    N/4 to N (quadratic would be ~16x). Measured as the child's CPU time, min of 3 samples per size
    (review of ae012a0: wall-clock was flaky under load); the child is hard-killed at 120 s wall-clock."""
    import subprocess
    import sys

    n = 200_000
    try:
        proc = subprocess.run([sys.executable, "-c", _CHUNK_CHILD.format(n=n), encoding], cwd=ROOT,
                              capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        pytest.fail(f"{encoding or 'identity'}: 200k one-byte chunks exceeded 120 s (child killed)")
    assert proc.returncode != -__import__("signal").SIGXCPU, f"{encoding or 'identity'}: used up 30 s of CPU (super-linear)"
    assert proc.returncode == 0, proc.stderr[-2000:]
    quarter, full, n_quarter, n_full = proc.stdout.split()
    assert int(n_full) > 150_000, n_full
    assert float(full) <= max(2.0, 8 * float(quarter)), f"{quarter}s at N/4 -> {full}s at N (super-linear)"


async def _max_loop_gap(coro) -> float:
    import asyncio
    import time

    stop = asyncio.Event()

    async def ticker():
        # CPU time of the event-loop thread between two ticker turns (review of ae012a0): the work
        # the loop did without yielding. Time the process spends descheduled under load is not counted.
        worst, last = 0.0, time.thread_time()
        while not stop.is_set():
            await asyncio.sleep(0.005)
            now = time.thread_time()
            worst, last = max(worst, now - last), now
        return worst

    tick = asyncio.create_task(ticker())
    await asyncio.sleep(0.02)
    try:
        await coro
    finally:
        stop.set()
    return await tick


async def test_gzip_in_16_byte_chunks_keeps_the_loop_responsive():
    import asyncio
    import gzip
    import os

    body = gzip.compress(os.urandom(300_000).hex().encode())   # ~600 KB decoded, ~330 KB on the wire

    async def gen():
        for i in range(0, len(body), 16):
            yield body[i:i + 16]
            await asyncio.sleep(0)                               # like a socket delivering small reads

    f = fetcher(lambda req: httpx.Response(200, content=gen(), headers={"content-encoding": "gzip"}),
                {"a.example": [PUBLIC_V4]}, max_bytes=2_000_000, total_timeout=60)
    gap = await _max_loop_gap(f.fetch("https://a.example/"))
    assert gap < 0.25, f"event loop stalled {gap:.2f}s"


async def test_non_yielding_stream_still_yields_the_loop_periodically():
    """A transport that never suspends (already-buffered data) must not monopolise the loop.
    Counted in work, not time (review of ae012a0): a sleep(0) ticker records how many chunks the
    reader consumed between two of its turns; the read loop hands the loop back every
    YIELD_EVERY_CHUNKS chunks, so no stretch may be longer than that (+ slack for httpx's own steps)."""
    import asyncio

    from aidigest.fetcher import YIELD_EVERY_CHUNKS
    produced = 0

    async def gen():
        nonlocal produced
        for _ in range(200_000):
            produced += 1
            yield b"a"

    stretches: list[int] = []
    stop = asyncio.Event()

    async def ticker():
        last = produced
        while not stop.is_set():
            await asyncio.sleep(0)
            stretches.append(produced - last)
            last = produced

    f = fetcher(lambda req: httpx.Response(200, content=gen()), {"a.example": [PUBLIC_V4]},
                max_bytes=2_000_000, total_timeout=60)
    tick = asyncio.create_task(ticker())
    await asyncio.sleep(0)
    try:
        await f.fetch("https://a.example/")
    finally:
        stop.set()
        await tick
    assert produced == 200_000
    assert max(stretches) <= YIELD_EVERY_CHUNKS + 8, f"{max(stretches)} chunks without yielding the loop"


# ── L1 (round 2): non-text codecs and pathological charrefs ───────────────────
@pytest.mark.parametrize("charset", ["base64", "rot13", "idna", "hex", "zlib", "uu", "bz2", "quopri", "punycode"])
async def test_non_text_charset_is_upstream_error(charset):
    f = fetcher(lambda req: httpx.Response(200, content=streamed(b"hello \xff world"),
                                           headers={"content-type": f"text/html; charset={charset}"}),
                {"a.example": [PUBLIC_V4]})
    with pytest.raises(UpstreamError, match="charset"):
        await f.fetch("https://a.example/")


# ── M3 (round 2): IPv4-mapped addresses are judged by their IPv4 alone ────────
@pytest.mark.parametrize("ip, public", [("::ffff:8.8.8.8", True), ("::ffff:93.184.216.34", True),
                                        ("::ffff:127.0.0.1", False), ("::ffff:10.0.0.1", False),
                                        ("::ffff:169.254.169.254", False), ("::ffff:240.0.0.1", False)])
def test_ipv4_mapped_decided_by_embedded_ipv4(ip, public):
    assert is_public_address(ip) is public


# ── L8 (round 2): one version string ──────────────────────────────────────────
def test_user_agent_carries_package_version():
    import aidigest
    from aidigest.fetcher import USER_AGENT

    assert USER_AGENT == f"AdaptCloud-AIDigest/{aidigest.__version__} (+https://adaptcloud.io)"
