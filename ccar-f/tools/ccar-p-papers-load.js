// Loads the CCAR-P bank, exam simulation and practice-paper sources into a fake `window` for Node
// tools and CI validators, in the same order the browser uses.
const fs = require("fs");
const path = require("path");

// Objectives for the 20 original exam-simulation items that are not bank variants
// (the bank variants map through audits/ccar-p-d*.json conceptToObjective).
const SIM_OBJECTIVES = {
  "SIM-P2-MR-01": "D1.5", "SIM-P2-MR-02": "D1.4", "SIM-P2-MATCH-01": "D1.3",
  "SIM-P6-MR-01": "D2.5", "SIM-P6-MR-02": "D2.2",
  "SIM-P1-MR-01": "D3.1", "SIM-P1-MR-02": "D3.5", "SIM-P1-MR-03": "D3.4", "SIM-P1-MATCH-01": "D3.7",
  "SIM-P3-MR-01": "D4.2", "SIM-P3-MR-02": "D4.4", "SIM-P3-MATCH-01": "D4.4", "SIM-P3-MATRIX-01": "D4.3",
  "SIM-P4-MR-01": "D5.3", "SIM-P4-MR-02": "D5.4", "SIM-P4-MATCH-01": "D5.1",
  "SIM-P5-MR-01": "D6.1", "SIM-P5-MR-02": "D6.3", "SIM-P5-MATCH-01": "D6.5",
  "SIM-P7-MR-01": "D7.1",
};

// Bank and simulation files, in index.html order; then the paper sources, in loader.js order.
const BANK_FILES = ["certifications", "ccar-p.bank-architecture", "ccar-p.d3-topup", "ccar-p.bank-enterprise", "ccar-p.d2-topup",
  "ccar-p.d5-topup", "imported/ccar-p.d3.practitioner", "ccar-p.d3-scenario-rewrite", "ccar-p.d2-scenario-rewrite",
  "ccar-p.d6-scenario-rewrite", "ccar-p.d1-scenario-rewrite", "ccar-p.d4-scenario-rewrite", "ccar-p.d5-scenario-rewrite",
  "ccar-p.d7-scenario-rewrite", "ccar-p.d1-reconcile", "ccar-p.d4-reconcile", "ccar-p.d6-reconcile", "ccar-p.d2-reconcile",
  "ccar-p.d3-reconcile", "ccar-p.exam-simulation"];
const PAPER_FILES = ["ccar-p.papers-items-p1", "ccar-p.papers-items-p2", "ccar-p.papers-items-p3", "ccar-p.papers-items-p4",
  "ccar-p.papers-items-p5", "ccar-p.papers-items-p6", "ccar-p.papers-items-p7", "ccar-p.papers-items-session",
  "ccar-p.papers-overrides", "ccar-p.drill-items-1", "ccar-p.drill-items-2"];

function loadCcarpPapers(root, { withLayout = false } = {}) {
  global.window = {};
  const load = (f) => { const p = path.join(root, f + ".js"); delete require.cache[require.resolve(p)]; require(p); };
  BANK_FILES.forEach(load);
  PAPER_FILES.forEach(load);
  if (withLayout) load("ccar-p.mock-papers-layout");
  load("ccar-p.mock-papers");
  load("cert-sources");
  load("ccar-p.sources");
  const objectivesByDomain = {};
  for (const f of fs.readdirSync(path.join(root, "audits")).filter(f => /^ccar-p-d\d\.json$/.test(f))) {
    const a = JSON.parse(fs.readFileSync(path.join(root, "audits", f), "utf8"));
    objectivesByDomain[a.internalDomain] = a.objectives.map(o => o.id);
  }
  return { window: global.window, objectivesByDomain, builder: global.window.CCARP_PAPER_BUILDER };
}

module.exports = { loadCcarpPapers, SIM_OBJECTIVES, BANK_FILES, PAPER_FILES };
