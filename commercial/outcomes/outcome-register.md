# Account outcome register

Copy this template into the customer's restricted project workspace. Do not commit completed account records or source evidence to this public repository. This is a manual reporting template; it does not implement ingestion, approvals or automated billing.

Account ID: [ID] | SOW ID/version: [ID/version] | Workflow: [name]

Reporting window and timezone: [dates/timezone] | Account owner: [name]

Customer acceptance owner: [name] | Last reconciled: [timestamp]

Term start/end: [dates] | Renewal review: [date, at least 60 days before expiry]

PromptForce.AI order/entitlement: [restricted reference] | Provider support owner: [name]

Monthly service capacity / used: [hours] | Monthly report / review: [status]

Service fee / platform fee / usage overage: [separate amounts] | Service credits: [amount and reason]

Renewal decision: [pending/renewed/expired] | Next-term scope and approved fee: [reference]

## Continuing service plan

Adapt delivery lead: [name] | Customer business owner: [name] | Release/acceptance approver: [name]

Current 90-day plan: [reference/version] | Monthly working review: [date] | Quarterly value review: [date]

Mandatory service report delivered: [date/reference] | Review decision: [accepted/omission/disputed] | Remedy: [if applicable]

| Work item | Fee/capacity allocation | Stage | Baseline and target | Estimate / used | Acceptance and release owner | Evidence / decision | Next action / due date |
|---|---|---|---|---|---|---|---|
| [ID] | [recurring or package ID; never both] | [assess/agree/implement/verify/reassess] | [reference] | [hours] | [names] | [reference and decision] | [action, owner, date] |

Record retain, extend, revise, pause or retire decisions with reasons. A release acceptance closes its work item and informs the next cycle. Monthly service fulfillment is recorded separately from work-package acceptance. Track baseline versions so a later revision cannot rewrite prior results.

## One row per purchased outcome

| Outcome ID | Definition / SOW reference | Baseline | Target | Actual | Guardrails | Evidence / coverage | Status | Customer approval | Earned fee | Invoiced / credited |
|---|---|---|---|---|---|---|---|---|---:|---:|
| [O1] | [reference] | [value/period] | [threshold] | [value/period] | [pass/fail/pending] | [restricted link, %] | [state] | [name/date/link] | [amount] | [amount] |

Allowed states: not started, in progress, submitted, accepted, rejected, curing, disputed, not measurable. A calculated pass is not written customer acceptance. Only accepted, contractually earned amounts enter the earned-fee column. Keep mobilization cash and unearned advances separate from earned fees.

## One row per workflow and period

| Period | Eligible cases | Accepted unique cases | Acceptance rate | Operating cost | Cost per accepted case | Handling time | Critical errors | Coverage | Contingent fee eligibility |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| [window] | [N] | [S] | [S/N] | [C] | [C/S] | [agreed statistic] | [count] | [known/missing sources] | [pending/pass/fail] |

Never add counts of different workflow outcomes together to calculate a universal account unit cost. Group by account, SOW, workflow, metric version and reporting period. Portfolio reporting can aggregate fees and delivery costs; compare unit costs only for genuinely comparable workflow definitions.

## Minimum transaction evidence

Keep these fields in the existing restricted business system or evidence store. The record format can be a table or structured event; no new platform is required initially.

| Field | Purpose |
|---|---|
| account_id, sow_id, outcome_id, workflow_id | Stable attribution; do not infer identity from display names |
| business_case_id, attempt_id | Deduplicate completions while retaining every attempt's cost |
| event_time, reporting_period, timezone | Reconcile the same time window |
| eligibility_rule_version, case_type | Preserve population and case mix |
| model/tool/release version | Reproduce the evaluated system |
| completion_status, reviewer, accepted_at, reopened_at | Establish success, required human approval and reversals |
| rubric_version, quality_result, critical_error | Apply acceptance guardrails |
| human_minutes, model_cost, tool_cost, cloud_cost, allocated_shared_cost | Cost all eligible work, including failures and review |
| currency, rate_basis, billing_reference | Distinguish actual from normalized cost and avoid mixing currencies |
| evidence_reference, source_coverage | Link restricted proof and surface unknowns |

Avoid raw sensitive prompts or documents in the reporting view. Use restricted references and agreed retention controls.

## Evidence and billing review

Use the frequency agreed in the account schedule. Weekly review is a possible scope choice, not a universal service commitment.

1. Reconcile all eligible business cases and all billed usage. Investigate missing attribution and duplicated cases.
2. Apply review and reopen windows; recompute accepted counts and correction credits.
3. Include failed attempts and shared allocations in cost. Mark incomplete periods not measurable.
4. Check the primary metric and every guardrail. Record deviations and confounding changes.
5. Request customer acceptance with source evidence. Record reviewer, decision and timestamp.
6. Reconcile earned fees, advances, invoices and credits to the SOW cap. Escalate disputed cases without automatically billing them.

## Account economics, restricted to Adapt

Track contracted base fee, maximum variable fee, earned revenue, cash collected, unearned advance, delivery cost to date, forecast cost to complete, rework hours and measurement hours. Forecast margin excluding unearned variable fees. Report customer value separately from Adapt margin.
