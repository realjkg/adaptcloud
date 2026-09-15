(() => {
  const baseStartQuiz = startQuiz;
  const baseRenderQuiz = renderQuiz;
  const baseAnswer = answer;
  const baseFinishQuiz = finishQuiz;
  const baseShowResults = showResults;
  const baseResume = resume;
  const MOCK_MINUTES = 120;

  function mockState() {
    const t = state.activeQuiz;
    return t && t.mode === "mock" ? t : null;
  }

  function prepareMockState(t) {
    t.responses = t.responses || {};
    t.flags = t.flags || {};
    t.phase = t.phase || "exam";
    t.timeHidden = !!t.timeHidden;
    t.scoredIds = t.scoredIds || [];
    if (Array.isArray(t.answers) && t.answers.length) {
      t.answers.forEach(a => {
        if (a && a.id && Number.isInteger(a.choice) && t.responses[a.id] === undefined) t.responses[a.id] = a.choice;
        if (a && a.id && !t.scoredIds.includes(a.id)) t.scoredIds.push(a.id);
      });
    }
    if (t.phase !== "intro" && !t.deadline) {
      const elapsed = t.started ? Date.now() - t.started : 0;
      t.started = t.started || Date.now();
      t.deadline = Date.now() + Math.max(0, MOCK_MINUTES * 60000 - elapsed);
    }
    return t;
  }

  function counts(t) {
    let answered = 0, flagged = 0;
    t.ids.forEach(id => {
      if (t.responses[id] !== undefined && t.responses[id] !== null) answered++;
      if (t.flags[id]) flagged++;
    });
    return { answered, incomplete: t.ids.length - answered, flagged };
  }

  function startMock() {
    state.activeQuiz = {
      mode: "mock",
      ids: weightedMock(),
      pos: 0,
      answers: [],
      responses: {},
      flags: {},
      scoredIds: [],
      started: null,
      deadline: null,
      phase: "intro",
      timeHidden: false
    };
    save();
    show("quizView");
    renderMock();
  }

  startQuiz = function(mode) {
    if (mode === "mock") return startMock();
    baseStartQuiz(mode);
  };

  function beginMock() {
    const t = prepareMockState(mockState());
    if (!t) return;
    t.phase = "exam";
    t.started = Date.now();
    t.deadline = Date.now() + MOCK_MINUTES * 60000;
    t.pos = Math.min(Math.max(0, t.pos || 0), t.ids.length - 1);
    save();
    renderMock();
    startTimer();
  }

  function renderIntro() {
    clearInterval(timerHandle);
    timer.textContent = "";
    quizTitle.textContent = "Full Mock — Exam Instructions";
    quizCounter.textContent = "Proctored-style practice session";
    quizProgress.style.width = "0%";
    quizBody.innerHTML = `
      <div class="exam-intro">
        <h3>Before you begin</h3>
        <p>This mock reproduces the navigation pressure of a Pearson-delivered certification exam while using only original practice questions.</p>
        <div class="exam-intro-grid">
          <div><strong>60</strong><span>questions</span></div>
          <div><strong>120</strong><span>minutes</span></div>
          <div><strong>1</strong><span>final submission</span></div>
        </div>
        <ul>
          <li>Move backward and forward between questions.</li>
          <li>Flag any question for review, answered or unanswered.</li>
          <li>Use the Review screen to inspect all, incomplete, or flagged questions before submission.</li>
          <li>No correctness feedback or explanations appear until the exam is submitted.</li>
          <li>The timer continues while you review and auto-submits at zero.</li>
          <li>Unanswered questions count as incorrect in this simulator.</li>
        </ul>
        <div class="exam-start-row">
          <button class="btn" id="beginMockBtn">Begin Exam</button>
          <button class="ghost" id="cancelMockBtn">Return to dashboard</button>
        </div>
      </div>`;
    document.getElementById("beginMockBtn").onclick = beginMock;
    document.getElementById("cancelMockBtn").onclick = () => {
      state.activeQuiz = null;
      save();
      show("home");
      renderHome();
    };
  }

  function statusFor(t, id) {
    const answered = t.responses[id] !== undefined && t.responses[id] !== null;
    const flagged = !!t.flags[id];
    if (flagged && answered) return "answered flagged";
    if (flagged) return "flagged";
    if (answered) return "answered";
    return "unanswered";
  }

  function renderPalette(t) {
    return `<aside class="exam-palette" aria-label="Question navigator">
      <div class="exam-palette-head"><strong>Question navigator</strong><span class="small">Select a number to jump</span></div>
      <div class="exam-palette-grid">${t.ids.map((id, i) => {
        const status = statusFor(t, id);
        const current = i === t.pos ? " current" : "";
        const flag = t.flags[id] ? '<span class="flag-dot" aria-hidden="true">⚑</span>' : "";
        return `<button type="button" class="exam-qnum ${status}${current}" data-qindex="${i}" aria-label="Question ${i + 1}, ${status.replace(" ", ", ")}">${i + 1}${flag}</button>`;
      }).join("")}</div>
      <div class="exam-legend small"><span><i class="legend-box answered"></i>Answered</span><span><i class="legend-box unanswered"></i>Incomplete</span><span><i class="legend-flag">⚑</i>Flagged</span></div>
    </aside>`;
  }

  function bindPalette(t) {
    document.querySelectorAll("[data-qindex]").forEach(btn => {
      btn.onclick = () => {
        t.pos = Number(btn.dataset.qindex);
        t.phase = "exam";
        save();
        renderMock();
      };
    });
  }

  function renderQuestion(t) {
    const q = QUESTIONS.find(x => x.id === t.ids[t.pos]);
    const selected = t.responses[q.id];
    const c = counts(t);
    quizTitle.textContent = "Full Mock";
    quizCounter.textContent = `Question ${t.pos + 1} of ${t.ids.length} • ${DOMAINS[q.domain].name}`;
    quizProgress.style.width = ((t.pos + 1) / t.ids.length * 100) + "%";
    quizBody.innerHTML = `
      <div class="exam-toolbar">
        <button type="button" class="ghost exam-flag-btn ${t.flags[q.id] ? "is-flagged" : ""}" id="flagReviewBtn" aria-pressed="${t.flags[q.id] ? "true" : "false"}">${t.flags[q.id] ? "⚑ Flagged for Review" : "⚐ Flag for Review"}</button>
        <button type="button" class="ghost" id="openReviewBtn">Review (${c.incomplete} incomplete)</button>
        <button type="button" class="ghost" id="toggleTimeBtn">${t.timeHidden ? "Show time" : "Hide time"}</button>
      </div>
      <div class="exam-layout">
        <div class="qbox exam-question">
          <div class="qtext">${esc(q.q)}</div>
          <div id="choices" role="radiogroup" aria-label="Answer choices"></div>
          <div class="exam-nav"><button type="button" class="ghost" id="prevMockBtn" ${t.pos === 0 ? "disabled" : ""}>Previous</button><div class="grow"></div><button type="button" class="btn2" id="nextMockBtn">${t.pos === t.ids.length - 1 ? "Review Exam" : "Next"}</button></div>
        </div>
        ${renderPalette(t)}
      </div>`;

    q.choices.forEach((choice, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice exam-choice" + (selected === i ? " selected" : "");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", selected === i ? "true" : "false");
      b.textContent = String.fromCharCode(65 + i) + ". " + choice;
      b.onclick = () => {
        t.responses[q.id] = i;
        save();
        renderQuestion(t);
      };
      document.getElementById("choices").appendChild(b);
    });

    document.getElementById("flagReviewBtn").onclick = () => {
      t.flags[q.id] = !t.flags[q.id];
      save();
      renderQuestion(t);
    };
    document.getElementById("openReviewBtn").onclick = () => {
      t.phase = "review";
      save();
      renderReview(t, "all");
    };
    document.getElementById("toggleTimeBtn").onclick = () => {
      t.timeHidden = !t.timeHidden;
      save();
      updateTimerText();
      document.getElementById("toggleTimeBtn").textContent = t.timeHidden ? "Show time" : "Hide time";
    };
    document.getElementById("prevMockBtn").onclick = () => {
      if (t.pos > 0) { t.pos--; save(); renderMock(); }
    };
    document.getElementById("nextMockBtn").onclick = () => {
      if (t.pos < t.ids.length - 1) { t.pos++; save(); renderMock(); }
      else { t.phase = "review"; save(); renderReview(t, "all"); }
    };
    bindPalette(t);
    updateTimerText();
  }

  function reviewRows(t, filter) {
    return t.ids.map((id, i) => {
      const answered = t.responses[id] !== undefined && t.responses[id] !== null;
      const flagged = !!t.flags[id];
      if (filter === "incomplete" && answered) return "";
      if (filter === "flagged" && !flagged) return "";
      return `<button type="button" class="review-row" data-review-index="${i}"><span class="review-num">${i + 1}</span><span class="review-state ${answered ? "answered" : "incomplete"}">${answered ? "Answered" : "Incomplete"}</span><span class="review-flag">${flagged ? "⚑ Flagged" : ""}</span><span class="review-open">Open</span></button>`;
    }).join("");
  }

  function renderReview(t, filter = "all") {
    clearInterval(timerHandle);
    quizTitle.textContent = "Item Review";
    quizCounter.textContent = "Review before final submission";
    quizProgress.style.width = "100%";
    const c = counts(t);
    quizBody.innerHTML = `
      <div class="exam-review">
        <div class="review-summary"><div><strong>${t.ids.length}</strong><span>Total</span></div><div><strong>${c.answered}</strong><span>Answered</span></div><div><strong>${c.incomplete}</strong><span>Incomplete</span></div><div><strong>${c.flagged}</strong><span>Flagged</span></div></div>
        <div class="review-actions"><button type="button" class="${filter === "all" ? "btn2" : "ghost"}" data-filter="all">Review All</button><button type="button" class="${filter === "incomplete" ? "btn2" : "ghost"}" data-filter="incomplete">Review Incomplete</button><button type="button" class="${filter === "flagged" ? "btn2" : "ghost"}" data-filter="flagged">Review Flagged</button><div class="grow"></div><button type="button" class="ghost" id="returnToQuestionBtn">Return to Question ${t.pos + 1}</button></div>
        <div class="review-list">${reviewRows(t, filter) || '<div class="review-empty">No questions in this review category.</div>'}</div>
        <div class="exam-submit-bar"><div><strong>Ready to end the exam?</strong><div class="small">${c.incomplete ? `${c.incomplete} question${c.incomplete === 1 ? "" : "s"} remain unanswered.` : "All questions have an answer."}</div></div><button type="button" class="btn" id="submitMockBtn">End Review & Submit Exam</button></div>
      </div>`;

    document.querySelectorAll("[data-filter]").forEach(btn => btn.onclick = () => renderReview(t, btn.dataset.filter));
    document.querySelectorAll("[data-review-index]").forEach(btn => {
      btn.onclick = () => { t.pos = Number(btn.dataset.reviewIndex); t.phase = "exam"; save(); renderMock(); };
    });
    document.getElementById("returnToQuestionBtn").onclick = () => { t.phase = "exam"; save(); renderMock(); };
    document.getElementById("submitMockBtn").onclick = () => {
      const c2 = counts(t);
      const msg = c2.incomplete ? `Submit now? ${c2.incomplete} unanswered question${c2.incomplete === 1 ? "" : "s"} will count as incorrect in this simulator.` : "Submit the exam now? You will not be able to change your answers afterward.";
      if (confirm(msg)) finishQuiz(false);
    };
    startTimer();
  }

  function updateTimerText() {
    const t = mockState();
    if (!t || !t.deadline || t.phase === "intro") { timer.textContent = ""; return; }
    if (t.timeHidden) { timer.textContent = "Time hidden"; timer.setAttribute("aria-label", "Time remaining hidden"); return; }
    const ms = Math.max(0, t.deadline - Date.now());
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
    timer.setAttribute("aria-label", `${m} minutes ${s} seconds remaining`);
  }

  const originalStartTimer = startTimer;
  startTimer = function() {
    const t = mockState();
    if (!t) return originalStartTimer();
    clearInterval(timerHandle);
    if (!t.deadline || t.phase === "intro") { updateTimerText(); return; }
    const tick = () => {
      const current = mockState();
      if (!current) { clearInterval(timerHandle); return; }
      const ms = current.deadline - Date.now();
      if (ms <= 0) { clearInterval(timerHandle); finishQuiz(true); return; }
      updateTimerText();
    };
    tick();
    timerHandle = setInterval(tick, 1000);
  };

  function renderMock() {
    const t = prepareMockState(mockState());
    if (!t) { show("home"); renderHome(); return; }
    if (t.phase === "intro") return renderIntro();
    if (t.phase === "review") return renderReview(t, "all");
    renderQuestion(t);
    startTimer();
  }

  renderQuiz = function() {
    if (mockState()) return renderMock();
    baseRenderQuiz();
  };

  answer = function(choice) {
    if (mockState()) {
      const t = prepareMockState(mockState());
      const q = QUESTIONS.find(x => x.id === t.ids[t.pos]);
      t.responses[q.id] = choice;
      save();
      renderQuestion(t);
      return;
    }
    baseAnswer(choice);
  };

  finishQuiz = function(timedOut) {
    const t = mockState();
    if (!t) return baseFinishQuiz(timedOut);
    clearInterval(timerHandle);
    prepareMockState(t);
    const scoredAlready = new Set(t.scoredIds || []);
    const answers = t.ids.map(id => {
      const q = QUESTIONS.find(x => x.id === id);
      const choice = t.responses[id] !== undefined ? t.responses[id] : null;
      const correct = choice === q.answer;
      if (!scoredAlready.has(id)) {
        const p = qP(id);
        p.attempts++;
        if (correct) p.correct++; else p.lastWrong = Date.now();
        const ds = state.domainStats[q.domain];
        ds.attempts++;
        if (correct) ds.correct++;
        scoredAlready.add(id);
      }
      return { id, choice, correct, domain: q.domain, unanswered: choice === null };
    });
    const correct = answers.filter(a => a.correct).length;
    const total = t.ids.length;
    const score = total ? correct / total : 0;
    const incomplete = answers.filter(a => a.unanswered).length;
    state.mockHistory.push({ date: new Date().toISOString(), score, correct, total, timedOut: !!timedOut, incomplete });
    const result = { mode: "mock", answers, score, correct, total, timedOut: !!timedOut, incomplete };
    state.activeQuiz = null;
    save();
    showResults(result);
  };

  showResults = function(r) {
    baseShowResults(r);
    if (r.mode !== "mock") return;
    resultText.textContent = `${r.correct} of ${r.total} correct${r.incomplete ? ` • ${r.incomplete} unanswered` : ""}${r.timedOut ? " • time expired" : ""}. This is a practice accuracy score, not Anthropic's scaled score.`;
    resultReview.innerHTML = `<div class="post-review-head"><strong>Post-exam review</strong><span class="small">All questions are shown only after submission.</span></div>`;
    r.answers.forEach((a, i) => {
      const q = QUESTIONS.find(x => x.id === a.id);
      const selectedText = a.choice === null ? "No answer" : `${String.fromCharCode(65 + a.choice)}. ${q.choices[a.choice]}`;
      const correctText = `${String.fromCharCode(65 + q.answer)}. ${q.choices[q.answer]}`;
      const div = document.createElement("div");
      div.className = "item post-review-item " + (a.correct ? "is-correct" : "is-wrong");
      div.innerHTML = `<div class="post-review-meta">Question ${i + 1} • ${esc(DOMAINS[q.domain].name)} • ${a.correct ? "Correct" : a.unanswered ? "Unanswered" : "Incorrect"}</div><strong>${esc(q.q)}</strong><div class="small post-review-answer">Your answer: ${esc(selectedText)}</div><div class="small">Correct answer: ${esc(correctText)}</div><div class="small post-review-why">${esc(q.why)}</div>`;
      resultReview.appendChild(div);
    });
  };

  resume = function() {
    if (mockState()) { show("quizView"); renderMock(); return; }
    baseResume();
  };

  stopQuiz.onclick = () => {
    clearInterval(timerHandle);
    save();
    show("home");
    renderHome();
  };
})();
