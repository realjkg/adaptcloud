# Adapt Cloud — website copy

Section-by-section copy for the Webflow site. Each block maps to one Webflow
section; the **Field** names are the suggested Webflow element/CMS field names so
copy and layout stay decoupled.

Every claim below is traceable to something in this repository. If you edit a
number, edit `azure/COSTS.md` too — the FinOps dashboard reads from the same set
of rates, and a marketing page that disagrees with the repo is worse than no page.

---

## 1. Hero

**Field: `hero-eyebrow`**
> Governed AI agents on Azure

**Field: `hero-headline`**
> Your agents are identities. Govern them like it.

**Field: `hero-subhead`**
> Adapt Cloud stands up AI agents inside a real Azure landing zone — each with its
> own Entra Agent ID, least-privilege RBAC, and policy-as-code guardrails that deny
> the bad deployment instead of filing a ticket about it. Low-code first, so the
> business builds; governed by default, so security doesn't have to object.

**Field: `hero-cta-primary`** → `Book a working session`
**Field: `hero-cta-secondary`** → `See what it costs to run`

**Field: `hero-proof-strip`** (three inline stats)
> `12` architecture claims, each with a test that fails if you remove the guardrail
> `7` Azure Policy definitions enforced at the management-group scope
> `~$100/mo` to stand the whole thing up in a sandbox and tear it down again

> **Alt headlines** — if the primary reads too abstract for the audience:
> - *"Ship agents your security team doesn't have to argue with."*
> - *"Low-code speed. Landing-zone discipline. Pick both."*
> - *"The governance isn't a slide. It's Terraform, and it's tested."*

---

## 2. The problem

**Field: `problem-kicker`**
> Why agent pilots stall

**Field: `problem-headline`**
> The demo works. The deployment is the hard part.

**Field: `problem-body`**
> Most agent projects die in the gap between "it answered the question" and "it can
> touch production data." The agent runs under a shared service principal nobody
> owns. Its permissions are whatever got it working on a Thursday. There's no
> inventory, so nobody can say how many agents exist or who is accountable for one.
> The controls live in a policy document instead of the platform, which means they
> hold right up until the moment someone is in a hurry.
>
> None of that is an AI problem. It's a landing-zone problem wearing an AI costume —
> and it has a known shape of answer.

---

## 3. What we build

**Field: `approach-kicker`**
> The approach

**Field: `approach-headline`**
> Low-code first, governed by default

**Field: `approach-body`**
> Business teams build in Power Platform and Copilot Studio, where they're fast. The
> platform underneath is Terraform: an Application Platform management group, a
> vended workload subscription peered to your connectivity hub, private endpoints on
> every PaaS service, and a DLP policy that classifies the entire connector catalog
> before a maker ever opens the designer.
>
> The guardrails are policy as code, assigned at the management-group scope. A
> deployment that reaches for an unapproved model, opens a public endpoint, or skips
> its ownership tags doesn't get flagged in a report next quarter. It fails.

### Capability cards

**Card 1 — `capability-identity`**
> **Every agent is a first-class identity**
> One Entra Agent ID or user-assigned managed identity per agent. No shared service
> principals, no agent borrowing a human's account, no client secrets — federated
> credentials instead. Conditional Access targets the agent group directly and blocks
> interactive sign-in.

**Card 2 — `capability-landing-zone`**
> **A real landing zone, created if you don't have one**
> The Cloud Adoption Framework says agent workloads belong in an Application landing
> zone under an Application Platform management group. If your tenant doesn't have
> one, the platform module creates it — idempotently — then vends the workload
> subscription beneath it.

**Card 3 — `capability-policy`**
> **Policy as code, in Deny mode**
> Seven definitions and one initiative: allowed regions, approved model deployments,
> deny public network access, deny local auth on Cognitive Services, require
> diagnostic settings, require ownership and classification tags, audit managed
> identity. Assigned at the MG scope, so it covers workloads nobody told you about.

**Card 4 — `capability-lowcode`**
> **The widest connector reach, classified**
> A Power Platform Managed Environment with a DLP policy sorting the full connector
> catalog into Business, Non-Business and Blocked — plus custom API connectors
> generated from your own OpenAPI specs and fronted by API Management.

**Card 5 — `capability-observability`**
> **Traceable to the agent that did it**
> Central Log Analytics, per-agent Application Insights, diagnostic settings enforced
> by policy, Defender for Cloud AI threat protection, and Purview/DSPM hooks. Every
> call resolves back to a named agent identity.

**Card 6 — `capability-humanloop`**
> **Human-in-the-loop where it matters**
> Sensitive operations sit behind an APIM policy that requires an approver header.
> An agent can prepare a payout. It cannot issue one on its own.

---

## 4. Proof section — the differentiator

**Field: `proof-kicker`**
> Proof, not posture

**Field: `proof-headline`**
> Twelve claims. Twelve tests. Delete a guardrail and the suite goes red.

