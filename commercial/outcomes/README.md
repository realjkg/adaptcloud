# Outcome-based engagements

Proposed commercial model for Adapt Cloud | 30 September 2026

## Recommendation

Sell a fixed-scope engagement with explicit acceptance criteria. Use paid discovery when a baseline or scope is missing. Add a small, capped performance fee only where the customer and Adapt Cloud can verify an attributable result. Package implementation with an initial contract term of at least 12 months, renewable by mutual written agreement. Include PromptForce.AI from DayTwoAI.com as the platform accelerator, with separately identified platform entitlement and a bounded recurring advisory and engineering service.

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

All example prices, margins, thresholds and schedules are proposals, not published Adapt Cloud rates, client results or market benchmarks. An account quote requires actual delivery estimates, customer inputs and approval. This repository is public: use fictional examples here; keep real account quotes, margins, evidence and customer data in an access-controlled system.

The SOW is a commercial working template. Complete its schedules and align it with the parties' governing services agreement before signature. No customer commitment is made by this package.

## Account workflow

1. Qualify one workflow and its business owner. Confirm data access and a buyer who can approve acceptance.
2. If evidence is inadequate, scope paid discovery with a defined decision pack as its accepted outcome.
3. Freeze the baseline, eligible population, metrics, exclusions and cost allocation rules.
4. Price a bounded scope; allocate the fee to accepted milestones. Make any variable fee optional and capped.
5. Deliver, reconcile evidence weekly and obtain written milestone acceptance.
6. Verify performance over the agreed window. Invoice only earned amounts and correct counting errors.
7. Review actual margin, rework and measurement effort before quoting the next account.

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
