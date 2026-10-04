"""Production validation (mirrors homeschool-api core/config.py)."""

import pytest
from pydantic import ValidationError

from tests.fakes import PROXY_SECRET, make_settings

GOOD_PROD = dict(
    production="true",
    anthropic_api_key="sk-ant-api03-" + "x" * 40,
    aidigest_database_url="postgresql+asyncpg://aidigest_app:p@db.example.com/sagedb?ssl=require",
    aidigest_proxy_secret=PROXY_SECRET,
    aidigest_basic_auth_user="ops",
)


def test_default_model_is_current_sonnet():
    assert make_settings().aidigest_model == "claude-sonnet-5-5"


def test_model_is_configurable():
    assert make_settings(aidigest_model="claude-opus-5-5").aidigest_model == "claude-opus-5-5"


def test_valid_production_settings_accepted():
    s = make_settings(**GOOD_PROD)
    assert s.is_production


@pytest.mark.parametrize(
    "override, needle",
    [
        ({"aidigest_proxy_secret": ""}, "AIDIGEST_PROXY_SECRET"),
        ({"aidigest_proxy_secret": "short-secret"}, "AIDIGEST_PROXY_SECRET"),
        ({"aidigest_proxy_secret": "replace-me-openssl-rand-hex-32"}, "AIDIGEST_PROXY_SECRET"),
        ({"anthropic_api_key": ""}, "ANTHROPIC_API_KEY"),
        ({"anthropic_api_key": "sk-ant-..."}, "ANTHROPIC_API_KEY"),
        ({"anthropic_api_key": "sk-ant-REPLACE_ME"}, "ANTHROPIC_API_KEY"),
        ({"aidigest_database_url": ""}, "AIDIGEST_DATABASE_URL"),
        ({"aidigest_database_url": "postgresql+asyncpg://user:password@host/dbname?ssl=require"},
         "AIDIGEST_DATABASE_URL"),
    ],
)
def test_production_rejects_weak_or_missing_secrets(override, needle):
    with pytest.raises(ValidationError, match=needle):
        make_settings(**{**GOOD_PROD, **override})


def test_dev_mode_tolerates_missing_secret_but_service_still_fails_closed():
    s = make_settings(aidigest_proxy_secret="")
    assert not s.is_production
    assert s.aidigest_proxy_secret == ""


def test_daily_time_default_and_parse():
    s = make_settings()
    assert s.aidigest_daily_time == "12:30"
    assert (s.daily_hour, s.daily_minute) == (12, 30)
    s2 = make_settings(aidigest_daily_time="06:05")
    assert (s2.daily_hour, s2.daily_minute) == (6, 5)


@pytest.mark.parametrize("bad", ["25:00", "12:60", "1230", "noon", ""])
def test_daily_time_rejects_invalid(bad):
    with pytest.raises(ValidationError):
        make_settings(aidigest_daily_time=bad)


def test_database_url_comes_from_aidigest_database_url(monkeypatch):
    """M8: AIDigest uses its own least-privilege connection string, never the tutor's DATABASE_URL."""
    from aidigest.config import Settings

    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://sage:x@db/sagedb")
    monkeypatch.setenv("AIDIGEST_DATABASE_URL", "postgresql+asyncpg://aidigest_app:y@db/sagedb")
    assert Settings(_env_file=None).aidigest_database_url.startswith("postgresql+asyncpg://aidigest_app")
    monkeypatch.delenv("AIDIGEST_DATABASE_URL")
    assert Settings(_env_file=None).aidigest_database_url == ""


def test_safe_defaults():
    """L1/L5/M1/M2/M6: bounds that protect cost and availability have safe defaults."""
    s = make_settings()
    assert s.aidigest_fetch_max_redirects == 2
    assert s.aidigest_fetch_max_bytes == 1_000_000
    assert s.aidigest_fetch_total_seconds == 30
    assert s.aidigest_parse_timeout_seconds == 10
    assert s.aidigest_ai_max_tokens == 16_000
    assert s.aidigest_ai_effort == "medium"
    assert s.aidigest_ai_max_concurrency == 2
    assert s.aidigest_task_hourly_limit == 20
    assert s.aidigest_task_budget_seconds == 600
    assert s.aidigest_daily_budget_seconds == 900
    assert s.aidigest_daily_lease_seconds == 1200
    assert s.aidigest_daily_heartbeat_seconds == 60
    assert s.aidigest_daily_max_attempts == 3
    assert s.aidigest_daily_lease_seconds > s.aidigest_daily_budget_seconds


