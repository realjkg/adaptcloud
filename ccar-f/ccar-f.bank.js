(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-f"] = root["ccar-f"] || {cards:[],questions:[]};
  const place=(n,correct,wrong)=>{const answer=n%4,choices=wrong.slice(0,3);choices.splice(answer,0,correct);return{choices,answer}};
  const add=(domain,contexts,concepts)=>{
    for(let i=0;i<6;i++){
      const c=concepts[Math.floor(i/contexts.length)%concepts.length],ctx=contexts[i%contexts.length];
      const id=`ARX-${domain}-${String(i+1).padStart(3,"0")}`;const p=place(i+domain.charCodeAt(1),c.correct,c.wrong);
      bank.questions.push({id,domain,q:`${ctx} ${c.ask}`,choices:p.choices,answer:p.answer,why:c.why});
    }
  };

  add("D1",[
    "An enterprise team is deciding whether to use a fixed workflow or a more autonomous agent.",
    "A production agent coordinates several steps across business systems."
  ],[
    {ask:"Which architecture is preferable when the sequence and decision branches are known in advance?",correct:"Use the simpler deterministic workflow and add autonomy only where dynamic decisions are required",wrong:["Use an open-ended agent for every step","Use multiple agents even when no specialization is needed","Let the model invent the process at runtime"],why:"Architectures should use the least autonomy needed for the task because simpler workflows are easier to test and operate."},
    {ask:"What is the strongest way to limit the impact of an agent that can take consequential actions?",correct:"Combine bounded autonomy with explicit authorization and human approval at high-impact boundaries",wrong:["Rely only on a more detailed system prompt","Remove observability so the agent can act faster","Allow unlimited iterations so the agent can self-correct"],why:"High-impact agent behavior needs bounded execution and accountable authorization outside model reasoning."},
    {ask:"A long-running orchestration may pause, retry, or resume after service failures. Where should durable workflow state live?",correct:"In an external durable state store designed for recovery and audit",wrong:["Only in the model conversation","Only in the latest tool response","Only in application memory"],why:"External durable state supports recovery, idempotency, and audit across process restarts."}
  ]);

  add("D2",[
    "An architect is designing a tool boundary for an enterprise agent.",
    "A platform team is connecting multiple internal capabilities through MCP."
  ],[
    {ask:"Which tool boundary is easiest to secure and reason about?",correct:"A narrow capability with explicit parameters, validation, and least-privilege access",wrong:["One broad tool that accepts arbitrary commands","A tool whose permissions change based only on model prose","A tool with undocumented parameters"],why:"Narrow, explicit tools reduce ambiguity and blast radius while improving authorization and testing."},
    {ask:"What should an MCP architecture keep separate from protocol connectivity?",correct:"Identity, authorization, policy enforcement, validation, and auditing",wrong:["All access-control decisions","Every business invariant","All application ownership"],why:"MCP standardizes connection patterns but does not replace enterprise security and governance controls."},
    {ask:"How should the architecture handle tool failures that may be recoverable?",correct:"Return explicit error semantics and use bounded retry or alternate paths based on the failure type",wrong:["Pretend the tool succeeded","Retry every failure forever","Hide the failure from orchestration state"],why:"Typed failure handling enables predictable recovery and avoids runaway loops."}
  ]);

  add("D3",[
    "A large repository uses Claude Code across several engineering teams.",
    "A platform team wants consistent Claude Code behavior without overloading every session context."
  ],[
    {ask:"Which information belongs in durable repository guidance?",correct:"Stable project conventions, build/test commands, architectural constraints, and workflow expectations",wrong:["Temporary details for one ticket only","Sensitive runtime values","Every historical conversation"],why:"Durable project guidance should encode stable repository-level context and conventions."},
    {ask:"When should the team prefer a deterministic hook or permission control over written guidance?",correct:"When a lifecycle rule must be enforced consistently rather than merely suggested",wrong:["When the rule is optional and stylistic only","When the team wants more prose in context","When no action needs enforcement"],why:"Hard workflow boundaries belong in deterministic controls rather than relying on model compliance alone."},
    {ask:"Why delegate a specialized subtask to a subagent?",correct:"To isolate context and return a focused result without flooding the main agent with every detail",wrong:["To remove all need for review","To guarantee every subtask is correct","To make every task multi-agent by default"],why:"Subagents are useful when specialization or context isolation improves the overall workflow."}
  ]);

  add("D4",[
    "An architecture team is standardizing prompts used across several production workflows.",
    "A downstream service consumes Claude output programmatically."
  ],[
    {ask:"What is the strongest way to make machine-consumed output reliable?",correct:"Define and validate an explicit structured output contract",wrong:["Parse free-form prose with increasingly complex regular expressions","Increase response creativity","Rely on a formatting example without validation"],why:"A structured contract is easier to validate, test, and evolve than brittle prose parsing."},
    {ask:"How should prompts separate trusted instructions from retrieved or user-provided content?",correct:"Use clear boundaries so external content remains data and cannot redefine trusted policy",wrong:["Mix all text into one unlabeled block","Let the longest section determine priority","Move policy instructions into the retrieved content"],why:"Clear prompt boundaries support reliable instruction hierarchy and reduce confusion."},
    {ask:"A prompt is reused across many routes. What change most improves maintainability?",correct:"Factor stable policy and reusable instructions into well-defined shared components with route-specific context kept separate",wrong:["Copy and independently edit the full prompt everywhere","Hide success criteria inside examples only","Allow each caller to redefine the core policy"],why:"Separating stable and variable prompt components reduces drift and simplifies evaluation."}
  ]);

  add("D5",[
    "A production agent handles long conversations and large knowledge sources.",
    "An architect is designing reliability controls for a context-heavy workflow."
  ],[
    {ask:"What is the best strategy when context grows beyond what materially helps the current task?",correct:"Prune, summarize, retrieve, or compact while preserving durable task state and relevant evidence",wrong:["Keep every token forever","Delete the current objective","Repeat old context to make it more salient"],why:"Context should be treated as a managed resource, not an unlimited transcript."},
    {ask:"How should the system recover after a partial multi-step failure?",correct:"Persist progress, classify the failure, and resume or retry only the affected step when safe",wrong:["Restart every external action blindly","Discard all state and assume nothing happened","Ask the model to guess which steps completed"],why:"Durable state and failure classification support safe, efficient recovery."},
    {ask:"What is the strongest basis for a production reliability target?",correct:"Measured service objectives and representative evals covering normal and failure cases",wrong:["A single successful demo","The model's self-reported confidence","A prompt that says the system must never fail"],why:"Reliability must be measured against representative behavior and operational objectives."}
  ]);
})();
