# Adapt Cloud — marketing assets

Copy, an interactive FinOps dashboard, and print-ready one-pagers for
[adaptcloud.io](https://adaptcloud.io/). Everything here is derived from the
implementation in this repository — chiefly [`azure/COSTS.md`](../azure/COSTS.md),
[`azure/README.md`](../azure/README.md) and
[`azure/tests/README.md`](../azure/tests/README.md) — so the site and the code
don't drift apart.

```
marketing/
├── finops-dashboard.html          Interactive cost model. Self-contained, Webflow-embeddable.
├── copy/
│   └── site-copy.md               Section-by-section site copy, mapped to Webflow field names.
└── pdf/
    ├── finops-one-pager.html      Print sources (Letter, 1 page each)
    ├── platform-one-pager.html
    ├── build.sh                   Renders both to PDF via headless Chromium
    ├── adapt-cloud-finops-one-pager.pdf
    └── adapt-cloud-platform-one-pager.pdf
```

## Status: not yet keyed to the live site

These assets were built **standalone**, because this session could not reach
`adaptcloud.io` — the sandbox's egress proxy denies it by organization policy
(`403` on CONNECT). So the dashboard ships with its own scoped styles rather than
reusing the classes already on the site.

To make these drop into the existing design system instead of sitting beside it,
the site's published markup and CSS are needed. Any one of these is enough:

1. **Webflow → Export Code** (paid site plan) — the zip contains `index.html` plus
   `css/adaptcloud.webflow.css`. Drop it in `marketing/_site-export/`.
2. **View source** on the published page, plus the linked
   `…webflow.css` file, saved into the same folder.
3. **A style audit**: the class names for the section wrapper, heading, body text,
   button, and card, plus the brand hex values and font stack.

With any of those, the dashboard can be re-skinned to inherit your real classes
(`.section`, `.container`, `.heading-style-h2`, …) so it looks native rather than
embedded, and the copy in `copy/site-copy.md` can be mapped to actual element IDs
rather than suggested names.

## Embedding the FinOps dashboard in Webflow

The dashboard is deliberately self-contained: no external CSS, JS, fonts, or
network calls, so it works under Webflow's embed sandbox and any CSP.

**Option A — Embed element (recommended).** Webflow's HTML Embed component caps
at ~50,000 characters; the dashboard is well under that.

1. Add an **Embed** element inside the section that holds the FinOps copy.
2. Paste everything between `<body>` and `</body>` from `finops-dashboard.html`,
   **plus** the `<style>` block from `<head>`.
3. Give the parent section a `finops-embed` class so it can be styled from the
   Designer without touching the embed.

All selectors are namespaced under `.ac-fin` / `.ac-` prefixes, so nothing leaks
into the rest of the page and nothing on the page overrides it.

**Option B — iframe.** Host `finops-dashboard.html` (Netlify, Pages, blob storage)
and iframe it. Better isolation, but you must manage iframe height on resize.

Option A is preferable — it inherits the page's theme and needs no height
juggling.

### Theme

The dashboard renders in light or dark automatically via
`prefers-color-scheme`, and also honours a `data-theme="light|dark"` attribute
stamped on `<html>` if the site has its own toggle.

## Regenerating the PDFs

```bash
cd marketing/pdf
./build.sh              # both
./build.sh finops       # just one
```

Chromium is resolved from `PLAYWRIGHT_BROWSERS_PATH` (the container ships one at
`/opt/pw-browsers`), then from `PATH`; override with `CHROMIUM_BIN`. Both sheets
are tuned to fill exactly one Letter page — if you add copy, re-check the page
count, because Chromium will silently spill to a second page.

## Keeping the numbers honest

The cost figures appear in three places: `azure/COSTS.md`, the `COST_MODEL`
constants in `finops-dashboard.html`, and the printed tables in
`pdf/finops-one-pager.html`. **`azure/COSTS.md` is the source of truth.** When a
rate changes there, update the other two.

The dashboard's presets are validated against the ranges documented in
`COSTS.md` — sandbox `$80–150`, module defaults `$600–750`, production
`$3,500–6,000+`. It currently computes `$106`, `$681` and `$5,494`. If you change
a rate, confirm the presets still land in range.

All figures are list prices, USD, East US 2, pay-as-you-go, no EA/CSP discount,
at early-2026 rates. The footer on every asset says so; keep it there.
