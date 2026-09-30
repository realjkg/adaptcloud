# Statement of Work: measurable AI workflow

SOW ID: [ID] | Version: [version] | Effective date: [date]

Adapt Cloud contracting entity: [legal name and address]

Customer: [legal name and address] | Account ID: [stable ID]

Governing services agreement: [agreement and date]

## 0. Contract term and renewable service

Initial term: [12 or more months]. Contract/service commencement: [date]. Initial term end: [date]. Implementation acceptance does not silently restart or extend this term. State whether recurring services begin immediately or at a separately agreed date and align the fee schedule accordingly.

Renewal: successive [12 or more]-month periods by mutual written agreement. Hold a renewal review at least 60 days before term end and record the decision before expiry. No automatic renewal is implied. Early termination rights, outstanding commitments and unused prepayment treatment follow the governing agreement and the completed termination schedule. Monthly invoicing does not itself create monthly cancellation rights.

Attach the completed [annual service schedule](annual-service-schedule.md), including monthly service capacity, deliverables, support coverage and the platform order. Platform accelerator: **PromptForce.AI from DayTwoAI.com**. Confirm the entitlement, permitted use, ordering party, usage limits, data handling, intellectual property and third-party support responsibilities before promising access. Adapt is responsible for its contracted advisory, integration, engineering and measurement work; platform-provider obligations are only those documented in the applicable provider terms.

## 1. Business objective and scope

Business problem: [one specific problem]. Workflow: [name]. Business owner: [name and role]. Technical owner: [name and role]. Acceptance approver and alternate: [names and roles].

Included systems, integrations, environments, locations, users, languages, case types and volume band: [explicit list and limits].

Included deliverables: [list]. Excluded work: [list, including ongoing operations if not purchased]. Customer dependencies and delivery dates: [data access, representative samples, permissions, SME review, approvals, infrastructure and licenses].

Schedule: [start, milestones, verification window and final date]. Work starts after [signed scope, agreed access and mobilization conditions]. Dependencies that delay work trigger a documented schedule review; they do not silently turn a failed result into an accepted one.

## 2. Outcome and acceptance schedule

Complete one row per purchased outcome. Do not use a vague phrase such as "production ready" without listing its acceptance tests.

| Outcome ID | Accepted capability or decision | Metric and exact threshold | Evidence and evaluation version | Due date and approver | Allocated base fee |
|---|---|---|---|---|---:|
| O1 | [baseline/decision] | [reconciliation and completeness rules] | [signed baseline pack] | [date / name] | [amount] |
| O2 | [bounded workflow] | [functional and quality thresholds] | [test set and acceptance run] | [date / name] | [amount] |
| O3 | [deployment and controls] | [named tests and defect limits] | [release record and control evidence] | [date / name] | [amount] |
| O4 | [operating handover] | [runbook, operator demonstration and reporting] | [handover record] | [date / name] | [amount] |

One-time implementation base fee equals the sum of the allocated milestone fees. Recurring services and platform entitlement are separately itemized below. Milestone acceptance requires all applicable quality, security and operational guardrails. Tests demonstrate compliance with the agreed scope and sample, not a guarantee of every future model response or the absence of future incidents.

## 3. Measurement schedule

| Field | Agreed definition |
|---|---|
| Primary performance metric | [formula, units, aggregation and direction] |
| Baseline | [value, period, evidence reference and customer approval] |
| Target | [absolute threshold and/or improvement formula] |
| Eligible population | [case types, inclusion rules, difficulty strata and sampling method] |
| Success event | [business completion, required review and acceptance criteria] |
| Identity and deduplication | [unique business-case key; retries map to that key] |
| Reopen/reversal rule | [window; when a success is revoked; invoice adjustment process] |
| Denominator | [unique eligible cases or unique accepted completions, as appropriate] |
| Cost numerator | [models, tools, cloud, retries, failures, review, rework and shared allocation] |
| Implementation/service allocation | [excluded from operating view; period and method for fully loaded view] |
| Data coverage | [minimum completeness; reconciliation rule; handling of missing data] |
| Quality guardrails | [rubric, threshold, reviewer, evaluation set and critical-error rules] |
| Latency / security guardrails | [percentile and control tests; severity definition] |
| Attribution | [comparison group or change record; normalization; exclusions] |
| Verification window | [dates, timezone, minimum volume and delayed-arrival cutoff] |
| Source of truth | [restricted log, billing and business-system references] |
| Evidence retention and access | [period, access owners and privacy controls] |

The same scope and allocation rules apply to the baseline and final measurement. Costs of failed attempts remain in the numerator. Repeated attempts do not create extra successes. Missing evidence results in "not measurable," not a pass. Low volume requires the extension or resolution rule in Section 5. The parties approve any methodology change in writing before applying it prospectively.

