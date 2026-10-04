#!/usr/bin/env bash
# setup.sh signal/failure harness under several bash versions (official bash:<version> images).
#
# The cases are generated from tests/test_setup_sh.py (the same hooks, the real aidigest_fill_empty
# from setup.sh) and run inside each container with that container's bash. Every case runs in its own
# process group (job control), so "kill 0" reaches only the case. Checked per case: exit status,
# .env (untouched / completely replaced), no temp file left (except after SIGKILL), one temp name
# recorded, the failure message, and mode/owner for the mode case.
#
# Usage: AIDigest/scripts/setup_bash_matrix.sh [setup.sh]   (env: BASH_VERSIONS, PYTHON)
# Needs docker and a PYTHON with requirements-dev.txt installed. Exit 0 = every case passed.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SETUP=$(realpath "${1:-$HERE/../../setup.sh}")
VERSIONS=${BASH_VERSIONS:-"4.4 5.0 5.1 5.2 5.3"}
PYTHON=${PYTHON:-python3}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/cases"
cp "$SETUP" "$WORK/setup.sh"
# Generate the cases from the test module, pointed at the setup.sh under test.
(cd "$HERE/.." && "$PYTHON" - "$WORK" <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, ".")
import tests.test_setup_sh as t
out = Path(sys.argv[1]); cases = out / "cases"
t.REPO = out                                   # _fill_empty_script reads REPO / "setup.sh"
rows = []
def add(name, hook, rc, final, env="", msg="", prep=""):
    (cases / f"{name}.sh").write_text(t._fill_empty_script(hook))
    rows.append("|".join([name, str(rc), final, env, msg, prep]))
for point, hook in sorted(t._SIGNAL_POINTS.items()):
    for sig, n in sorted(t._SIGNUM.items()):
        for target in ("shell", "group"):
            add(f"sig-{point}-{sig}-{target}", hook, 128 + n,
                "filled" if point == "after-replace" else "original", f"SIG={sig} TARGET={target}")
for point in ("during-copy", "at-replace"):
    for target in ("shell", "group"):
        add(f"kill-{point}-{target}", t._SIGNAL_POINTS[point], 137, "original", f"SIG=KILL TARGET={target}")
for failure, (hook, message) in sorted(t._FAILURES.items()):
    add(f"fail-{failure}", hook, 1, "original", msg=message, prep="600")
add("mode-owner", t._MKTEMP_RECORD, 0, "filled", prep="640owner")
add("control", t._MKTEMP_RECORD, 0, "filled")
(out / "cases.txt").write_text("\n".join(rows) + "\n")
(out / "original").write_text(t._ORIGINAL)
(out / "filled").write_text(t._FILLED)
print(f"{len(rows)} cases generated from tests/test_setup_sh.py")
PY
)

cat > "$WORK/run.sh" <<'RUN'
set -u
cd /h; pass=0; fail=0
set -m   # job control: each case is its own process group
while IFS='|' read -r name rc final envs msg prep; do
  w=$(mktemp -d /tmp/case.XXXXXX); cp original "$w/.env"
  case "$prep" in 600) chmod 600 "$w/.env" ;; 640owner) chmod 640 "$w/.env"; chown 12345:23456 "$w/.env" ;; esac
  # shellcheck disable=SC2086
  (cd "$w" && exec env -i PATH="$PATH" CREATED="$w/created.log" $envs bash "/h/cases/$name.sh" "$w/.env" >"$w/out" 2>&1) &
  wait $! 2>/dev/null; got=$?
  why=""
  [[ $got == "$rc" ]] || why+=" exit=$got (want $rc)"
  cmp -s "$w/.env" "$final" || why+=" .env is not the $final file ($(wc -c < "$w/.env") bytes)"
  if [[ $rc != 137 ]]; then
    ! ls -A "$w" | grep -q '^\.env\.aidigest\.' || why+=" temp file left"
    [[ $(cat "$w/created.log" 2>/dev/null | wc -l) -eq 1 ]] || why+=" temp names recorded != 1"
  fi
  [[ -z "$msg" ]] || grep -q "$msg" "$w/out" || why+=" message '$msg' missing"
  if [[ $prep == 640owner && "$(stat -c '%a %u %g' "$w/.env")" != "640 12345 23456" ]]; then why+=" mode/owner"; fi
  if [[ -z "$why" ]]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "  FAIL $name:$why"; fi
  rm -rf "$w"
done < cases.txt
echo "  bash $BASH_VERSION: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
RUN

FAILED=0
for v in $VERSIONS; do
  echo "== bash:$v"
  docker run --rm -v "$WORK:/h:ro" "bash:$v" bash /h/run.sh 2>/dev/null || FAILED=$((FAILED + 1))
done
echo
if [[ $FAILED -eq 0 ]]; then echo "setup bash matrix: all versions passed"; else echo "setup bash matrix: $FAILED version(s) failed"; exit 1; fi
