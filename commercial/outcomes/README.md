# Continuous AI advisory and engineering

Proposed commercial model for Adapt Cloud | 30 September 2026

## Recommendation

Offer a continuing advisory and engineering service for an initial term of at least 12 months, renewable by mutual written agreement. Include PromptForce.AI from DayTwoAI.com as the platform accelerator, with a defined entitlement and provider responsibilities. Reserve capacity for approved improvements, maintain a rolling 90-day plan, and use monthly working reviews and quarterly business-value reviews to guide the work.

Repeat assess, agree, implement and verify. Feed the result into the next assessment. Acceptance closes a work item, not the account relationship. Price separately scoped implementation only where the work exceeds included capacity; some accounts may start with systems already in use. Add a capped performance fee only where its result is independently verifiable and attributable.

For a three-year-old specialist consultancy, this gives the buyer accountability while protecting delivery capacity and cash flow. Company age alone should not determine price. Relevant experience, delivery evidence, scope, risk and customer value should. Do not discount merely because AI makes delivery faster; price the accepted capability and use delivery efficiency to improve margin.

Cost per successful outcome is a useful operating metric. Price per successful transaction is a different commercial choice. Neither is automatically a suitable basis for a consulting invoice.

## Package contents

- [Pricing guide](pricing-guide.md): account qualification, economics, measurement and offer mapping.
- [Annual service schedule](annual-service-schedule.md): 12-month minimum term, PromptForce.AI role, recurring deliverables and renewal.
- [SOW template](sow-template.md): editable account-specific scope, acceptance, fees and measurement schedule.
- [Illustrative SOW](example-sow.md): fictional $40,000 implementation plus $36,000 annual services, a separately quoted platform entitlement and a capped $5,000 performance fee.
- [Outcome register](outcome-register.md): a lightweight account scorecard and transaction evidence specification.
- [Brochure](adapt-cloud-outcomes-brochure.pdf): two-page client-facing PDF without pricing.
- [Brochure source](brochure.json) and [renderer](render_brochure.py).
- [Editorial review record](review-notes.md): revision findings and final verification.

All example prices, margins, thresholds and schedules are proposals, not published Adapt Cloud rates, client results or market benchmarks. An account quote requires actual delivery estimates, customer inputs and approval. This repository is public: use fictional examples here; keep real account quotes, margins, evidence and customer data in an access-controlled system.

The SOW is a commercial working template. Complete its schedules and align it with the parties' governing services agreement before signature. No customer commitment is made by this package.

## Account workflow

1. Agree the account scope, business and technical owners, term, platform entitlement and recurring capacity.
2. Establish the baseline or document evidence gaps. Approve the first 90-day plan.
3. Assess the next priority and agree its scope, owner, acceptance test, estimate and fee/capacity allocation.
4. Implement and test the approved work; obtain release approval and preserve rollback evidence.
5. Verify against the agreed baseline and quality requirements. Record acceptance, remediation or a stop decision.
6. Return findings to the backlog. Deliver the monthly service report and working review throughout the term, including periods between releases.
7. Each quarter, evaluate total cost and business value, then refresh the 90-day plan. Reprioritize within scope; obtain a change order for added scope or capacity.
8. Review renewal at least 60 days before expiry. Agree the next term or follow the exit plan; do not repeat implementation fees automatically.

The outcome register is a template, not an automated integration or billing system. Start with one account scorecard linked to restricted evidence. Add automation only when manual reconciliation becomes material.

## Rebuild brochure

From this directory, using Python 3 and ReportLab. The exact Space Grotesk Light (300), Regular (400), and Medium (500) fonts used by the website are bundled under `assets/fonts/` with their SIL Open Font License. The renderer embeds them, so no system font installation or network access is required.

```sh
python -m pip install -r requirements-brochure.txt
python render_brochure.py
```

The renderer reads `brochure.json`, uses `assets/adapt-cloud-icon.png`, and writes the PDF beside the source. No network access is needed. The icon was retrieved from the live Adapt Cloud website on 30 September 2026; its source URL is in `assets/README.md`.

## Basis and limits

Current Adapt Cloud positioning was reviewed at https://www.adaptcloud.io/ on 30 September 2026. The site describes AI Tokenomics Business Analysis, Frontier Agent Accelerator, and AI FinOps & Governance Implementation; it does not publish a price list. This package adds proposed commercial terms without changing the website or its offers.

The user requested PromptForce.AI from DayTwoAI.com as the accelerator in renewable arrangements of one year or longer. DayTwoAI publicly describes PromptForce as a component library and AI-readiness platform. Platform license, reseller rights, allowances, deployment, support and data terms have not been established by this work. The platform homepage was not retrievable through the research tool; capability descriptions are limited to DayTwoAI's public description at https://daytwoai.com/.

Measurement principles are informed by the FinOps Foundation's [Unit Economics capability](https://www.finops.org/framework/capabilities/unit-economics/) and Anthropic's [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), reviewed on the same date. Our commercial recommendations are Adapt Cloud proposals, not recommendations or endorsements from those organizations. Nothing here asserts Anthropic partner, certification or reseller status.
