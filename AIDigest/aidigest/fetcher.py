"""Guarded HTTPS GET fetcher - the only path for outbound source fetches.

Controls (each covered by tests/test_fetcher.py and the mutation check):
  * HTTPS only, default port only, no userinfo, no control characters
  * no IP-literal hosts (incl. integer/hex/short IPv4 forms) and no local names;
    host checks use the IDNA (ASCII) form, which is also used for DNS, Host and SNI
  * DNS resolved once per hop; every answer must be globally routable (reserved,
    IPv4-compatible/-translated and local-use NAT64 ranges included)
  * the connection is made to the validated IP (Host header + TLS SNI = hostname,
    certificate verified against the hostname), so DNS rebinding cannot redirect it
  * redirects followed manually, each target re-validated, bounded count
  * Accept-Encoding: identity; gzip/deflate decoded incrementally under the byte cap,
    any other content encoding refused; Content-Length pre-check + running total
  * a total deadline per fetch (slowloris) on top of the per-read timeout
  * environment proxies are ignored (they would bypass IP pinning)
"""

from __future__ import annotations

import asyncio
import codecs
import ipaddress
import socket
import zlib
from dataclasses import dataclass
from typing import Awaitable, Callable

import httpx

from aidigest import __version__
from aidigest.errors import UnsafeURLError, UpstreamError

USER_AGENT = f"AdaptCloud-AIDigest/{__version__} (+https://adaptcloud.io)"
ACCEPT = "text/html,text/plain,application/json,application/rss+xml,application/atom+xml,application/xml"
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
BLOCKED_HOSTS = {"localhost", "metadata", "metadata.google.internal", "instance-data", "kubernetes"}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan")
NAT64 = ipaddress.ip_network("64:ff9b::/96")
NON_PUBLIC_V6 = tuple(ipaddress.ip_network(n) for n in (
    "::/96",            # IPv4-compatible (deprecated) - also covers :: and ::1
    "::ffff:0:0:0/96",  # IPv4-translated (RFC 2765)
    "64:ff9b:1::/48",   # local-use NAT64 (RFC 8215)
    "100::/64",         # discard-only
    "2001:db8::/32",    # documentation
))
YIELD_EVERY_CHUNKS = 256   # hand the event loop back periodically even if the transport never suspends
SUPPORTED_ENCODINGS = {"gzip": 16 + zlib.MAX_WBITS, "x-gzip": 16 + zlib.MAX_WBITS, "deflate": zlib.MAX_WBITS}

Resolver = Callable[[str], Awaitable[list[str]]]


@dataclass(frozen=True)
class FetchResult:
    url: str
    status: int
    content_type: str
    text: str


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        pass
    try:  # inet_aton accepts "2130706433", "0x7f000001", "127.1" - all resolve to IPs
        socket.inet_aton(host)
        return True
    except OSError:
        return False


def ascii_host(url: httpx.URL) -> str:
    """The IDNA-encoded host - the form used for every check, DNS, Host and SNI (M4)."""
    return url.raw_host.decode("ascii").lower().rstrip(".")


def validate_url(raw: str) -> httpx.URL:
    """Static checks that need no network. Raises UnsafeURLError."""
    if not isinstance(raw, str) or not raw.strip():
        raise UnsafeURLError("URL is empty")
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in raw):
        raise UnsafeURLError("URL contains control characters")
    try:
        url = httpx.URL(raw.strip())
        host = ascii_host(url)
    except Exception as exc:  # httpx.InvalidURL, IDNA errors and friends
        raise UnsafeURLError("URL could not be parsed") from exc
    if url.scheme != "https":
        raise UnsafeURLError("Only HTTPS URLs are allowed")
    if url.userinfo:
        raise UnsafeURLError("URL credentials are not allowed")
    if url.port not in (None, 443):
        raise UnsafeURLError("Only the default HTTPS port is allowed")
    if not host:
        raise UnsafeURLError("URL has no host")
    if _is_ip_literal(host):
        raise UnsafeURLError("Literal IP hosts are not allowed")
    if host in BLOCKED_HOSTS or host.endswith(BLOCKED_SUFFIXES) or "." not in host:
        raise UnsafeURLError("Local or metadata hosts are not allowed")
    return url


def effective_address(ip: ipaddress.IPv4Address | ipaddress.IPv6Address):
    """An IPv4-mapped address (::ffff:a.b.c.d) is judged purely as its IPv4: the stdlib flags for
    the mapped range differ between releases (e.g. is_reserved is True on 3.12.3, False on 3.11)."""
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    return ip


