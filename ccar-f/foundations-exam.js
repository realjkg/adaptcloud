(() => {
  const SIM = (window.FOUNDATIONS_EXAM_SIM || {})[window.CERT_PROFILE?.code];
  if (!SIM) return;

  const baseStartQuiz = startQuiz;
  const baseRenderQuiz = renderQuiz;
  const baseFinishQuiz = finishQuiz;
  const baseResume = resume;
  const baseStartTimer = startTimer;
  const MINUTES = Number(PROFILE?.minutes) || 120;
  const esc2 = x => esc(String(x ?? ""));
  const label = i => String.fromCharCode(65 + i);
  const isFoundationMock = () => state.activeQuiz?.mode === "mock" && state.activeQuiz?.foundationScenarioVersion === SIM.version;
  const variantKey = q => `${q?.familyId || String(q?.id || "").split("::")[0]}::${q?.variantId || String(q?.id || "").split("::")[0]}`;
  const shuffleLocal = a => {
    const b=a.slice();
    for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}
    return b;
  };
  const shuffleMulti = q => {
    if ((q.itemType || "single") !== "multi") return q;
    const correct = new Set(q.answers || []);
    const entries = q.choices.map((text,i)=>({text,why:q.choiceWhy?.[i],correct:correct.has(i)}));
    const shuffled = shuffleLocal(entries);
    return {...q,choices:shuffled.map(x=>x.text),choiceWhy:Array.isArray(q.choiceWhy)?shuffled.map(x=>x.why):q.choiceWhy,answers:shuffled.map((x,i)=>x.correct?i:-1).filter(i=>i>=0)};
  };
  const formOverlap = (form, recent) => form.reduce((n,q)=>n+(recent.has(variantKey(q))?1:0),0);

  if (!document.getElementById("foundationsExamStyle")) {
    const style = document.createElement("style");
    style.id = "foundationsExamStyle";
    style.textContent = `
      .foundation-scenario{border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--soft);border-radius:12px;padding:13px 15px;margin-bottom:14px}
      .foundation-scenario strong{display:block;margin-bottom:5px}.foundation-scenario p{margin:0;line-height:1.5}
      .foundation-item-type{font-size:12px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
      .foundation-selection-count{font-size:12px;color:var(--muted);font-weight:800;margin:0 0 8px}
      .foundation-review-answer{margin-top:6px}.foundation-review-why{margin-top:6px;padding-top:6px;border-top:1px solid var(--line)}
      .foundation-review-rationales{display:grid;gap:4px;margin-top:6px}
    `;
    document.head.appendChild(style);
  }

  function complete(q, response) {
    if ((q.itemType || "single") === "multi") {
      return Array.isArray(response) && response.length === q.selectCount && new Set(response).size === response.length && response.every(i => Number.isInteger(i) && i >= 0 && i < q.choices.length);
    }
    return Number.isInteger(response) && response >= 0 && response < q.choices.length;
  }

  function started(q, response) {
    return (q.itemType || "single") === "multi" ? Array.isArray(response) && response.length > 0 : Number.isInteger(response);
  }

  function correct(q, response) {
    if (!complete(q, response)) return false;
    if ((q.itemType || "single") === "multi") {
      const a = response.slice().sort((x,y)=>x-y), b = q.answers.slice().sort((x,y)=>x-y);
      return a.length === b.length && a.every((v,i)=>v === b[i]);
    }
    return response === q.answer;
  }

  function getQ(t) { return t.form[t.pos]; }
  function counts(t) {
    let answered=0, partial=0, flagged=0;
    t.form.forEach(q => {
      const r=t.responses[q.id];
      if (complete(q,r)) answered++;
      else if (started(q,r)) partial++;
      if (t.flags[q.id]) flagged++;
    });
    return {answered,partial,incomplete:t.form.length-answered,flagged};
  }

  function startFoundationMock() {
    let form;
    try {
      const recent = new Set(state.mockHistory.slice(-2).flatMap(m=>m.variantKeys||[]));
      const candidates = Array.from({length:4},()=>SIM.buildForm(Math.random));
      form = candidates.sort((a,b)=>formOverlap(a,recent)-formOverlap(b,recent))[0].map(shuffleMulti);
    }
    catch (e) { alert(`${PROFILE.code} scenario mock could not be built: ${e.message || e}`); return; }
    if (!Array.isArray(form) || form.length !== PROFILE.questionCount) {
      alert(`${PROFILE.code} scenario mock expected ${PROFILE.questionCount} items but built ${form?.length || 0}.`);
      return;
    }
    state.activeQuiz={
      mode:"mock", foundationScenarioVersion:SIM.version, form, pos:0, responses:{}, flags:{}, phase:"intro", timeHidden:false,
      started:null, deadline:null, answers:[], scored:false
    };
    save(); show("quizView"); renderFoundationMock();
  }

  startQuiz = function(mode) {
    if (mode === "mock") return startFoundationMock();
    return baseStartQuiz(mode);
  };

  function begin() {
    const t=state.activeQuiz;
    t.phase="exam"; t.started=Date.now(); t.deadline=Date.now()+MINUTES*60000; t.pos=0; save(); renderFoundationMock(); startTimer();
  }

  function intro(t) {
    clearInterval(timerHandle); timer.textContent="";
    quizTitle.textContent=`${PROFILE.code} Full Mock — Exam Instructions`;
    quizCounter.textContent="Scenario-based proctored-style practice";
    quizProgress.style.width="0%";
    const summary=SIM.summarize(t.form), multi=summary.byType.multi||0, single=summary.byType.single||0;
    const scenarioNote = PROFILE.code === "CCAR-F"
      ? `<div class="exam-source-note"><strong>Scenario structure:</strong> This form uses four scenario contexts selected from the six contexts published for CCAR-F, with 15 items in each block. Domain allocation remains blueprint-weighted.</div>`
      : `<div class="exam-source-note"><strong>Scenario structure:</strong> Items are independent workday/production vignettes. The public guide confirms multiple-choice and multiple-response but does not publish a CCAR-F-style grouped-scenario bank for this track.</div>`;
    quizBody.innerHTML=`<div class="exam-intro"><h3>Before you begin</h3><p>This mock emphasizes applied judgment, realistic constraints, plausible alternatives, and delayed feedback using original practice content.</p><div class="exam-intro-grid"><div><strong>${t.form.length}</strong><span>items</span></div><div><strong>${MINUTES}</strong><span>minutes</span></div><div><strong>${multi}</strong><span>select-multiple items</span></div></div><div class="exam-format-summary">${single} select-one · ${multi} select-multiple</div>${scenarioNote}<ul><li>Each question tells you whether to select one or multiple responses.</li><li>Multiple-response items are scored all-or-nothing in this simulator.</li><li>No correctness feedback appears until final submission.</li><li>You may move backward, forward, and flag items for review.</li><li>The timer continues during review and auto-submits at zero.</li><li>Incomplete items count as incorrect.</li></ul><div class="exam-start-row"><button class="btn" id="foundationBegin">Begin Exam</button><button class="ghost" id="foundationCancel">Return to dashboard</button></div></div>`;
    foundationBegin.onclick=begin;
    foundationCancel.onclick=()=>{state.activeQuiz=null;save();show("home");renderHome();};
  }

  function status(t,q) {
    const r=t.responses[q.id], done=complete(q,r), part=!done&&started(q,r), flag=!!t.flags[q.id];
    if(flag&&done)return "answered flagged"; if(flag&&part)return "partial flagged"; if(flag)return "flagged"; if(done)return "answered"; if(part)return "partial"; return "unanswered";
  }

  function palette(t) {
    return `<aside class="exam-palette" aria-label="Question navigator"><div class="exam-palette-head"><strong>Question navigator</strong><span class="small">Select a number to jump</span></div><div class="exam-palette-grid">${t.form.map((q,i)=>{const s=status(t,q),cur=i===t.pos?" current":"",flag=t.flags[q.id]?'<span class="flag-dot" aria-hidden="true">⚑</span>':"";return `<button type="button" class="exam-qnum ${s}${cur}" data-fq="${i}" aria-label="Question ${i+1}, ${s.replaceAll(" ",", ")}">${i+1}${flag}</button>`;}).join("")}</div><div class="exam-legend small"><span><i class="legend-box answered"></i>Answered</span><span><i class="legend-box partial"></i>Partial</span><span><i class="legend-box unanswered"></i>Incomplete</span><span><i class="legend-flag">⚑</i>Flagged</span></div></aside>`;
  }

  function bindPalette(t) { document.querySelectorAll("[data-fq]").forEach(b=>b.onclick=()=>{t.pos=Number(b.dataset.fq);t.phase="exam";save();renderFoundationMock();}); }

  function renderQuestion(t) {
    const q=getQ(t), response=t.responses[q.id], c=counts(t), type=q.itemType||"single";
    quizTitle.textContent=`${PROFILE.code} Full Mock`;
    quizCounter.textContent=`Question ${t.pos+1} of ${t.form.length} • ${DOMAINS[q.domain].name}`;
    quizProgress.style.width=((t.pos+1)/t.form.length*100)+"%";
    const scenario=q.scenarioContext?`<div class="foundation-scenario"><strong>${esc2(q.scenarioTitle||"Scenario")}</strong><p>${esc2(q.scenarioContext)}</p></div>`:"";
    quizBody.innerHTML=`<div class="exam-toolbar"><button type="button" class="ghost exam-flag-btn ${t.flags[q.id]?"is-flagged":""}" id="foundationFlag">${t.flags[q.id]?"⚑ Flagged for Review":"⚐ Flag for Review"}</button><button type="button" class="ghost" id="foundationReview">Review (${c.incomplete} incomplete)</button><button type="button" class="ghost" id="foundationTime">${t.timeHidden?"Show time":"Hide time"}</button></div><div class="exam-layout"><div class="qbox exam-question">${scenario}<div class="foundation-item-type">${type==="multi"?`Multiple response · Select ${q.selectCount}`:"Multiple choice · Select ONE"}</div><div class="qtext">${esc2(q.q)}</div><div id="foundationChoices"></div><div class="exam-nav"><button class="ghost" id="foundationPrev" ${t.pos===0?"disabled":""}>Previous</button><div class="grow"></div><button class="btn2" id="foundationNext">${t.pos===t.form.length-1?"Review Exam":"Next"}</button></div></div>${palette(t)}</div>`;
    const host=document.getElementById("foundationChoices");
    if(type==="multi"){
      const chosen=Array.isArray(response)?response.slice():[];
      const counter=document.createElement("div");counter.className="foundation-selection-count";counter.textContent=`Selected ${chosen.length} of ${q.selectCount}`;host.appendChild(counter);
      q.choices.forEach((text,i)=>{const on=chosen.includes(i),b=document.createElement("button");b.type="button";b.className="choice exam-choice"+(on?" selected":"");b.setAttribute("role","checkbox");b.setAttribute("aria-checked",on?"true":"false");b.textContent=`${label(i)}. ${text}`;b.onclick=()=>{const next=chosen.slice(),at=next.indexOf(i);if(at>=0)next.splice(at,1);else if(next.length<q.selectCount)next.push(i);t.responses[q.id]=next.sort((a,b)=>a-b);save();renderQuestion(t);};host.appendChild(b);});
    }else{
      q.choices.forEach((text,i)=>{const b=document.createElement("button");b.type="button";b.className="choice exam-choice"+(response===i?" selected":"");b.setAttribute("role","radio");b.setAttribute("aria-checked",response===i?"true":"false");b.textContent=`${label(i)}. ${text}`;b.onclick=()=>{t.responses[q.id]=i;save();renderQuestion(t);};host.appendChild(b);});
    }
    foundationFlag.onclick=()=>{t.flags[q.id]=!t.flags[q.id];save();renderQuestion(t);};
    foundationReview.onclick=()=>{t.phase="review";save();renderReview(t,"all");};
    foundationTime.onclick=()=>{t.timeHidden=!t.timeHidden;save();updateTimer();foundationTime.textContent=t.timeHidden?"Show time":"Hide time";};
    foundationPrev.onclick=()=>{if(t.pos>0){t.pos--;save();renderFoundationMock();}};
    foundationNext.onclick=()=>{if(t.pos<t.form.length-1){t.pos++;save();renderFoundationMock();}else{t.phase="review";save();renderReview(t,"all");}};
    bindPalette(t); updateTimer();
  }

  function reviewRows(t,filter){return t.form.map((q,i)=>{const done=complete(q,t.responses[q.id]),flag=!!t.flags[q.id];if(filter==="incomplete"&&done)return"";if(filter==="flagged"&&!flag)return"";return `<button class="review-row" data-fr="${i}"><span class="review-num">${i+1}</span><span class="review-state ${done?"answered":"incomplete"}">${done?"Answered":"Incomplete"}</span><span class="review-flag">${flag?"⚑ Flagged":""}</span><span class="review-open">Open</span></button>`;}).join("");}

  function renderReview(t,filter="all"){
    clearInterval(timerHandle);quizTitle.textContent="Item Review";quizCounter.textContent=`${PROFILE.code} review before final submission`;quizProgress.style.width="100%";const c=counts(t);
    quizBody.innerHTML=`<div class="exam-review"><div class="review-summary"><div><strong>${t.form.length}</strong><span>Total</span></div><div><strong>${c.answered}</strong><span>Answered</span></div><div><strong>${c.incomplete}</strong><span>Incomplete</span></div><div><strong>${c.flagged}</strong><span>Flagged</span></div></div><div class="review-actions"><button class="${filter==="all"?"btn2":"ghost"}" data-ff="all">Review All</button><button class="${filter==="incomplete"?"btn2":"ghost"}" data-ff="incomplete">Review Incomplete</button><button class="${filter==="flagged"?"btn2":"ghost"}" data-ff="flagged">Review Flagged</button><div class="grow"></div><button class="ghost" id="foundationReturn">Return to Question ${t.pos+1}</button></div><div class="review-list">${reviewRows(t,filter)||'<div class="review-empty">No questions in this review category.</div>'}</div><div class="exam-submit-bar"><div><strong>Ready to submit?</strong><div class="small">${c.incomplete?`${c.incomplete} item${c.incomplete===1?"":"s"} remain incomplete.`:"All items have a complete response."}</div></div><button class="btn" id="foundationSubmit">End Review & Submit Exam</button></div></div>`;
    document.querySelectorAll("[data-ff]").forEach(b=>b.onclick=()=>renderReview(t,b.dataset.ff));
    document.querySelectorAll("[data-fr]").forEach(b=>b.onclick=()=>{t.pos=Number(b.dataset.fr);t.phase="exam";save();renderFoundationMock();});
    foundationReturn.onclick=()=>{t.phase="exam";save();renderFoundationMock();};
    foundationSubmit.onclick=()=>{const cc=counts(t),msg=cc.incomplete?`Submit now? ${cc.incomplete} incomplete item${cc.incomplete===1?"":"s"} will count as incorrect.`:"Submit the exam now?";if(confirm(msg))finishQuiz(false);};
    startTimer();
  }

  function updateTimer(){const t=state.activeQuiz;if(!isFoundationMock()||!t.deadline||t.phase==="intro"){timer.textContent="";return;}if(t.timeHidden){timer.textContent="Time hidden";return;}const ms=Math.max(0,t.deadline-Date.now()),m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000);timer.textContent=`${m}:${String(s).padStart(2,"0")}`;}

  startTimer=function(){if(!isFoundationMock())return baseStartTimer();clearInterval(timerHandle);const t=state.activeQuiz;if(!t.deadline||t.phase==="intro"){updateTimer();return;}const tick=()=>{if(!isFoundationMock()){clearInterval(timerHandle);return;}if(t.deadline-Date.now()<=0){clearInterval(timerHandle);finishQuiz(true);return;}updateTimer();};tick();timerHandle=setInterval(tick,1000);};

  function renderFoundationMock(){const t=state.activeQuiz;if(!isFoundationMock()){return baseRenderQuiz();}if(t.phase==="intro")return intro(t);if(t.phase==="review")return renderReview(t,"all");renderQuestion(t);startTimer();}
  renderQuiz=function(){if(isFoundationMock())return renderFoundationMock();return baseRenderQuiz();};

  function responseText(q,r){if(!started(q,r))return"No answer";if((q.itemType||"single")==="multi")return r.slice().sort((a,b)=>a-b).map(i=>`${label(i)}. ${q.choices[i]}`).join("; ");return `${label(r)}. ${q.choices[r]}`;}
  function correctText(q){if((q.itemType||"single")==="multi")return q.answers.slice().sort((a,b)=>a-b).map(i=>`${label(i)}. ${q.choices[i]}`).join("; ");return `${label(q.answer)}. ${q.choices[q.answer]}`;}

  function finishFoundation(timedOut){
    clearInterval(timerHandle);const t=state.activeQuiz;if(!isFoundationMock())return baseFinishQuiz(timedOut);
    const answers=t.form.map(q=>({id:q.id,domain:q.domain,response:t.responses[q.id],correct:correct(q,t.responses[q.id]),q}));
    if(!t.scored){answers.forEach(a=>{const p=qP(a.id);p.attempts++;if(a.correct)p.correct++;else p.lastWrong=Date.now();const ds=state.domainStats[a.domain];ds.attempts++;if(a.correct)ds.correct++;});t.scored=true;}
    const correctN=answers.filter(a=>a.correct).length,total=answers.length,score=total?correctN/total:0;
    state.mockHistory.push({date:new Date().toISOString(),score,correct:correctN,total,timedOut:!!timedOut,format:SIM.version,variantKeys:t.form.map(variantKey)});
    state.activeQuiz=null;save();show("resultView");resultTitle.textContent=`${PROFILE.code} Scenario Mock Results`;resultScore.textContent=Math.round(score*100)+"%";resultText.textContent=`${correctN} of ${total} items answered correctly${timedOut?" before time expired":""}. This is raw practice accuracy, not a conversion to Anthropic's scaled score.`;
    const by={};Object.keys(DOMAINS).forEach(d=>by[d]={a:0,c:0});answers.forEach(a=>{by[a.domain].a++;if(a.correct)by[a.domain].c++;});
    resultDomains.innerHTML="<div class='domainGrid'>"+Object.entries(DOMAINS).map(([d,x])=>`<div class="name">${esc2(x.name)}</div><div class="score">${by[d].a?Math.round(by[d].c/by[d].a*100)+"%":"—"}</div><div class="small">${by[d].a} Q</div>`).join("")+"</div>";
    resultReview.innerHTML="";answers.filter(a=>!a.correct).forEach(a=>{const q=a.q,div=document.createElement("div");div.className="item post-review-item is-wrong";const rationales=Array.isArray(q.choiceWhy)?`<div class="foundation-review-rationales">${q.choiceWhy.map((w,i)=>`<div><strong>${label(i)}.</strong> ${esc2(w)}</div>`).join("")}</div>`:"";div.innerHTML=`<strong>${esc2(q.q)}</strong><div class="foundation-review-answer small"><strong>Your answer:</strong> ${esc2(responseText(q,a.response))}</div><div class="foundation-review-answer small"><strong>Correct:</strong> ${esc2(correctText(q))}</div><div class="foundation-review-why small">${esc2(q.why||"")}</div>${rationales}`;resultReview.appendChild(div);});
    renderHome();
  }
  finishQuiz=function(timedOut){if(isFoundationMock())return finishFoundation(timedOut);return baseFinishQuiz(timedOut);};
  resume=function(){if(isFoundationMock()){show("quizView");renderFoundationMock();startTimer();return;}return baseResume();};
})();
