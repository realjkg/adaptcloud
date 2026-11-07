# Claude Certification Study Simulator

One adaptive study engine with four **isolated** certification tracks: separate banks, domain weights, progress and mastery for each exam. Nothing is shared between tracks, so a question written for one exam can't leak into another.

**Open it:** `https://realjkg.github.io/adaptcloud/ccar-f/` (GitHub Pages; see [Deployment](#deployment)). Jump straight to a track with `?track=`:

| Track | Exam | Format | Domains | Deep link |
|---|---|---|---:|---|
| `ccar-f` | Claude Certified Architect – Foundations | 60 Q / 120 min | 5 | [`?track=ccar-f`](https://realjkg.github.io/adaptcloud/ccar-f/?track=ccar-f) |
| `ccar-p` | Claude Certified Architect – Professional | 63 Q / 120 min | 7 | [`?track=ccar-p`](https://realjkg.github.io/adaptcloud/ccar-f/?track=ccar-p) |
| `ccdv-f` | Claude Certified Developer – Foundations | 53 Q / 120 min | 8 | [`?track=ccdv-f`](https://realjkg.github.io/adaptcloud/ccar-f/?track=ccdv-f) |
| `ccao-f` | Claude Certified Associate – Foundations | 60 Q / 120 min | 7 | [`?track=ccao-f`](https://realjkg.github.io/adaptcloud/ccar-f/?track=ccao-f) |

The folder is still named `ccar-f/` because CCAR-F was the first track. Renaming it would break the published URL and every saved progress key, so the name stays.

## Exam-guide alignment

All four tracks are aligned to **Exam Guide v1.0 (effective July 2026)**, verified **September 15, 2026** (see `audits/*.json`, fields `guideVersion` and `verifiedAt`).

> **Upcoming change.** Pearson VUE has announced updated content for **Associate – Foundations, Developer – Foundations and Architect – Professional** starting **December 7, 2026**, with updated exam guides published **November 17, 2026**. Architect – Foundations (CCAR-F) is not part of that update. Until the CCAO-F, CCDV-F and CCAR-P tracks are re-verified against the new guides, treat them as v1.0 content: fine for testing before December 7, not for testing on or after it.

### Domain weights by track

**CCAR-F — Architect Foundations** (60-question mock allocation)

| Domain | Weight | Mock items |
|---|---:|---:|
| Agentic Architecture & Orchestration | 27% | 16 |
| Tool Design & MCP Integration | 18% | 11 |
| Claude Code Configuration & Workflows | 20% | 12 |
| Prompt Engineering & Structured Output | 20% | 12 |
| Context Management & Reliability | 15% | 9 |

**CCAR-P — Architect Professional**: Integration 19% · Solution Design & Architecture 17% · Evaluation, Testing & Optimization 16% · Governance, Safety & Risk Management 14% · Stakeholder Communication & Lifecycle Management 14% · Claude Models, Prompting & Context Engineering 13% · Developer Productivity & Operational Enablement 7%

**CCDV-F — Developer Foundations**: Applications and Integration 33.1% · Model Selection and Optimization 16.8% · Agents and Workflows 14.7% · Prompt and Context Engineering 11% · Tools and MCPs 10.6% · Security and Safety 8.1% · Claude Code 3.1% · Eval, Testing, and Debugging 2.6%

**CCAO-F — Associate Foundations**: Output Evaluation and Validation 21% · Workflow Integration and Solution Design 16% · Governance, Risk, and Responsible Use 15% · Prompting and Task Execution 14% · Product and Model Selection 12% · Configuration and Knowledge Management 12% · Troubleshooting and Optimization 10%

Weights come from `certifications.js`, which is the single place the engine reads them from.

## What each track includes

- adaptive flashcards and an original multiple-choice practice pool (CCAR-F: 162 flashcards, 152-question pool)
- untimed practice, adaptive weak-area practice, and blueprint-weighted full mock exams
- per-domain scoring and spaced-review scheduling
- a deliberately conservative PASS-READY gate: at least 90% overall and no domain below 85%
- start / stop / resume with browser `localStorage`, plus progress export/import for moving between devices

Full mocks unlock for a track only after its bank satisfies the complete blueprint allocation.

## How the content is organized

| Layer | Files | Purpose |
|---|---|---|
| Track profiles | `certifications.js`, `exam-profile.js` | Exam format, domains and weights per track |
| Seed and base banks | `*.seed.js`, `*.bank*.js`, `payload1–5.js` | Original cards and questions (CCAR-F's base set ships as a compressed payload) |
| Rewrites and reconciliation | `ccar-p.d*-scenario-rewrite.js`, `ccar-p.d*-reconcile.js`, `*-topup.js` | Domain-level upgrades applied in load order (see `index.html`) |
| Fidelity and governance | `foundations-*.js`, `source-governance.js` | Scenario-fidelity and source-provenance rules |
| Audit manifests | `audits/*.json` | Objective-to-content traceability and guide version per track |
| Source registries | `sources/**/source-registry.json` | Approved and excluded sources with attribution |
| Engine | `loader.js`, `app.js`, `multi-app.js`, `exam.js`, `adaptive-*.js` | Track loading, practice, mocks, adaptive selection |

## Validation

Each track has dedicated GitHub Actions workflows in `.github/workflows/` (`ccar-f-*`, `ccar-p-*`, `ccdv-f-*`, `ccao-f-*`, `foundations-*`). They check objective coverage, blueprint allocation, scenario fidelity, timed modes and source governance, so a change that breaks a track's blueprint fails in CI before it can deploy.

## Updating a track for a new exam guide

1. Add the new guide to the track's source registry under `sources/`.
2. Update the track's domains and weights in `certifications.js`.
3. Update the track's audit manifest in `audits/` (`guideVersion`, `guideEffective`, `verifiedAt`) and remap objectives.
4. Fix whatever the track's validation workflows flag: uncovered objectives, allocation gaps, retired topics.
5. Update the alignment section of this README.

## Local use

Open `index.html` in a browser. Pick a track from the selector or add `?track=<id>` to the URL.

## Deployment

`.github/workflows/ccar-f-pages.yml` publishes this directory to GitHub Pages whenever changes under `ccar-f/` land on `main`. GitHub Pages must be set to deploy from GitHub Actions. The Pages root redirects to `/ccar-f/`, which keeps the shareable URL stable.

## Important

This is **independent study material**. It isn't affiliated with or endorsed by Anthropic or Quizlet, doesn't contain recalled or live exam items, and can't guarantee a passing score. If a certification's scope changes, the published Anthropic exam guide is the authority.

## Official references

- Claude Certification Program — https://claude.com/blog/four-role-based-claude-certifications
- Anthropic Partner Academy, Architect – Foundations — https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification
- Claude Platform Docs — https://platform.claude.com/docs/
- Claude Code Docs — https://code.claude.com/docs/
