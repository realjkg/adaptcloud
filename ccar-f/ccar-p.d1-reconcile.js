(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"];
  if (!bank || !Array.isArray(bank.questions)) return;

  const VERSION = "2026-09-15-d1-v1";
  const conceptFamilies = {
    "P-P2-01": "D1-PATTERN-SELECTION",
    "P-P2-02": "D1-BUSINESS-TRACEABILITY",
    "P-P2-03": "D1-DECOMPOSITION",
    "P-P2-04": "D1-MULTI-AGENT-ORCHESTRATION",
    "P-P2-05": "D1-DURABLE-STATE",
    "P-P2-06": "D1-PORTABLE-ARCHITECTURE",
    "P-P2-07": "D1-SCALABILITY-BACKPRESSURE",
    "P-P2-08": "D1-COST-ARCHITECTURE",
    "P-P2-09": "D1-SLA-ENGINEERING",
    "P-P2-10": "D1-ENVIRONMENT-PROMOTION",
    "P-P2-11": "D1-ARCHITECTURE-DECISION-RECORDS"
  };

  const ids=[];
  for(const q of bank.questions){
    if(q.domain!=="P2") continue;
    const m=String(q.id||"").match(/^(P-P2-\d+)-[AB]$/);
    const familyId=(m&&conceptFamilies[m[1]]) || q.familyId || q.concept || q.id;
    q.familyId=familyId;
    q.semanticReconciliation={
      version:VERSION,
      officialDomain:"D1",
      canonicalFamilyId:familyId,
      responsibilityBoundary:"solution-architecture-decision",
      disposition:"keep-as-spaced-variant"
    };
    ids.push(q.id);
  }

  window.CLAUDE_CERT_RECONCILIATIONS=window.CLAUDE_CERT_RECONCILIATIONS||{};
  window.CLAUDE_CERT_RECONCILIATIONS["ccar-p-d1"]={
    version:VERSION,
    officialDomain:"D1",
    internalDomain:"P2",
    reconciledQuestionIds:ids,
    canonicalFamilyCount:new Set(bank.questions.filter(q=>q.domain==="P2").map(q=>q.familyId)).size,
    boundaryRule:"D1 measures architecture selection and engineering. Keep technically adjacent D6 stakeholder tasks separate: engineering an SLA/component budget is D1; negotiating expectations or an achievable SLA is D6. ADR architecture reasoning is D1; transfer/handoff guidance is D6."
  };
})();
