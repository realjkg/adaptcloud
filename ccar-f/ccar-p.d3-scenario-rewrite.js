(() => {
  const bank = window.CLAUDE_CERT_BANK_EXPANSIONS?.["ccar-p"];
  if (!bank) return;

  const VERSION = "2026-09-15-d3-scenarios-v1";
  const rewrites = {
    "P-P1-01-B": {
      q: "A claims assistant must use policy lookup, CRM notes, and payment-status services. Each system has a different owner, authentication model, and release cadence. Which integration design best preserves ownership and least privilege while still giving Claude the capabilities it needs?",
      choices: [
        "Expose narrow, owned service or tool contracts for each system and authorize each call independently",
        "Create one generic enterprise tool with a broad service account so Claude can reach every backend",
        "Replicate the three systems into one shared database and let the model query it directly",
        "Give the model network access and rely on the system prompt to keep calls within approved services"
      ],
      answer: 0,
      why: "The strongest boundary keeps each system behind an owned contract and enforces authorization at that boundary. A broad super-tool, replicated database, or prompt-only restriction collapses ownership and increases privilege.",
      choiceWhy: [
        "Correct. Narrow owned contracts preserve system responsibility, security controls, and independent operability.",
        "A broad super-tool centralizes privilege and makes authorization and failure isolation harder to reason about.",
        "Replicating systems creates a new source-of-truth and governance problem rather than respecting existing ownership.",
        "Prompt instructions are not a network or authorization boundary and cannot replace enforced service controls."
      ]
    },
    "P-P1-02-B": {
      q: "An internal engineering assistant can access 180 tools, but production traces show that a typical request needs only 6 to 12. Tool-selection errors and prompt overhead rise as the catalogue grows. What should the architect change first?",
      choices: [
        "Increase the model context window so the full catalogue fits comfortably",
        "Keep every tool loaded but shorten each description to one sentence",
        "Expose a task-scoped tool set initially and discover additional capabilities only when the workflow requires them",
        "Remove tool descriptions and let the model infer behavior from tool names"
      ],
      answer: 2,
      why: "A large mostly irrelevant capability surface should be narrowed and discovered progressively. This reduces context pressure and selection ambiguity without removing access to capabilities that are genuinely needed later.",
      choiceWhy: [
        "A larger context window does not address capability bloat or overlapping choices.",
        "Shorter descriptions may reduce tokens but still leave the model choosing among too many irrelevant capabilities.",
        "Correct. Task-scoped exposure plus progressive discovery reduces noise while retaining breadth when needed.",
        "Removing descriptions makes tool selection less reliable because boundaries and inputs become ambiguous."
      ]
    },
    "P-P1-03-B": {
      q: "A manager asks an HR assistant for compensation data about employees in that manager's reporting chain. The request is authenticated at the front end, but the downstream HR services must still enforce the manager's exact permissions. What is the strongest design?",
      choices: [
        "Use a shared administrator token for downstream calls and ask Claude to filter unauthorized records",
        "Propagate delegated identity or verifiable authorization context and enforce access in each downstream service",
        "Authorize only at the chat front end because the model already knows who the user is",
        "Strip identity before downstream calls to avoid leaking user information between services"
      ],
      answer: 1,
      why: "Caller identity and authorization context must survive the integration chain so each service can enforce its own policy. Front-end checks and prompts do not substitute for downstream authorization.",
      choiceWhy: [
        "A shared administrator token destroys least privilege and makes the model responsible for access control.",
        "Correct. Delegated or verifiable identity lets each downstream service enforce the caller's authorized scope.",
        "Front-end authorization alone is insufficient when downstream systems hold protected data and actions.",
        "Removing identity prevents the downstream service from making the authorization decision it is responsible for."
      ]
    },
    "P-P1-04-B": {
      q: "A deterministic nightly finance job pushes normalized ledger rows into a warehouse. No model chooses the operation, and the transfer is not intended to be discovered by other AI applications. Which connection mechanism is the best fit?",
      choices: [
        "Publish the warehouse write operation as an MCP server because all enterprise integrations should use MCP",
        "Use an agent-to-agent protocol so autonomous agents can negotiate the transfer",
        "Call the warehouse's direct application API from the batch job",
        "Register the warehouse as a Claude tool and have a model invoke it on schedule"
      ],
      answer: 2,
      why: "A deterministic non-model batch transfer does not benefit from model-facing capability discovery. A direct application API is the narrower and more appropriate integration mechanism.",
      choiceWhy: [
        "MCP is useful when standardized model-facing discovery and reuse add value; that need is absent here.",
        "Agent-to-agent coordination adds autonomy and protocol complexity to a deterministic batch transfer.",
        "Correct. The direct API matches a fixed application integration with no need for model discovery.",
        "Adding a model to invoke a deterministic scheduled transfer introduces unnecessary cost and failure modes."
      ]
    },
    "P-P1-05-B": {
      q: "A benefits assistant may answer only from the employer's currently approved plan documents, and auditors must be able to trace every material claim to its source. Which retrieval architecture best satisfies those requirements?",
      choices: [
        "Attach the complete document repository to every request so Claude can decide what is relevant",
        "Let Claude browse the document store directly and rely on prompt instructions to avoid unapproved files",
        "Run semantic search across every indexed document and remove disallowed citations after generation",
        "Use a policy-aware retrieval service that filters to approved current documents and returns scoped evidence with provenance"
      ],
      answer: 3,
      why: "The retrieval layer should enforce eligibility before evidence reaches the model and should preserve source provenance. That creates an auditable evidence boundary instead of relying on the model to police the corpus.",
      choiceWhy: [
        "Attaching the full repository wastes context and can expose stale or unapproved content.",
        "Prompt instructions do not enforce document eligibility or provide a controlled audit boundary.",
        "Post-generation filtering is too late because unauthorized or stale evidence may already have influenced the answer.",
        "Correct. Policy-aware filtering plus provenance gives the model only eligible evidence and preserves auditability."
      ]
    },
    "P-P1-06-B": {
      q: "A contract-review workflow can take eight minutes because it waits on two external checks. Users must be able to close the browser and return later without restarting the job. Which orchestration pattern is most appropriate?",
      choices: [
        "Keep the original HTTP request open until every external check and model call completes",
        "Queue the work, persist durable workflow state, and expose completion through status polling or callbacks",
        "Restart the full workflow whenever the user returns so the latest context is guaranteed",
        "Store the current step only in the conversation history and infer progress when the user reconnects"
      ],
      answer: 1,
      why: "Long-running work should be decoupled from the interactive request and backed by durable state. Queues and explicit job status make retries, reconnection, and recovery manageable.",
      choiceWhy: [
        "Holding an HTTP request open for minutes is fragile and couples user connectivity to workflow completion.",
        "Correct. Durable asynchronous orchestration survives disconnects and supports explicit retry and status handling.",
        "Restarting repeats expensive or side-effecting work and discards valid completed progress.",
        "Conversation text is not an authoritative workflow-state store and is unsafe for recovery logic."
      ]
    },
    "P-P1-07-B": {
      q: "An onboarding agent submits a vendor record to a procurement API. The API accepts the request, but the network times out before the agent receives the response. A blind retry could create a duplicate vendor. What control should be designed into the integration?",
      choices: [
        "Treat every timeout as a failed operation and submit a new request with a new identifier",
        "Use an idempotency key or operation identifier and verify the prior outcome before retrying",
        "Ask Claude to estimate whether the original request probably succeeded before deciding to retry",
        "Disable retries entirely and require an operator to re-enter every timed-out request"
      ],
      answer: 1,
      why: "Timeouts create uncertainty about whether a side effect completed. An idempotency key plus outcome verification makes retries safe without assuming that timeout means failure.",
      choiceWhy: [
        "A new identifier can create a second side effect even when the first request already succeeded.",
        "Correct. Idempotent operation identity lets the system repeat safely or discover the already-completed result.",
        "The model cannot infer authoritative external transaction state from a network timeout.",
        "Eliminating retries avoids duplicates but creates unnecessary manual failure handling instead of solving the integration problem."
      ]
    },
    "P-P1-08-B": {
      q: "A customer-support workflow crosses Claude, a retriever, a policy service, and an external case-management API. p95 latency spikes intermittently, but each component's local logs look healthy. What telemetry design will best identify the slow hop?",
      choices: [
        "Use one correlation or trace ID across model, retrieval, policy, and tool spans and record per-hop timing and errors",
        "Collect only final response latency because intermediate telemetry adds too much noise",
        "Assign a new unrelated request ID at every hop so each service can manage logs independently",
        "Capture full payloads for every production request and inspect them manually when latency rises"
      ],
      answer: 0,
      why: "Cross-service latency diagnosis requires end-to-end correlation. Shared trace context with per-hop spans lets operators see where time and failures accumulate without relying on disconnected logs.",
      choiceWhy: [
        "Correct. Correlated distributed traces expose the path and duration of each model and integration step.",
        "Final latency shows that a problem exists but not which dependency or stage caused it.",
        "Unrelated identifiers prevent reliable reconstruction of a single workflow across services.",
        "Capturing every full payload is expensive and still does not replace structured timing and correlation."
      ]
    },
    "P-P1-09-B": {
      q: "Three applications consume a structured risk object produced by a shared Claude service. The service team wants to rename fields and change an enum used by downstream automation. What is the strongest contract-management approach?",
      choices: [
        "Change the fields immediately and notify consumers after deployment",
        "Return prose temporarily so each consumer can infer the new structure",
        "Keep the same schema version and document the changed meanings in release notes",
        "Publish a versioned schema, validate outputs against it, and define compatibility or migration rules for consumers"
      ],
      answer: 3,
      why: "Machine-consumed output is an interface contract. Versioning and compatibility rules let producers evolve safely while consumers validate and migrate deliberately.",
      choiceWhy: [
        "Breaking consumers first turns contract management into incident response.",
        "Free-form prose removes the machine-verifiable contract that downstream automation depends on.",
        "Changing semantics without a version makes existing consumers unable to distinguish old and new behavior safely.",
        "Correct. A versioned validated schema makes compatibility explicit and supports controlled migration."
      ]
    },
    "P-P1-10-B": {
      q: "A travel-planning assistant can complete the core itinerary without a third-party weather enrichment service, but that service intermittently returns 503 errors. What should the production workflow do?",
      choices: [
        "Fail the entire itinerary whenever weather enrichment is unavailable",
        "Use bounded retries or a circuit breaker, continue the core itinerary, and clearly mark weather enrichment as unavailable",
        "Generate likely weather conditions from the model so the user still sees a complete answer",
        "Retry the weather service indefinitely because completeness matters more than latency"
      ],
      answer: 1,
      why: "A noncritical dependency should not collapse the core user path. Graceful degradation preserves the primary task while making the missing enrichment explicit and observable.",
      choiceWhy: [
        "Failing the whole workflow gives an optional dependency control over the critical path.",
        "Correct. Bounded recovery plus graceful degradation isolates the optional failure while preserving user value.",
        "Inventing weather data hides the dependency failure and introduces unsupported claims.",
        "Unbounded retries can exhaust latency and resources and still fail to restore the dependency."
      ]
    },
    "P-P1-11-B": {
      q: "An employee-support solution serves both EU and US workforces. EU case data, retrieved documents, model traffic, and diagnostic logs must remain within approved EU boundaries. Which architecture best satisfies the residency requirement?",
      choices: [
        "Use whichever region has the lowest model latency and encrypt traffic in transit",
        "Centralize all logs in the US while keeping only the source documents in the EU",
        "Route EU model, retrieval, integration, storage, and telemetry paths through approved EU endpoints and prevent cross-region replication",
        "Allow global processing but remove employee names before responses are returned"
      ],
      answer: 2,
      why: "Residency applies to the full data path, not only the source database. Model calls, retrieval, integrations, storage, and telemetry must all stay inside the approved boundary when policy requires it.",
      choiceWhy: [
        "Encryption protects transport but does not satisfy a policy that restricts where processing occurs.",
        "Diagnostic logs can contain sensitive data and are part of the residency boundary.",
        "Correct. The entire EU processing and observability path must remain within approved regional boundaries.",
        "Pseudonymization may reduce sensitivity but does not override an explicit regional-processing requirement."
      ]
    },
    "P-P1-12-B": {
      q: "An access-governance agent proposes revoking elevated permissions from 400 accounts after a policy change. Security policy requires an authorized administrator to approve the exact action before it is executed. How should the approval step be implemented?",
      choices: [
        "Execute the revocations first and ask an administrator to review the audit log afterward",
        "Ask Claude to self-check the proposal twice and treat agreement as approval",
        "Show a generic confirmation such as 'Proceed with cleanup?' without listing the affected accounts",
        "Freeze the proposed change set, present the exact payload to an authorized approver immediately before execution, and log the approval with that payload"
      ],
      answer: 3,
      why: "Human approval should sit immediately before the consequential side effect and bind to the exact payload being executed. That makes the approval meaningful, auditable, and resistant to changes between review and action.",
      choiceWhy: [
        "Post-execution review is audit, not preventive human-in-the-loop control.",
        "Model self-review does not satisfy a requirement for an authorized human decision maker.",
        "A generic confirmation cannot establish that the approver reviewed the actual high-impact changes.",
        "Correct. Binding an authorized approval to the exact pending payload provides enforceable pre-execution control and evidence."
      ]
    }
  };

  for (const [id, patch] of Object.entries(rewrites)) {
    const q = bank.questions.find(item => item.id === id);
    if (!q) continue;
    Object.assign(q, patch, {
      scenarioRewrite: {
        version: VERSION,
        style: "original-practice-scenario",
        sourcePolicy: "original-not-live-exam-content"
      }
    });
  }

  window.CLAUDE_CERT_SCENARIO_REWRITES = window.CLAUDE_CERT_SCENARIO_REWRITES || {};
  window.CLAUDE_CERT_SCENARIO_REWRITES["ccar-p-d3"] = {
    version: VERSION,
    rewrittenQuestionIds: Object.keys(rewrites)
  };
})();
