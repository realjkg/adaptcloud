(() => {
  const baseStartQuiz = startQuiz;
  const baseRenderQuiz = renderQuiz;
  const baseAnswer = answer;
  const baseFinishQuiz = finishQuiz;
  const baseShowResults = showResults;
  const baseResume = resume;
  const MOCK_MINUTES = Number(PROFILE?.minutes) || 120;
  const EXAM_SIM = PROFILE?.code === "CCAR-P" ? window.CCARP_EXAM_SIM : null;

  const shuffle = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const mockPool = () => EXAM_SIM?.items?.length ? EXAM_SIM.items : QUESTIONS;
  const mockQuestion = (id) => EXAM_SIM?.itemById?.[id] || mockPool().find(q => q.id === id) || QUESTIONS.find(q => q.id === id);
  const itemType = (q) => q?.itemType || "single";
  const labelFor = (i) => String.fromCharCode(65 + i);
  const safe = (x) => esc(String(x ?? ""));

  function responseStarted(q, response) {
    const type = itemType(q);
    if (type === "single") return Number.isInteger(response);
    if (type === "multi") return Array.isArray(response) && response.length > 0;
    if (type === "matching" || type === "matrix") return Array.isArray(response) && response.some(v => v !== null && v !== undefined);
    return false;
  }

  function responseComplete(q, response) {
    const type = itemType(q);
    if (type === "single") return Number.isInteger(response) && response >= 0 && response < q.choices.length;
    if (type === "multi") {
      return Array.isArray(response) && response.length === q.selectCount && response.every(v => Number.isInteger(v) && v >= 0 && v < q.choices.length) && new Set(response).size === response.length;
    }
    if (type === "matching") {
      return Array.isArray(response) && response.length === q.prompts.length && response.every(v => Number.isInteger(v) && v >= 0 && v < q.options.length);
    }
    if (type === "matrix") {
      return Array.isArray(response) && response.length === q.statements.length && response.every(v => typeof v === "boolean");
    }
    return false;
  }

  function itemCorrect(q, response) {
    if (!responseComplete(q, response)) return false;
    const type = itemType(q);
    if (type === "single") return response === q.answer;
    if (type === "multi") {
      const a = [...response].sort((x, y) => x - y);
      const b = [...q.answers].sort((x, y) => x - y);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    if (type === "matching" || type === "matrix") return response.length === q.answers.length && response.every((v, i) => v === q.answers[i]);
    return false;
  }

  function itemInstruction(q) {
    const type = itemType(q);
    if (type === "single") return "Multiple choice · Select ONE";
    if (type === "multi") return `Multiple response · Select ${q.selectCount}`;
    if (type === "matching") return "Scenario matching · Choose one option for every row · Options may be reused";
    if (type === "matrix") return "Scenario matrix · Mark YES or NO for every statement";
    return "Question";
  }

  function responseHtml(q, response) {
    const type = itemType(q);
    if (!responseStarted(q, response)) return "<em>No answer</em>";
    if (type === "single") return `${labelFor(response)}. ${safe(q.choices[response])}`;
    if (type === "multi") return [...response].sort((a,b)=>a-b).map(i => `${labelFor(i)}. ${safe(q.choices[i])}`).join("<br>");
    if (type === "matching") return q.prompts.map((p, i) => `${safe(p)} → <strong>${response?.[i] === null || response?.[i] === undefined ? "Unanswered" : safe(q.options[response[i]])}</strong>`).join("<br>");
    if (type === "matrix") return q.statements.map((s, i) => `${safe(s)} → <strong>${typeof response?.[i] === "boolean" ? (response[i] ? "YES" : "NO") : "Unanswered"}</strong>`).join("<br>");
    return "<em>No answer</em>";
  }

  function correctHtml(q) {
    const type = itemType(q);
    if (type === "single") return `${labelFor(q.answer)}. ${safe(q.choices[q.answer])}`;
    if (type === "multi") return q.answers.slice().sort((a,b)=>a-b).map(i => `${labelFor(i)}. ${safe(q.choices[i])}`).join("<br>");
    if (type === "matching") return q.prompts.map((p, i) => `${safe(p)} → <strong>${safe(q.options[q.answers[i]])}</strong>`).join("<br>");
    if (type === "matrix") return q.statements.map((s, i) => `${safe(s)} → <strong>${q.answers[i] ? "YES" : "NO"}</strong>`).join("<br>");
    return "";
  }

  function rationaleHtml(q, response) {
    const blocks = [`<div class="post-review-why">${safe(q.why || "")}</div>`];
    if (Array.isArray(q.choiceWhy) && Array.isArray(q.choices)) {
      const relevant = new Set();
      if (itemType(q) === "single") {
        if (Number.isInteger(response)) relevant.add(response);
        if (Number.isInteger(q.answer)) relevant.add(q.answer);
      } else if (itemType(q) === "multi") {
        (response || []).forEach(i => relevant.add(i));
        (q.answers || []).forEach(i => relevant.add(i));
      }
      if (relevant.size) blocks.push(`<div class="post-review-rationales">${[...relevant].sort((a,b)=>a-b).map(i => `<div><strong>${labelFor(i)}.</strong> ${safe(q.choiceWhy[i] || "")}</div>`).join("")}</div>`);
    }
    if (Array.isArray(q.rowWhy)) blocks.push(`<div class="post-review-rationales">${q.rowWhy.map((w,i)=>`<div><strong>Row ${i+1}.</strong> ${safe(w)}</div>`).join("")}</div>`);
    if (Array.isArray(q.statementWhy)) blocks.push(`<div class="post-review-rationales">${q.statementWhy.map((w,i)=>`<div><strong>${i+1}.</strong> ${safe(w)}</div>`).join("")}</div>`);
    return blocks.join("");
  }

  function buildMockIds() {
    if (EXAM_SIM) {
      if (!EXAM_SIM.ready) {
        alert(`CCAR-P exam simulation is not ready. Missing source items: ${EXAM_SIM.missingSourceIds.join(", ")}`);
        return [];
      }
      const ids = EXAM_SIM.buildForm(Math.random);
      if (ids.length !== PROFILE.questionCount) {
        alert(`CCAR-P exam simulation expected ${PROFILE.questionCount} items but built ${ids.length}.`);
        return [];
      }
      return shuffle(ids);
    }
    return weightedMock();
  }

  function mockState() {
    const t = state.activeQuiz;
    return t && t.mode === "mock" ? t : null;
  }

  function prepareMockState(t) {
    if (!t) return null;
    t.responses = t.responses || {};
    t.flags = t.flags || {};
    t.phase = t.phase || "exam";
    t.timeHidden = !!t.timeHidden;
    t.scoredIds = t.scoredIds || [];
    if (Array.isArray(t.answers) && t.answers.length) {
      t.answers.forEach(a => {
        if (!a?.id || t.responses[a.id] !== undefined) return;
        if (a.response !== undefined) t.responses[a.id] = a.response;
        else if (a.choice !== undefined) t.responses[a.id] = a.choice;
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
    let answered = 0, partial = 0, flagged = 0;
    t.ids.forEach(id => {
      const q = mockQuestion(id);
      const r = t.responses[id];
      if (q && responseComplete(q, r)) answered++;
      else if (q && responseStarted(q, r)) partial++;
      if (t.flags[id]) flagged++;
    });
    return { answered, partial, incomplete: t.ids.length - answered, flagged };
  }

  function startMock() {
    const ids = buildMockIds();
    if (!ids.length) return;
    state.activeQuiz = {mode:"mock",ids,pos:0,answers:[],responses:{},flags:{},scoredIds:[],started:null,deadline:null,phase:"intro",timeHidden:false,examFidelity:!!EXAM_SIM,examVersion:EXAM_SIM?.version||null};
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
    const t = mockState();
    clearInterval(timerHandle);
    timer.textContent = "";
    quizTitle.textContent = `${PROFILE.code} Full Mock — Exam Instructions`;
    quizCounter.textContent = "Proctored-style practice session";
    quizProgress.style.width = "0%";
    const summary = EXAM_SIM?.summarize ? EXAM_SIM.summarize(t.ids) : null;
    const typeText = summary ? [summary.byType.single?`${summary.byType.single} single-answer`:"",summary.byType.multi?`${summary.byType.multi} multiple-response`:"",summary.byType.matching?`${summary.byType.matching} scenario-matching`:"",summary.byType.matrix?`${summary.byType.matrix} matrix`:""].filter(Boolean).join(" · ") : "Single-answer multiple choice";
    const evidenceNote = EXAM_SIM ? `<div class="exam-source-note"><strong>Format fidelity:</strong> The public CCAR-P blueprint confirms multiple-choice and multiple-response. This simulator also rehearses practitioner-reported scenario matching and, on some forms, a matrix-style composite. All questions are original practice content; no live or recalled exam items are used.</div>` : "";
    quizBody.innerHTML = `
      <div class="exam-intro">
        <h3>Before you begin</h3>
        <p>This mock reproduces timed navigation, review pressure, blueprint weighting, and supported item mechanics using original practice material.</p>
        <div class="exam-intro-grid"><div><strong>${t.ids.length}</strong><span>questions</span></div><div><strong>${MOCK_MINUTES}</strong><span>minutes</span></div><div><strong>1</strong><span>final submission</span></div></div>
        <div class="exam-format-summary">${safe(typeText)}</div>${evidenceNote}
        <ul>
          <li>Each item states whether to select one response, multiple responses, or complete every scenario row.</li>
          <li>Multiple-response and composite items are scored all-or-nothing in this simulator.</li>
          <li>Move backward and forward and flag any item for review.</li>
          <li>No correctness feedback or explanations appear until final submission.</li>
          <li>The timer continues during review and auto-submits at zero.</li>
          <li>Incomplete items count as incorrect.</li>
        </ul>
        <div class="exam-start-row"><button class="btn" id="beginMockBtn">Begin Exam</button><button class="ghost" id="cancelMockBtn">Return to dashboard</button></div>
      </div>`;
    document.getElementById("beginMockBtn").onclick = beginMock;
    document.getElementById("cancelMockBtn").onclick = () => { state.activeQuiz = null; save(); show("home"); renderHome(); };
  }

  function statusFor(t, id) {
    const q = mockQuestion(id), r = t.responses[id];
    const answered = q && responseComplete(q, r), partial = q && !answered && responseStarted(q, r), flagged = !!t.flags[id];
    if (flagged && answered) return "answered flagged";
    if (flagged && partial) return "partial flagged";
    if (flagged) return "flagged";
    if (answered) return "answered";
    if (partial) return "partial";
    return "unanswered";
  }

  function renderPalette(t) {
    return `<aside class="exam-palette" aria-label="Question navigator"><div class="exam-palette-head"><strong>Question navigator</strong><span class="small">Select a number to jump</span></div><div class="exam-palette-grid">${t.ids.map((id,i)=>{const status=statusFor(t,id),current=i===t.pos?" current":"",flag=t.flags[id]?'<span class="flag-dot" aria-hidden="true">⚑</span>':"";return `<button type="button" class="exam-qnum ${status}${current}" data-qindex="${i}" aria-label="Question ${i+1}, ${status.replaceAll(" ",", ")}">${i+1}${flag}</button>`;}).join("")}</div><div class="exam-legend small"><span><i class="legend-box answered"></i>Answered</span><span><i class="legend-box partial"></i>Partial</span><span><i class="legend-box unanswered"></i>Incomplete</span><span><i class="legend-flag">⚑</i>Flagged</span></div></aside>`;
  }

  function bindPalette(t) {
    document.querySelectorAll("[data-qindex]").forEach(btn => { btn.onclick = () => { t.pos=Number(btn.dataset.qindex); t.phase="exam"; save(); renderMock(); }; });
  }

  function setResponse(t,q,value) { t.responses[q.id]=value; save(); renderQuestion(t); }

  function renderSingle(q,t,response) {
    const host=document.getElementById("choices");
    q.choices.forEach((choice,i)=>{const b=document.createElement("button");b.type="button";b.className="choice exam-choice"+(response===i?" selected":"");b.setAttribute("role","radio");b.setAttribute("aria-checked",response===i?"true":"false");b.textContent=`${labelFor(i)}. ${choice}`;b.onclick=()=>setResponse(t,q,i);host.appendChild(b);});
  }

  function renderMulti(q,t,response) {
    const selected=Array.isArray(response)?response.slice():[],host=document.getElementById("choices"),count=document.createElement("div");
    count.className="exam-selection-count";count.textContent=`Selected ${selected.length} of ${q.selectCount}`;host.appendChild(count);
    q.choices.forEach((choice,i)=>{const on=selected.includes(i),b=document.createElement("button");b.type="button";b.className="choice exam-choice exam-multi-choice"+(on?" selected":"");b.setAttribute("role","checkbox");b.setAttribute("aria-checked",on?"true":"false");b.textContent=`${labelFor(i)}. ${choice}`;b.onclick=()=>{const next=selected.slice(),at=next.indexOf(i);if(at>=0)next.splice(at,1);else if(next.length<q.selectCount)next.push(i);setResponse(t,q,next.sort((a,b)=>a-b));};host.appendChild(b);});
  }

  function renderMatching(q,t,response) {
    const selected=Array.isArray(response)&&response.length===q.prompts.length?response.slice():Array(q.prompts.length).fill(null),host=document.getElementById("choices");host.className="matching-grid";
    q.prompts.forEach((prompt,i)=>{const row=document.createElement("label");row.className="matching-row";const text=document.createElement("span");text.className="matching-prompt";text.textContent=`${i+1}. ${prompt}`;const select=document.createElement("select");select.className="matching-select";select.setAttribute("aria-label",`Scenario ${i+1}`);const blank=document.createElement("option");blank.value="";blank.textContent="Choose an option";select.appendChild(blank);q.options.forEach((opt,j)=>{const option=document.createElement("option");option.value=String(j);option.textContent=opt;option.selected=selected[i]===j;select.appendChild(option);});select.onchange=()=>{const next=selected.slice();next[i]=select.value===""?null:Number(select.value);t.responses[q.id]=next;save();};row.append(text,select);host.appendChild(row);});
  }

  function renderMatrix(q,t,response) {
    const selected=Array.isArray(response)&&response.length===q.statements.length?response.slice():Array(q.statements.length).fill(null),host=document.getElementById("choices");host.className="matrix-grid";
    q.statements.forEach((statement,i)=>{const row=document.createElement("div");row.className="matrix-row";const text=document.createElement("div");text.className="matrix-statement";text.textContent=`${i+1}. ${statement}`;const buttons=document.createElement("div");buttons.className="matrix-buttons";[["YES",true],["NO",false]].forEach(([label,value])=>{const b=document.createElement("button");b.type="button";b.className="ghost matrix-choice"+(selected[i]===value?" selected":"");b.setAttribute("aria-pressed",selected[i]===value?"true":"false");b.textContent=label;b.onclick=()=>{const next=selected.slice();next[i]=value;setResponse(t,q,next);};buttons.appendChild(b);});row.append(text,buttons);host.appendChild(row);});
  }

  function renderQuestion(t) {
    const q=mockQuestion(t.ids[t.pos]);if(!q){alert(`Unable to resolve exam item ${t.ids[t.pos]}.`);return;}
    const response=t.responses[q.id],c=counts(t);quizTitle.textContent=`${PROFILE.code} Full Mock`;quizCounter.textContent=`Question ${t.pos+1} of ${t.ids.length} • ${DOMAINS[q.domain]?.name||q.domain}`;quizProgress.style.width=((t.pos+1)/t.ids.length*100)+"%";
    quizBody.innerHTML=`<div class="exam-toolbar"><button type="button" class="ghost exam-flag-btn ${t.flags[q.id]?"is-flagged":""}" id="flagReviewBtn" aria-pressed="${t.flags[q.id]?"true":"false"}">${t.flags[q.id]?"⚑ Flagged for Review":"⚐ Flag for Review"}</button><button type="button" class="ghost" id="openReviewBtn">Review (${c.incomplete} incomplete)</button><button type="button" class="ghost" id="toggleTimeBtn">${t.timeHidden?"Show time":"Hide time"}</button></div><div class="exam-layout"><div class="qbox exam-question"><div class="exam-item-type">${safe(itemInstruction(q))}</div><div class="qtext">${safe(q.q)}</div><div id="choices"></div><div class="exam-nav"><button type="button" class="ghost" id="prevMockBtn" ${t.pos===0?"disabled":""}>Previous</button><div class="grow"></div><button type="button" class="btn2" id="nextMockBtn">${t.pos===t.ids.length-1?"Review Exam":"Next"}</button></div></div>${renderPalette(t)}</div>`;
    const type=itemType(q);if(type==="single")renderSingle(q,t,response);else if(type==="multi")renderMulti(q,t,response);else if(type==="matching")renderMatching(q,t,response);else if(type==="matrix")renderMatrix(q,t,response);
    document.getElementById("flagReviewBtn").onclick=()=>{t.flags[q.id]=!t.flags[q.id];save();renderQuestion(t);};
    document.getElementById("openReviewBtn").onclick=()=>{t.phase="review";save();renderReview(t,"all");};
    document.getElementById("toggleTimeBtn").onclick=()=>{t.timeHidden=!t.timeHidden;save();updateTimerText();document.getElementById("toggleTimeBtn").textContent=t.timeHidden?"Show time":"Hide time";};
    document.getElementById("prevMockBtn").onclick=()=>{if(t.pos>0){t.pos--;save();renderMock();}};
    document.getElementById("nextMockBtn").onclick=()=>{if(t.pos<t.ids.length-1){t.pos++;save();renderMock();}else{t.phase="review";save();renderReview(t,"all");}};
    bindPalette(t);updateTimerText();
  }

  function reviewRows(t,filter) {
    return t.ids.map((id,i)=>{const q=mockQuestion(id),r=t.responses[id],answered=q&&responseComplete(q,r),partial=q&&!answered&&responseStarted(q,r),flagged=!!t.flags[id];if(filter==="incomplete"&&answered)return"";if(filter==="flagged"&&!flagged)return"";const stateText=answered?"Answered":partial?"Partial":"Incomplete",stateClass=answered?"answered":partial?"partial":"incomplete",typeText=itemType(q).replace("single","MC").replace("multi","MR").replace("matching","Match").replace("matrix","Matrix");return `<button type="button" class="review-row" data-review-index="${i}"><span class="review-num">${i+1}</span><span class="review-state ${stateClass}">${stateText}</span><span class="review-type">${safe(typeText)}</span><span class="review-flag">${flagged?"⚑ Flagged":""}</span><span class="review-open">Open</span></button>`;}).join("");
  }

  function renderReview(t,filter="all") {
    clearInterval(timerHandle);quizTitle.textContent="Item Review";quizCounter.textContent="Review before final submission";quizProgress.style.width="100%";const c=counts(t);
    quizBody.innerHTML=`<div class="exam-review"><div class="review-summary"><div><strong>${t.ids.length}</strong><span>Total</span></div><div><strong>${c.answered}</strong><span>Complete</span></div><div><strong>${c.incomplete}</strong><span>Incomplete</span></div><div><strong>${c.flagged}</strong><span>Flagged</span></div></div><div class="review-actions"><button type="button" class="${filter==="all"?"btn2":"ghost"}" data-filter="all">Review All</button><button type="button" class="${filter==="incomplete"?"btn2":"ghost"}" data-filter="incomplete">Review Incomplete</button><button type="button" class="${filter==="flagged"?"btn2":"ghost"}" data-filter="flagged">Review Flagged</button><div class="grow"></div><button type="button" class="ghost" id="returnToQuestionBtn">Return to Question ${t.pos+1}</button></div><div class="review-list">${reviewRows(t,filter)||'<div class="review-empty">No questions in this review category.</div>'}</div><div class="exam-submit-bar"><div><strong>Ready to end the exam?</strong><div class="small">${c.incomplete?`${c.incomplete} item${c.incomplete===1?"":"s"} remain incomplete${c.partial?` (${c.partial} partially answered)`:""}.`:"All items are complete."}</div></div><button type="button" class="btn" id="submitMockBtn">End Review & Submit Exam</button></div></div>`;
    document.querySelectorAll("[data-filter]").forEach(btn=>btn.onclick=()=>renderReview(t,btn.dataset.filter));document.querySelectorAll("[data-review-index]").forEach(btn=>{btn.onclick=()=>{t.pos=Number(btn.dataset.reviewIndex);t.phase="exam";save();renderMock();};});document.getElementById("returnToQuestionBtn").onclick=()=>{t.phase="exam";save();renderMock();};document.getElementById("submitMockBtn").onclick=()=>{const c2=counts(t),msg=c2.incomplete?`Submit now? ${c2.incomplete} incomplete item${c2.incomplete===1?"":"s"} will count as incorrect.`:"Submit the exam now? You will not be able to change your answers afterward.";if(confirm(msg))finishQuiz(false);};startTimer();
  }

  function updateTimerText() {
    const t=mockState();if(!t||!t.deadline||t.phase==="intro"){timer.textContent="";return;}if(t.timeHidden){timer.textContent="Time hidden";timer.setAttribute("aria-label","Time remaining hidden");return;}const ms=Math.max(0,t.deadline-Date.now()),m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000);timer.textContent=`${m}:${String(s).padStart(2,"0")}`;timer.setAttribute("aria-label",`${m} minutes ${s} seconds remaining`);
  }

  const originalStartTimer=startTimer;
  startTimer=function(){const t=mockState();if(!t)return originalStartTimer();clearInterval(timerHandle);if(!t.deadline||t.phase==="intro"){updateTimerText();return;}const tick=()=>{const current=mockState();if(!current){clearInterval(timerHandle);return;}const ms=current.deadline-Date.now();if(ms<=0){clearInterval(timerHandle);finishQuiz(true);return;}updateTimerText();};tick();timerHandle=setInterval(tick,1000);};

  function renderMock(){const t=prepareMockState(mockState());if(!t){show("home");renderHome();return;}if(t.phase==="intro")return renderIntro();if(t.phase==="review")return renderReview(t,"all");renderQuestion(t);startTimer();}

  renderQuiz=function(){if(mockState())return renderMock();baseRenderQuiz();};
  answer=function(choice){if(mockState()){const t=prepareMockState(mockState()),q=mockQuestion(t.ids[t.pos]);if(itemType(q)==="single")setResponse(t,q,choice);return;}baseAnswer(choice);};

  finishQuiz=function(timedOut){
    const t=mockState();if(!t)return baseFinishQuiz(timedOut);clearInterval(timerHandle);prepareMockState(t);const scoredAlready=new Set(t.scoredIds||[]);
    const answers=t.ids.map(id=>{const q=mockQuestion(id),response=t.responses[id]!==undefined?t.responses[id]:null,correct=q?itemCorrect(q,response):false;if(q&&!scoredAlready.has(id)){const p=qP(id);p.attempts=(p.attempts||0)+1;p.lastSeen=Date.now();if(correct)p.correct=(p.correct||0)+1;else p.lastWrong=Date.now();const ds=state.domainStats[q.domain];ds.attempts++;if(correct)ds.correct++;scoredAlready.add(id);}return{id,response,correct,domain:q?.domain||"",itemType:itemType(q)};});
    t.scoredIds=[...scoredAlready];t.answers=answers;const correct=answers.filter(a=>a.correct).length,total=answers.length,score=total?correct/total:0;state.mockHistory.push({date:new Date().toISOString(),score,correct,total,timedOut:!!timedOut,examVersion:t.examVersion||null,mixedFormat:!!t.examFidelity});const result={mode:"mock",answers,score,correct,total,timedOut:!!timedOut,examFidelity:!!t.examFidelity,examVersion:t.examVersion||null};state.activeQuiz=null;save();showResults(result);
  };

  showResults=function(r){
    if(r.mode!=="mock")return baseShowResults(r);show("resultView");resultTitle.textContent=`${PROFILE.code} Full Mock Results`;resultScore.textContent=Math.round(r.score*100)+"%";resultText.textContent=`${r.correct} of ${r.total} items correct${r.timedOut?" when time expired":""}. This is raw practice accuracy; Anthropic's published passing score is scaled and no public raw-percentage conversion is assumed here.`;const by={};Object.keys(DOMAINS).forEach(d=>by[d]={a:0,c:0});r.answers.forEach(x=>{if(by[x.domain]){by[x.domain].a++;if(x.correct)by[x.domain].c++;}});resultDomains.innerHTML="<div class='domainGrid'>"+Object.entries(DOMAINS).map(([d,x])=>`<div class="name">${safe(x.name)}</div><div class="score">${by[d].a?Math.round(by[d].c/by[d].a*100)+"%":"—"}</div><div class="small">${by[d].a} Q</div>`).join("")+"</div>";resultReview.innerHTML="";const wrong=r.answers.filter(a=>!a.correct);if(!wrong.length)resultReview.innerHTML='<div class="item"><strong>No incorrect items.</strong><div class="small">Every scored item was correct.</div></div>';else wrong.forEach((a,index)=>{const q=mockQuestion(a.id);if(!q)return;const div=document.createElement("div");div.className="item post-review-item is-wrong";div.innerHTML=`<div class="post-review-head"><strong>Review ${index+1}</strong><span class="small">${safe(itemInstruction(q))}</span></div><div><strong>${safe(q.q)}</strong></div><div class="post-review-answer"><span class="small">Your answer</span><br>${responseHtml(q,a.response)}</div><div class="post-review-answer"><span class="small">Correct answer</span><br>${correctHtml(q)}</div>${rationaleHtml(q,a.response)}`;resultReview.appendChild(div);});renderHome();
  };

  resume=function(){if(state.activeQuiz?.mode==="mock"){show("quizView");renderMock();startTimer();return;}baseResume();};
})();
