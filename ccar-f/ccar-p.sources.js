// CCAR-P objective map for the shared source catalog (cert-sources.js). Primary pages for each
// exam-guide objective, most relevant first, plus short objective names for the study plan.
(() => {
  // Primary pages for each exam-guide objective, most relevant first. D6 has little dedicated official
  // coverage; its entries point to the closest official guidance (success criteria, evals, outcomes).
  const OBJECTIVES = {
    "D1.1": ["agents", "successCriteria", "chooseCriteria"],
    "D1.2": ["agents", "contextEng", "buildEvals"],
    "D1.3": ["agents", "chainPrompts", "toolHow"],
    "D1.4": ["multiAgent", "subagentPrompting", "multiagentOrchestration"],
    "D1.5": ["agents", "chainPrompts", "stateTracking"],
    "D1.6": ["successCriteria", "costIntel", "chooseCriteria"],
    "D2.1": ["chooseMatrix", "chooseStart", "modelsTable", "effort"],
    "D2.2": ["role", "clear", "xml", "directInjection"],
    "D2.3": ["examples", "thinking", "clear", "promptOverview"],
    "D2.4": ["contextWindows", "tokenCounting", "contextEng", "compaction"],
    "D2.5": ["cacheHow", "cacheBreakpoints", "skills"],
    "D3.1": ["toolsForAgents", "toolSearch", "toolContext"],
    "D3.2": ["ccPermissions", "permissionPolicies", "sdkSecure", "authentication"],
    "D3.3": ["latency", "chooseStart", "effort"],
    "D3.4": ["otel", "ccMonitoring", "sdkObservability"],
    "D3.5": ["contextualRetrieval", "embeddings", "citations"],
    "D3.6": ["contextualRetrieval", "searchResults", "contextEng"],
    "D3.7": ["mcpConnector", "toolHow", "codeExecMcp"],
    "D3.8": ["skills", "contextEng", "toolSearch"],
    "D4.1": ["successCriteria", "commonCriteria", "buildEvals"],
    "D4.2": ["buildEvals", "evalPrinciples", "successCriteria"],
    "D4.3": ["evalPrinciples", "chooseUpgrade", "buildEvals"],
    "D4.4": ["hallucinationBasics", "hallucinationAdvanced", "chooseUpgrade"],
    "D4.5": ["cachePricing", "batch", "latency", "costIntel"],
    "D4.6": ["otel", "ccMonitoring", "cacheTracking", "usageCost"],
    "D5.1": ["directInjection", "indirectInjection", "chainSafeguards"],
    "D5.2": ["hallucinationBasics", "indirectInjection", "refusals"],
    "D5.3": ["autonomy", "permissionPolicies", "ccPermissionModes"],
    "D5.4": ["retention", "residency", "ccHipaa", "trust"],
    "D5.5": ["aup", "transparency", "rsp"],
    "D6.1": ["successCriteria", "commonCriteria", "agents"],
    "D6.2": ["chooseCriteria", "costIntel", "successCriteria"],
    "D6.3": ["successCriteria", "latency", "outcomes"],
    "D6.4": ["ccMemory", "skillsPractices", "buildEvals"],
    "D6.5": ["buildEvals", "chooseUpgrade", "otel"],
    "D7.1": ["ccSettings", "ccManaged", "ccPermissions", "ccMcp"],
    "D7.2": ["ccBestPractices", "ccWorkflows", "ccHooks", "ccGithubActions"],
    "D7.3": ["ccTroubleshooting", "ccDebugConfig", "ccMonitoring"],
  };

  const OBJECTIVE_NAMES = {
    "D1.1": "Translate business problems into Claude solutions", "D1.2": "Design end-to-end architectures", "D1.3": "Select architectural patterns",
    "D1.4": "Design multi-agent systems and orchestration", "D1.5": "Apply decomposition techniques", "D1.6": "Align solutions to business value",
    "D2.1": "Select Claude models on trade-offs", "D2.2": "Design system prompts, templates and guardrails", "D2.3": "Apply prompt engineering techniques",
    "D2.4": "Optimize context windows and token usage", "D2.5": "Implement prompt reuse (caching, modular prompts, Skills)",
    "D3.1": "Evaluate tool and agent configuration for capability bloat", "D3.2": "Analyze authentication and authorization gaps", "D3.3": "Evaluate accuracy-latency trade-offs",
    "D3.4": "Select monitoring strategies at scale", "D3.5": "Design a RAG pipeline (chunking and indexing)", "D3.6": "Match retrieval strategy to data and queries",
    "D3.7": "Select the integration mechanism (MCP, API/CLI, agent-to-agent)", "D3.8": "Progressive discovery vs. monolithic context",
    "D4.1": "Define evaluation metrics", "D4.2": "Design evaluation datasets and test frameworks", "D4.3": "Run A/B tests and iterate",
    "D4.4": "Diagnose prompt failure, hallucination and model mismatch", "D4.5": "Optimize token use, latency and cost", "D4.6": "Monitor with logging and observability",
    "D5.1": "Implement guardrails and safety controls", "D5.2": "Identify risks and failure modes", "D5.3": "Apply human-in-the-loop validation",
    "D5.4": "Ensure regulatory compliance (GDPR, HIPAA, FedRAMP)", "D5.5": "Address ethical AI (bias, fairness, transparency)",
    "D6.1": "Run structured discovery and requirements", "D6.2": "Communicate architecture decisions and trade-offs", "D6.3": "Manage feedback loops and expectations (SLAs)",
    "D6.4": "Document architectures and implementation guidance", "D6.5": "Support lifecycle phases",
    "D7.1": "Configure Claude tools and environments for teams", "D7.2": "Improve developer workflows with AI tooling", "D7.3": "Support debugging and operational issue resolution",
  };

  window.CertSources.register("ccar-p", {objectives: OBJECTIVES, names: OBJECTIVE_NAMES, verified: "2026-11-06"});
})();
