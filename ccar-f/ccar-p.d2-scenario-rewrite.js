(() => {
  const bank = window.CLAUDE_CERT_BANK_EXPANSIONS?.["ccar-p"];
  if (!bank) return;

  const VERSION = "2026-09-15-d2-scenarios-v1";
  const rewrites = {
    "P-P6-01-B": {
      q: "A support platform handles millions of short intent-classification requests each month. Offline evaluation shows two candidate Claude models are statistically indistinguishable on the required quality metric, but one has materially lower latency and cost. What is the strongest production choice?",
      choices: [
        "Use the larger model because higher capability always provides more safety margin",
        "Use the lower-cost, lower-latency model that meets the evaluated quality target and keep regression gates in place",
        "Route half the requests randomly to each model forever so no model-selection decision is required",
        "Choose the model with the largest context window even though the task inputs are short"
      ],
      answer: 1,
      why: "Model selection should follow measured workload requirements rather than a capability label. When quality is equivalent at the required threshold, lower latency and cost are legitimate architecture advantages, provided regression evaluation remains in place.",
      choiceWhy: [
        "A larger model may add cost and latency without improving the evaluated task outcome.",
        "Correct. Select the least expensive and fastest model that demonstrably satisfies the required quality and operational constraints.",
        "Permanent random routing avoids a decision instead of using evidence to choose the appropriate production default.",
        "Context capacity is irrelevant when the actual workload does not need it and other measured constraints dominate."
      ]
    },
    "P-P6-02-B": {
      q: "A multi-tenant assistant has company-wide safety rules, product-specific instructions, tenant configuration, retrieved evidence, and a strict response contract. Teams keep copying all of it into one giant prompt, and updates frequently conflict. Which prompt architecture is strongest?",
      choices: [
        "Keep one monolithic prompt but add headings so maintainers can find each section more easily",
        "Move tenant configuration into retrieved documents so external content can override global policy when needed",
        "Separate durable system policy, reusable task modules, tenant context, retrieved evidence, and the output contract with explicit precedence",
        "Place every rule in the user message because user messages are easiest for application code to modify"
      ],
      answer: 2,
      why: "Prompt architecture should make instruction roles and precedence explicit. Separating durable policy, reusable task logic, dynamic tenant data, evidence, and output contracts reduces accidental conflict and supports safer reuse and maintenance.",
      choiceWhy: [
        "Headings improve readability but do not solve ownership, precedence, reuse, or conflict between instruction classes.",
        "Retrieved content is untrusted context and should not gain authority over durable system policy.",
        "Correct. Modular layers with explicit precedence make policy and task behavior maintainable and auditable.",
        "Putting durable policy in a user message weakens instruction hierarchy and mixes application control with user-provided input."
      ]
    },
    "P-P6-03-B": {
      q: "A legal-research assistant has access to a 70,000-page corpus, but a typical question depends on only a few sections. Teams propose attaching the entire corpus to every request because the model supports a large context window. What is the better context strategy?",
      choices: [
        "Retrieve and rank the small set of relevant sections, preserve citations, and reserve context for the evidence and instructions needed for this request",
        "Include the entire corpus so the model can independently decide which pages matter",
        "Remove system instructions first whenever the context window becomes crowded",
        "Compress every document into one global summary and use only that summary for all questions"
      ],
      answer: 0,
      why: "A large context window is not a reason to send irrelevant material. Retrieval keeps the working set focused, reduces token cost and distraction, and preserves the ability to ground answers in the most relevant source evidence.",
      choiceWhy: [
        "Correct. Retrieval creates a request-specific working set while preserving provenance and room for high-value instructions.",
        "Stuffing the full corpus wastes tokens and can reduce relevance even when the request technically fits.",
        "System policy and task instructions are high-value context and should not be sacrificed to preserve irrelevant evidence.",
        "A single global summary loses detail and provenance needed for precise questions across a large corpus."
      ]
    },
    "P-P6-04-B": {
      q: "Every request to a compliance assistant shares a long, versioned policy prefix and the same tool definitions, while the user question and retrieved passages change each time. The workload has high request volume. How should the prompt be organized to benefit most from prompt caching?",
      choices: [
        "Put the dynamic user question first, followed by the stable policy, so the model sees user intent early",
        "Keep the large stable prefix in a consistent order before dynamic request-specific content and version it when policy changes",
        "Randomize the order of policy sections across requests to avoid model overfitting",
        "Cache retrieved passages indefinitely because they are expensive to compute"
      ],
      answer: 1,
      why: "Prompt caching is most useful when a large stable prefix is reused across requests. Stable content should remain consistent and precede the dynamic suffix; policy versions must change when the underlying semantics change.",
      choiceWhy: [
        "Placing dynamic content first breaks reuse of the stable prefix that caching relies on.",
        "Correct. A consistent stable prefix followed by dynamic content maximizes reusable cached context while preserving freshness through versioning.",
        "Randomizing stable content reduces cache reuse and adds no architectural benefit.",
        "Retrieved passages are request-specific and can become stale; they are not a good candidate for indefinite reuse."
      ]
    },
    "P-P6-05-B": {
      q: "A claims workflow sends Claude's decision directly into deterministic downstream automation. The consumer requires fields for disposition, reason code, confidence band, and evidence IDs. Occasional prose or missing fields would break processing. What is the strongest interface design?",
      choices: [
        "Give two JSON examples in the prompt and parse whatever the model returns",
        "Use an explicit structured-output schema, validate the result, and reject or retry outputs that do not satisfy the contract",
        "Ask for concise prose and use a regular expression to extract the four fields",
        "Allow any valid JSON object and let the downstream service infer missing fields"
      ],
      answer: 1,
      why: "Machine-consumed model output should be treated as a typed interface. An explicit schema plus validation provides a deterministic contract for downstream automation and creates a clear failure path when an output does not conform.",
      choiceWhy: [
        "Examples can help formatting but do not enforce a machine-verifiable schema.",
        "Correct. Structured output plus validation gives downstream code a reliable typed contract.",
        "Regular expressions over prose are brittle and do not provide a complete structural contract.",
        "Allowing arbitrary JSON shifts ambiguity into deterministic downstream code and defeats the purpose of structured output."
      ]
    },
    "P-P6-06-B": {
      q: "An operations agent has tools named `get_customer`, `lookup_customer`, `customer_search`, and `customer_details`. Traces show the model often chooses the wrong one because their descriptions overlap. What should the architect change first?",
      choices: [
        "Add more specialized customer tools so every edge case has a dedicated function",
        "Make tool purpose, inputs, side effects, and boundaries explicit, and consolidate capabilities that are meaningfully redundant",
        "Hide parameter descriptions so the model focuses only on tool names",
        "Create one generic `execute` tool that accepts a free-text instruction for any customer operation"
      ],
      answer: 1,
      why: "Reliable tool use depends on a capability surface with clear, non-overlapping semantics. Better names and descriptions plus consolidation reduce ambiguity more effectively than adding more tools or hiding structure.",
      choiceWhy: [
        "Adding more overlapping choices increases the selection problem rather than resolving it.",
        "Correct. Explicit semantics and reduced overlap give the model a clearer decision boundary between tools.",
        "Parameter descriptions are part of the contract the model needs to invoke a tool correctly.",
        "A generic free-text execution surface removes useful structure and usually expands risk and ambiguity."
      ]
    },
    "P-P6-07-B": {
      q: "A case-management agent can stay active for days. Its raw conversation history, tool outputs, and intermediate reasoning now consume most of the context window, and quality degrades late in a case. Which design best preserves useful continuity?",
      choices: [
        "Persist authoritative case state outside the prompt, compact prior interaction into durable summaries, and retrieve only history or evidence relevant to the current step",
        "Keep every token from every prior turn because deleting history always destroys necessary reasoning",
        "Discard all prior context at fixed intervals and ask the user to restate the case from memory",
        "Move the oldest transcript into the system prompt so it has higher priority"
      ],
      answer: 0,
      why: "Long-running workflows need durable state rather than unbounded transcript accumulation. External state, selective retrieval, and controlled summarization preserve important continuity while keeping the active working set focused.",
      choiceWhy: [
        "Correct. Durable state and selective context let the system preserve what matters without carrying every historical token.",
        "Unbounded transcript growth consumes context and mixes stale details with current task state.",
        "Periodic amnesia loses continuity and places recovery burden on the user rather than the architecture.",
        "Old transcript content should not be promoted to the highest instruction authority merely because it is old."
      ]
    },
    "P-P6-08-B": {
      q: "A clinical-operations assistant is asked whether a patient qualifies for a program, but the required eligibility field is absent from the available record. The workflow is high impact and policy forbids guessing. What behavior should the system require?",
      choices: [
        "Choose the most likely answer from the surrounding record so the user receives a complete response",
        "Return a definitive answer but attach a low-confidence label",
        "State that the required evidence is missing and route the case to the defined evidence-gathering or human-review path",
        "Use a longer chain of reasoning so the model can infer the missing field more reliably"
      ],
      answer: 2,
      why: "When a consequential decision is underdetermined, the system should expose the evidence gap and follow a defined escalation or evidence-gathering path. More reasoning cannot create authoritative facts that are absent from the record.",
      choiceWhy: [
        "Guessing converts uncertainty into an unsupported high-impact decision.",
        "A confidence label does not make a definitive unsupported decision acceptable when policy requires evidence.",
        "Correct. Explicit abstention plus escalation preserves safety and makes the missing evidence actionable.",
        "Additional reasoning may improve use of available evidence but cannot manufacture a required missing fact."
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
  window.CLAUDE_CERT_SCENARIO_REWRITES["ccar-p-d2"] = {
    version: VERSION,
    rewrittenQuestionIds: Object.keys(rewrites)
  };
})();
