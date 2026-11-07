#!/usr/bin/env node
// Validates the six fixed CCAR-P practice papers. Run from the repository root:
//   node ccar-f/tools/validate-ccar-p-papers.js
// Exit code 0 means every check passed.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const { loadCcarpPapers } = require("./ccar-p-papers-load.js");

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

const { window, objectivesByDomain } = loadCcarpPapers(ROOT, { withLayout: true });
const profile = window.CLAUDE_CERTIFICATIONS["ccar-p"];
const layout = window.CCARP_MOCK_PAPER_LAYOUT;
const P = window.CCARP_MOCK_PAPERS;
check(P && P.ready, `Papers not ready; missing items: ${(P?.missingIds || []).join(", ")}`);
if (!P) { console.error(problems.join("\n")); process.exit(1); }

// Objectives for reused items come from the layout.
const objectiveOf = (q) => q.objectiveId || layout.reusedObjectives[q.id];
const kind = (q) => q.itemType === "matching" || q.itemType === "matrix" ? "comp" : q.itemType;
const allObjectives = Object.values(objectivesByDomain).flat();

// 1. Shape: six papers of 63 unique items; together they use every pool item exactly once.
check(P.papers.length === 6, `Expected 6 papers, found ${P.papers.length}`);
const seen = new Map();
for (const paper of P.papers) {
  check(paper.ids.length === profile.questionCount, `${paper.id}: ${paper.ids.length} items, expected ${profile.questionCount}`);
  check(new Set(paper.ids).size === paper.ids.length, `${paper.id}: an item appears twice`);
  for (const id of paper.ids) { check(!seen.has(id), `${id} is in both ${seen.get(id)} and ${paper.id}`); seen.set(id, paper.id); }
}
check(seen.size === P.items.length, `Papers use ${seen.size} items but the pool has ${P.items.length}`);

// 2. Per-paper geometry: domain weights, item-type mix, one matrix, full objective coverage, no repeated family.
for (const paper of P.papers) {
  const qs = paper.ids.map(id => P.itemById[id]);
  const byType = { single: 0, multi: 0, matching: 0, matrix: 0 };
  qs.forEach(q => byType[q.itemType]++);
  check(byType.single === 44 && byType.multi === 14 && byType.matching === 4 && byType.matrix === 1,
    `${paper.id}: type mix ${JSON.stringify(byType)}, expected 44 single, 14 multi, 4 matching, 1 matrix`);
  for (const [d, meta] of Object.entries(profile.domains)) {
    const inD = qs.filter(q => q.domain === d);
    check(inD.length === meta.mock, `${paper.id}: ${d} has ${inD.length} items, expected ${meta.mock}`);
    const [s, m, c] = layout.typeSplit[d];
    const k = { single: 0, multi: 0, comp: 0 }; inD.forEach(q => k[kind(q)]++);
    check(k.single === s && k.multi === m && k.comp === c, `${paper.id}: ${d} type split ${JSON.stringify(k)}, expected ${s}/${m}/${c}`);
  }
  const covered = new Set(qs.map(objectiveOf));
  for (const o of allObjectives) check(covered.has(o), `${paper.id}: objective ${o} is not covered`);
  const fams = qs.map(q => q.family);
  check(new Set(fams).size === fams.length, `${paper.id}: a concept family appears twice`);
}

