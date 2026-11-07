# Claude Certification Study Simulator

One study app for four Claude certification exams. Each exam has its own questions, flashcards, domain weights and saved progress. Nothing is shared between exams, so a question written for one can't show up in another.

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

## What each exam includes

The home screen offers four ways to study:

| Mode | What it does |
|---|---|
| **Flashcard session** | Flashcards for the exam, each with a short example. Cards you find hard come back sooner. |
| **Practice questions** | Scenario questions with the answer and explanation shown right after each one. |
| **Weak-area practice** | Questions from the domains you miss most. |
| **Practice exam** | A full timed exam weighted like the real one. Answers appear only after you submit. |

Also included:

- original questions written for practice (CCAR-F: 162 flashcards and a 152-question pool)
- scores by domain, so you can see where you're weak
- a strict readiness check. On CCAR-F, **Ready** means you've answered at least 100 questions with 90% or better overall, scored at least 85% in every domain (with at least 10 questions answered in each), and scored 90% or better on each of your last three practice exams. The other exams use the same check with their own target in place of 85% and 90%: 88% for CCAO-F, 90% for CCDV-F and 92% for CCAR-P.
- progress saved in your browser so you can stop and pick up later, plus export and import for moving between devices

The practice exam for an exam unlocks only once there are enough unique questions to fill every domain in the right proportion.

## How the content is organized

| Layer | Files | Purpose |
|---|---|---|
| Track profiles | `certifications.js`, `exam-profile.js` | Exam format, domains and weights per track |
| Seed and base banks | `*.seed.js`, `*.bank*.js`, `payload1–5.js` | Original cards and questions (CCAR-F's base set ships as a compressed payload) |
| Rewrites and reconciliation | `ccar-p.d*-scenario-rewrite.js`, `ccar-p.d*-reconcile.js`, `*-topup.js` | Domain-level upgrades applied in load order (see `index.html`) |
| Scenario and source rules | `foundations-*.js`, `source-governance.js` | Rules that keep scenarios realistic and every question's source approved |
| Audit files | `audits/*.json` | Which exam-guide objective each piece of content covers, and the guide version |
| Source lists | `sources/**/source-registry.json` | Approved and excluded sources, with credit |
| App code | `loader.js`, `app.js`, `multi-app.js`, `exam.js`, `adaptive-*.js` | Loading an exam, flashcards, practice, weak-area selection and practice exams |

## Checks

Each exam has its own GitHub Actions checks in `.github/workflows/` (`ccar-f-*`, `ccar-p-*`, `ccdv-f-*`, `ccao-f-*`, `foundations-*`). They confirm every objective is covered, each domain has enough questions, scenarios stay realistic, timed modes behave, and sources are approved. A change that breaks any of these fails before it can deploy.

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
