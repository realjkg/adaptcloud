(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"] = root["ccar-p"] || {cards:[],questions:[]};
  const SOURCE = "juanmartincoma-ccarp";
  const REVIEWED = "2026-09-15";
  const TOOL_DOC = "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview";
  const TOOL_SEARCH_DOC = "https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool";
  const MCP_DOC = "https://platform.claude.com/docs/en/agents-and-tools/mcp-connector";
  const TOOL_TROUBLE_DOC = "https://platform.claude.com/docs/en/agents-and-tools/tool-use/troubleshooting-tool-use";

  const q = (x) => ({
    ...x,
    domain:"P1",
    provenance:{
      sourceId:SOURCE,
      sourceRef:x.sourceRef,
      liveExamMaterial:false,
      recalledExamMaterial:false,
      verbatimReuse:false,
      permissionStatus:"cc-by-4.0-adaptation"
    },
    validation:{
      examGuide:"v1.0-2026-07",
      reviewedAt:REVIEWED,
      officialDocs:x.officialDocs,
      practitionerCrosscheck:["juanmartincoma-ccarp","vkorost-ccarp-guide"]
    }
  });

  const questions = [
    q({
      id:"EXT-D3-023",objectiveIds:["D3.2"],concept:"P-P1-11",familyId:"DESTRUCTIVE-TOOL-BLAST-RADIUS",variantId:"support-data-delete-v1",sourceRef:"profesional/examen.md#23",officialDocs:[TOOL_DOC,TOOL_TROUBLE_DOC],
      q:"A customer-support agent can update profiles and, in rare cases, permanently erase account records. The platform must retain the erase capability, but an agent mistake must not have organization-wide impact. Which control set is strongest?",
      choices:[
        "Limit the erase tool to the support tenant and require an approval gate before execution",
        "Keep broad credentials but add a stronger warning to the tool description",
        "Allow the call automatically and review all erase events at the end of each week",
        "Hide the erase tool near the bottom of the catalog so it is selected less often"
      ],answer:0,
      why:"Blast radius is reduced by enforcing least privilege in the execution layer and placing human approval before an irreversible action; wording and after-the-fact review are weaker controls.",
      choiceWhy:[
        "Correct: scoped credentials reduce reachable data and approval prevents an irreversible action from executing solely on model judgment.",
        "A description can influence selection but is not an authorization boundary and does not reduce credential scope.",
        "Audit is useful for detection and reconstruction, but it happens after the destructive action.",
        "Catalog position is not a security control and does not change what the tool can do."
      ]
    }),
    q({
      id:"EXT-D3-024",objectiveIds:["D3.7"],concept:"P-P1-01",familyId:"REUSABLE-ENTERPRISE-MCP",variantId:"benefits-system-v1",sourceRef:"profesional/examen.md#24",officialDocs:[MCP_DOC,TOOL_SEARCH_DOC],
      q:"Three internal assistants need access to the same employee-benefits service, and the service team expects its capabilities to change frequently. Which integration design best minimizes duplicated AI-specific integration work?",
      choices:[
        "Implement the service as a reusable MCP server maintained by the owning team",
        "Embed the service's REST calls separately inside each assistant",
        "Give every assistant direct database credentials so no connector layer is needed",
        "Create one free-text execute endpoint that accepts arbitrary operations from each assistant"
      ],answer:0,
      why:"A reusable MCP exposure fits a capability that multiple AI clients need and that will evolve under a separate owning team.",
      choiceWhy:[
        "Correct: one maintained MCP interface can be reused by multiple AI applications and evolve with the source service.",
        "Direct integrations can work, but repeating them in every assistant multiplies maintenance as the service changes.",
        "Direct database access bypasses service boundaries and expands the security/maintenance surface.",
        "A generic free-text execution surface weakens typed boundaries and makes safe tool selection harder."
      ]
    }),
    q({
      id:"EXT-D3-025",objectiveIds:["D3.4"],concept:"P-P1-08",familyId:"TRACE-CORRELATION-OBSERVABILITY",variantId:"fleet-diagnostics-v1",sourceRef:"profesional/examen.md#25",officialDocs:[TOOL_DOC],
      q:"A platform runs thousands of multi-step agent sessions per hour. Engineers can see final responses, but they cannot reconstruct why a failed session chose a particular retrieval result or tool call. What telemetry should be added first?",
      choices:[
        "Correlated structured traces that capture each step and the relevant retrieval/tool inputs and outputs",
        "A dashboard showing only request volume and average response time",
        "A complete raw prompt-and-response archive for every session with no sampling policy",
        "The Git commit author for the currently deployed service"
      ],answer:0,
      why:"Correlated traces preserve the causal sequence of an agent session and expose the intermediate retrieval/tool evidence needed to diagnose failures at scale.",
      choiceWhy:[
        "Correct: correlation plus step-level evidence makes the path to failure reconstructable.",
        "Aggregate latency and volume are useful health metrics but cannot explain a specific bad decision path.",
        "Capturing everything can be expensive and risky; structured traces with selective payload capture are more operationally useful.",
        "Deployment authorship does not reveal the model's run-time decision sequence."
      ]
    }),
    q({
      id:"EXT-D3-026",objectiveIds:["D3.3","D3.5"],concept:"P-P1-05",familyId:"RAG-RERANK-QUALITY-LATENCY",variantId:"engineering-manuals-v1",sourceRef:"profesional/examen.md#26",officialDocs:[TOOL_DOC],
      q:"A retrieval assistant often returns passages that are related to a question but not sufficient to answer it. A reranker improves grounded-answer accuracy materially, while p95 latency remains below the agreed SLA. What is the strongest architecture decision?",
      choices:[
        "Adopt the reranker, keep the latency/quality thresholds in evaluation, and monitor both in production",
        "Reject the reranker because any increase in latency is unacceptable",
        "Retrieve many more passages and rely on the model to find the useful one",
        "Raise model temperature so it can infer the missing answer from related passages"
      ],answer:0,
      why:"The measured configuration improves task quality and still satisfies the latency requirement, so adopting it with continued regression monitoring is the defensible operating point.",
      choiceWhy:[
        "Correct: Professional architecture balances measured quality and latency against explicit thresholds rather than optimizing one metric in isolation.",
        "Latency matters, but the stated SLA is still met; an absolute zero-latency-increase rule ignores the quality benefit.",
        "Flooding context with weak candidates can increase cost and noise without improving relevance.",
        "Higher sampling variability does not repair retrieval relevance or grounding."
      ]
    }),
    q({
      id:"EXT-D3-027",objectiveIds:["D3.2"],concept:"P-P1-03",familyId:"PER-USER-AUTHORIZATION",variantId:"case-files-v1",sourceRef:"profesional/examen.md#27",officialDocs:[TOOL_TROUBLE_DOC],
      q:"An assistant searches case files for many employees. Each employee is entitled to a different subset of documents, and retrieved text may itself contain adversarial instructions. Which authorization model is most defensible?",
      choices:[
        "Enforce the caller's permissions before retrieval/tool execution so the model can never obtain unauthorized documents",
        "Retrieve with a shared administrator credential and tell the model to ignore documents the caller should not see",
        "Retrieve broadly, then ask the model to redact anything that appears sensitive",
        "Use one shared credential but lower the model temperature to reduce accidental disclosure"
      ],answer:0,
      why:"Authorization must be enforced outside the model so untrusted content or prompt failure cannot grant access the caller does not possess.",
      choiceWhy:[
        "Correct: system-layer authorization makes inaccessible data unavailable to the model in the first place.",
        "Prompt instructions are not an access-control boundary and can fail under injection or ordinary model error.",
        "Post-retrieval redaction still exposes unauthorized data to the model and can itself fail.",
        "Sampling settings do not constrain data access or credential privilege."
      ]
    }),
    q({
      id:"EXT-D3-028",objectiveIds:["D3.5"],concept:"P-P1-05",familyId:"STRUCTURE-AWARE-CHUNKING",variantId:"safety-procedures-v1",sourceRef:"profesional/examen.md#28",officialDocs:[TOOL_DOC],
      q:"A RAG assistant over safety procedures frequently retrieves a requirement without the exception listed immediately after it, and many retrieved passages begin or end mid-list. What should the architect change first?",
      choices:[
        "Chunk on document structure so requirements, exceptions, and list boundaries remain semantically complete",
        "Make chunks much smaller so every match is more precise",
        "Increase retrieval from five passages to fifty on every request",
        "Switch to a larger generation model while leaving the index unchanged"
      ],answer:0,
      why:"The failure signature points to boundaries that split meaning. Structure-aware chunking preserves the units needed for correct interpretation.",
      choiceWhy:[
        "Correct: chunk boundaries should follow semantic/document structure when adjacent clauses or list items jointly determine meaning.",
        "Smaller fixed chunks can worsen fragmentation and separate more dependencies.",
        "Retrieving many fragments increases noise and cost without guaranteeing the missing linked context.",
        "A stronger model cannot reliably reconstruct context that retrieval never supplied."
      ]
    }),
    q({
      id:"EXT-D3-029",objectiveIds:["D3.1","D3.8"],concept:"P-P1-13",familyId:"PROGRESSIVE-TOOL-DISCOVERY",variantId:"ops-catalog-v1",sourceRef:"profesional/examen.md#29",officialDocs:[TOOL_SEARCH_DOC],
      q:"An operations agent has access to 70 tools, but any single request normally needs fewer than five. Evaluation shows tool-choice accuracy falling as the catalog grows. What design change most directly addresses the problem?",
      choices:[
        "Use progressive tool discovery so only a focused relevant subset is loaded for each request",
        "Load all 70 tools and increase the model's reasoning effort",
        "Replace the catalog with one generic execute tool that accepts free-text commands",
        "Duplicate the most common tools near the beginning of the list"
      ],answer:0,
      why:"Current Claude tool-search guidance explicitly addresses large catalogs by discovering and loading only relevant tools, reducing context bloat and selection confusion.",
      choiceWhy:[
        "Correct: deferred/progressive discovery reduces the visible tool surface while preserving the full platform capability set.",
        "More reasoning does not remove the context bloat or overlapping selection surface.",
        "A generic executor removes useful typed boundaries and can increase safety and validation risk.",
        "Duplicate entries increase ambiguity rather than reducing it."
      ]
    }),
    q({
      id:"EXT-D3-030",objectiveIds:["D3.5","D3.6","D3.2"],concept:"P-P1-15",familyId:"RETRIEVAL-FAILURE-DIAGNOSIS",variantId:"policy-search-v1",sourceRef:"profesional/examen.md#30",officialDocs:[TOOL_DOC],
      q:"A policy assistant has three distinct failures: exact document codes retrieve similar-but-wrong records, superseded policies still appear after refresh, and some retrieved clauses lose the definitions they reference. Which diagnosis is correct?",
      choices:[
        "The failures point respectively to search strategy, indexing/versioning, and chunking/linkage",
        "All three are generation-model quality problems",
        "All three are caused by insufficient prompt detail",
        "The failures point respectively to chunking, model size, and output-token limits"
      ],answer:0,
      why:"Exact identifiers need lexical/hybrid handling, stale versions are an indexing/versioning concern, and severed semantic dependencies are a chunking/linkage concern.",
      choiceWhy:[
        "Correct: the three symptoms occur at different retrieval-pipeline stages and should be fixed at those stages.",
        "A generation model cannot repair stale or wrong evidence selected upstream.",
        "Prompt wording does not update an index or reconnect document structure.",
        "These diagnoses do not match the observed failure mechanisms."
      ]
    }),
    q({
      id:"EXT-D3-031",objectiveIds:["D3.2","D3.6"],concept:"P-P1-12",familyId:"TENANT-AWARE-RETRIEVAL",variantId:"multi-tenant-knowledge-v1",sourceRef:"profesional/examen.md#31",officialDocs:[TOOL_TROUBLE_DOC],
      q:"A single vector index stores knowledge for many customer organizations. The application must make cross-customer disclosure structurally impossible during retrieval. What should the query path do?",
      choices:[
        "Apply authorization-derived tenant metadata filters before candidate evidence is returned to the model",
        "Search the global index and ask the model to quote only passages containing the caller's company name",
        "Search globally, then remove cross-tenant passages from the final answer after generation",
        "Depend on semantic relevance because the caller's question usually mentions the correct tenant"
      ],answer:0,
      why:"Tenant eligibility is an authorization constraint and should narrow the searchable candidate set before the model receives evidence.",
      choiceWhy:[
        "Correct: pre-model filtering enforces the caller's allowed corpus at the retrieval layer.",
        "Company-name checking is a prompt convention, not access control, and names may be absent or ambiguous.",
        "Post-generation cleanup is too late because unauthorized content has already entered model context.",
        "Relevance scoring cannot substitute for authorization."
      ]
    }),
    q({
      id:"EXT-D3-032",objectiveIds:["D3.5"],concept:"P-P1-05",familyId:"INCREMENTAL-INDEX-FRESHNESS",variantId:"handbook-edits-v1",sourceRef:"profesional/examen.md#32",officialDocs:[TOOL_DOC],
      q:"A staff handbook changes throughout the workday, and answers must reflect approved edits within minutes. Which index-maintenance pattern best fits the freshness requirement?",
      choices:[
        "Process changes incrementally as they are approved and use periodic reconciliation/full rebuilds as a safety net",
        "Rebuild the entire index once each night because batch jobs are easier to operate",
        "Cache generated answers for an hour so fewer retrievals occur",
        "Skip indexing and put the entire handbook in every request"
      ],answer:0,
      why:"Incremental change processing meets the minutes-level freshness objective, while periodic reconciliation protects against missed events or drift.",
      choiceWhy:[
        "Correct: event/change-driven updates satisfy freshness and reconciliation protects index integrity.",
        "A nightly rebuild cannot meet a requirement measured in minutes.",
        "Answer caching makes stale information persist longer rather than improving freshness.",
        "Sending the whole corpus each time is costly and does not provide a scalable index-maintenance strategy."
      ]
    }),
    q({
      id:"EXT-D3-033",objectiveIds:["D3.1"],concept:"P-P1-13",familyId:"TOOL-BOUNDARY-DISAMBIGUATION",variantId:"records-tools-v1",sourceRef:"profesional/examen.md#33",officialDocs:[TOOL_SEARCH_DOC,TOOL_DOC],
      q:"An agent repeatedly chooses the wrong one of three record-retrieval tools because their purposes overlap and their descriptions are nearly identical. Which remediation is strongest?",
      choices:[
        "Clarify each tool's inputs, outputs, and boundary, then consolidate tools whose responsibilities genuinely overlap",
        "Split each existing tool into smaller tools so the model has more specific options",
        "Tell the model to prefer whichever tool appears first when uncertain",
        "Invoke all three tools and let the model compare their results"
      ],answer:0,
      why:"Selection reliability improves when tool boundaries are explicit and redundant capabilities are removed; adding more overlap or arbitrary ordering worsens the problem.",
      choiceWhy:[
        "Correct: clear descriptions plus removal of true overlap reduce both ambiguity and capability bloat.",
        "More tools can increase the same selection problem unless decomposition creates genuinely distinct boundaries.",
        "List order is not a principled routing rule and can institutionalize wrong calls.",
        "Calling everything increases cost, latency, and data exposure while avoiding the real design problem."
      ]
    }),
    q({
      id:"EXT-D3-034",objectiveIds:["D3.7"],concept:"P-P1-04",familyId:"INTEGRATION-MECHANISM-SELECTION",variantId:"enterprise-boundaries-v1",sourceRef:"profesional/examen.md#34",officialDocs:[MCP_DOC,TOOL_DOC],
      q:"An architect is selecting connection mechanisms for three cases: reusable internal AI access to payroll, a deterministic nightly warehouse copy, and coordination between autonomous agents owned by different companies. Which mapping is strongest?",
      choices:[
        "Payroll via MCP; warehouse copy via direct API/ETL integration; cross-company agents via an agent-to-agent protocol boundary",
        "Use MCP for all three because it standardizes every integration",
        "Use direct API calls for all three because they are simplest operationally",
        "Use agent-to-agent communication for all three so every system can negotiate dynamically"
      ],answer:0,
      why:"The mechanism should match the interaction shape: reusable AI-facing capabilities suit MCP, deterministic data movement suits direct integration, and independently operated agents need an explicit agent-to-agent boundary.",
      choiceWhy:[
        "Correct: it matches protocol choice to reuse, determinism, and organizational trust boundaries.",
        "MCP is useful for AI-facing reusable tools, but a deterministic warehouse copy does not require model/tool discovery semantics.",
        "Direct APIs fit deterministic owned pipelines but do not provide the reusable AI-tool abstraction or autonomous cross-organization coordination pattern described.",
        "Agent-to-agent protocols add unnecessary autonomy to deterministic or centrally owned integrations."
      ]
    })
  ];

  bank.questions.push(...questions);
})();
