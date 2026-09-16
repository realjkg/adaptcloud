(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"];
  if (!bank || !Array.isArray(bank.questions)) return;

  const VERSION = "2026-09-15-d6-v1";
  const conceptFamilies = {
    "P-P5-01": "D6-STRUCTURED-DISCOVERY",
    "P-P5-02": "D6-TRADEOFF-COMMUNICATION",
    "P-P5-03": "D6-OPERATIONAL-OWNERSHIP",
    "P-P5-04": "D6-LIFECYCLE-READINESS",
    "P-P5-05": "D6-ADOPTION-FEEDBACK",
    "P-P5-06": "D6-EXECUTIVE-OUTCOMES",
    "P-P5-07": "D6-HANDOFF-GUIDANCE",
    "P-P5-08": "D6-CHANGE-GOVERNANCE",
    "P-P5-09": "D6-ROADMAP-PRIORITIZATION"
  };

  const ids=[];
  for(const q of bank.questions){
    if(q.domain!=="P5") continue;
    const m=String(q.id||"").match(/^(P-P5-\d+)-[AB]$/);
    const familyId=(m&&conceptFamilies[m[1]]) || q.familyId || q.concept || q.id;
    q.familyId=familyId;
    q.semanticReconciliation={
      version:VERSION,
      officialDomain:"D6",
      canonicalFamilyId:familyId,
      responsibilityBoundary:"stakeholder-lifecycle-decision",
      disposition:"keep-as-spaced-variant"
    };
    ids.push(q.id);
  }

  window.CLAUDE_CERT_RECONCILIATIONS=window.CLAUDE_CERT_RECONCILIATIONS||{};
  window.CLAUDE_CERT_RECONCILIATIONS["ccar-p-d6"]={
    version:VERSION,
    officialDomain:"D6",
    internalDomain:"P5",
    reconciledQuestionIds:ids,
    canonicalFamilyCount:new Set(bank.questions.filter(q=>q.domain==="P5").map(q=>q.familyId)).size,
    boundaryRule:"Count D6 mastery when the learner must discover, communicate, align, hand off, govern change, or manage lifecycle ownership—not merely when the scenario happens to mention a technical architecture topic."
  };
})();
