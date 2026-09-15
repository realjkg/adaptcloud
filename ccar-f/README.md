# CCAR-F Adaptive Study Simulator

A self-contained study simulator for **Claude Certified Architect – Foundations (CCAR-F)**.

## Current exam alignment

Verified **September 15, 2026** against the current Anthropic Partner Academy Architect – Foundations listing and the published **Exam Guide v1.0 (effective July 2026)**.

Current blueprint used by the simulator:

| Domain | Weight | 60-question simulator allocation |
|---|---:|---:|
| Agentic Architecture & Orchestration | 27% | 16 |
| Tool Design & MCP Integration | 18% | 11 |
| Claude Code Configuration & Workflows | 20% | 12 |
| Prompt Engineering & Structured Output | 20% | 12 |
| Context Management & Reliability | 15% | 9 |

Anthropic currently lists the exam as **60 questions in 120 minutes**.

## What is included

- 162 adaptive flashcards, each with one brief concrete example
- 150-question multiple-choice practice pool
- untimed multiple-choice practice mode
- adaptive weak-area multiple-choice mode
- 60-question blueprint-weighted mock exams
- per-domain scoring
- a deliberately conservative PASS-READY study gate:
  - at least 90% overall
  - no domain below 85%
- spaced-review scheduling
- persistent start / stop / resume using browser localStorage
- migration from the first simulator version
- progress export/import for cross-device backup

## Important

This is **independent study material**. It is not affiliated with or endorsed by Anthropic or Quizlet, does not contain recalled/live exam items, and cannot guarantee a passing score. The published Anthropic exam guide is the authority if the certification scope changes.

## Official references

- Anthropic Partner Academy — Claude Certified Architect – Foundations
  - https://anthropic-partners.skilljar.com/claude-certified-architect-foundations-certification
- Claude Certification Program
  - https://claude.com/blog/four-role-based-claude-certifications
- Claude Platform Docs
  - https://platform.claude.com/docs/
- Claude Code Docs
  - https://code.claude.com/docs/

## Local use

Open `index.html` directly in a browser.

## Deployment

The repository workflow `.github/workflows/ccar-f-pages.yml` publishes this directory to GitHub Pages when changes under `ccar-f/` land on `main`.

Expected Pages URL once GitHub Pages is configured to deploy with GitHub Actions:

`https://realjkg.github.io/adaptcloud/ccar-f/`

The Pages root redirects to `/ccar-f/`, leaving a stable shareable endpoint for the simulator.
