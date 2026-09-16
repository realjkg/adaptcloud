(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"];
  if (!bank || !Array.isArray(bank.questions)) return;

  const VERSION = "2026-09-15-d2-v1";
  const conceptFamilies = {
    "P-P6-01": "D2-MODEL-SELECTION",
    "P-P6-02": "D2-PROMPT-ARCHITECTURE",
    "P-P6-03": "D2-CONTEXT-WORKING-SET",
    "P-P6-04": "D2-PROMPT-CACHING",
    "P-P6-05": "D2-STRUCTURED-OUTPUT",
    "P-P6-06": "D2-TOOL-DESCRIPTIONS",
    "P-P6-07": "D2-CONTEXT-WORKING-SET",
    "P-P6-08": "D2-UNCERTAINTY-ESCALATION",
    "P-P6-09": "D2-PROMPT-TECHNIQUE"
  };

  const canonicalFromQuestion = (q) => {
    const m = String(q.id || "").match(/^(P-P6-\d+)-[AB]$/);
    if (m && conceptFamilies[m[1]]) return conceptFamilies[m[1]];
    return q.familyId || q.concept || q.id;
  };

  const reconciled = [];
  for (const q of bank.questions) {
    if (q.domain !== "P6") continue;
    const familyId = canonicalFromQuestion(q);
    q.familyId = familyId;
    q.semanticReconciliation = {
      version: VERSION,
      officialDomain: "D2",
      canonicalFamilyId: familyId,
      disposition: "keep-as-spaced-variant"
    };
    reconciled.push(q.id);
  }

  window.CLAUDE_CERT_RECONCILIATIONS = window.CLAUDE_CERT_RECONCILIATIONS || {};
  window.CLAUDE_CERT_RECONCILIATIONS["ccar-p-d2"] = {
    version: VERSION,
    officialDomain: "D2",
    internalDomain: "P6",
    reconciledQuestionIds: reconciled,
    canonicalFamilyCount: new Set(
      bank.questions.filter(q => q.domain === "P6").map(q => q.familyId)
    ).size,
    mergedConcepts: [["P-P6-03","P-P6-07"]],
    freshnessReview: {
      reviewedAt: "2026-09-15",
      note: "Current questions do not rely on temperature, top_p, or top_k as recommended controls; those parameters are treated as freshness-sensitive and should not be introduced as timeless guidance."
    }
  };
})();
