// CCAR-F objective map for the shared source catalog (cert-sources.js). Primary official pages for
// each of the 30 Foundations objectives (audits/ccar-f.json), most relevant first, plus short names
// for the study plan. Checked 2026-11-11.
(() => {
  const OBJECTIVES = {
    // D1 Agentic architecture and orchestration
    "ARCH-AG-LOOPS": ["agents", "stateTracking", "stopReasons"],
    "ARCH-AG-MULTI": ["multiAgent", "agents", "subagentPrompting"],
    "ARCH-AG-SUBAGENT": ["ccSubagents", "sdkSubagents", "subagentPrompting"],
    "ARCH-AG-HANDOFF": ["agents", "permissionPolicies", "autonomy"],
    "ARCH-AG-HOOKS": ["ccHooksHow", "sdkHooks", "ccPermHooks"],
    "ARCH-AG-DECOMP": ["agents", "chainPrompts", "multiAgent"],
    "ARCH-AG-SESSION": ["stateTracking", "memoryTool", "contextEng"],
    // D2 Tool design and MCP integration
    "ARCH-TOOL-INTERFACE": ["defineTools", "toolsForAgents", "strictTools"],
    "ARCH-TOOL-ERRORS": ["toolErrors", "toolsForAgents", "defineTools"],
    "ARCH-TOOL-CHOICE": ["forceTool", "toolSearch", "toolsForAgents"],
    "ARCH-TOOL-MCP": ["mcpConnector", "ccMcp", "sdkSecure"],
    "ARCH-TOOL-BUILTIN": ["ccPermissions", "sdkPermissions", "serverTools"],
    // D3 Claude Code configuration and workflows
    "ARCH-CODE-GUIDANCE": ["ccClaudeMdScopes", "ccClaudeMdLoad", "ccImports"],
    "ARCH-CODE-COMMANDS": ["ccSkills", "ccSubagents", "skillsPractices"],
    "ARCH-CODE-RULES": ["ccPathRules", "ccClaudeMdLoad", "ccMemory"],
    "ARCH-CODE-PLAN": ["ccModes", "ccWorkflows", "ccBestPractices"],
    "ARCH-CODE-REFINE": ["ccBestPractices", "ccWorkflows", "ccTroubleshooting"],
    "ARCH-CODE-CICD": ["ccAutoApprove", "ccBare", "ccGithubActions", "ccRuleOrder"],
    // D4 Prompt engineering and structured output
    "ARCH-PROMPT-CRITERIA": ["clear", "role", "xml", "successCriteria"],
    "ARCH-PROMPT-FEWSHOT": ["examples", "promptOverview"],
    "ARCH-PROMPT-STRUCTURED": ["structured", "structuredLimits", "strictTools"],
    "ARCH-PROMPT-RETRY": ["outputFormat", "toolErrors", "stopReasons"],
    "ARCH-PROMPT-BATCH": ["batch", "cacheHow", "cachePricing"],
    "ARCH-PROMPT-REVIEW": ["chainPrompts", "evalPrinciples", "hallucinationAdvanced"],
    // D5 Context management and reliability
    "ARCH-CTX-WINDOW": ["contextWindows", "contextEng", "compaction"],
    "ARCH-CTX-ESCALATION": ["autonomy", "agents", "hallucinationBasics"],
    "ARCH-CTX-ERRORPROP": ["toolErrors", "multiAgent", "stopReasons"],
    "ARCH-CTX-EXPLORE": ["ccLargeCodebases", "ccSubagents", "ccContext"],
    "ARCH-CTX-HUMAN": ["autonomy", "permissionPolicies", "ccModes"],
    "ARCH-CTX-PROVENANCE": ["citations", "searchResults", "hallucinationBasics"],
  };
  const OBJECTIVE_NAMES = {
    "ARCH-AG-LOOPS": "Bound agentic loops", "ARCH-AG-MULTI": "Choose multi-agent designs only when warranted",
    "ARCH-AG-SUBAGENT": "Delegate to subagents with scoped context", "ARCH-AG-HANDOFF": "Enforce explicit workflow handoffs",
    "ARCH-AG-HOOKS": "Use lifecycle hooks for cross-cutting controls", "ARCH-AG-DECOMP": "Decompose tasks along real boundaries",
    "ARCH-AG-SESSION": "Persist session state and resume safely",
    "ARCH-TOOL-INTERFACE": "Design narrow, typed tool interfaces", "ARCH-TOOL-ERRORS": "Return structured, actionable tool errors",
    "ARCH-TOOL-CHOICE": "Control which tools agents get and choose", "ARCH-TOOL-MCP": "Integrate MCP with identity, authorization and audit",
    "ARCH-TOOL-BUILTIN": "Govern built-in tools by their side effects",
    "ARCH-CODE-GUIDANCE": "Organize CLAUDE.md by scope", "ARCH-CODE-COMMANDS": "Package procedures as skills or commands",
    "ARCH-CODE-RULES": "Use path-specific rules", "ARCH-CODE-PLAN": "Choose planning or direct execution",
    "ARCH-CODE-REFINE": "Iterate from tests and review evidence", "ARCH-CODE-CICD": "Run Claude Code in CI/CD with reproducible controls",
    "ARCH-PROMPT-CRITERIA": "Write explicit criteria and trusted boundaries", "ARCH-PROMPT-FEWSHOT": "Use few-shot examples for hard boundaries",
    "ARCH-PROMPT-STRUCTURED": "Use validated structured output", "ARCH-PROMPT-RETRY": "Build bounded validation and retry loops",
    "ARCH-PROMPT-BATCH": "Batch compatible workloads", "ARCH-PROMPT-REVIEW": "Use independent multi-pass review",
    "ARCH-CTX-WINDOW": "Manage the context window as a working set", "ARCH-CTX-ESCALATION": "Escalate ambiguity instead of guessing",
    "ARCH-CTX-ERRORPROP": "Propagate typed errors and confidence", "ARCH-CTX-EXPLORE": "Explore large codebases incrementally",
    "ARCH-CTX-HUMAN": "Keep human review at high-impact boundaries", "ARCH-CTX-PROVENANCE": "Preserve claim-level provenance",
  };
  // Pages for questions that predate objective IDs, by domain.
  const DOMAIN_DEFAULTS = {
    D1: ["agents", "multiAgent", "ccHooksHow"], D2: ["toolsForAgents", "defineTools", "toolErrors"],
    D3: ["ccBestPractices", "ccClaudeMdScopes", "ccPermissions"], D4: ["promptOverview", "structured", "examples"],
    D5: ["contextEng", "contextWindows", "hallucinationBasics"],
  };
  window.CertSources.register("ccar-f", {objectives: OBJECTIVES, names: OBJECTIVE_NAMES, domainDefaults: DOMAIN_DEFAULTS});
})();
