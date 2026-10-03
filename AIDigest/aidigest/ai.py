"""Claude adapter (Anthropic Python SDK) plus strict parsing of model output.

Exactly one `complete()` call is made per DAILY run or TASK. No tools are sent,
so the model cannot trigger any side effect."""

from __future__ import annotations

import json
import math
from typing import Any, Protocol

import anthropic

from aidigest.errors import AIError


class AIClient(Protocol):
    async def complete(self, *, system: str, user: str) -> str: ...


class AnthropicAI:
    def __init__(self, client: Any, *, model: str, max_tokens: int):
        self._client = client
        self.model = model
        self.max_tokens = max_tokens

    async def complete(self, *, system: str, user: str) -> str:
        try:
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.APIError as exc:
            raise AIError(f"Claude API error: {type(exc).__name__}") from exc
        if response.stop_reason == "refusal":
            raise AIError("Claude declined the request")
        if response.stop_reason == "max_tokens":
            raise AIError("Claude output was truncated (max_tokens)")
        text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
        if not text.strip():
            raise AIError("Claude returned no text")
        return text


def build_anthropic_ai(settings) -> AnthropicAI:
    client = anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key or None,
        timeout=settings.aidigest_ai_timeout_seconds,
        max_retries=2,
    )
    return AnthropicAI(client, model=settings.aidigest_model, max_tokens=settings.aidigest_ai_max_tokens)


# ── Strict output parsing ────────────────────────────────────────────────────
def _reject_constant(name: str) -> Any:
    raise ValueError(f"non-finite JSON constant {name}")


def _loads(fragment: str) -> Any:
    try:
        return json.loads(fragment, parse_constant=_reject_constant)
    except (ValueError, RecursionError) as exc:
        raise AIError("Model returned invalid JSON") from exc


def parse_json_array(text: str) -> list:
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end <= start:
        raise AIError("Model did not return a JSON array")
    parsed = _loads(text[start:end + 1])
    if not isinstance(parsed, list):
        raise AIError("Model did not return a JSON array")
    return parsed


def parse_json_object(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise AIError("Model did not return a JSON object")
    parsed = _loads(text[start:end + 1])
    if not isinstance(parsed, dict):
        raise AIError("Model did not return a JSON object")
    return parsed


def finite_number(value: Any) -> float | None:
    """Finding 3: only real, finite JSON numbers count. Strings, bools, null, NaN, +/-inf -> None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except OverflowError:
        return None
    return number if math.isfinite(number) else None


def bounded_str(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""