## 4. Fees and invoicing

Currency: [currency]. Implementation base fee: [amount]. Annual recurring advisory/engineering services: [amount]. Initial-term recurring total: [annual amount multiplied by agreed term fraction]. PromptForce.AI entitlement for the initial term: [amount, allowance and billing basis]. Maximum optional contingent fee for the initial term: [amount or zero]. Maximum initial-term fees: [implementation + recurring services + platform + capped contingency]. Taxes and approved customer-paid third-party usage: [treatment]. Do not issue a final quote while any fee or allowance remains undefined.

| Invoice event | Amount | Earning/acceptance condition |
|---|---:|---|
| Mobilization advance | [amount] | Credited against [outcome]; treatment of unearned funds as agreed below |
| [milestone] | [amount] | Written acceptance of [outcome] |
| [milestone] | [amount] | Written acceptance of [outcome] |
| Final base milestone | [amount] | Written acceptance of [outcome] |
| Optional performance payment | [maximum amount] | Section 5 criteria satisfied and approved |

Recurring service invoice schedule: [monthly in advance / arrears / annual], [amount] per period, [number] periods. Platform billing: [schedule and amount]. Monthly service report and review: [deliverables, acceptance deadline and remedy for missed commitments]. State any acceptance-linked holdback separately; ongoing capacity fees are not automatically performance-contingent.

The implementation invoice schedule must total the implementation base fee exactly once; the advance is a credit, not an additional fee. Payment term: [days]. Refund or credit treatment for unearned advance on termination: [rule aligned to governing agreement]. Accepted work, rejected work and customer-caused delays are handled according to [agreed terms].

Cloud, model and third-party charges are [customer-paid directly / included within specified allowance / separately approved]. Specify usage limits and overage authorization; no unlimited expense commitment is implied.

## 5. Optional performance fee

Use only after the baseline and attribution method are accepted. Delete this section or set the fee to zero otherwise.

- Maximum fee: [amount]. Qualification: [all required improvement and guardrail conditions].
- Calculation: [binary amount or explicit graduated formula, floors, caps and rounding].
- Evidence owner: [name]. Customer approval deadline: [business days after complete evidence submission].
- Minimum volume: [count]. Low-volume or incomplete-data extension: [maximum days and conditions].
- If verification remains impossible at the final cutoff: [no contingent fee earned / other expressly agreed resolution].
- Customer-caused changes: [pause/rebaseline/change-order process; no automatic earned fee].
- Attribution exclusions: [vendor rate changes, unrelated projects, staffing changes, scope changes and other agreed factors].
- No double counting across outcomes, contract years or fee schedules. State whether each contingent fee is one-time or reset by an explicit renewal schedule. Adjust errors or reversals using [credit/true-up procedure].

## 6. Review, rejection and remediation

Adapt submits the evidence pack and acceptance request for each milestone. Customer responds within [business days] with written acceptance or an itemized rejection linked to an agreed criterion. Silence is not automatic acceptance under this template. Overdue review escalates to [named sponsors] and may pause dependent work.

For an in-scope failure attributable to Adapt, Adapt provides [number] remediation cycle(s), up to [duration], without an additional services fee. Retest against the same agreed criteria. If it still fails, the parties apply the selected remedy: [withhold the affected unearned milestone fee; refund or credit its unearned advance; terminate remaining scope; or approve a separately scoped change]. Specify the exact remedy before signing. Previously accepted milestones are treated under the governing agreement.

No contingent fee is earned for a missed performance target. A bounded remedy is not an unlimited promise to work until any desired business result occurs. Scope changes, new integrations and new baseline populations require a written change order.

## 7. Operating responsibilities and change control

Adapt owns [implementation, tests, documentation and agreed support]. Customer owns [data legality and quality, access, business decisions, staffing, adoption, operations and required approvals]. Third parties own [named dependencies].

Support after acceptance: [included period, response times, coverage and exclusions, or separately scoped]. Define the rollback owner, incident escalation and human-review responsibilities. Model, prompt, tool, vendor or workflow changes require a recorded impact assessment and evaluation; material changes require approved scope and measurement updates.

Confidentiality, data processing, intellectual property, warranties, liability, termination and order of precedence follow the governing agreement and any listed addenda. Identify unresolved terms before signing: [list or none].

## 8. Approval

The parties confirm that all bracketed fields, fees, thresholds, dependencies and remedies are complete and consistent with the governing agreement.

Adapt authorized signatory: [name, title, signature, date]

Customer authorized signatory: [name, title, signature, date]

Baseline approval record: [reference, approver, date]
