"""Claude adapter and strict model-output parsing. The Anthropic client is a fake."""

import math
from types import SimpleNamespace

import pytest

from aidigest.ai import AnthropicAI, finite_number, parse_json_array, parse_json_object
from aidigest.errors import AIError


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


def message(text, stop_reason="end_turn"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
        stop_reason=stop_reason,
    )


async def test_anthropic_adapter_makes_one_call_with_configured_model():
    msgs = FakeMessages(message('{"ok": true}'))
    ai = AnthropicAI(SimpleNamespace(messages=msgs), model="claude-sonnet-5-5", max_tokens=1234)
    out = await ai.complete(system="SYS", user="USER")
    assert out == '{"ok": true}'
    assert len(msgs.calls) == 1
    call = msgs.calls[0]
    assert call["model"] == "claude-sonnet-5-5"
    assert call["max_tokens"] == 1234
    assert call["system"] == "SYS"
    assert call["messages"] == [{"role": "user", "content": "USER"}]
    assert "tools" not in call


async def test_anthropic_adapter_refusal_is_ai_error():
    # Partial text with a refusal stop_reason must still be rejected.
    msgs = FakeMessages(message('[{"id": "x"}]', "refusal"))
    ai = AnthropicAI(SimpleNamespace(messages=msgs), model="m", max_tokens=10)
    with pytest.raises(AIError):
        await ai.complete(system="s", user="u")


async def test_anthropic_adapter_truncation_is_ai_error():
    ai = AnthropicAI(SimpleNamespace(messages=FakeMessages(message("[{", "max_tokens"))), model="m", max_tokens=10)
    with pytest.raises(AIError):
        await ai.complete(system="s", user="u")


async def test_anthropic_adapter_api_error_is_ai_error():
    import anthropic
    import httpx

    err = anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
    ai = AnthropicAI(SimpleNamespace(messages=FakeMessages(error=err)), model="m", max_tokens=10)
    with pytest.raises(AIError):
        await ai.complete(system="s", user="u")


@pytest.mark.parametrize(
    "value, expected",
    [(0, 0.0), (0.8, 0.8), (-15, -15.0), (1, 1.0)],
)
def test_finite_number_accepts_finite_numbers(value, expected):
    assert finite_number(value) == expected


@pytest.mark.parametrize(
    "value",
    [math.nan, math.inf, -math.inf, float("nan"), "0.9", "NaN", "Infinity", None, True, False, [], {}, "abc"],
)
def test_finite_number_rejects_everything_else(value):
    assert finite_number(value) is None


def test_parse_json_helpers():
    assert parse_json_array('noise [ {"a": 1} ] trailing') == [{"a": 1}]
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    for bad in ["", "no json", "[1, 2", "{\"a\": }"]:
        with pytest.raises(AIError):
            parse_json_array(bad)
        with pytest.raises(AIError):
            parse_json_object(bad)
    with pytest.raises(AIError):
        parse_json_object("[1]")


def test_parse_json_rejects_nan_literals():
    with pytest.raises(AIError):
        parse_json_array('[{"score_adjustment": NaN}]')
    with pytest.raises(AIError):
        parse_json_object('{"confidence": Infinity}')