def policy_blocks(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Explicit deny rules that do not depend on the stdlib's is_global tables (defence in
    depth: those tables have changed between Python releases). True = never connect."""
    ip = effective_address(ip)
    if ip.is_reserved or ip.is_multicast:
        return True
    if isinstance(ip, ipaddress.IPv6Address):
        if any(ip in net for net in NON_PUBLIC_V6):
            return True
        embedded = ip.sixtofour or (ip.teredo[1] if ip.teredo else None)
        if embedded is not None and not is_public_address(str(embedded)):
            return True
    return False


def is_public_address(value: str) -> bool:
    try:
        ip = effective_address(ipaddress.ip_address(value.split("%", 1)[0]))
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip in NAT64:
        # Well-known NAT64 (DNS64 networks): judge by the embedded IPv4 address.
        return is_public_address(str(ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)))
    return bool(ip.is_global) and not policy_blocks(ip)


async def system_resolver(host: str) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(info[4][0] for info in infos))


class GuardedFetcher:
    def __init__(
        self,
        *,
        max_bytes: int = 1_000_000,
        max_redirects: int = 2,
        timeout: float = 15.0,
        total_timeout: float = 30.0,
        resolver: Resolver | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects
        self.timeout = timeout
        self.total_timeout = total_timeout
        self.resolver = resolver or system_resolver
        self.transport = transport

    async def fetch(self, raw_url: str) -> FetchResult:
        url = validate_url(raw_url)
        try:
            return await asyncio.wait_for(self._fetch(url), self.total_timeout)
        except TimeoutError as exc:  # M1: total deadline, not just per-read
            raise UpstreamError(f"Fetch deadline of {self.total_timeout:g}s exceeded") from exc

    async def _resolve_public(self, host: str) -> str:
        try:
            answers = await self.resolver(host)
        except Exception as exc:
            raise UpstreamError(f"Could not resolve {host}") from exc
        if not answers:
            raise UpstreamError(f"Could not resolve {host}")
        for address in answers:
            if not is_public_address(address):
                raise UnsafeURLError(f"{host} resolves to a non-public address")
        return answers[0]

    async def _fetch(self, url: httpx.URL) -> FetchResult:
        async with httpx.AsyncClient(
            transport=self.transport, timeout=self.timeout, follow_redirects=False, trust_env=False
        ) as client:
            for _hop in range(self.max_redirects + 1):
                host = ascii_host(url)
                address = await self._resolve_public(host)
                pinned = url.copy_with(host=address)  # connect to the validated IP only
                request = client.build_request(
                    "GET",
                    pinned,
                    headers={"Host": host, "User-Agent": USER_AGENT, "Accept": ACCEPT,
                             "Accept-Encoding": "identity"},
                    extensions={"sni_hostname": host},
                )
                try:
                    response = await client.send(request, stream=True)
                except httpx.HTTPError as exc:
                    raise UpstreamError(f"Fetch failed for {host}: {type(exc).__name__}") from exc
                try:
                    if response.status_code in REDIRECT_STATUSES:
                        location = response.headers.get("location")
                        if not location:
                            raise UpstreamError("Redirect without location")
                        url = validate_url(str(url.join(location)))
                        continue
                    if not 200 <= response.status_code < 300:
                        raise UpstreamError(f"Source returned {response.status_code}")
                    body = await self._read_capped(response)
                finally:
                    await response.aclose()
                return FetchResult(
                    url=str(url),
                    status=response.status_code,
                    content_type=response.headers.get("content-type", ""),
                    text=decode_text(body, response.charset_encoding),
                )
            raise UpstreamError("Too many redirects")

    async def _read_capped(self, response: httpx.Response) -> bytes:
        declared = response.headers.get("content-length")
        if declared is not None:
            try:
                if int(declared) > self.max_bytes:
                    raise UpstreamError("Source too large")
            except ValueError as exc:
                raise UpstreamError("Invalid Content-Length") from exc
        encoding = response.headers.get("content-encoding", "identity").strip().lower()
        if encoding in ("", "identity"):
            decoder = None
        elif encoding in SUPPORTED_ENCODINGS:
            decoder = zlib.decompressobj(SUPPORTED_ENCODINGS[encoding])
        else:
            raise UpstreamError(f"Unsupported content encoding {encoding[:40]!r}")
        if response.is_stream_consumed:
            # Only in-process transports hand over a pre-read (already decoded) body; still cap it.
            if len(response.content) > self.max_bytes:
                raise UpstreamError("Source too large")
            return response.content
        # M1 (round 2): O(1) work per wire chunk - running totals, never re-summing the chunk list.
        received = decoded = 0
        chunks: list[bytes] = []
        try:
            async for count, raw in _enumerate_async(response.aiter_raw()):
                if count % YIELD_EVERY_CHUNKS == YIELD_EVERY_CHUNKS - 1:
                    await asyncio.sleep(0)
                received += len(raw)
                if received > self.max_bytes:
                    raise UpstreamError("Source too large")
                if decoder is None:
                    chunks.append(raw)
                    continue
                data = raw
                while data:  # M5: incremental decode, never more than the remaining budget + 1
                    out = decoder.decompress(data, self.max_bytes - decoded + 1)
                    if out:
                        decoded += len(out)
                        if decoded > self.max_bytes:
                            raise UpstreamError("Source too large (decoded)")
                        chunks.append(out)
                    data = decoder.unconsumed_tail
        except httpx.HTTPError as exc:  # M4: e.g. ReadTimeout mid-body
            raise UpstreamError(f"Body read failed: {type(exc).__name__}") from exc
        except zlib.error as exc:
            raise UpstreamError("Corrupt compressed body") from exc
        return b"".join(chunks)


async def _enumerate_async(iterator):
    count = 0
    async for item in iterator:
        yield count, item
        count += 1


def _codec(name: str | None) -> str:
    """Charset from the response, falling back to UTF-8 for unknown names (M4)."""
    if not name:
        return "utf-8"
    try:
        return codecs.lookup(name).name
    except LookupError:
        return "utf-8"


def decode_text(body: bytes, charset: str | None) -> str:
    """Decode with a real text codec only (round 2 L1): bytes-to-bytes and str-to-str codecs
    (base64, rot13, zlib, ...) and IDNA/punycode are refused as 502, never a 500."""
    info = codecs.lookup(_codec(charset))
    if not getattr(info, "_is_text_encoding", True):     # base64, rot13, zlib, hex, uu, bz2, quopri ...
        raise UpstreamError(f"Unsupported charset {str(charset)[:40]!r}")
    try:  # text codecs that still cannot decode arbitrary bytes: idna, punycode, undefined
        return body.decode(info.name, errors="replace")
    except (UnicodeError, ValueError, TypeError) as exc:
        raise UpstreamError(f"Could not decode the body as charset {str(charset)[:40]!r}") from exc
