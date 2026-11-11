// Applies the CCAR-F answer-set repairs (ccar-f.answer-repair-1..4.js) to the loaded bank.
// Runs in the browser after the bank and the complexity layer are assembled and before the scenario
// layer builds exam forms, so practice questions and exam forms both show the repaired sets.
// For each question whose correct answer has a repair: the wrong answers are replaced with plausible
// alternatives, each choice gets its own rationale, an overlong correct answer may be tightened, answer
// positions are rebalanced deterministically, and generic filler sentences are removed from the stem.
(() => {
  if (window.CERT_TRACK !== "ccar-f" || !Array.isArray(window.CCARF_QUESTIONS)) return;
  const VERSION = "2026-11-11-ccar-f-answer-repair-v1";
  const repairs = new Map((window.CCARF_ANSWER_REPAIRS || []).map(([key, r]) => [key, r]));
  // Sentences the old generators appended to many stems; they add length without information.
  const FILLER = [
    "The team needs a defensible decision rather than a merely plausible answer.",
    "A mistake would create rework and could affect a customer or production workflow.",
    "The output will be used immediately by another person or system.",
    "The design must remain auditable after the initial pilot.",
  ];
  const strip = (q) => FILLER.reduce((s, f) => s.split(f).join(" "), String(q)).replace(/\s{2,}/g, " ").trim();
  const repaired = [];
  for (const q of window.CCARF_QUESTIONS) {
    if ((q.itemType || "single") !== "single" || !Array.isArray(q.choices) || !Number.isInteger(q.answer)) continue;
    const r = repairs.get(q.choices[q.answer]);
    if (!r) continue;
    repaired.push([q, r]);
  }
  repaired.sort((a, b) => a[0].id < b[0].id ? -1 : 1).forEach(([q, r], n) => {
    const answer = n % 4;
    const choices = r.x.map(x => x[0]), whys = r.x.map(x => x[1]);
    choices.splice(answer, 0, r.c || q.choices[q.answer]);
    whys.splice(answer, 0, r.cw);
    Object.assign(q, {q: strip(q.q), choices, answer, choiceWhy: whys, rationales: whys.slice(), answerRepair: VERSION});
  });
  // Filler sentences also appear in stems without a repair entry.
  for (const q of window.CCARF_QUESTIONS) if (typeof q.q === "string") q.q = strip(q.q);
  window.CCARF_ANSWER_REPAIR = {version: VERSION, repaired: repaired.length, available: repairs.size};
})();
