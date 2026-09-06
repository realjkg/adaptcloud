#!/usr/bin/env bash
# Render the partner briefs to PDF.
#
# Two things this handles that a naive headless print does not:
#   1. The source files carry no <head> — the artifact service supplies one at
#      publish time — so a file:// load falls back to a legacy encoding and
#      mangles every em dash. A charset meta is injected into the render copy.
#   2. Google Fonts do not resolve during headless render, so the output silently
#      falls back to Liberation Sans/Serif. The latin subsets are fetched and
#      inlined as data URIs first.
# Render copies are temporary; the published HTML is never modified.
set -euo pipefail

cd "$(dirname "$0")"
DOCS=(co-delivery-brief channel-brief internal-annex partner-faq partner-operating-loop rules-of-engagement deal-registration)
CHROME="${CHROME:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
GF="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"

[ -x "$CHROME" ] || { echo "chrome not found; set CHROME=/path/to/chrome" >&2; exit 1; }
mkdir -p pdf
trap 'rm -f gf.css fonts-inline.css render-*.html' EXIT

curl -sSf -m 30 -A "$UA" "$GF" -o gf.css

python3 - "${DOCS[@]}" <<'PY'
import base64, pathlib, re, subprocess, sys
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
css = pathlib.Path("gf.css").read_text()
parts, faces = re.split(r"/\*\s*([a-z-]+)\s*\*/", css), []
for i in range(1, len(parts), 2):
    if parts[i] != "latin":                      # latin subset only, for size
        continue
    body = parts[i + 1]
    m = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", body)
    if not m:
        continue
    data = subprocess.run(["curl", "-sS", "-m", "30", "-A", UA, m.group(1)],
                          capture_output=True).stdout
    if data[:4] != b"wOF2":
        sys.exit(f"font fetch failed: {m.group(1)}")
    body = body.replace(m.group(1), "data:font/woff2;base64," + base64.b64encode(data).decode())
    body = re.sub(r"\s*unicode-range:[^;]+;", "", body)
    faces.append("@font-face {" + body.split("{", 1)[1].rsplit("}", 1)[0] + "}")
if not faces:
    sys.exit("no latin faces parsed from gf.css")
inline = "\n".join(faces)

drop = re.compile(r'<link rel="preconnect"[^>]*>\s*|<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*">')
for name in sys.argv[1:]:
    t = pathlib.Path(f"{name}.html").read_text(encoding="utf-8")
    t = drop.sub("", t).replace("<style>", "<style>\n" + inline + "\n", 1)
    pathlib.Path(f"render-{name}.html").write_text('<meta charset="utf-8">\n' + t, encoding="utf-8")
print(f"inlined {len(faces)} font faces")
PY

for d in "${DOCS[@]}"; do
  "$CHROME" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
    --virtual-time-budget=15000 --run-all-compositor-stages-before-draw \
    --print-to-pdf="pdf/AdaptCloud-${d}.pdf" "file://$PWD/render-${d}.html" 2>/dev/null
  echo "  pdf/AdaptCloud-${d}.pdf"
done
