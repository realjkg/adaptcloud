"""Assert that Azure Policy denies each bad-fixture apply.

If the apply succeeds, the initiative isn't enforced (or the definition doesn't
match the pattern the fixture violates). Either way, the test's job is to
surface that misalignment loudly.
"""

from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

import pytest


FIXTURES_DIR = Path(__file__).parent / "bad-fixtures"

CASES = [
    ("openai-public-access", "aiagent-deny-public-network"),
    ("unapproved-model", "aiagent-allowed-aoai-models"),
    ("missing-tags", "aiagent-require-tags"),
]


@pytest.fixture(scope="session")
def subscription_id() -> str:
    sub = os.environ.get("AZURE_SUBSCRIPTION_ID")
    if not sub:
        pytest.skip("AZURE_SUBSCRIPTION_ID not set")
    return sub


@pytest.mark.parametrize("fixture,expected_policy", CASES)
def test_policy_denies_bad_fixture(fixture: str, expected_policy: str, subscription_id: str, tmp_path):
    fx_src = FIXTURES_DIR / fixture
    if not fx_src.is_dir():
        pytest.skip(f"fixture missing: {fx_src}")

    # Copy fixture to a tmp dir so parallel runs don't clobber .terraform.
    fx = tmp_path / fixture
    fx.mkdir()
    for f in fx_src.iterdir():
        (fx / f.name).write_bytes(f.read_bytes())

    rg_suffix = uuid.uuid4().hex[:6]
    env = {
        **os.environ,
        "TF_VAR_subscription_id": subscription_id,
        "TF_VAR_rg_suffix": rg_suffix,
    }

    subprocess.run(
        ["terraform", "init", "-input=false", "-no-color"],
        cwd=fx, env=env, check=True, capture_output=True, text=True,
    )
    r = subprocess.run(
        ["terraform", "apply", "-input=false", "-auto-approve", "-no-color"],
        cwd=fx, env=env, capture_output=True, text=True,
    )
    combined = (r.stdout or "") + (r.stderr or "")

    try:
        assert r.returncode != 0, (
            f"expected policy denial, but apply succeeded — the initiative isn't "
            f"enforced or the {expected_policy} definition doesn't catch this "
            f"case.\n\nSTDOUT:\n{r.stdout[:2000]}"
        )
        assert (
            "RequestDisallowedByPolicy" in combined
            or expected_policy in combined
            or "disallowed by policy" in combined.lower()
        ), (
            f"apply failed but not for the expected policy reason.\n\n"
            f"Expected mention of {expected_policy} or RequestDisallowedByPolicy.\n\n"
            f"Output:\n{combined[:2000]}"
        )
    finally:
        # Best-effort cleanup; the fixture RG may not exist if apply died early.
        subprocess.run(
            ["terraform", "destroy", "-input=false", "-auto-approve", "-no-color"],
            cwd=fx, env=env, capture_output=True, text=True, timeout=300,
        )
