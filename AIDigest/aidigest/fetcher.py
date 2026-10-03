"""Guarded HTTPS GET fetcher - the only path for outbound source fetches.

Controls (each covered by tests/test_fetcher.py and the mutation check):
  * HTTPS only, default port only, no userinfo
  * no IP-literal hosts (incl. integer/hex/short IPv4 forms) and no local names
  * DNS resolved once per hop; every answer must be globally routable
  * the connection is made to the validated IP (Host header + TLS SNI = hostname,
    certificate verified against the hostname), so DNS rebinding cannot redirect it
  * redirects followed manually, each target re-validated, bounded count
  * streamed body with a byte cap (Content-Length pre-check + running total)
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from dataclasses import dataclass
from typing import Awaitable, Callable

import httpx

from aidigest.errors import UnsafeURLError, UpstreamError

USER_AGENT = "AdaptCloud-AIDigest/0.3 (+https://adaptcloud.io)"
ACCEPT = "text/html,text/plain,application/json,application/rss+xml,application/atom+xml,application/xml"
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
BLOCKED_HOSTS = {"localhost", "metadata", "metadata.google.internal", "instance-data", "kubernetes"}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".lan")
NAT64 = ipaddress.ip_network("64:ff9b::/96")

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


def validate_url(raw: str) -> httpx.URL:
    """Static checks that need no network. Raises UnsafeURLError."""
    if not isinstance(raw, str) or not raw.strip():
        raise UnsafeURLError("URL is empty")
    try:
        url = httpx.URL(raw.strip())
    except Exception as exc:  # httpx.InvalidURL and friends
        raise UnsafeURLError("URL could not be parsed") from exc
    if url.scheme != "https":
        raise UnsafeURLError("Only HTTPS URLs are allowed")
    if url.userinfo:
        raise UnsafeURLError("URL credentials are not allowed")
    if url.port not in (None, 443):
        raise UnsafeURLError("Only the default HTTPS port is allowed")
    host = (url.host or "").lower().rstrip(".")
    if not host:
        raise UnsafeURLError("URL has no host")
    if _is_ip_literal(host):
        raise UnsafeURLError("Literal IP hosts are not allowed")
    if host in BLOCKED_HOSTS or host.endswith(BLOCKED_SUFFIXES) or "." not in host:
        raise UnsafeURLError("Local or metadata hosts are not allowed")
    return url


def is_public_address(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        embedded = ip.ipv4_mapped or (ip.sixtofour if ip.sixtofour else None)
        if ip.teredo:
            embedded = ip.teredo[1]
        if ip in NAT64:
            embedded = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
        if embedded is not None and not is_public_address(str(embedded)):
            return False
    return bool(ip.is_global) and not ip.is_multicast


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
        resolver: Resolver | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.max_bytes = max_bytes
        self.max_redirects = max_redirects
        self.timeout = timeout
        self.resolver = resolver or system_resolver
        self.transport = transport

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

    async def fetch(self, raw_url: str) -> FetchResult:
        url = validate_url(raw_url)
        async with httpx.AsyncClient(
            transport=self.transport, timeout=self.timeout, follow_redirects=False, trust_env=False
        ) as client:
            for _hop in range(self.max_redirects + 1):
                host = url.host.lower().rstrip(".")
                address = await self._resolve_public(host)
                pinned = url.copy_with(host=address)  # connect to the validated IP only
                request = client.build_request(
                    "GET",
                    pinned,
                    headers={"Host": host, "User-Agent": USER_AGENT, "Accept": ACCEPT},
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
                encoding = response.charset_encoding or "utf-8"
                return FetchResult(
                    url=str(url),
                    status=response.status_code,
                    content_type=response.headers.get("content-type", ""),
                    text=body.decode(encoding, errors="replace"),
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
        received = 0
        chunks: list[bytes] = []
        async for chunk in response.aiter_bytes():  # decoded bytes: also caps decompression
            received += len(chunk)
            if received > self.max_bytes:
                raise UpstreamError("Source too large")
            chunks.append(chunk)
        return b"".join(chunks)
