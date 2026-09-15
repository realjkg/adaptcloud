(async()=>{try{
  const profiles=window.CLAUDE_CERTIFICATIONS||{};
  const params=new URLSearchParams(location.search);
  let track=params.get("track")||localStorage.getItem("claude-cert-active")||window.CLAUDE_CERT_DEFAULT||"ccar-f";
  if(!profiles[track])track=window.CLAUDE_CERT_DEFAULT||"ccar-f";
  const profile=profiles[track];
  window.CERT_TRACK=track;
  window.CERT_PROFILE=profile;
  localStorage.setItem("claude-cert-active",track);

  const selector=document.getElementById("certTrack");
  if(selector){
    selector.innerHTML=Object.entries(profiles).map(([id,p])=>`<option value="${id}"${id===track?" selected":""}>${p.code} · ${p.role} ${p.level}${p.bankStatus==="planned"?" · planned":""}</option>`).join("");
    selector.addEventListener("change",()=>{
      const u=new URL(location.href);
      u.searchParams.set("track",selector.value);
      location.href=u.toString();
    });
  }
  const heading=document.getElementById("certHeading");if(heading)heading.textContent=`${profile.code} Study Simulator`;
  const sub=document.getElementById("certSubhead");if(sub)sub.textContent=`${profile.title} • adaptive ${profile.role.toLowerCase()} preparation`;
  const level=document.getElementById("levelBadge");if(level)level.textContent=profile.level;
  const fmt=document.getElementById("examFormatBadge");if(fmt)fmt.textContent=profile.questionCount?`${profile.questionCount} Q / ${profile.minutes} min`:`${profile.minutes} min / blueprint pending`;
  const note=document.getElementById("blueprintNote");if(note){
    if(Object.keys(profile.domains||{}).length)note.textContent=`${profile.code} domain weights are isolated from every other certification. Adaptive practice targets the weakest weighted domains first; the expanded bank is validated against each domain allocation before full mocks are enabled.`;
    else note.textContent=`${profile.code} is registered in the engine, but its detailed exam blueprint is not being treated as final until the track content is locked to the current guide.`;
  }
  const mockDesc=document.getElementById("mockDesc");if(mockDesc)mockDesc.textContent=profile.bankStatus==="complete"?`${profile.questionCount} questions, ${profile.minutes} minutes, blueprint-weighted, with proctored-style navigation and review.`:"Adaptive practice is active now; the proctored full mock unlocks only after the unique bank satisfies the complete blueprint.";

  let data=null;
  if(track==="ccar-f"){
    const b64=(window.CCARF_DATA_B64_CHUNKS||[]).join("");
    const raw=atob(b64);
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(!("DecompressionStream" in window))throw new Error("This browser needs DecompressionStream support.");
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text=await new Response(stream).text();
    data=JSON.parse(text);
  }else{
    data=(window.CLAUDE_CERT_SEED_DATA||{})[track]||{cards:[],questions:[]};
  }
  const expansion=(window.CLAUDE_CERT_BANK_EXPANSIONS||{})[track]||{cards:[],questions:[]};
  data={
    cards:[...(data.cards||[]),...(expansion.cards||[])],
    questions:[...(data.questions||[]),...(expansion.questions||[])]
  };
  window.CCARF_CARDS=data.cards;
  window.CCARF_QUESTIONS=data.questions;

  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(`Unable to load ${src}`));document.body.appendChild(s)});
  if(track==="ccar-f"){
    await loadScript("./app.js");
    await loadScript("./exam.js");
  }else{
    await loadScript("./multi-app.js");
    await loadScript("./adaptive-core.js");
    await loadScript("./adaptive-patch.js");
    if(profile.bankStatus!=="planned")await loadScript("./exam.js");
  }
}catch(e){document.body.innerHTML=`<main style="font-family:system-ui;max-width:760px;margin:40px auto;padding:20px"><h1>Claude Certification Study Engine</h1><p>Unable to load this certification track in this browser.</p><pre>${String(e)}</pre></main>`}})();
