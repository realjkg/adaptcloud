(() => {
  const seed = (window.CLAUDE_CERT_SEED_DATA || {})["ccdv-f"] || { cards: [], questions: [] };
  const expansion = (window.CLAUDE_CERT_BANK_EXPANSIONS || {})["ccdv-f"] || { cards: [], questions: [] };

  const objectives = {
    "DEV-APP-REQ": "Requirements translation",
    "DEV-APP-SLC": "Systems lifecycle management",
    "DEV-APP-API": "Claude API mechanics",
    "DEV-APP-SWE": "Software engineering foundations",
    "DEV-APP-DESIGN": "Claude application design",
    "DEV-APP-CONFIG": "Configuration management",
    "DEV-MOD-LLM": "LLM fundamentals",
    "DEV-MOD-TECH": "Technical fundamentals",
    "DEV-MOD-SELECT": "Model selection and tradeoffs",
    "DEV-MOD-COST": "Cost and token management",
    "DEV-AG-ARCH": "Agent architecture",
    "DEV-AG-BUILD": "Agent construction",
    "DEV-AG-PATTERN": "Agent patterns and frameworks",
    "DEV-PC-CONTEXT": "Context engineering",
    "DEV-PC-PROMPT": "Prompt engineering",
    "DEV-PC-OUTPUT": "Output handling",
    "DEV-TOOL-IMPL": "Tool implementation",
    "DEV-TOOL-MCP": "MCP server development",
    "DEV-TOOL-CUSTOM": "Agentic customization",
    "DEV-SEC-APP": "AI application security",
    "DEV-SEC-GUARD": "Guardrails and safe deployment",
    "DEV-SEC-HOOK": "Claude hooks for guardrails",
    "DEV-SEC-SECRET": "Identity, secrets, and key management",
    "DEV-CODE": "Claude Code operation",
    "DEV-EVAL": "Eval, testing, and debugging"
  };

  const familyObjectives = {
    "DV1.01":"DEV-APP-API", "DV1.02":"DEV-APP-API", "DV1.03":"DEV-APP-API",
    "DV1.04":"DEV-APP-DESIGN", "DV1.05":"DEV-APP-SWE", "DV1.06":"DEV-APP-DESIGN",
    "DV1.07":"DEV-APP-SWE", "DV1.08":"DEV-APP-SWE", "DV1.09":"DEV-APP-SLC",
    "DV1.10":"DEV-APP-SWE", "DV1.11":"DEV-APP-SLC",
    "DV2.01":"DEV-MOD-SELECT", "DV2.02":"DEV-MOD-SELECT", "DV2.03":"DEV-MOD-COST",
    "DV2.04":"DEV-MOD-COST", "DV2.05":"DEV-MOD-COST", "DV2.06":"DEV-MOD-SELECT",
    "DV2.07":"DEV-MOD-COST", "DV2.08":"DEV-MOD-COST",
    "DV3.01":"DEV-AG-ARCH", "DV3.02":"DEV-AG-ARCH", "DV3.03":"DEV-AG-BUILD",
    "DV3.04":"DEV-AG-BUILD", "DV3.05":"DEV-AG-PATTERN", "DV3.06":"DEV-AG-BUILD",
    "DV3.07":"DEV-AG-PATTERN",
    "DV4.01":"DEV-PC-OUTPUT", "DV4.02":"DEV-PC-PROMPT", "DV4.03":"DEV-PC-CONTEXT",
    "DV4.04":"DEV-PC-CONTEXT", "DV4.05":"DEV-PC-CONTEXT",
    "DV5.01":"DEV-TOOL-IMPL", "DV5.02":"DEV-TOOL-IMPL", "DV5.03":"DEV-TOOL-MCP",
    "DV5.04":"DEV-TOOL-IMPL",
    "DV6.01":"DEV-SEC-APP", "DV6.02":"DEV-SEC-SECRET", "DV6.03":"DEV-SEC-GUARD",
    "DV7.01":"DEV-CODE", "DV7.02":"DEV-CODE", "DV7.03":"DEV-CODE",
    "DV8.01":"DEV-EVAL", "DV8.02":"DEV-EVAL", "DV8.03":"DEV-EVAL"
  };

  const contextsPerFamily = { D1:3, D2:2, D3:2, D4:2, D5:2, D6:2, D7:1, D8:2 };
  const seedFamilies = {
    D1:["DV1.02","DV1.03","DV1.04"],
    D2:["DV2.01","DV2.03","DV2.04"],
    D3:["DV3.01","DV3.04","DV3.03"],
    D4:["DV4.01","DV4.02","DV4.03"],
    D5:["DV5.02","DV5.01","DV5.03"],
    D6:["DV6.01","DV6.02","DV6.03"],
    D7:["DV7.02","DV7.01","DV7.03"],
    D8:["DV8.01","DV8.03","DV8.02"]
  };

  function tag(item, familyId, variantId) {
    if (!item || !familyId) return;
    item.familyId = familyId;
    item.objectiveId = familyObjectives[familyId];
    if (variantId) item.variantId = variantId;
  }

  [...(seed.cards || []), ...(seed.questions || [])].forEach(item => {
    const m = String(item.id || "").match(/^DVQ?-(D[1-8])-(\d{2})$/);
    if (!m) return;
    const idx = Number(m[2]) - 1;
    tag(item, (seedFamilies[m[1]] || [])[idx], `seed-${idx + 1}`);
  });

  (expansion.questions || []).forEach(q => {
    const m = String(q.id || "").match(/^DVX-(D[1-8])-(\d{3})$/);
    if (!m) return;
    const n = Number(m[2]);
    const familyNo = Math.floor((n - 1) / contextsPerFamily[m[1]]) + 1;
    const familyId = `DV${m[1].slice(1)}.${String(familyNo).padStart(2, "0")}`;
    tag(q, familyId, `generated-${n}`);
  });

  (expansion.cards || []).forEach(card => {
    const m = String(card.id || "").match(/^DVX-C-(D[1-8])-(\d{2})$/);
    if (!m) return;
    const familyId = `DV${m[1].slice(1)}.${String(Number(m[2])).padStart(2, "0")}`;
    tag(card, familyId, `card-${m[2]}`);
  });

  window.CCDVF_FAMILY_MAP = {
    schemaVersion: "1.0",
    objectives,
    familyObjectives,
    seedFamilies,
    contextsPerFamily
  };
})();
