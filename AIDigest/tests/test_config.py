"""Production validation (mirrors homeschool-api core/config.py)."""

import pytest
from pydantic import ValidationError

from tests.fakes import PROXY_SECRET, make_settings

GOOD_PROD = dict(
    production="true",
    anthropic_api_key="sk-ant-api03-" + "x" * 40,
    aidigest_database_url="postgresql+asyncpg://aidigest_app:p@db.example.com/sagedb?ssl=require",
    aidigest_proxy_secret=PROXY_SECRET,
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
