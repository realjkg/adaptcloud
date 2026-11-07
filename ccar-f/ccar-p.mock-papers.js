// CCAR-P fixed practice papers ("Practice exam 1-6").
// Builds the paper item pool from the original paper items (ccar-p.papers-items-*.js) and the
// existing CCAR-P bank and exam-simulation items, applies wording overrides, and places correct
// answers in balanced, deterministic positions. The paper layout (which items are in which paper)
// is generated offline by tools/build-ccar-p-papers.js and stored in ccar-p.mock-papers-layout.js.
// Runs in the browser and in Node validators (it only reads and writes `window`).
(() => {
  const VERSION = "2026-11-06-ccar-p-papers-v1";
  const PROVENANCE = {kind: "original-practice", liveExamContent: false, source: "adaptcloud-ccar-p-papers"};

  // Small deterministic PRNG (mulberry32) seeded from a string.
  const seedOf = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let a = seedOf(seed); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const PAIRS = [[0,1],[0,2],[0,3],[0,4],[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
  // A balanced, shuffled sequence of n target slots drawn from `values`.
  const balanced = (values, n, seed) => { const out = []; while (out.length < n) out.push(...shuffle(values, rng(seed + ":" + out.length))); return shuffle(out.slice(0, n), rng(seed + ":final")); };

  // Place choices so the correct ones land at the target positions; distractor order is seeded.
  function arrange(choices, whys, correctIdx, targets, seed) {
    const r = rng(seed);
    const wrong = shuffle(choices.map((_, i) => i).filter(i => !correctIdx.includes(i)), r);
    const order = new Array(choices.length);
    targets.forEach((pos, k) => { order[pos] = correctIdx[k]; });
    let w = 0;
    for (let pos = 0; pos < order.length; pos++) if (order[pos] === undefined) order[pos] = wrong[w++];
    return {choices: order.map(i => choices[i]), choiceWhy: order.map(i => whys[i]), answers: targets.slice().sort((a, b) => a - b)};
  }

  function fromRaw(it, domain) {
    const base = {id: it.id, domain, objectiveId: it.o, q: it.q, why: it.w, family: it.id, origin: it.d ? "session-bank" : "new",
      provenance: {...PROVENANCE, ...(it.src ? {documentation: it.src} : {})}, examSimulation: {version: VERSION, liveExamContent: false}};
    if (it.t === "s") return {...base, itemType: "single", _choices: [it.c[0], ...it.x.map(x => x[0])], _whys: [it.c[1], ...it.x.map(x => x[1])], _correct: [0]};
    if (it.t === "m") return {...base, itemType: "multi", selectCount: 2, _choices: [...it.c.map(c => c[0]), ...it.x.map(x => x[0])], _whys: [...it.c.map(c => c[1]), ...it.x.map(x => x[1])], _correct: [0, 1]};
    if (it.t === "c") return {...base, itemType: "matching", prompts: it.rows.map(r => r[0]), options: it.opts.slice(), answers: it.rows.map(r => r[1]), rowWhy: it.rows.map(r => r[2])};
    if (it.t === "x") return {...base, itemType: "matrix", statements: it.rows.map(r => r[0]), answers: it.rows.map(r => r[1]), statementWhy: it.rows.map(r => r[2])};
    throw new Error(`Unknown paper item type ${it.t} for ${it.id}`);
  }

  function fromExisting(q, overrides, whyOverrides) {
    const o = overrides[q.id] || {};
    const type = q.itemType || "single";
    const family = /^P-(P\d+-\d+)-[AB]$/.exec(q.id)?.[1] || /^P-(P\d+-\d+)$/.exec(q.concept || "")?.[1] || q.id;
    const base = {id: "PX-" + q.id, sourceQuestionId: q.id, domain: q.domain, q: q.q, why: q.why, family, origin: "existing-bank",
      provenance: {...PROVENANCE, source: "adaptcloud-ccar-p-bank", reusedFrom: q.id}, examSimulation: {version: VERSION, liveExamContent: false}};
    if (type === "single" || type === "multi") {
      const choices = q.choices.map((c, i) => o[i] !== undefined ? o[i] : c);
      const correct = type === "single" ? [q.answer] : q.answers.slice();
      return {...base, itemType: type, ...(type === "multi" ? {selectCount: q.selectCount} : {}), _choices: choices, _whys: (q.choiceWhy || whyOverrides[q.id] || []).slice(), _correct: correct};
    }
    if (type === "matching") return {...base, itemType: "matching", prompts: q.prompts.slice(), options: q.options.slice(), answers: q.answers.slice(), rowWhy: q.rowWhy.slice()};
    if (type === "matrix") return {...base, itemType: "matrix", statements: q.statements.slice(), answers: q.answers.slice(), statementWhy: q.statementWhy.slice()};
    throw new Error(`Unsupported item type ${type} for ${q.id}`);
  }

  function buildPool() {
    const raw = window.CCARP_PAPER_ITEMS_RAW || {};
    const overrides = window.CCARP_PAPER_TEXT_OVERRIDES || {};
    const whyOverrides = window.CCARP_PAPER_WHY_OVERRIDES || {};
    const bank = window.CLAUDE_CERT_BANK_EXPANSIONS?.["ccar-p"]?.questions || [];
    const sim = window.CCARP_EXAM_SIM;
    const items = [];
    for (const [key, list] of Object.entries(raw)) for (const it of list) items.push(fromRaw(it, it.d || key));
    for (const q of bank) if (/-B$/.test(q.id) || /^EXT-/.test(q.id)) items.push(fromExisting(q, overrides, whyOverrides));
    for (const q of sim?.items || []) if (q.itemType && q.itemType !== "single") items.push(fromExisting(q, overrides, whyOverrides));
    // Balanced answer positions per domain and item type, in stable ID order.
    const groups = {};
    for (const it of items) if (it._choices) (groups[it.domain + ":" + it.itemType] ||= []).push(it);
    for (const [g, list] of Object.entries(groups)) {
      list.sort((a, b) => a.id < b.id ? -1 : 1);
      const multi = g.endsWith(":multi");
      const targets = multi ? balanced(PAIRS.map((_, i) => i), list.length, VERSION + g) : balanced([0, 1, 2, 3], list.length, VERSION + g);
      list.forEach((it, k) => {
        const t = multi ? PAIRS[targets[k]] : [targets[k]];
        const placed = arrange(it._choices, it._whys, it._correct, t, VERSION + it.id);
        it.choices = placed.choices; it.choiceWhy = placed.choiceWhy;
        if (multi) it.answers = placed.answers; else it.answer = placed.answers[0];
        delete it._choices; delete it._whys; delete it._correct;
      });
    }
    const itemById = Object.fromEntries(items.map(it => [it.id, it]));
    if (Object.keys(itemById).length !== items.length) throw new Error("Duplicate paper item IDs");
    return {items, itemById};
  }

  const summarize = (ids, itemById) => {
    const byType = {}, byDomain = {};
    for (const id of ids) { const q = itemById[id]; if (!q) continue; byType[q.itemType] = (byType[q.itemType] || 0) + 1; byDomain[q.domain] = (byDomain[q.domain] || 0) + 1; }
    return {byType, byDomain, total: ids.length};
  };

  window.CCARP_PAPER_BUILDER = {VERSION, buildPool, summarize, rng, shuffle};

  const layout = window.CCARP_MOCK_PAPER_LAYOUT;
  if (!layout || !window.CCARP_EXAM_SIM) return;
  const {items, itemById} = buildPool();
  for (const [id, objective] of Object.entries(layout.reusedObjectives || {})) if (itemById[id] && !itemById[id].objectiveId) itemById[id].objectiveId = objective;
  const papers = layout.papers.map(p => ({id: p.id, title: p.title, ids: p.ids.slice()}));
  const missing = papers.flatMap(p => p.ids.filter(id => !itemById[id]));
  window.CCARP_MOCK_PAPERS = {
    version: VERSION, layoutVersion: layout.version, guideVersion: layout.guideVersion,
    ready: missing.length === 0, missingIds: missing,
    papers, items, itemById,
    paperById: Object.fromEntries(papers.map(p => [p.id, p])),
    summarize: (ids) => summarize(ids, itemById),
  };
})();
