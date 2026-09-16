(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"];
  if (!bank || !Array.isArray(bank.questions)) return;

  const VERSION = "2026-09-15-d3-v1";

  // Canonical semantic families are broader than question IDs and narrower than domains.
  // They let the adaptive engine treat genuinely equivalent reasoning tasks as one concept
  // while keeping distinct D3 skills available as separate practice material.
  const conceptFamilies = {
    "P-P1-01": "D3-INTEGRATION-BOUNDARY",
    "P-P1-02": "D3-PROGRESSIVE-DISCOVERY",
    "P-P1-03": "D3-AUTHORIZATION-PROPAGATION",
    "P-P1-04": "D3-CONNECTION-MECHANISM",
    "P-P1-05": "D3-RAG-EVIDENCE-BOUNDARY",
    "P-P1-06": "D3-ASYNC-INTEGRATION",
    "P-P1-07": "D3-IDEMPOTENT-SIDE-EFFECTS",
    "P-P1-08": "D3-CORRELATED-OBSERVABILITY",
    "P-P1-09": "D3-DATA-CONTRACT-GOVERNANCE",
    "P-P1-10": "D3-FAILURE-ISOLATION",
    "P-P1-11": "D3-DATA-RESIDENCY",
    "P-P1-12": "D3-HIGH-RISK-ACTION-CONTROLS",
    "P-P1-13": "D3-CAPABILITY-SURFACE",
    "P-P1-14": "D3-ACCURACY-LATENCY"
  };

  // P1-15 originally paired two materially different retrieval decisions under one concept.
  // Split them so hybrid/search-strategy practice does not suppress authorization-filter practice.
  const questionFamilies = {
    "P-P1-15-A": "D3-RETRIEVAL-STRATEGY",
    "P-P1-15-B": "D3-AUTHORIZED-RETRIEVAL",

    // Practitioner-derived variants reconciled to the same semantic families as equivalent
    // AdaptCloud originals. Distinct chunking/indexing/diagnosis tasks remain separate families.
    "EXT-D3-023": "D3-HIGH-RISK-ACTION-CONTROLS",
    "EXT-D3-024": "D3-CONNECTION-MECHANISM",
    "EXT-D3-025": "D3-CORRELATED-OBSERVABILITY",
    "EXT-D3-026": "D3-ACCURACY-LATENCY",
    "EXT-D3-027": "D3-AUTHORIZATION-PROPAGATION",
    "EXT-D3-028": "D3-STRUCTURE-AWARE-CHUNKING",
    "EXT-D3-029": "D3-PROGRESSIVE-DISCOVERY",
    "EXT-D3-030": "D3-RETRIEVAL-DIAGNOSIS",
    "EXT-D3-031": "D3-AUTHORIZED-RETRIEVAL",
    "EXT-D3-032": "D3-INDEX-FRESHNESS",
    "EXT-D3-033": "D3-CAPABILITY-SURFACE",
    "EXT-D3-034": "D3-CONNECTION-MECHANISM"
  };

  const dispositions = {
    "P-P1-15-B": "near-duplicate-rewrite-candidate",
    "EXT-D3-031": "near-duplicate-rewrite-candidate"
  };

  const canonicalFromQuestion = (q) => {
    if (questionFamilies[q.id]) return questionFamilies[q.id];
    const m = String(q.id || "").match(/^(P-P1-\d+)-[AB]$/);
    if (m && conceptFamilies[m[1]]) return conceptFamilies[m[1]];
    return q.familyId || q.concept || q.id;
  };

  const reconciled = [];
  for (const q of bank.questions) {
    if (q.domain !== "P1") continue;
    const familyId = canonicalFromQuestion(q);
    q.familyId = familyId;
    q.semanticReconciliation = {
      version: VERSION,
      officialDomain: "D3",
      canonicalFamilyId: familyId,
      disposition: dispositions[q.id] || "keep-as-spaced-variant"
    };
    reconciled.push(q.id);
  }

  window.CLAUDE_CERT_RECONCILIATIONS = window.CLAUDE_CERT_RECONCILIATIONS || {};
  window.CLAUDE_CERT_RECONCILIATIONS["ccar-p-d3"] = {
    version: VERSION,
    officialDomain: "D3",
    internalDomain: "P1",
    reconciledQuestionIds: reconciled,
    canonicalFamilyCount: new Set(
      bank.questions.filter(q => q.domain === "P1").map(q => q.familyId)
    ).size,
    rewriteCandidates: Object.keys(dispositions)
  };
})();
