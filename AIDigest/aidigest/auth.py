"""Fail-closed authentication for requests proxied by Caddy.

Caddy performs basic_auth, then sets X-AIDigest-User to the authenticated user id
(overwriting any client value) and adds X-AIDigest-Proxy-Secret. This middleware
rejects every request except GET/HEAD /health unless BOTH are present and valid."""

import hmac
import json

from starlette.datastructures import Headers

USER_HEADER = "x-aidigest-user"
SECRET_HEADER = "x-aidigest-proxy-secret"  # noqa: S105 - header name, not a secret
PUBLIC_ROUTES = {("GET", "/health"), ("HEAD", "/health")}


class AuthMiddleware:
    def __init__(self, app, *, proxy_secret: str):
        self.app = app
        self._secret = proxy_secret.encode("utf-8")

    def _secret_ok(self, supplied: str) -> bool:
        if not self._secret:
            return False  # no configured secret -> nothing is trusted
        return hmac.compare_digest(supplied.encode("utf-8"), self._secret)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            return await self.app(scope, receive, send)
        if scope["type"] != "http":
            return await send({"type": "websocket.close", "code": 1008})
        if (scope["method"], scope["path"]) in PUBLIC_ROUTES:
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        user = headers.get(USER_HEADER, "").strip()
        if not self._secret_ok(headers.get(SECRET_HEADER, "")) or not user:
            return await _unauthorized(send)
        scope.setdefault("state", {})["user"] = user
        return await self.app(scope, receive, send)


async def _unauthorized(send) -> None:
    body = json.dumps({"error": "Authentication required"}).encode()
    await send({"type": "http.response.start", "status": 401, "headers": [
        (b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
        (b"cache-control", b"no-store"), (b"www-authenticate", b'Basic realm="AIDigest"'),
    ]})
    await send({"type": "http.response.body", "body": body})