// 3. Item integrity and provenance.
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 3) || []);
for (const q of P.items) {
  const t = q.id;
  check(q.q && q.q.length >= 40, `${t}: question text missing or too short`);
  check(q.why && q.why.length >= 60, `${t}: explanation missing or too short`);
  check(objectiveOf(q) && allObjectives.includes(objectiveOf(q)), `${t}: unknown objective ${objectiveOf(q)}`);
  check(q.provenance?.liveExamContent === false && q.examSimulation?.liveExamContent === false, `${t}: provenance must mark it as not live exam content`);
  if (q.itemType === "single") {
    check(q.choices?.length === 4 && new Set(q.choices.map(c => c.trim().toLowerCase())).size === 4, `${t}: needs four distinct choices`);
    check(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${t}: invalid answer`);
    check(q.choiceWhy?.length === 4 && q.choiceWhy.every(w => String(w).length >= 30), `${t}: needs a rationale for every choice`);
    check(/^Correct\b/.test(q.choiceWhy[q.answer]), `${t}: rationale for the correct choice should start with "Correct"`);
  } else if (q.itemType === "multi") {
    check(q.selectCount === 2 && q.choices?.length === 5 && new Set(q.choices).size === 5, `${t}: needs five distinct choices, select two`);
    check(q.answers?.length === 2 && new Set(q.answers).size === 2 && q.answers.every(i => i >= 0 && i < 5), `${t}: invalid answers`);
    check(q.choiceWhy?.length === 5 && q.choiceWhy.every(w => String(w).length >= 25), `${t}: needs a rationale for every choice`);
    check(q.answers.every(i => /^Correct\b/.test(q.choiceWhy[i])), `${t}: rationales for correct choices should start with "Correct"`);
  } else if (q.itemType === "matching") {
    check(q.prompts?.length === 5 && q.options?.length >= 3 && q.answers?.length === 5 && q.answers.every(i => Number.isInteger(i) && i >= 0 && i < q.options.length), `${t}: malformed matching item`);
    check(q.rowWhy?.length === 5 && q.rowWhy.every(w => String(w).length >= 25), `${t}: needs a rationale for every row`);
    check(new Set(q.answers).size >= 2, `${t}: every row has the same answer`);
  } else if (q.itemType === "matrix") {
    check(q.statements?.length === 5 && q.answers?.length === 5 && q.answers.every(v => typeof v === "boolean"), `${t}: malformed matrix item`);
    check(q.statementWhy?.length === 5 && q.statementWhy.every(w => String(w).length >= 25), `${t}: needs a rationale for every statement`);
    check(q.answers.some(v => v) && q.answers.some(v => !v), `${t}: all statements have the same answer`);
  } else check(false, `${t}: unknown item type ${q.itemType}`);
}

// 4. No answer giveaways: balanced answer positions, and the correct choice is not usually the longest.
const singles = P.items.filter(q => q.itemType === "single");
const pos = [0, 0, 0, 0]; singles.forEach(q => pos[q.answer]++);
pos.forEach((n, i) => check(n / singles.length >= 0.2 && n / singles.length <= 0.3, `Answer position ${"ABCD"[i]} is used for ${n}/${singles.length} single-answer items; expected 20-30%`));
for (const paper of P.papers) {
  const ps = paper.ids.map(id => P.itemById[id]).filter(q => q.itemType === "single"), pp = [0, 0, 0, 0];
  ps.forEach(q => pp[q.answer]++);
  check(Math.max(...pp) / ps.length <= 0.4, `${paper.id}: one answer position is used for ${Math.max(...pp)}/${ps.length} single-answer items`);
}
const longest = singles.filter(q => { const L = q.choices.map(c => c.length); return L[q.answer] === Math.max(...L) && L.filter(l => l === L[q.answer]).length === 1; }).length;
check(longest / singles.length <= 0.4, `The correct choice is the longest in ${longest}/${singles.length} single-answer items; keep it at or below 40%`);
const multis = P.items.filter(q => q.itemType === "multi");
const topTwo = multis.filter(q => { const order = q.choices.map((c, i) => [c.length, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(x => x[1]); return q.answers.every(i => order.includes(i)); }).length;
check(topTwo / multis.length <= 0.4, `Both correct choices are the two longest in ${topTwo}/${multis.length} multiple-response items; keep it at or below 40%`);
const pairs = new Set(multis.map(q => q.answers.join("")));
check(pairs.size >= 8, `Multiple-response answers use only ${pairs.size} distinct pairs of positions`);

// 5. Source governance: no blocked provenance phrases, no near-duplicate stems within a paper.
const excluded = JSON.parse(fs.readFileSync(path.join(ROOT, "sources/ccar-p/excluded-sources.json"), "utf8"));
for (const q of P.items) {
  const text = JSON.stringify(q).toLowerCase();
  for (const pat of excluded.blockedPatterns) check(!text.includes(pat.toLowerCase()), `${q.id}: contains blocked phrase "${pat}"`);
}
const jac = (a, b) => { const A = words(a), B = words(b); let i = 0; for (const w of A) if (B.has(w)) i++; return i / (new Set([...A, ...B]).size || 1); };
for (const paper of P.papers) {
  const qs = paper.ids.map(id => P.itemById[id]);
  for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) {
    const s = jac(qs[i].q, qs[j].q);
    check(s < 0.6, `${paper.id}: ${qs[i].id} and ${qs[j].id} have near-duplicate question text (${s.toFixed(2)})`);
  }
}

// 6. Targeted-practice drill: reworded bank questions that no paper uses, with comprehension-grade
// answer sets (plausible alternatives, a rationale for every choice, no length or position tell).
const drill = P.drill || [];
const paperText = new Set(P.items.map(q => q.q));
check(drill.length >= 60, `Drill pool has ${drill.length} questions; expected at least 60`);
const drillObjs = new Set(drill.map(q => q.objectiveId));
for (const o of allObjectives) check(drillObjs.has(o), `Drill pool has no question for objective ${o}`);
const dpos = [0, 0, 0, 0];
let dLongest = 0;
for (const q of drill) {
  check(q.rewritten, `${q.id}: drill question has no rewritten answer set in ccar-p.drill-items-*.js`);
  check(!paperText.has(q.q), `${q.id}: drill question also appears in a paper`);
  check(q.choices.length === 4 && new Set(q.choices).size === 4 && Number.isInteger(q.answer), `${q.id}: needs four distinct choices and one answer`);
  check(q.choiceWhy?.length === 4 && q.choiceWhy.every(w => String(w).length >= 25), `${q.id}: needs a rationale for every choice`);
  check(/^Correct\b/.test(q.choiceWhy?.[q.answer] || ""), `${q.id}: rationale for the correct choice should start with "Correct"`);
  dpos[q.answer]++;
  const L = q.choices.map(c => c.length);
  if (L[q.answer] === Math.max(...L) && L.filter(l => l === L[q.answer]).length === 1) dLongest++;
}
check(dLongest / (drill.length || 1) <= 0.4, `Drill: the correct choice is the longest in ${dLongest}/${drill.length}; keep it at or below 40%`);
dpos.forEach((n, i) => check(n / (drill.length || 1) <= 0.3, `Drill: answer position ${"ABCD"[i]} is used for ${n}/${drill.length}`));

// 7. Official source links: every paper and drill question links to at least one official page.
const SRC = window.CERT_SOURCES?.["ccar-p"];
check(SRC && typeof SRC.linksFor === "function", "ccar-p.sources.js must define CERT_SOURCES['ccar-p'].linksFor");
if (SRC) {
  for (const [id, s] of Object.entries(SRC.sources)) {
    let host = "";
    try { const u = new URL(s.url); host = u.hostname; check(u.protocol === "https:", `Source ${id} must use https`); } catch { check(false, `Source ${id} has an invalid URL`); }
    check(SRC.allowedHosts.includes(host), `Source ${id} is not on an official Anthropic host: ${host}`);
    check(s.title && s.title.length >= 4, `Source ${id} needs a title`);
  }
  for (const o of allObjectives) check((SRC.objectives[o] || []).length >= 2 && SRC.objectives[o].every(id => SRC.sources[id]), `Objective ${o} needs at least two known sources`);
  for (const q of [...P.items, ...drill]) {
    const links = SRC.linksFor(q, objectiveOf(q));
    check(links.length >= 1, `${q.id}: no source link`);
  }
  check(/^\d{4}-\d{2}-\d{2}$/.test(SRC.verified), "ccar-p.sources.js needs a verified date");
}

// 8. Layout and wiring.
check(layout.builderVersion === P.version, `Layout was built with builder ${layout.builderVersion}, current builder is ${P.version}`);
const loader = fs.readFileSync(path.join(ROOT, "loader.js"), "utf8");
for (const f of ["ccar-p.papers-items-p1", "ccar-p.papers-items-session", "ccar-p.papers-overrides", "ccar-p.drill-items-1", "ccar-p.drill-items-2", "ccar-p.mock-papers-layout", "ccar-p.mock-papers", "ccar-p.sources"]) {
  const at = loader.indexOf(`"${f}"`);
  check(at >= 0 && at < loader.lastIndexOf("./exam.js"), `loader.js must load ${f}.js before exam.js`);
}
check(loader.indexOf('"ccar-p.mock-papers-layout"') < loader.indexOf('"ccar-p.mock-papers"'), "loader.js must load the layout before ccar-p.mock-papers.js");
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, "audits/ccar-p-mock-papers.json"), "utf8"));
check(audit.builderVersion === P.version && audit.layoutVersion === layout.version, "audits/ccar-p-mock-papers.json versions do not match the builder and layout");
check(audit.paperCount === P.papers.length && audit.pool?.total === P.items.length, "audits/ccar-p-mock-papers.json counts do not match the papers");
check(audit.formatReference?.questionTextUsed === false && /No live/.test(audit.contentProvenance || ""), "audits/ccar-p-mock-papers.json must keep the no-live-content boundary");
const exam = fs.readFileSync(path.join(ROOT, "exam.js"), "utf8");
check(exam.includes("CCARP_MOCK_PAPERS") && exam.includes("paperId"), "exam.js must support paper selection");
for (const token of ["sourcesHtml", "makePerm", "buildAdaptive", "newTotal", "window.ExamCore"]) check(exam.includes(token), `exam.js is missing ${token}`);
check(loader.indexOf('"./exam-insight.js"') > loader.indexOf('"./exam.js"'), "loader.js must load exam-insight.js after exam.js");

if (problems.length) { console.error(problems.map(p => "FAIL " + p).join("\n")); console.error(`${problems.length} problems`); process.exit(1); }
const counts = { single: singles.length, multi: multis.length, longest: `${longest}/${singles.length}`, positions: pos.join("/") };
console.log(`CCAR-P papers validated: ${P.papers.length} papers x ${profile.questionCount} items, ${P.items.length} unique items, every objective in every paper. ${JSON.stringify(counts)}`);
