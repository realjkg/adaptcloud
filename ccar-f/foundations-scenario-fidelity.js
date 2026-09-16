(() => {
  const TRACKS = new Set(["ccao-f", "ccdv-f", "ccar-f"]);
  const track = window.CERT_TRACK;
  const profile = window.CERT_PROFILE;
  const questions = window.CCARF_QUESTIONS || [];
  if (!TRACKS.has(track) || !profile || !questions.length) return;

  const hash = (s) => {
    let h = 2166136261;
    for (const ch of String(s || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const shuf = (a, rng = Math.random) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  };
  const stripLead = (text) => {
    const s = String(text || "").trim();
    const i = s.indexOf(". ");
    return i >= 24 && i <= 190 ? s.slice(i + 2) : s;
  };

  const scenarioBits = {
    "ccao-f": {
      A1: ["A finance analyst is finalizing a decision brief from a workbook, meeting notes, and an approved dashboard.", "An HR operations lead is preparing guidance that managers will use the same day.", "A customer-success manager is reviewing an account-risk summary before an executive meeting."],
      A2: ["An operations team is redesigning a recurring case workflow with several human handoffs.", "A service team wants to automate part of a monthly process without losing accountability.", "A business unit is piloting Claude inside an existing approval workflow."],
      A3: ["A regulated team is handling customer and employee information under an internal AI-use policy.", "A business unit is introducing Claude into a process that includes sensitive records and consequential decisions.", "A team is reviewing whether an AI-assisted workflow has appropriate privacy and approval controls."],
      A4: ["A consultant is preparing a time-sensitive executive deliverable and the first draft is inconsistent.", "A project lead is using Claude for a repeated analysis-and-writing task with a fixed audience and format.", "An analyst is refining a prompt used every week by several colleagues."],
      A5: ["A team must choose a Claude product or model for a recurring business task with explicit cost, speed, and quality constraints.", "A department is deciding how much model capability it actually needs for routine work and difficult exceptions.", "A business owner is comparing Claude features for a workflow that mixes research, drafting, and reusable knowledge."],
      A6: ["A project team repeatedly produces the same deliverable using approved templates, terminology, and reference material.", "A department wants reusable Claude instructions and knowledge without asking every user to rebuild context from scratch.", "A team is maintaining a shared Claude workspace whose source material changes over time."],
      A7: ["A previously reliable Claude workflow has started producing inconsistent results after the inputs changed.", "Users report that a recurring workflow is slower and less consistent even though its business objective is unchanged.", "A team is diagnosing why a prompt-and-review process works on easy cases but fails on edge cases."]
    },
    "ccdv-f": {
      D1: ["A production Claude service handles interactive traffic and background work through the same integration layer.", "A developer is hardening a user-facing Claude application that must survive retries, partial responses, and traffic bursts.", "A platform team is diagnosing reliability problems across a Claude API client, worker queue, and downstream service."],
      D2: ["A high-volume route must meet a measured quality target while reducing latency and inference cost.", "A team is choosing models and optimization techniques for routine requests and difficult exceptions.", "An application has representative eval results plus production token and latency telemetry for several model configurations."],
      D3: ["A production workflow has some fixed steps but also cases where the next action depends on intermediate results.", "An agent occasionally loops or retries the same failing action without making progress.", "A developer is deciding whether a bounded workflow, one agent, or delegated subagents best fits the task."],
      D4: ["A developer is improving a machine-consumed prompt whose context grows across long sessions.", "A Claude route combines trusted instructions, retrieved content, and user data before returning structured output.", "A team is debugging output drift caused by prompt structure and context growth rather than transport failures."],
      D5: ["An application exposes several external capabilities to Claude and must keep tool selection predictable and secure.", "A team is deciding whether a reusable capability belongs in a direct API integration, a custom tool, or an MCP server.", "A developer is tightening tool schemas and error semantics after ambiguous calls caused production failures."],
      D6: ["A Claude application processes untrusted content and can trigger privileged downstream actions.", "A security review finds that model instructions, credentials, and execution permissions are too tightly coupled.", "A team is adding deterministic guardrails around an AI-assisted production workflow."],
      D7: ["A development team is standardizing Claude Code behavior across a shared repository and CI workflow.", "Several engineers use Claude Code differently and the repository now has conflicting local conventions.", "A team wants repeatable headless Claude Code automation without granting unnecessary permissions."],
      D8: ["A staging Claude application passes demos but fails intermittently on representative production-like inputs.", "A team must isolate whether a regression comes from integration code, prompt behavior, tools, or the model output itself.", "An engineer is designing evals and traces so failures can be reproduced before release."]
    }
  };

  const ccarScenarios = [
    { id:"support-agent", title:"Customer Support Resolution Agent", primary:["D1","D2","D5"], context:"A support organization is deploying a Claude Agent SDK resolution agent with customer, order, refund, and escalation tools. The target is high first-contact resolution without allowing ambiguous cases or privileged actions to bypass escalation controls." },
    { id:"claude-code-generation", title:"Code Generation with Claude Code", primary:["D3","D5"], context:"An engineering team is using Claude Code for generation, refactoring, debugging, and documentation across a shared repository. The design must keep repository guidance, permissions, planning behavior, and session context maintainable for multiple developers." },
    { id:"multi-agent-research", title:"Multi-Agent Research System", primary:["D1","D2","D5"], context:"A research platform uses a coordinator plus specialized search, analysis, synthesis, and reporting agents. The system must preserve provenance, isolate context, recover from partial failures, and keep tool access appropriate to each role." },
    { id:"developer-productivity", title:"Developer Productivity with Claude", primary:["D1","D2","D3"], context:"A platform team is building Claude-assisted developer workflows for exploring unfamiliar repositories, understanding legacy services, generating boilerplate, and automating repetitive engineering tasks using built-in tools and approved integrations." },
    { id:"claude-code-ci", title:"Claude Code for Continuous Integration", primary:["D3","D4"], context:"A CI platform invokes Claude Code for automated review, test generation, and pull-request feedback. The team must make the workflow non-interactive, reproducible, low-noise, permission-bounded, and useful to human reviewers." },
    { id:"structured-extraction", title:"Structured Data Extraction", primary:["D4","D5"], context:"A document pipeline extracts structured records from varied unstructured inputs, validates them against schemas, handles missing or ambiguous fields, and feeds downstream systems that cannot tolerate fabricated values or malformed output." }
  ];

  const detail = {
    stakes:["The output will be used immediately by another person or system.","A mistake would create rework and could affect a customer or production workflow.","The team needs a defensible decision rather than a merely plausible answer.","The design must remain auditable after the initial pilot."],
    evidence:["The team has representative examples and can compare the result with an authoritative source.","Logs and saved examples are available, but the first explanation offered by the model may be wrong.","The workflow has a clear system of record and an accountable human owner.","The team can change prompts or architecture, but must preserve existing security boundaries."]
  };

  const leadFor = (q) => {
    if (track === "ccar-f") {
      const compatible = ccarScenarios.filter(s => s.primary.includes(q.domain));
      const s = compatible.length ? compatible[hash(q.id) % compatible.length] : ccarScenarios[hash(q.id) % ccarScenarios.length];
      return `${s.context} ${detail.stakes[hash(q.id + "s") % detail.stakes.length]}`;
    }
    const pool = scenarioBits[track]?.[q.domain] || ["A team is making an applied decision with Claude in a production workflow."];
    return `${pool[hash(q.id) % pool.length]} ${detail.evidence[hash(q.id + "e") % detail.evidence.length]}`;
  };

  // Practice/adaptive drills should exercise judgment in context, not present naked fact recall.
  questions.forEach(q => {
    if (!q || q.scenarioFidelity === "foundations-v1") return;
    q.originalQuestion = q.originalQuestion || q.q;
    q.scenarioCore = stripLead(q.q);
    q.q = `${leadFor(q)} ${q.scenarioCore}`;
    q.scenarioFidelity = "foundations-v1";
  });

  const mr = (trackCode, domain, familyId, stems, choices, answers, why, choiceWhy) => ({trackCode,domain,familyId,stems,choices,answers,selectCount:answers.length,why,choiceWhy});
  const multiConcepts = [
    mr("CCAO-F","A1","FO-A1-MR",[
      "A board brief contains a revenue claim that appears only in meeting notes, while a second claim conflicts with the approved dashboard. Which TWO actions should the analyst take before the brief is used?",
      "Claude produced a polished executive summary, but one material fact lacks a source and another differs from the system of record. Which TWO steps best protect decision quality?"
    ],["Verify the material claims against authoritative sources","Keep the conflict visible until the responsible owner resolves it","Regenerate until both claims sound equally confident","Remove citations so readers focus on the recommendation","Use the longer of the two conflicting values"],[0,1],"Material claims need source verification, and unresolved conflicts should be surfaced to the accountable owner rather than hidden or averaged away.",["Correct: consequential facts should be checked against the authoritative source.","Correct: conflicting trusted evidence needs explicit resolution by the responsible source or owner.","Confidence and fluency do not establish factual correctness.","Removing provenance makes validation harder, not safer.","Length is not evidence of authority or recency."]),
    mr("CCAO-F","A2","FO-A2-MR",[
      "A team is piloting Claude inside a refund workflow. Which TWO design choices best limit risk while still producing useful learning?",
      "An operations group wants its first Claude automation to improve case handling without handing over irreversible decisions. Which TWO practices are strongest?"
    ],["Start with a bounded assistive step that has measurable outcomes","Keep human approval before consequential or irreversible actions","Automate every decision at once so the pilot reflects the final state","Use the chat transcript as the only system of record","Remove exception handling until after launch"],[0,1],"Early automation is safer and more measurable when the scope is bounded and consequential actions remain behind accountable approval.",["Correct: bounded pilots isolate value and failure modes.","Correct: approval preserves accountability at high-consequence boundaries.","Big-bang automation increases blast radius before evidence exists.","Generated conversation is not a durable operational system of record.","Edge cases should have an explicit path before launch."]),
    mr("CCAO-F","A3","FO-A3-MR",[
      "A regulated team wants Claude to summarize sensitive customer records. Which TWO controls most directly reduce governance risk?",
      "A business unit is introducing Claude into a sensitive workflow. Which TWO practices should be treated as baseline controls?"
    ],["Minimize the data to what the task actually requires","Require accountable review before sensitive or high-impact use","Paste every available record so the model has maximum context","Let instructions inside uploaded documents override policy when specific","Share one privileged account across the team for convenience"],[0,1],"Data minimization limits unnecessary exposure, while accountable review protects sensitive or consequential use from becoming an unreviewed model decision.",["Correct: unnecessary sensitive data should not enter the workflow.","Correct: high-impact output needs accountable human oversight.","More data can increase exposure without improving the task.","Untrusted content must not override trusted policy.","Shared broad credentials violate least privilege and accountability."]),
    mr("CCAO-F","A4","FO-A4-MR",[
      "A recurring executive-writing prompt produces inconsistent structure and repeatedly confuses two categories. Which TWO prompt changes are most likely to help?",
      "A team prompt is vague about output shape and misclassifies cases near a category boundary. Which TWO refinements directly address those failures?"
    ],["State the objective, audience, constraints, and output structure explicitly","Add representative examples near the category boundary","Increase temperature so Claude explores more interpretations","Remove the success criteria to avoid over-constraining the model","Ask for a longer answer without changing instructions"],[0,1],"Explicit requirements reduce ambiguity and examples clarify hard-to-describe boundaries.",["Correct: task requirements and output contracts should be explicit.","Correct: examples are useful when labels or style boundaries are subtle.","More randomness does not resolve ambiguous instructions.","Removing success criteria makes variation more likely.","Length alone does not clarify the task."]),
    mr("CCAO-F","A5","FO-A5-MR",[
      "A team is choosing how to handle a high-volume routine task with a small set of difficult exceptions. Which TWO principles should guide the choice?",
      "A department is selecting a Claude model strategy for routine work plus occasional complex cases. Which TWO considerations are most defensible?"
    ],["Use measured task quality, latency, and cost rather than model prestige","Escalate genuinely difficult cases to a more capable option when evidence justifies it","Default every request to the largest model regardless of eval results","Choose solely by the model name users recognize most","Ignore context size because all models behave the same on long inputs"],[0,1],"Model and product choice should be evidence-driven and can separate routine work from hard cases rather than paying maximum cost everywhere.",["Correct: selection should follow measured requirements.","Correct: selective escalation concentrates capability where it adds value.","Largest-by-default ignores cost and measured sufficiency.","Brand familiarity is not a task-quality criterion.","Context characteristics can materially affect reliability and cost."]),
    mr("CCAO-F","A6","FO-A6-MR",[
      "A team produces the same weekly update from an approved template, glossary, and changing source material. Which TWO practices best support consistency over time?",
      "A shared Claude workflow relies on durable instructions and reference files that change periodically. Which TWO configuration practices are strongest?"
    ],["Keep stable shared instructions and reference material in a maintained Project or equivalent shared configuration","Review and update the knowledge sources when the authoritative material changes","Ask every user to recreate the instructions from memory each week","Treat last month's generated answer as the new source of truth","Mix personal preferences into the shared policy instructions without review"],[0,1],"Reusable configuration should centralize stable guidance and keep its knowledge sources synchronized with authoritative changes.",["Correct: shared maintained configuration reduces prompt drift.","Correct: stale knowledge can make a consistent workflow consistently wrong.","Rebuilding from memory creates avoidable variation.","Generated output should not silently become authoritative source material.","Personal preferences should not overwrite shared policy without governance."]),
    mr("CCAO-F","A7","FO-A7-MR",[
      "A workflow that used to perform well is now inconsistent after the input mix changed. Which TWO diagnostic steps should happen before a broad redesign?",
      "Users report quality degradation on new edge cases, but the team has not yet isolated the cause. Which TWO actions are the best first investigation?"
    ],["Compare representative failing examples with previously successful cases","Identify whether the failure comes from changed inputs, instructions, source material, or review criteria","Replace every prompt and model simultaneously","Measure only response length because it is easy to track","Delete the historical examples so the team starts fresh"],[0,1],"Troubleshooting should isolate the changed variable with representative evidence before multiple components are changed at once.",["Correct: contrasting success and failure cases exposes the real difference.","Correct: failures should be classified before remediation.","Changing everything destroys diagnostic signal.","Response length is not a general quality metric.","Historical cases are valuable regression evidence."]),

    mr("CCDV-F","D1","FD-D1-MR",[
      "A production API worker may retry after rate pressure or an uncertain network outcome. Which TWO controls most directly prevent the retry path from creating a larger incident?",
      "A Claude integration sometimes retries requests after transient failures, and some requests trigger downstream writes. Which TWO engineering controls are essential?"
    ],["Use bounded backoff with jitter and concurrency control","Make external side effects idempotent or deduplicated","Retry immediately in an unbounded loop","Assume a transport timeout means the downstream action definitely failed","Store authoritative workflow state only in the model transcript"],[0,1],"Transient failures need bounded retry behavior, and ambiguous retries around side effects need idempotency or deduplication.",["Correct: bounded backoff avoids amplifying provider or downstream pressure.","Correct: idempotency prevents duplicate external effects when completion is uncertain.","Unbounded retries can worsen an outage.","A timeout can leave completion ambiguous.","Conversation context is not a durable transactional state store."]),
    mr("CCDV-F","D2","FD-D2-MR",[
      "A high-volume route must cut inference cost without losing its measured quality target. Which TWO changes are strongest candidates to evaluate first?",
      "Production traces show a large stable prompt prefix and a small percentage of unusually hard requests. Which TWO optimizations fit the evidence?"
    ],["Use prompt caching for the stable reusable prefix","Route only the difficult cases to a stronger model while keeping routine traffic on an efficient model","Move every request to the largest model","Randomize the stable prefix on every call","Increase maximum output tokens for every request regardless of need"],[0,1],"Caching attacks repeated input cost, and selective model escalation preserves capability for difficult cases without paying for it on all traffic.",["Correct: stable repeated prefixes are a core caching use case.","Correct: selective escalation balances cost and hard-case quality.","Largest-for-all works against the cost objective without evidence it is needed.","Changing the prefix prevents cache reuse.","Unused output headroom increases cost exposure without solving the identified bottleneck."]),
    mr("CCDV-F","D3","FD-D3-MR",[
      "An agent can take privileged actions and occasionally stalls on repeated tool failures. Which TWO controls should be enforced outside model judgment?",
      "A production agent needs autonomy, but the team must bound runaway execution and protect high-impact actions. Which TWO controls are most important?"
    ],["Explicit iteration, time, or tool-call limits","Human approval before privileged, destructive, or otherwise high-impact actions","Let the agent retry indefinitely if it says progress is possible","Use a longer system prompt as the only authorization boundary","Hide tool traces to reduce operational noise"],[0,1],"Operational bounds stop runaway behavior, and consequential actions need an accountable authorization boundary independent of model preference.",["Correct: deterministic budgets bound cost and failure duration.","Correct: approval protects consequential side effects.","Self-declared progress is not a reliable execution bound.","Prompt text alone is not a privileged-action authorization mechanism.","Removing traces makes diagnosis and audit harder."]),
    mr("CCDV-F","D4","FD-D4-MR",[
      "A long-running route mixes trusted instructions with retrieved content and keeps accumulating history. Which TWO changes best improve reliability?",
      "A Claude application shows context drift and occasional instruction confusion as sessions grow. Which TWO prompt/context controls directly address those symptoms?"
    ],["Clearly separate trusted instructions from untrusted or retrieved content","Prune, summarize, compact, or retrieve only context relevant to the current task","Keep every previous token forever so nothing is lost","Allow retrieved text to redefine system policy","Duplicate the full history into every tool result"],[0,1],"Trust boundaries should be explicit, and context should contain task-relevant state rather than unlimited history.",["Correct: separation reduces instruction confusion and injection risk.","Correct: context management controls cost and drift.","Unlimited history can increase noise and cost.","Retrieved data should not become higher-priority instructions.","Duplicating history worsens context bloat."]),
    mr("CCDV-F","D5","FD-D5-MR",[
      "Several tools have overlapping purposes and failures are returned as free-form text. Which TWO interface changes most directly improve tool reliability?",
      "Claude frequently chooses the wrong tool and the orchestrator cannot tell whether a failure is retryable. Which TWO changes address the root causes?"
    ],["Make tool names, descriptions, inputs, and boundaries explicit and non-overlapping","Return structured error categories with retry or correction semantics","Add more overlapping tools so every edge case has a separate option","Return an empty success object for failures","Grant every tool administrator privileges to eliminate permission errors"],[0,1],"Clear capability boundaries improve selection, while typed failures let deterministic orchestration choose the right recovery path.",["Correct: precise differentiated tools reduce selection ambiguity.","Correct: structured errors support bounded remediation.","More overlapping tools usually worsen ambiguity.","Hiding errors causes unsafe continuation.","Broad privileges increase blast radius rather than improving interface quality."]),
    mr("CCDV-F","D6","FD-D6-MR",[
      "A Claude application consumes untrusted documents and can call tools with external side effects. Which TWO controls most directly reduce prompt-injection impact?",
      "A security review finds that untrusted content can influence privileged actions. Which TWO defenses should be implemented at the execution boundary?"
    ],["Treat untrusted content as data that cannot override trusted instructions","Enforce least privilege and independent authorization for tool actions","Tell users not to include malicious text and remove other controls","Let the model decide whether its own credentials are appropriate","Give all sessions the same broad service account for consistency"],[0,1],"Prompt boundaries reduce instruction confusion, while least privilege and independent authorization limit what a compromised reasoning path can actually do.",["Correct: content should not inherit instruction authority merely because it is retrieved or uploaded.","Correct: execution controls must constrain side effects independently of the model.","User warnings are not an enforcement mechanism.","The model should not be the sole authority over its own privilege.","Shared broad credentials violate least privilege and accountability."]),
    mr("CCDV-F","D7","FD-D7-MR",[
      "A team wants consistent Claude Code behavior across developers and CI. Which TWO practices best support that goal?",
      "Claude Code works differently on each engineer's machine and the CI job has broader permissions than it needs. Which TWO changes are strongest?"
    ],["Version shared project guidance and reusable workflows with the repository","Constrain non-interactive automation to the commands and permissions required by the job","Keep all important conventions only in personal local settings","Grant CI unrestricted shell and production credentials to avoid failures","Require every engineer to paste the same prompt manually for each task"],[0,1],"Shared versioned configuration reduces drift, while bounded execution keeps automation reproducible without unnecessary privilege.",["Correct: repository-scoped guidance is maintainable and reviewable.","Correct: CI should receive only the execution surface it needs.","Personal-only configuration cannot reliably standardize a team.","Unrestricted CI privileges increase risk.","Manual prompt copying creates drift and is hard to maintain."]),
    mr("CCDV-F","D8","FD-D8-MR",[
      "A staging application regressed after several changes landed together. Which TWO evidence sources are most useful for isolating the failure?",
      "A Claude feature fails only on a subset of production-like cases. Which TWO practices best support diagnosis before another release?"
    ],["Representative saved eval cases that reproduce the failure","End-to-end traces separating request, model, tool, and application behavior","A screenshot of one successful demo","The monthly cloud bill by itself","A prompt rewrite performed before reproducing the issue"],[0,1],"Reproducible eval cases establish the symptom, and layered traces reveal where in the system the failure occurs.",["Correct: saved failing cases turn an intermittent complaint into a regression test.","Correct: traces help distinguish integration, tool, and model-output failures.","One successful demo does not isolate an intermittent regression.","Spend alone does not identify the failure layer.","Changing the system before reproducing the issue can destroy diagnostic evidence."]),

    mr("CCAR-F","D1","FA-D1-MR",[
      "A customer-resolution agent can plan dynamically, but refunds above a threshold must never execute autonomously. Which TWO architecture controls best satisfy the requirement?",
      "An autonomous service agent needs flexible reasoning while the business requires a hard boundary around expensive actions. Which TWO controls should the architect choose?"
    ],["Keep the agentic loop inside explicit iteration/time/tool budgets","Enforce the refund threshold in deterministic application logic with an approval or escalation path","Ask the model to remember the threshold in prose and otherwise run without limits","Give the agent broader permissions so it can correct its own mistakes","Suppress intermediate traces so the agent has less context"],[0,1],"Agentic reasoning can stay flexible while deterministic bounds and approval logic enforce operational and business limits.",["Correct: outer-loop budgets prevent runaway execution.","Correct: policy-critical side effects need deterministic enforcement.","Prompt memory is not a hard policy boundary.","More privilege increases blast radius.","Removing traces does not enforce the business rule."]),
    mr("CCAR-F","D2","FA-D2-MR",[
      "A platform exposes many tools to several agents, including two tools with similar purposes and one destructive capability. Which TWO design changes most improve safety and selection quality?",
      "Tool-choice errors increased after the catalog grew, and one rarely used tool can delete records. Which TWO architecture changes address the highest-risk problems?"
    ],["Reduce each agent's catalog to the capabilities relevant to its responsibility","Place destructive capability behind least privilege and explicit approval","Add more similar tools so the model can choose a more specific one","Use one unrestricted generic execute tool for every operation","Rely on tool ordering in the prompt as the security boundary"],[0,1],"Smaller relevant tool surfaces improve selection, while least privilege and approval reduce the blast radius of destructive actions.",["Correct: task-specific catalogs reduce ambiguity and privilege.","Correct: irreversible actions need enforceable authorization controls.","More overlapping tools can worsen selection ambiguity.","A generic unrestricted tool expands the action surface.","Prompt ordering is not an authorization mechanism."]),
    mr("CCAR-F","D3","FA-D3-MR",[
      "A team is standardizing Claude Code across a monorepo and CI. Which TWO configuration choices best separate durable team rules from task-specific execution?",
      "A shared repository has global standards, service-specific conventions, and a non-interactive review job. Which TWO practices create the cleanest control model?"
    ],["Version shared guidance at the narrowest appropriate repository or directory scope","Run CI with explicit non-interactive configuration and only the permissions/tools required by the job","Put every temporary ticket note into the root guidance file permanently","Keep shared standards only in one developer's personal settings","Grant CI maximum permissions so configuration never blocks it"],[0,1],"Scoped versioned guidance keeps shared behavior maintainable, while bounded non-interactive execution makes CI reproducible and safer.",["Correct: guidance scope should match where the rule applies.","Correct: automated execution should be explicit and least-privileged.","Permanent global files should not accumulate transient task noise.","Personal settings cannot reliably define team behavior.","Maximum permissions trade convenience for unnecessary risk."]),
    mr("CCAR-F","D4","FA-D4-MR",[
      "A structured extraction pipeline sometimes invents values for missing fields and occasionally returns output that downstream code cannot parse. Which TWO controls address the two failure modes most directly?",
      "A document-extraction system must preserve unknown values honestly and produce machine-valid output. Which TWO prompt/output mechanisms best support that goal?"
    ],["Use an explicit schema that permits null or a documented unknown representation where appropriate","Validate the structured response and retry with targeted error feedback when the output violates the contract","Tell the model to be confident so it avoids null values","Parse arbitrary prose with increasingly permissive regular expressions","Remove field definitions so the model can infer the schema"],[0,1],"The schema needs a valid representation for missing information, and deterministic validation must enforce the machine-consumed contract.",["Correct: nullable or explicit unknown fields prevent pressure to fabricate data.","Correct: validation and bounded corrective retries enforce structure.","Confidence instructions can increase unsupported fabrication.","Permissive prose parsing weakens the contract.","Removing field definitions increases ambiguity."]),
    mr("CCAR-F","D5","FA-D5-MR",[
      "A long-running research workflow is hitting context limits and the parent agent receives verbose subagent histories. Which TWO changes best preserve useful state without flooding the context window?",
      "A multi-agent system becomes less reliable as every worker returns its full scratch history to the coordinator. Which TWO context strategies are strongest?"
    ],["Require subagents to return concise structured results and provenance rather than their full working history","Persist durable checkpoints or summaries outside transient model context and retrieve only what the next step needs","Increase every context payload until it contains the full history of every agent","Duplicate tool outputs into both parent and child prompts for redundancy","Discard provenance so summaries are shorter"],[0,1],"Context isolation is preserved by concise contracts and external durable state, while relevant information can be retrieved when needed.",["Correct: subagent outputs should carry the result and evidence needed by the parent, not uncontrolled scratch history.","Correct: durable external state supports resumption without relying on a giant prompt.","Unlimited history increases cost and context pressure.","Duplication worsens the same problem.","Provenance is important for verification and should not be sacrificed merely to save tokens."])
  ];

  const conceptsFor = (code, domain) => multiConcepts.filter(x => x.trackCode === code && x.domain === domain);
  const variantFrom = (concept, rng) => {
    const idx = Math.floor(rng() * concept.stems.length) % concept.stems.length;
    return {
      id:`${concept.familyId}-${idx + 1}`,
      domain:concept.domain,
      familyId:concept.familyId,
      variantId:`scenario-${idx + 1}`,
      itemType:"multi",
      q:concept.stems[idx],
      choices:concept.choices.slice(),
      answers:concept.answers.slice(),
      selectCount:concept.selectCount,
      why:concept.why,
      choiceWhy:concept.choiceWhy.slice(),
      scenarioFidelity:"foundations-v1",
      provenance:"project-original"
    };
  };

  const familyKey = q => q?.familyId || q?.id;
  const chooseSingles = (domain, count, blockedFamilies, rng) => {
    const groups = new Map();
    questions.filter(q => q.domain === domain).forEach(q => {
      const k = familyKey(q);
      if (blockedFamilies.has(k)) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(q);
    });
    const selected = [];
    for (const [, variants] of shuf([...groups.entries()], rng)) {
      if (selected.length >= count) break;
      selected.push(shuf(variants, rng)[0]);
    }
    if (selected.length < count) {
      for (const q of shuf(questions.filter(q => q.domain === domain && !selected.includes(q)), rng)) {
        if (selected.length >= count) break;
        selected.push(q);
      }
    }
    return selected;
  };

  const buildWeighted = (rng = Math.random) => {
    const out = [];
    for (const [domain, meta] of Object.entries(profile.domains || {})) {
      const concepts = conceptsFor(profile.code, domain);
      const multis = concepts.map(c => variantFrom(c, rng));
      const blocked = new Set(multis.map(familyKey));
      const singles = chooseSingles(domain, Math.max(0, meta.mock - multis.length), blocked, rng).map(q => ({...q, itemType:"single"}));
      if (multis.length + singles.length !== meta.mock) throw new Error(`${profile.code} ${domain}: unable to build ${meta.mock}-item domain allocation`);
      out.push(...multis, ...singles);
    }
    return out;
  };

  const contextualizeCcar = (item, scenario) => {
    const core = item.scenarioCore || stripLead(item.originalQuestion || item.q);
    return {
      ...item,
      id:`${item.id}::${scenario.id}`,
      q:item.itemType === "multi" ? item.q : core,
      scenarioId:scenario.id,
      scenarioTitle:scenario.title,
      scenarioContext:scenario.context
    };
  };

  const buildCcar = (rng = Math.random) => {
    const selectedScenarios = shuf(ccarScenarios, rng).slice(0, 4);
    const items = buildWeighted(rng);
    const packs = selectedScenarios.map(s => ({scenario:s, items:[]}));
    const scarcity = (item) => selectedScenarios.filter(s => s.primary.includes(item.domain)).length;
    const ordered = items.slice().sort((a,b) => scarcity(a) - scarcity(b));
    for (const item of ordered) {
      let candidates = packs.filter(p => p.items.length < 15 && p.scenario.primary.includes(item.domain));
      if (!candidates.length) candidates = packs.filter(p => p.items.length < 15);
      candidates.sort((a,b) => a.items.length - b.items.length);
      candidates[0].items.push(contextualizeCcar(item, candidates[0].scenario));
    }
    if (packs.some(p => p.items.length !== 15)) throw new Error("CCAR-F scenario form did not resolve to four 15-item scenario blocks");
    return packs.flatMap(p => shuf(p.items, rng));
  };

  const buildFlat = (rng = Math.random) => shuf(buildWeighted(rng).map(q => ({...q})), rng);
  const summarize = items => items.reduce((acc, q) => { acc.total++; acc.byDomain[q.domain]=(acc.byDomain[q.domain]||0)+1; acc.byType[q.itemType||"single"]=(acc.byType[q.itemType||"single"]||0)+1; if(q.scenarioId) acc.scenarios.add(q.scenarioId); return acc; }, {total:0,byDomain:{},byType:{},scenarios:new Set()});

  window.FOUNDATIONS_EXAM_SIM = window.FOUNDATIONS_EXAM_SIM || {};
  window.FOUNDATIONS_EXAM_SIM[profile.code] = {
    version:"foundations-scenario-v1",
    track:profile.code,
    researchBoundary:"official-public-guide-plus-original-practice-only",
    itemFormats:["single","multi"],
    scenarioStructure:profile.code === "CCAR-F" ? "4-of-6-published-scenario-contexts" : "independent-applied-vignettes",
    publishedScenarioBank:profile.code === "CCAR-F" ? ccarScenarios.map(s => ({id:s.id,title:s.title,primary:s.primary.slice()})) : [],
    buildForm:profile.code === "CCAR-F" ? buildCcar : buildFlat,
    summarize
  };
})();
