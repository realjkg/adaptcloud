(() => {
  if(typeof window==="undefined"||!window.CERT_PROFILE||window.CERT_TRACK==="ccar-f")return;
  const CORE=window.CertAdaptiveCore;
  if(!CORE)throw new Error("Adaptive core did not load.");

  const baseFullBankReady=fullBankReady;
  const baseRandomPractice=randomPractice;
  const baseWeightedMock=weightedMock;
  const baseStartQuiz=startQuiz;
  const baseRenderQuiz=renderQuiz;
  const baseAnswer=answer;

  state.recentQuestions=Array.isArray(state.recentQuestions)?state.recentQuestions:[];
  state.recentConcepts=Array.isArray(state.recentConcepts)?state.recentConcepts:[];
  Object.values(state.qProgress||{}).forEach(p=>{if(p.lastSeen===undefined)p.lastSeen=0});

  function noteSeen(q){
    const p=qP(q.id);p.lastSeen=Date.now();
    state.recentQuestions=CORE.remember(state.recentQuestions,q.id,48);
    state.recentConcepts=CORE.remember(state.recentConcepts,CORE.conceptKey(q,PROFILE.code),PROFILE.code==="CCAR-P"?36:24);
  }

  function nextAdaptive(usedIds){
    return CORE.nextAdaptiveQuestion({questions:QUESTIONS,profileCode:PROFILE.code,qProgress:state.qProgress,domainStats:state.domainStats,domains:DOMAINS,recentConcepts:state.recentConcepts,usedIds,targetAccuracy:PROFILE.adaptive.targetAccuracy||.9});
  }

  fullBankReady=function(){
    if(PROFILE.code!=="CCAR-P")return baseFullBankReady();
    if(PROFILE.bankStatus!=="complete")return false;
    return Object.entries(DOMAINS).every(([d,x])=>CORE.uniqueConceptCount(QUESTIONS,d,PROFILE.code)>=x.mock);
  };

  randomPractice=function(n=20){return CORE.practiceSet({questions:QUESTIONS,profileCode:PROFILE.code,qProgress:state.qProgress,recentConcepts:state.recentConcepts,n})};

  adaptiveSet=function(n=25){
    const ids=[];
    while(ids.length<Math.min(n,CORE.grouped(QUESTIONS,PROFILE.code).size)){
      const q=nextAdaptive(ids);if(!q)break;ids.push(q.id);
    }
    return ids;
  };

  weightedMock=function(){
    if(PROFILE.code!=="CCAR-P")return baseWeightedMock();
    if(!fullBankReady())return[];
    return CORE.mockSet({questions:QUESTIONS,profileCode:PROFILE.code,qProgress:state.qProgress,domains:DOMAINS});
  };

  startQuiz=function(mode){
    if(mode!=="adaptive")return baseStartQuiz(mode);
    const q=nextAdaptive([]);if(!q){alert("No questions are available for this track yet.");return}
    state.activeQuiz={mode:"adaptive",ids:[q.id],pos:0,answers:[],started:Date.now(),deadline:null,answered:false,target:Math.min(25,CORE.grouped(QUESTIONS,PROFILE.code).size)};
    save();show("quizView");renderQuiz();startTimer();
  };

  renderQuiz=function(){
    const t=state.activeQuiz;
    if(!t||t.mode!=="adaptive")return baseRenderQuiz();
    if(t.pos>=t.ids.length){finishQuiz(false);return}
    const q=currentQ(),total=t.target||t.ids.length;
    quizTitle.textContent=`${PROFILE.code} Adaptive Mode`;
    quizCounter.textContent=`Question ${t.pos+1} of ${total} • ${DOMAINS[q.domain].name}`;
    quizProgress.style.width=(t.pos/total*100)+"%";
    quizBody.innerHTML=`<div class="qbox"><div class="qtext">${esc(q.q)}</div><div id="choices"></div><div id="feedback" class="hidden"></div></div>`;
    q.choices.forEach((c,i)=>{const b=document.createElement("button");b.className="choice";b.textContent=String.fromCharCode(65+i)+". "+c;b.onclick=()=>answer(i);choices.appendChild(b)});
  };

  answer=function(choice){
    const t=state.activeQuiz,q=currentQ();
    if(!t||t.mode!=="adaptive"){
      if(t&&t.mode==="mcq"&&q)noteSeen(q);
      return baseAnswer(choice);
    }
    const correct=choice===q.answer,p=qP(q.id);p.attempts++;if(correct)p.correct++;else p.lastWrong=Date.now();noteSeen(q);
    const ds=state.domainStats[q.domain];ds.attempts++;if(correct)ds.correct++;
    t.answers.push({id:q.id,choice,correct,domain:q.domain,concept:CORE.conceptKey(q,PROFILE.code)});t.answered=true;save();
    [...document.querySelectorAll(".choice")].forEach((b,i)=>{b.disabled=true;if(i===q.answer)b.classList.add("correct");if(i===choice&&!correct)b.classList.add("wrong")});
    feedback.className="notice";feedback.style.marginTop="13px";
    feedback.innerHTML=`<strong>${correct?"Correct":"Not quite"}</strong><br>${esc(q.why)}<br><button class="btn" id="nextQ" style="margin-top:10px">Next</button>`;
    nextQ.onclick=()=>{if(t.ids.length<(t.target||25)){const next=nextAdaptive(t.ids);if(next)t.ids.push(next.id)}t.pos++;t.answered=false;save();renderQuiz()};
  };
  save();
})();
