(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"];
  if (!bank || !Array.isArray(bank.questions)) return;

  const VERSION = "2026-09-15-d4-v1";
  const conceptFamilies = {
    "P-P3-01": "D4-EVAL-STRATEGY",
    "P-P3-02": "D4-EVAL-DATASET",
    "P-P3-03": "D4-JUDGE-CALIBRATION",
    "P-P3-04": "D4-AB-TESTING",
    "P-P3-05": "D4-REGRESSION-GATE",
    "P-P3-06": "D4-FAILURE-TAXONOMY",
    "P-P3-07": "D4-MULTIMETRIC-OPTIMIZATION",
    "P-P3-08": "D4-REQUIREMENT-TRACEABILITY",
    "P-P3-09": "D4-PRODUCTION-FEEDBACK",
    "P-P3-10": "D4-RELEASE-THRESHOLDS"
  };

  const ids=[];
  for(const q of bank.questions){
    if(q.domain!=="P3") continue;
    const m=String(q.id||"").match(/^(P-P3-\d+)-[AB]$/);
    const familyId=(m&&conceptFamilies[m[1]]) || q.familyId || q.concept || q.id;
    q.familyId=familyId;
    q.semanticReconciliation={
      version:VERSION,
      officialDomain:"D4",
      canonicalFamilyId:familyId,
      responsibilityBoundary:"evaluation-testing-decision",
      disposition:"keep-as-spaced-variant"
    };
    ids.push(q.id);
  }

  window.CLAUDE_CERT_RECONCILIATIONS=window.CLAUDE_CERT_RECONCILIATIONS||{};
  window.CLAUDE_CERT_RECONCILIATIONS["ccar-p-d4"]={
    version:VERSION,
    officialDomain:"D4",
    internalDomain:"P3",
    reconciledQuestionIds:ids,
    canonicalFamilyCount:new Set(bank.questions.filter(q=>q.domain==="P3").map(q=>q.familyId)).size,
    boundaryRule:"D4 measures how quality is defined, tested, diagnosed, compared, optimized, monitored, and gated. Keep stakeholder reporting/alignment in D6 even when the same metrics appear in the scenario."
  };
})();
