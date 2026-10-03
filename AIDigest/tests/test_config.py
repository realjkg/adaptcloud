"""Production validation (mirrors homeschool-api core/config.py)."""

import pytest
from pydantic import ValidationError

from tests.fakes import PROXY_SECRET, make_settings

GOOD_PROD = dict(
    production="true",
    anthropic_api_key="sk-ant-api03-" + "x" * 40,
    database_url="postgresql+asyncpg://u:p@db.example.com/aidigest?ssl=require",
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
        ({"database_url": ""}, "DATABASE_URL"),
        ({"database_url": "postgresql+asyncpg://user:password@host/dbname?ssl=require"}, "DATABASE_URL"),
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
