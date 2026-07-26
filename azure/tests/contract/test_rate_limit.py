"""Pillar #3: APIM enforces the tenant-wide rate limit.

The `azurerm_api_management_policy.global` XML in the workload sets
`<rate-limit calls="600" renewal-period="60" />`. Burst 601+ requests inside a
minute — some should come back 429.
"""

import time

import pytest
import requests


BURST = 620  # comfortably over 600
WINDOW_SECONDS = 60


def test_burst_triggers_429(claims_api_base_url, auth_headers, test_mode):
    if test_mode == "local":
        pytest.skip("Prism mock has no rate limiting")

    session = requests.Session()
    session.headers.update(auth_headers)

    seen_429 = 0
    seen_2xx = 0
    started = time.monotonic()
    for i in range(BURST):
        if time.monotonic() - started > WINDOW_SECONDS - 5:
            pytest.skip(f"burst too slow to complete inside the {WINDOW_SECONDS}s window")
        r = session.get(f"{claims_api_base_url}/claims", timeout=5)
        if r.status_code == 429:
            seen_429 += 1
        elif 200 <= r.status_code < 300:
            seen_2xx += 1
        # 5xx or other → collateral, don't fail on those; just keep going

    assert seen_429 > 0, (
        f"expected at least one 429 within a {WINDOW_SECONDS}s burst of {BURST}; "
        f"saw {seen_2xx} 2xx and 0 throttled"
    )
