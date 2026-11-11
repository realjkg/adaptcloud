// Comprehension layer for practice-exam results. Track-agnostic: it uses whatever exam.js exposes in
// window.ExamCore (sources, objectives, drill pool) and quietly skips what a track doesn't provide.
//  - Comprehension score: the score on questions that were new to you, so memory can't inflate it.
//  - Study plan: the objectives you missed, with the official pages to read for each.
//  - Targeted practice: a short drill on those objectives with instant feedback and source links,
//    drawn first from reworded bank questions that no paper uses.
(() => {
  const core = window.ExamCore;
  if (!core) return;
  const {PAPERS, objectiveOf, itemType, labelFor, safe, rationaleHtml, sourcesHtml, markSeen, shuffle} = core;
  const sources = () => core.SOURCES;
  // Answers may carry their question (Foundations forms do); otherwise look it up by ID.
  const questionOf = (a) => a.q || core.baseQuestion(a.id);
  const baseQuestion = (id) => core.baseQuestion(id) || (typeof QUESTIONS !== "undefined" ? QUESTIONS.find(q => q.id === id) : null);
  const DRILL_SIZE = 12;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const objectiveName = (o) => sources()?.objectiveNames?.[o] || o;

  // Objectives missed in an exam, most misses first.
  function missedObjectives(r) {
    const by = {};
    r.answers.forEach(a => { const q = questionOf(a), o = objectiveOf(q); if (!o) return; const s = by[o] ||= {o, missed: 0, total: 0}; s.total++; if (!a.correct) s.missed++; });
    return Object.values(by).filter(s => s.missed).sort((a, b) => b.missed - a.missed || a.o.localeCompare(b.o));
  }

  function drillIds(objectives, examAnswers) {
    const want = new Set(objectives.map(s => s.o)), qp = state.qProgress || {};
    const rank = (q) => objectives.findIndex(s => s.o === objectiveOf(q));
    // Drill pool: the track's dedicated drill set if it has one, otherwise practice-bank questions with a
    // rationale for every choice that you haven't seen yet.
    const pool = PAPERS?.drill || (typeof QUESTIONS !== "undefined" ? QUESTIONS.filter(q => Array.isArray(q.choiceWhy) && q.choiceWhy.length === q.choices?.length && !core.seenBefore(q)) : []);
    const fresh = pool.filter(q => want.has(objectiveOf(q)) && ["single", "multi"].includes(itemType(q)) && !(qp[q.id]?.correct > 0));
    // Not enough fresh questions: add exam questions you just missed, with choices reshuffled.
    const missed = examAnswers.filter(a => !a.correct).map(a => questionOf(a)).filter(q => q && ["single", "multi"].includes(itemType(q)) && baseQuestion(q.id));
    const ordered = [...shuffle(fresh).sort((a, b) => rank(a) - rank(b)), ...missed.filter(q => !fresh.includes(q))];
    return ordered.slice(0, DRILL_SIZE).map(q => q.id);
  }

  const drillAvailable = (objectives) => !!(PAPERS?.drill?.length || (typeof QUESTIONS !== "undefined" && objectives.length));
  function insightHtml(r, objectives) {
    const parts = [];
    if (Number.isInteger(r.newTotal)) {
      const seen = r.total - r.newTotal;
      parts.push(r.newTotal
        ? `<div class="insight-score"><div><strong>${pct(r.newCorrect, r.newTotal)}%</strong><span>on questions new to you</span></div><p>${r.newCorrect} of ${r.newTotal} new questions correct.${seen ? ` The other ${seen} you had seen before, so they show recall as much as understanding.` : " This is a clean read of your understanding."}</p></div>`
        : `<div class="insight-score"><div><strong>—</strong><span>no new questions</span></div><p>You had seen every question in this exam before, so this score mostly shows recall. Take an unseen paper or the adaptive mix for a clean read.</p></div>`);
    }
    if (objectives.length) {
      const rows = objectives.slice(0, 8).map(s => {
        const links = sources()?.objectiveLinks(s.o) || [];
        return `<li><div class="insight-obj"><strong>${safe(s.o)}</strong> ${safe(objectiveName(s.o))} <span class="small">missed ${s.missed} of ${s.total}</span></div>${links.length ? `<div class="source-links">${links.map(l => `<a href="${safe(l.url)}" target="_blank" rel="noopener">${safe(l.title)}${l.section ? ` · ${safe(l.section)}` : ""}</a>`).join("")}</div>` : ""}</li>`;
      }).join("");
      parts.push(`<div class="insight-plan"><h3>Study plan</h3><p class="small">The objectives you missed, with the official pages to read for each.</p><ol>${rows}</ol>${drillAvailable(objectives) ? `<button class="btn" id="startDrillBtn" type="button">Practice these objectives</button><span class="small insight-drill-note">${DRILL_SIZE} questions with instant feedback and source links</span>` : ""}</div>`);
    }
    return parts.join("");
  }

  // Drill: one question at a time, feedback after each answer.
  function runDrill(ids, back) {
    const d = {ids, pos: 0, correct: 0, done: []};
    show("quizView");
    const render = () => {
      if (d.pos >= d.ids.length) return finish();
      const q0 = baseQuestion(d.ids[d.pos]);
      // Show choices in a fresh order every time.
      const order = shuffle(q0.choices.map((_, i) => i));
      const q = {...q0, choices: order.map(i => q0.choices[i]), choiceWhy: Array.isArray(q0.choiceWhy) ? order.map(i => q0.choiceWhy[i]) : null,
        ...(itemType(q0) === "single" ? {answer: order.indexOf(q0.answer)} : {answers: q0.answers.map(i => order.indexOf(i)).sort((a, b) => a - b)})};
      const multi = itemType(q) === "multi", need = multi ? q.selectCount || q.answers.length : 1;
      quizTitle.textContent = "Targeted practice";
      quizCounter.textContent = `Question ${d.pos + 1} of ${d.ids.length} · ${safe(objectiveOf(q0) || "")} ${safe(objectiveName(objectiveOf(q0)))}`;
      quizProgress.style.width = `${(d.pos / d.ids.length) * 100}%`;
      timer.textContent = "";
      quizBody.innerHTML = `<div class="qbox drill-question"><div class="exam-item-type">${multi ? `Multiple response · Select ${need}` : "Multiple choice · Select ONE"}</div><div class="qtext">${safe(q.q)}</div><div id="choices"></div><div id="drillFeedback"></div></div>`;
      const host = document.getElementById("choices"), picked = new Set();
      q.choices.forEach((c, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "choice exam-choice"; b.textContent = `${labelFor(i)}. ${c}`;
        b.onclick = () => {
          if (host.dataset.locked) return;
          if (picked.has(i)) picked.delete(i); else picked.add(i);
          b.classList.toggle("selected", picked.has(i));
          if (picked.size === need) grade();
        };
        host.appendChild(b);
      });
      const grade = () => {
        host.dataset.locked = "1";
        const key = new Set(multi ? q.answers : [q.answer]), ok = picked.size === key.size && [...picked].every(i => key.has(i));
        [...host.children].forEach((b, i) => { b.disabled = true; if (key.has(i)) b.classList.add("correct"); else if (picked.has(i)) b.classList.add("wrong"); });
        const p = qP(q0.id); p.attempts = (p.attempts || 0) + 1; p.lastSeen = Date.now(); if (ok) p.correct = (p.correct || 0) + 1; else p.lastWrong = Date.now();
        const ds = state.domainStats[q0.domain]; if (ds) { ds.attempts++; if (ok) ds.correct++; }
        markSeen([q0]); save();
        if (ok) d.correct++;
        d.done.push({id: q0.id, correct: ok});
        const fb = document.getElementById("drillFeedback");
        fb.className = "notice drill-feedback " + (ok ? "is-right" : "is-wrong");
        fb.innerHTML = `<strong>${ok ? "Correct" : "Not quite"}</strong>${rationaleHtml(q, multi ? [...picked] : [...picked][0])}<div class="drill-actions"><button class="btn" type="button" id="drillNext">${d.pos + 1 < d.ids.length ? "Next question" : "See summary"}</button></div>`;
        if (!q.choiceWhy && !fb.querySelector(".source-links")) fb.insertAdjacentHTML("beforeend", sourcesHtml(q0));
        document.getElementById("drillNext").onclick = () => { d.pos++; render(); };
        document.getElementById("drillNext").focus();
      };
    };
    const finish = () => {
      quizTitle.textContent = "Targeted practice: summary";
      quizCounter.textContent = `${d.correct} of ${d.ids.length} correct`;
      quizProgress.style.width = "100%";
      const missed = d.done.filter(x => !x.correct).map(x => objectiveOf(baseQuestion(x.id))).filter(Boolean);
      quizBody.innerHTML = `<div class="qbox drill-summary"><h3>${pct(d.correct, d.ids.length)}% on targeted practice</h3><p>${missed.length ? `Still shaky: ${[...new Set(missed)].map(o => `<strong>${safe(o)}</strong> ${safe(objectiveName(o))}`).join(", ")}. Read the linked pages for those before your next exam.` : "Every objective in this set came back correct. Try an unseen paper or the adaptive mix next."}</p><div class="drill-actions"><button class="btn" type="button" id="drillHome">Back to home</button>${back ? '<button class="ghost" type="button" id="drillBack">Back to results</button>' : ""}</div></div>`;
      document.getElementById("drillHome").onclick = () => { show("home"); renderHome(); };
      if (back) document.getElementById("drillBack").onclick = back;
    };
    render();
  }

  // Draws the comprehension panel under the result summary. Called after any practice exam.
  function render(r) {
    const objectives = missedObjectives(r);
    let panel = document.getElementById("insightPanel");
    if (!panel) { panel = document.createElement("div"); panel.id = "insightPanel"; resultText.insertAdjacentElement("afterend", panel); }
    panel.className = "insight-panel";
    panel.innerHTML = insightHtml(r, objectives);
    const btn = document.getElementById("startDrillBtn");
    if (btn) btn.onclick = () => { const ids = drillIds(objectives, r.answers); if (ids.length) runDrill(ids, () => { show("resultView"); }); };
  }
  const baseShow = showResults;
  showResults = function (r) {
    baseShow(r);
    if (r?.mode === "mock") render(r);
  };
  window.ExamInsight = {render, missedObjectives, drillIds, runDrill, DRILL_SIZE};
})();
