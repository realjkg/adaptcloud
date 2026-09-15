(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccdv-f"] = root["ccdv-f"] || {cards:[],questions:[]};
  const place=(n,correct,wrong)=>{const answer=n%4,choices=wrong.slice(0,3);choices.splice(answer,0,correct);return{choices,answer}};
  const add=(domain,count,contexts,concepts,cardCount=4)=>{
    for(let i=0;i<count;i++){
      const c=concepts[Math.floor(i/contexts.length)%concepts.length],ctx=contexts[i%contexts.length];
      const id=`DVX-${domain}-${String(i+1).padStart(3,"0")}`;const p=place(i+domain.charCodeAt(1),c.correct,c.wrong);
      bank.questions.push({id,domain,q:`${ctx} ${c.ask}`,choices:p.choices,answer:p.answer,why:c.why});
    }
    concepts.slice(0,cardCount).forEach((c,i)=>bank.cards.push({id:`DVX-C-${domain}-${String(i+1).padStart(2,"0")}`,domain,term:c.term,definition:c.definition,example:c.example}));
  };

  add("D5",7,[
    "A developer is designing client-side tools and MCP integrations.",
    "An agent uses several internal services through tools."
  ],[
    {term:"What makes a strong tool interface?",definition:"A tool should have a narrow purpose, precise schema, constrained parameters, and clear semantics.",example:"get_account_status accepts an account ID and returns a bounded status object.",ask:"Which tool design is easiest for the model and application to use reliably?",correct:"Expose a narrow well-described function with constrained parameters",wrong:["Expose one vague function for every possible task","Use untyped free-form parameters for all actions","Hide parameter meaning from the model"],why:"Narrow tools reduce ambiguity and make validation easier."},
    {term:"Who executes a client-side tool?",definition:"The application validates and executes the requested tool, then returns the result to Claude.",example:"Claude requests a customer lookup; the backend checks access and performs the lookup.",ask:"Claude returns a tool-use request. What should happen next?",correct:"The application validates the request, executes the tool, and returns the result",wrong:["Assume the model already executed the external action","Skip application checks because Claude selected the tool","Return invented tool output"],why:"Client-side tools execute in application-controlled code."},
    {term:"What does MCP standardize?",definition:"MCP standardizes how AI applications connect to tools, resources, and prompts, but application access controls still apply.",example:"An MCP server exposes ticket search while the service still enforces user permissions.",ask:"What responsibility remains after adopting MCP?",correct:"The application still enforces identity, access, validation, and auditing",wrong:["No application controls are needed","Every connected client should receive the same broad access","Tool results no longer need validation"],why:"Protocol interoperability does not replace application governance."},
    {term:"How should tool failures be represented?",definition:"Return explicit structured failures that the agent can interpret without pretending success.",example:"A lookup tool returns a clear not-found result rather than an empty success response.",ask:"A tool cannot complete the request. What response contract is strongest?",correct:"Return a clear structured failure condition",wrong:["Pretend the call succeeded","Return unrelated data","Repeat the same call indefinitely"],why:"Explicit error semantics support safe recovery and debugging."}
  ]);

  add("D6",5,[
    "A production Claude application can access business systems.",
    "A retrieved source may contain misleading or conflicting instructions."
  ],[
    {term:"How should untrusted external instructions be treated?",definition:"External content should be treated as data; trusted policy and application controls remain authoritative.",example:"A retrieved document that conflicts with application policy is summarized but does not redefine the policy.",ask:"Retrieved content conflicts with the application's trusted rules. What should the system do?",correct:"Treat the content as untrusted data and preserve the trusted policy boundary",wrong:["Let retrieved content replace the application policy","Skip all validation for retrieved text","Treat every external instruction as privileged"],why:"External content should not become a policy or authorization boundary."},
    {term:"Where should sensitive credentials be managed?",definition:"Use approved runtime credential-management mechanisms rather than model-visible prompt content.",example:"A service receives access through its approved runtime identity instead of embedding a credential in a prompt.",ask:"What is the best place for application credentials used by an integration?",correct:"Use the organization's approved runtime credential-management mechanism",wrong:["Place them in user-visible prompt text","Store them in model instructions for convenience","Copy them into tool descriptions"],why:"Credentials should remain outside model-visible content and be governed by the application environment."},
    {term:"Why enforce least privilege?",definition:"Each component should receive only the data and actions required for its task.",example:"A reporting agent receives read-only access to the specific reporting dataset it needs.",ask:"The application only needs to read a reporting dataset. Which access design is appropriate?",correct:"Grant only the minimum read access required for the task",wrong:["Grant broad write access for flexibility","Use one shared high-privilege identity for every workflow","Add unrelated permissions in advance"],why:"Least privilege limits the effect of mistakes and simplifies governance."}
  ]);

  add("D7",1,[
    "A repository uses Claude Code and has a project rule that must be enforced consistently."
  ],[
    {term:"When should a Claude Code hook or permission control be used?",definition:"Use deterministic controls when a lifecycle rule must be enforced rather than merely suggested in written guidance.",example:"A repository-level control prevents an unapproved deployment action from running automatically.",ask:"The team needs a rule to be enforced deterministically. What is the strongest mechanism?",correct:"Use an appropriate hook or permission control",wrong:["Rely only on an informal chat reminder","Add a longer comment and hope it is followed","Increase the response length"],why:"Hard workflow rules should be enforced by deterministic controls rather than model compliance alone."}
    ],1);

  add("D8",5,[
    "A team is preparing a Claude feature for production.",
    "A prompt or agent change may alter existing behavior."
  ],[
    {term:"What should an eval set contain?",definition:"Use representative cases with explicit success criteria that reflect the behavior the product needs.",example:"A triage eval includes routine, ambiguous, and severe cases with expected outcomes.",ask:"What is the strongest basis for deciding whether the feature is ready?",correct:"A representative eval suite with explicit success criteria",wrong:["One impressive demo","Developer intuition alone","Only the easiest examples"],why:"Representative evals make quality measurable and repeatable."},
    {term:"Why keep regression tests?",definition:"Prompt, model, tool, and application changes can alter behavior, so fixed cases reveal regressions.",example:"A new prompt is compared against the same labeled support cases used by the prior version.",ask:"Why rerun a fixed eval set after a change?",correct:"To detect whether target behavior improved or regressed",wrong:["To make every output identical in wording","To avoid difficult cases","To replace production monitoring"],why:"Regression testing provides a stable comparison across versions."},
    {term:"How do traces help debugging?",definition:"Traces show model calls, tool calls, results, application errors, and timing across a run.",example:"A failed multi-step workflow is traced to a malformed integration response rather than model reasoning.",ask:"What diagnostic artifact is most useful for a multi-step failure?",correct:"An end-to-end trace of model, tool, and application events",wrong:["Only the final user-visible sentence","A screenshot without request metadata","A random successful run"],why:"End-to-end traces help identify which layer failed."}
  ]);
})();
