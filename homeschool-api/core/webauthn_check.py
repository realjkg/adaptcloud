"""
WebAuthn configuration validator.

Classifies the deployment's security tier and surfaces actionable issues
so operators know exactly what to fix before going live.

Security tiers (best → worst):
  production  — public domain + HTTPS + global CA cert
  lan         — .local / private hostname + HTTPS + Caddy local CA
  localhost   — http://localhost only, development use
  invalid     — IP address or non-HTTPS non-localhost (passkeys will fail)
"""

import re
import socket
from urllib.parse import urlparse

from core.config import settings, _is_ip, _LAN_TLDS

_TIER_NOTES = {
    "production": "Public domain with HTTPS — optimal for internet access",
    "lan":        "LAN hostname with HTTPS — install Caddy CA cert on each tablet",
    "localhost":  "Development only — passkeys work on this machine only",
    "invalid":    "WebAuthn will fail — see issues list",
}


def _tier_from_origin(origin: str) -> str:
    parsed = urlparse(origin)
    hostname = parsed.hostname or ""
    scheme = parsed.scheme
    if _is_ip(hostname):
        return "invalid"
    if hostname == "localhost":
        return "localhost"
    if scheme != "https":
        return "invalid"
    if any(hostname.endswith(tld) for tld in _LAN_TLDS):
        return "lan"
    return "production"


def _probe_dns(hostname: str, port: int) -> tuple[bool, str | None]:
    """Returns (resolves, error_message). Non-blocking DNS lookup."""
    if hostname == "localhost":
        return True, None
    try:
        socket.getaddrinfo(hostname, port, timeout=3)
        return True, None
    except OSError as exc:
        return False, str(exc)


def build_config_report(*, probe_dns: bool = False) -> dict:
    """
    Return a structured report of the current WebAuthn configuration.

    Args:
        probe_dns: If True, performs a live DNS lookup (used by the admin endpoint).
                   The public endpoint skips this to keep latency low.
    """
    origin = settings.webauthn_origin
    rp_id = settings.webauthn_rp_id
    rp_name = settings.webauthn_rp_name
    site_url = settings.site_url

    parsed = urlparse(origin)
    scheme = parsed.scheme
    hostname = parsed.hostname or ""
    port = parsed.port or (443 if scheme == "https" else 80)

    tier = _tier_from_origin(origin)
    issues: list[str] = []

    # ── Scheme check ──────────────────────────────────────────────────────────
    if scheme == "http" and hostname != "localhost":
        issues.append(
            f"Origin uses HTTP ({origin!r}). "
            "HTTPS is required for passkeys on non-localhost deployments. "
            "Set SITE_URL to an https:// address."
        )

    # ── IP address check ──────────────────────────────────────────────────────
    if _is_ip(hostname):
        issues.append(
            f"Hostname {hostname!r} is an IP address. "
            "WebAuthn requires a domain name as the Relying Party ID. "
            "Use a .local mDNS name (e.g. bede.local) or a real domain."
        )

    # ── rpId ↔ origin consistency ─────────────────────────────────────────────
    if hostname and rp_id:
        if hostname != rp_id and not hostname.endswith("." + rp_id):
            issues.append(
                f"WEBAUTHN_RP_ID {rp_id!r} is not a registrable-domain suffix "
                f"of the origin hostname {hostname!r}. "
                "Either remove WEBAUTHN_RP_ID to auto-derive it, or set it to "
                f"{hostname!r}."
            )

    # ── Production / LAN guidance ─────────────────────────────────────────────
    caddy_note = None
    if tier == "lan":
        caddy_note = (
            "Run 'make caddy-trust' once on each tablet to install the "
            "Caddy local CA cert and eliminate browser security warnings."
        )

    # ── DNS probe (admin only) ─────────────────────────────────────────────────
    dns_result: dict | None = None
    if probe_dns and hostname and hostname != "localhost":
        resolves, dns_error = _probe_dns(hostname, port)
        dns_result = {"resolves": resolves, "error": dns_error}
        if not resolves:
            issues.append(
                f"DNS lookup for {hostname!r} failed: {dns_error}. "
                "If using a .local name, ensure mDNS (Avahi/Bonjour) is running "
                "and the hostname is correct."
            )

    return {
        "site_url": site_url or "(not set — defaults to localhost)",
        "origin": origin,
        "rp_id": rp_id,
        "rp_name": rp_name,
        "security_tier": tier,
        "security_note": _TIER_NOTES[tier],
        "caddy_note": caddy_note,
        "https_enforced": scheme == "https",
        "config_valid": len(issues) == 0,
        "issues": issues,
        **({"dns": dns_result} if dns_result is not None else {}),
    }
