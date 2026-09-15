(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"] = root["ccar-p"] || {cards:[],questions:[]};
  const additions = [
    {
      id:"P1-13",term:"Capability-bloat review",
      definition:"Remove tools, permissions, and agent capabilities that are not required for the task instead of compensating for unnecessary privilege with prompts or monitoring.",
      example:"A support agent has write-capable tools that only administrators ever need.",
      q1:"A support agent exposes several write-capable tools that its users never need. What is the strongest design response?",
      a1:["Remove the unnecessary tools from the agent's available capability set","Keep the tools and add a confirmation prompt","Keep the tools and log every invocation","Use a larger model to choose tools more carefully"],
      why1:"The structural fix is to remove unnecessary capability at the source; prompts and logging do not reduce the available privilege.",
      q2:"During an enterprise tool audit, an agent has 40 tools but traces show only 9 are required for its approved workflows. What should the architect do first?",
      a2:["Reduce the exposed tool set to the approved required capabilities and retest","Retain all tools for future flexibility","Hide unused tool descriptions but leave them callable","Increase the context window so all tools remain visible"],
      why2:"Capability scope should follow task need and least privilege; unused callable tools increase attack surface and selection noise."
    },
    {
      id:"P1-14",term:"Accuracy-latency trade-off",
      definition:"Choose integration and retrieval settings by measured task quality and latency requirements, documenting why the operating point satisfies both.",
      example:"Reranking improves retrieval quality slightly but adds enough latency to threaten an interactive SLA.",
      q1:"A reranker improves retrieval accuracy by 1.5 percentage points but raises p95 latency beyond the agreed interactive SLA. What is the strongest next step?",
      a1:["Evaluate whether the quality gain justifies the SLA breach and test a lower-latency configuration against both metrics","Keep the reranker because accuracy always dominates latency","Remove retrieval entirely","Increase the SLA after deployment so the configuration passes"],
      why1:"Professional architecture treats accuracy and latency as explicit competing requirements and selects a measured operating point rather than optimizing one metric in isolation.",
      q2:"Two retrieval configurations meet the same minimum answer-quality threshold; one is materially faster and cheaper. Which choice is most defensible?",
      a2:["Prefer the faster, cheaper configuration while retaining regression tests for the quality threshold","Choose the slower configuration because more processing is always safer","Randomly alternate configurations","Ignore latency because both are accurate"],
      why2:"Once the required quality threshold is met, the lower-latency and lower-cost option is the stronger operating point unless another constraint says otherwise."
    },
    {
      id:"P1-15",term:"Retrieval-strategy selection",
      definition:"Match lexical, semantic, metadata-filtered, hybrid, and reranked retrieval to the corpus shape and query pattern rather than applying one retrieval method universally.",
      example:"A policy corpus contains exact identifiers plus natural-language guidance, and users ask both identifier lookups and conceptual questions.",
      q1:"A corpus contains exact policy IDs and semantically rich guidance. Users issue both exact-ID lookups and conceptual questions. Which retrieval strategy is strongest?",
      a1:["Use a hybrid strategy that can preserve exact matching while supporting semantic retrieval, with metadata filters where appropriate","Use semantic retrieval only and ignore exact identifiers","Use keyword search only for every query","Attach the entire corpus to each request"],
      why1:"Retrieval should reflect both the data shape and query pattern; hybrid retrieval handles exact and semantic needs more reliably than a single universal method.",
      q2:"A multi-tenant knowledge system must answer only from documents the caller is permitted to see. What should happen before similarity scoring alone determines the final evidence set?",
      a2:["Apply authorization-aware metadata filtering so ineligible documents cannot enter the candidate set","Retrieve globally and ask the model to ignore unauthorized results","Return all high-similarity documents and redact them after generation","Use a larger embedding model instead of access filters"],
      why2:"Authorization is a retrieval constraint, not a prompt preference; filtering the eligible corpus before final evidence selection prevents cross-tenant leakage."
    }
  ];
  additions.forEach(c => {
    bank.cards.push({id:`P-${c.id}-C`,domain:"P1",term:c.term,definition:c.definition,example:c.example});
    bank.questions.push(
      {id:`P-${c.id}-A`,domain:"P1",q:c.q1,choices:c.a1,answer:0,why:c.why1},
      {id:`P-${c.id}-B`,domain:"P1",q:c.q2,choices:c.a2,answer:0,why:c.why2}
    );
  });
})();
