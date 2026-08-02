#!/usr/bin/env bash
# Render the marketing one-pagers to PDF with headless Chromium.
#
#   ./build.sh            # render both
#   ./build.sh finops     # render one
#
# Chromium is resolved from PLAYWRIGHT_BROWSERS_PATH when present (the container
# image ships one at /opt/pw-browsers), otherwise from PATH.
set -euo pipefail

cd "$(dirname "$0")"

find_chromium() {
  if [[ -n "${CHROMIUM_BIN:-}" ]]; then echo "$CHROMIUM_BIN"; return; fi
  local base="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"
  local candidate
  candidate="$(find "$base" -maxdepth 3 -type f \
      \( -name 'chrome' -o -name 'headless_shell' \) 2>/dev/null | head -1 || true)"
  if [[ -n "$candidate" ]]; then echo "$candidate"; return; fi
  command -v chromium || command -v chromium-browser || command -v google-chrome
}

CHROME="$(find_chromium)"
[[ -n "$CHROME" ]] || { echo "No Chromium found. Set CHROMIUM_BIN." >&2; exit 1; }

render() {
  local src="$1" out="$2"
  echo "  $src -> $out"
  "$CHROME" --headless --disable-gpu --no-sandbox \
    --no-pdf-header-footer \
    --print-to-pdf="$out" \
    "file://$PWD/$src" 2>/dev/null
}

targets="${1:-all}"
echo "Rendering with: $CHROME"
[[ "$targets" == "all" || "$targets" == "finops" ]] && \
  render finops-one-pager.html adapt-cloud-finops-one-pager.pdf
[[ "$targets" == "all" || "$targets" == "platform" ]] && \
  render platform-one-pager.html adapt-cloud-platform-one-pager.pdf
echo "Done."