@pytest.mark.parametrize(
    "override",
    [
        {"aidigest_daily_lease_seconds": 900, "aidigest_daily_budget_seconds": 900},
        {"aidigest_daily_lease_seconds": 600},
        {"aidigest_daily_heartbeat_seconds": 1200},
        {"aidigest_ai_effort": "max"},
        {"aidigest_ai_max_concurrency": 0},
        {"aidigest_task_hourly_limit": 0},
        {"aidigest_daily_max_attempts": 0},
    ],
)
def test_unsafe_limits_rejected(override):
    """M2: the stale-takeover window must exceed the run budget; limits must be positive."""
    with pytest.raises(ValidationError):
        make_settings(**override)



# ── Round 3 M1: values Caddy must carry safely are restricted at the source ───
@pytest.mark.parametrize("secret", [
    "correct horse battery staple long passphrase",     # spaces (the challenger's repro)
    "0123456789abcdef0123456789abcdef\t",                # tab
    "0123456789abcdef0123456789abcdef\n",                # newline
    "0123456789abcdef\x000123456789abcdef",              # NUL
    "0123456789abcdef0123456789abcdef\x7f",              # DEL
    "0123456789abcdef0123456789abcdé",                   # non-ASCII
])
@pytest.mark.parametrize("production", ["true", "false"])
def test_proxy_secret_rejects_whitespace_and_control_characters(secret, production):
    with pytest.raises(ValidationError, match="AIDIGEST_PROXY_SECRET"):
        make_settings(**{**GOOD_PROD, "production": production, "aidigest_proxy_secret": secret})


@pytest.mark.parametrize("user", ["ops admin", " ", "ops\t", 'o"ps', "{ops}", "ops'", "a" * 65, "aidigest-disabled",
                                  "ops\x00", "öps"])
@pytest.mark.parametrize("production", ["true", "false"])
def test_basic_auth_user_rejects_unsafe_values(user, production):
    with pytest.raises(ValidationError, match="AIDIGEST_BASIC_AUTH_USER"):
        make_settings(**{**GOOD_PROD, "production": production, "aidigest_basic_auth_user": user})


def test_production_requires_basic_auth_user():
    with pytest.raises(ValidationError, match="AIDIGEST_BASIC_AUTH_USER"):
        make_settings(**{**GOOD_PROD, "aidigest_basic_auth_user": ""})


@pytest.mark.parametrize("user", ["ops", "ops.admin", "ops_1@adapt.cloud", "a" * 64])
def test_basic_auth_user_accepts_safe_values(user):
    assert make_settings(**{**GOOD_PROD, "aidigest_basic_auth_user": user}).aidigest_basic_auth_user == user


# ── Round 4 L1: the Caddyfile heredoc marker must not occur in the user name ──
# The user is substituted between <<AIDIGEST_VALUE_END ... AIDIGEST_VALUE_END in the Caddyfile; Caddy
# ends a heredoc as soon as the text read so far ends with the marker, so a user containing it
# (anywhere, any position) breaks `caddy adapt` although every character is allowed.
MARKER_USERS = ["AIDIGEST_VALUE_END", "xAIDIGEST_VALUE_END", "ops-AIDIGEST_VALUE_END", "AIDIGEST_VALUE_END-ops",
                "opsAIDIGEST_VALUE_ENDops"]


@pytest.mark.parametrize("user", MARKER_USERS)
@pytest.mark.parametrize("production", ["true", "false"])
def test_basic_auth_user_rejects_the_caddyfile_heredoc_marker(user, production):
    with pytest.raises(ValidationError, match="AIDIGEST_VALUE_END"):
        make_settings(**{**GOOD_PROD, "production": production, "aidigest_basic_auth_user": user})


@pytest.mark.parametrize("user", ["aidigest_value_end", "AIDIGEST_VALUE_EN", "AIDIGEST_VALUE-END"])
def test_basic_auth_user_accepts_near_misses_of_the_marker(user):
    """The rule is exactly 'contains the marker' (Caddy compares case-sensitively); the matrix
    shows Caddy accepts these."""
    assert make_settings(**{**GOOD_PROD, "aidigest_basic_auth_user": user}).aidigest_basic_auth_user == user


def test_heredoc_marker_is_the_one_the_caddyfile_uses():
    """Every heredoc in the Caddyfile uses config.HEREDOC_MARKER, and the entrypoint and setup.sh
    check that same marker (a renamed marker cannot silently leave a validator behind)."""
    import re
    from pathlib import Path

    from aidigest.config import HEREDOC_MARKER
    repo = Path(__file__).resolve().parents[2]
    caddyfile = (repo / "Caddyfile").read_text()
    assert set(re.findall(r"<<([A-Za-z0-9_-]+)", caddyfile)) == {HEREDOC_MARKER}
    assert f"HEREDOC_MARKER={HEREDOC_MARKER}\n" in (repo / "caddy-entrypoint.sh").read_text()
    assert f"!= *{HEREDOC_MARKER}* ]]" in (repo / "setup.sh").read_text()
