#!/usr/bin/env node
// Validates the CCAR-F comprehension layer: the original comprehension questions, the answer-set
// repairs, and the objective-to-source map. It loads the bank in browser order into a fake `window`
// and checks:
//  - every comprehension question is well formed, original, mapped to a real objective, and has a
//    rationale for every choice; together they cover all 30 objectives;
//  - every repair entry matches a question in the bank, and repaired questions keep a rationale per choice;
//  - answer sets give nothing away: the correct answer is the longest choice in at most 40% of
//    questions and each answer position holds 20-30% of correct answers;
//  - no generic filler sentence survives in a stem;
//  - every objective and every question resolves to official Anthropic pages.
// Usage: node ccar-f/tools/validate-ccar-f-comprehension.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const errors = [];
const fail = (m) => errors.push(m);
const load = (f) => { const p = path.join(root, f + ".js"); delete require.cache[require.resolve(p)]; require(p); };

global.window = {CERT_TRACK: "ccar-f"};
["certifications", "ccar-f.bank", "ccar-f.bank-topup", "ccar-f.audit-bank", "ccar-f.comprehension-items-1",
  "ccar-f.comprehension-items-2", "ccar-f.comprehension-bank"].forEach(load);

// Base bank (gzip payload), then the expansions, as the browser assembles them.
let b64 = "";
for (const n of [1, 2, 3, 4, 5]) {
  const m = fs.readFileSync(path.join(root, `payload${n}.js`), "utf8").match(/push\("([A-Za-z0-9+/=]+)"\);/);
  if (!m) throw new Error(`Unable to read payload${n}.js`);
  b64 += m[1];
}
const base = JSON.parse(zlib.gunzipSync(Buffer.from(b64, "base64")));
const expansion = window.CLAUDE_CERT_BANK_EXPANSIONS["ccar-f"];
window.CCARF_QUESTIONS = [...(base.questions || []), ...expansion.questions].map(q => ({...q, choices: q.choices && [...q.choices]}));
["ccar-f-foundations-complexity", "ccar-f-complexity-position-balance", "ccar-f.answer-repair-1", "ccar-f.answer-repair-2",
  "ccar-f.answer-repair-3", "ccar-f.answer-repair-4", "ccar-f.answer-repair", "cert-sources", "ccar-f.sources"].forEach(load);
const questions = window.CCARF_QUESTIONS;

const audit = JSON.parse(fs.readFileSync(path.join(root, "audits", "ccar-f.json"), "utf8"));
const objectiveIds = Object.values(audit.domains).flatMap(d => d.objectives.map(o => o.id));
const domainOf = Object.fromEntries(Object.entries(audit.domains).flatMap(([d, m]) => m.objectives.map(o => [o.id, d])));
const singles = (qs) => qs.filter(q => (q.itemType || "single") === "single" && Array.isArray(q.choices) && Number.isInteger(q.answer));
const filled = (s) => typeof s === "string" && s.trim().length > 0;

// No-tell checks: is the correct answer usually the longest choice, and are answer positions balanced?
function tells(label, qs) {
  const n = qs.length;
  if (!n) return fail(`${label}: no questions to check`);
  const longest = qs.filter(q => { const L = q.choices.map(c => String(c).length); return L[q.answer] === Math.max(...L) && L.filter(x => x === L[q.answer]).length === 1; }).length;
  if (longest / n > 0.4) fail(`${label}: correct answer is the longest choice in ${longest} of ${n} questions (limit 40%)`);
  const pos = [0, 0, 0, 0];
  qs.forEach(q => pos[q.answer]++);
  pos.forEach((c, i) => { if (c / n < 0.2 || c / n > 0.3) fail(`${label}: answer position ${"ABCD"[i]} holds ${c} of ${n} (expected 20-30%)`); });
  return {n, longest: `${Math.round(longest / n * 100)}%`, positions: pos.join("/")};
}

