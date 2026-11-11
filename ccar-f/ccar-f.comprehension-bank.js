// Adds the comprehension-grade questions (ccar-f.comprehension-items-*.js) to the CCAR-F bank.
// Answer positions are balanced and deterministic: the Nth question in ID order puts its correct answer
// at position N mod 4, and the wrong answers keep their authored order around it. Every question keeps a
// rationale per choice (choiceWhy, mirrored as rationales for the objective validator).
(() => {
  const raw = window.CCARF_COMPREHENSION_RAW || [];
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-f"] = root["ccar-f"] || {cards: [], questions: []};
  const VERSION = "2026-11-11-ccar-f-comprehension-v1";
  const sorted = raw.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  sorted.forEach((it, n) => {
    const answer = n % 4;
    const choices = it.x.map(x => x[0]), whys = it.x.map(x => x[1]);
    choices.splice(answer, 0, it.c[0]);
    whys.splice(answer, 0, it.c[1]);
    bank.questions.push({
      id: `ARC-${it.id}`, domain: it.d, objectiveId: it.o, familyId: `ARC.${it.id}`, variantId: "A",
      q: it.q, choices, answer, why: it.w, choiceWhy: whys, rationales: whys.slice(),
      sourceId: "adaptcloud-foundations-original", provenance: "project-original",
      difficulty: "comprehension", comprehensionVersion: VERSION,
    });
  });
  window.CCARF_COMPREHENSION = {version: VERSION, count: sorted.length, thirdPartyTextCopied: false};
})();