**Field: `proof-body`**
> Architecture diagrams are easy to draw and impossible to falsify. So every pillar
> of this platform is paired with a runnable test that proves it — and the test is
> designed to fail if the control is removed.
>
> Unauthenticated calls get a 401. A 601-call burst gets rate-limited. A Terraform
> plan with a `gpt-3.5-turbo` deployment is denied by policy. An OpenAI account with
> public network access is denied. A resource group missing `agentOwner` is denied.
> Ten adversarial prompts get refused by Prompt Shields. A `/payout` call without an
> approver header returns 403. A synthetic prompt shows up in Application Insights
> tagged with the agent's own identity.
>
> The end-to-end script chains all of it — apply, test, evaluate, prove the denials,
> print a compliance summary, destroy — for about five cents in tokens.

**Field: `proof-cta`** → `Read the control mapping`

---

## 5. FinOps section (wraps the dashboard embed)

**Field: `finops-kicker`**
> FinOps

**Field: `finops-headline`**
> Know the bill before you sign for it

**Field: `finops-body`**
> Governed doesn't have to mean expensive, but it does mean *knowable*. The same
> architecture runs from roughly $100 a month in a sandbox to several thousand in a
> zone-redundant production posture — and the difference is four or five variables,
> not a redesign.
>
> Two things dominate every estimate. API Management Premium buys Internal VNet and
> availability zones for about $2,800 a unit. AI Search bills per search unit whether
> or not anyone queries it. Almost everything else is either rounding or genuinely
> metered — your token spend is $0 until an agent is actually used, because quota is
> not a reservation.
>
> Move the knobs below. The number is honest about what's fixed and what only shows
> up when the platform earns its keep.

**Field: `finops-embed`** → *Webflow Embed element — see `marketing/README.md`*

**Field: `finops-footnote`**
> List prices, USD, pay-as-you-go, East US 2, no EA or CSP discount, early-2026
> rates. Estimates only — confirm against the Azure Pricing Calculator before you
> commit budget.

---

## 6. Teardown / risk-reversal

**Field: `teardown-headline`**
> You can turn it off

**Field: `teardown-body`**
> The sandbox profile is built to be disposable: public endpoints, Consumption-tier
> API Management, Basic search, and Key Vault purge protection deliberately off so a
> destroyed vault's name is reusable immediately. `terraform apply`, run the demo,
> `terraform destroy`, and nothing lingers to block the rebuild.
>
> That matters more than it sounds. A pilot you can't cleanly delete isn't a pilot —
> it's an unfunded production system with a pilot's budget.

---

## 7. Engagement model

**Field: `engage-headline`**
> How we work

**Card A — `engage-assess`**
> **Assess — 1 week**
> Where your agents actually are today: which identities they run under, what they
> can reach, what governance exists on paper versus in the platform. Output is a
> control-by-control gap map against the CAF agent-governance disciplines.

**Card B — `engage-land`**
> **Land — 3–4 weeks**
> The Application Platform landing zone, the policy initiative in Audit, and one real
> workload agent deployed end to end. You keep the Terraform.

**Card C — `engage-enforce`**
> **Enforce — ongoing**
> Flip the initiative from Audit to Deny once the estate is clean, wire the test
> suite into your pipeline, and hand over the operating model — access reviews, agent
> lifecycle, cost guardrails.

---

## 8. Closing CTA

**Field: `cta-headline`**
> Start with the sandbox. It costs about a hundred dollars and tells you the truth.

**Field: `cta-body`**
> We'll stand up the dev-demo profile in your tenant, run the twelve proofs against
> it, walk your security and platform teams through what passed and what didn't, and
> tear it down the same day if you want. No slideware.

**Field: `cta-button`** → `Book a working session`

---

## 9. Boilerplate

**Field: `boilerplate-short`** (≤ 200 characters)
> Adapt Cloud builds governed AI agent platforms on Azure — low-code first, landing-zone
> discipline underneath, and every architectural claim backed by a test that fails when
> the guardrail is removed.

**Field: `boilerplate-long`**
> Adapt Cloud is a cloud platform consultancy specialising in governed AI agent
> deployments. We implement Microsoft's Cloud Adoption Framework guidance for
> governing and securing AI agents as working infrastructure-as-code: Application
> Platform landing zones, policy-as-code guardrails, per-agent Entra identities, and
> Power Platform environments governed by connector-classification DLP. Our reference
> implementation ships with an end-to-end test suite that pairs every architectural
> claim with a runnable proof.

---

## Meta / SEO

| Field | Value |
|---|---|
| `meta-title` | Adapt Cloud — Governed AI Agents on Azure |
| `meta-description` | Deploy AI agents inside a real Azure landing zone: per-agent Entra identities, policy-as-code guardrails, and twelve architectural claims each backed by a test. See the cost model. |
| `og-title` | Your agents are identities. Govern them like it. |
| `og-description` | Landing zone, policy as code, per-agent identity, and a FinOps model that tells you what it costs before you sign for it. |
| `finops-page-title` | FinOps for governed AI agents — Adapt Cloud |
| `finops-meta-description` | What a governed Azure AI agent platform actually costs: from a ~$100/month sandbox to a zone-redundant production estate. Interactive cost model. |