// Comprehension questions.
const comp = questions.filter(q => String(q.id).startsWith("ARC-"));
const meta = window.CCARF_COMPREHENSION || {};
if (comp.length !== meta.count || comp.length < 60) fail(`Comprehension layer has ${comp.length} questions (metadata says ${meta.count})`);
if (meta.thirdPartyTextCopied !== false) fail("Comprehension metadata must declare thirdPartyTextCopied: false");
if (new Set(comp.map(q => q.id)).size !== comp.length) fail("Duplicate comprehension question IDs");
const allText = new Set();
for (const q of questions) { const t = String(q.q || "").trim().toLowerCase(); if (comp.includes(q) && allText.has(t)) fail(`${q.id}: duplicate question text`); allText.add(t); }
for (const q of comp) {
  if (!objectiveIds.includes(q.objectiveId)) fail(`${q.id}: unknown objective ${q.objectiveId}`);
  else if (domainOf[q.objectiveId] !== q.domain) fail(`${q.id}: objective ${q.objectiveId} is not in domain ${q.domain}`);
  if (q.sourceId !== "adaptcloud-foundations-original" || q.provenance !== "project-original") fail(`${q.id}: invalid provenance`);
  if (!Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some(c => !filled(c)) || new Set(q.choices).size !== 4) fail(`${q.id}: needs four distinct choices`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) fail(`${q.id}: invalid answer index`);
  if (!Array.isArray(q.choiceWhy) || q.choiceWhy.length !== 4 || q.choiceWhy.some(w => !filled(w))) fail(`${q.id}: needs a rationale for every choice`);
  else {
    if (!/^Correct\b/.test(q.choiceWhy[q.answer])) fail(`${q.id}: the correct choice's rationale should start with "Correct."`);
    q.choiceWhy.forEach((w, i) => { if (i !== q.answer && /^Correct\b/.test(w)) fail(`${q.id}: wrong choice ${"ABCD"[i]} is explained as correct`); });
  }
  if (String(q.why || "").trim().length < 40) fail(`${q.id}: explanation too thin`);
  if (/claudecertifiedarchitects|practice-?tests?\.com|udemy|examtopics/i.test(JSON.stringify(q))) fail(`${q.id}: references a third-party question source`);
}
const covered = new Set(comp.map(q => q.objectiveId));
const missing = objectiveIds.filter(o => !covered.has(o));
if (objectiveIds.length !== 30) fail(`Audit lists ${objectiveIds.length} objectives, expected 30`);
if (missing.length) fail(`Comprehension questions miss objectives: ${missing.join(", ")}`);
const compStats = tells("Comprehension questions", comp);

// Answer-set repairs.
const repairs = window.CCARF_ANSWER_REPAIRS || [];
const repairMeta = window.CCARF_ANSWER_REPAIR || {};
const correctTexts = new Set(singles(questions).map(q => q.choices[q.answer]));
const keys = new Set();
for (const [key, r] of repairs) {
  if (keys.has(key)) fail(`Duplicate repair key: ${key.slice(0, 60)}`);
  keys.add(key);
  if (!correctTexts.has(r.c || key)) fail(`Repair key matches no bank question: ${key.slice(0, 80)}`);
  if (!filled(r.cw) || !Array.isArray(r.x) || r.x.length !== 3 || r.x.some(([t, w]) => !filled(t) || !filled(w))) fail(`Repair is malformed: ${key.slice(0, 60)}`);
}
const repaired = questions.filter(q => q.answerRepair);
if (repairMeta.available !== repairs.length || repairMeta.repaired !== repaired.length || repaired.length < repairs.length) fail(`Repair overlay applied ${repairMeta.repaired} of ${repairMeta.available} (bank has ${repairs.length} entries)`);
for (const q of repaired) if (!Array.isArray(q.choiceWhy) || q.choiceWhy.length !== q.choices.length || q.choiceWhy.some(w => !filled(w))) fail(`${q.id}: repaired without a rationale per choice`);
const repairStats = tells("Repaired questions", repaired);
const bankStats = tells("Whole CCAR-F bank (single answer)", singles(questions));

// Generic filler sentences that once padded stems.
const FILLER = /defensible decision rather than a merely plausible|could affect a customer or production workflow|used immediately by another person or system|must remain auditable after the initial pilot/;
const padded = questions.filter(q => FILLER.test(String(q.q || "")));
if (padded.length) fail(`${padded.length} stems still carry filler sentences, e.g. ${padded[0].id}`);

// Official sources: every objective and every question resolves to allowed hosts.
const HOSTS = new Set(["platform.claude.com", "code.claude.com", "docs.claude.com", "support.claude.com", "www.anthropic.com", "trust.anthropic.com"]);
const src = window.CERT_SOURCES?.["ccar-f"];
if (!src) fail("CERT_SOURCES['ccar-f'] is not registered");
else {
  for (const s of Object.values(src.sources)) { const host = new URL(s.url).host; if (!HOSTS.has(host)) fail(`Source ${s.url} is not on an official Anthropic host`); }
  for (const o of objectiveIds) {
    const links = src.objectiveLinks(o) || [];
    if (links.length < 2) fail(`${o}: maps to ${links.length} official pages (need at least 2)`);
    if (!src.objectiveNames?.[o]) fail(`${o}: missing a study-plan name`);
  }
  for (const o of Object.keys(src.objectives)) if (!objectiveIds.includes(o)) fail(`Source map lists unknown objective ${o}`);
  const unlinked = questions.filter(q => !(src.linksFor(q, q.objectiveId, 3) || []).length);
  if (unlinked.length) fail(`${unlinked.length} questions resolve to no official page, e.g. ${unlinked[0].id}`);
}

const report = {questions: questions.length, comprehension: compStats, repairs: {entries: repairs.length, questions: repairStats}, bank: bankStats, objectivesCovered: covered.size};
console.log(JSON.stringify(report, null, 1));
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n` + errors.map(e => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log("CCAR-F comprehension layer validated.");
