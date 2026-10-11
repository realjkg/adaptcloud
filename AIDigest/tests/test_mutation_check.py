"""scripts/mutation_check.py: Caddy mutants go through the same kill confirmation as pytest mutants
(review of 432f908), so an unrelated or flaky matrix failure is SUSPECT, not a kill."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "mutation_check.py"

MATRIX_FAIL = """== user empty, hash empty
  ok    caddy adapt (via entrypoint)                 adapted
== user with a space
  FAIL  caddy adapt (via entrypoint)                 expected adapted got ERROR: random 1a2b3c
  FAIL  configured user:<right password>             expected 401 got 502
== secret with spaces
  FAIL  no credentials                               expected 401 got 502
caddy matrix: 3 failure(s)
"""


@pytest.fixture(scope="module")
def mc():
    spec = importlib.util.spec_from_file_location("mutation_check_under_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    import sys
    sys.modules[spec.name] = module      # @dataclass needs the module registered
    spec.loader.exec_module(module)
    return module


def test_matrix_failures_are_keyed_by_case_and_check_not_by_the_error_text(mc):
    assert mc.matrix_failures(MATRIX_FAIL) == {
        "user with a space :: caddy adapt (via entrypoint)",
        "user with a space :: configured user:<right password>",
        "secret with spaces :: no credentials"}
    assert mc.matrix_failures("== a\n  ok    x   200\ncaddy matrix: all expectations met\n") == set()


def _confirm(mc, first, rerun, baseline_failures):
    calls = []

    def run_matrix(tree):
        calls.append(tree)
        return {"mutant": rerun, "base": baseline_failures}[tree]
    reason = mc.confirm_matrix_kill("mutant", "base", first, run_matrix)
    return reason, calls


def test_matrix_kill_is_confirmed_when_the_mutant_fails_again_and_the_baseline_passes(mc):
    reason, calls = _confirm(mc, {"c :: x"}, {"c :: x", "d :: y"}, set())
    assert reason is None and calls == ["mutant", "base"]


def test_matrix_kill_is_suspect_when_it_does_not_reproduce_on_the_mutant(mc):
    reason, _ = _confirm(mc, {"c :: x"}, set(), set())
    assert reason and "mutated tree" in reason


def test_matrix_kill_is_suspect_when_the_rerun_fails_elsewhere(mc):
    reason, _ = _confirm(mc, {"c :: x"}, {"other :: z"}, set())
    assert reason and "same check" in reason


def test_matrix_kill_is_suspect_when_the_baseline_matrix_fails(mc):
    reason, _ = _confirm(mc, {"c :: x"}, {"c :: x"}, {"c :: x"})
    assert reason and "baseline" in reason


def test_matrix_kill_with_no_identified_failure_is_suspect(mc):
    reason, _ = _confirm(mc, set(), {"c :: x"}, set())
    assert reason and "no failing" in reason


def test_every_caddy_mutant_is_confirmed_not_exempt(mc):
    caddy = [m for m in mc.MUTATIONS if m.runner == "caddy"]
    assert len(caddy) >= 10
    class _M:
        runner = "caddy"
    assert mc.confirm_kill.__doc__ and "Caddy" in mc.confirm_kill.__doc__
    # the old exemption: a caddy mutant returned None before looking at anything
    reason = mc.confirm_kill(Path("/nonexistent/work"), Path("/nonexistent/base"), caddy[0], None)
    assert reason is not None, "a Caddy mutant with no identified failure must not be accepted"
