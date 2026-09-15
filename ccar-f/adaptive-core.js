(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.CertAdaptiveCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const WRONG_RETRY_MS=30*60*1000;
  const RECENT_LIMIT=36;

  function conceptKey(q, profileCode){
    if(!q)return "";
    if(q.familyId)return q.familyId;
    if(q.concept)return q.concept;
    if(profileCode==="CCAR-P"){
      const m=String(q.id||"").match(/^(P-P\d+-\d+)-[AB]$/);
      if(m)return m[1];
    }
    return String(q.id||"");
  }

  function grouped(questions, profileCode, domain){
    const map=new Map();
    (questions||[]).forEach(q=>{
      if(domain&&q.domain!==domain)return;
      const key=conceptKey(q,profileCode);
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(q);
    });
    return map;
  }

  function uniqueConceptCount(questions, domain, profileCode){
    return grouped(questions,profileCode,domain).size;
  }

  function progressFor(qProgress,id){
    return (qProgress&&qProgress[id])||{attempts:0,correct:0,lastWrong:0,lastSeen:0};
  }

  function conceptProgress(variants,qProgress){
    return (variants||[]).reduce((acc,q)=>{
      const p=progressFor(qProgress,q.id);
      acc.attempts+=p.attempts||0;
      acc.correct+=p.correct||0;
      acc.lastWrong=Math.max(acc.lastWrong,p.lastWrong||0);
      acc.lastSeen=Math.max(acc.lastSeen,p.lastSeen||0);
      return acc;
    },{attempts:0,correct:0,lastWrong:0,lastSeen:0});
  }

  function chooseVariant(variants,qProgress,rng=Math.random){
    const ranked=(variants||[]).map(q=>{
      const p=progressFor(qProgress,q.id);
      return {q,p,tie:rng()};
    }).sort((a,b)=>{
      if((a.p.attempts||0)!==(b.p.attempts||0))return (a.p.attempts||0)-(b.p.attempts||0);
      if((a.p.lastSeen||0)!==(b.p.lastSeen||0))return (a.p.lastSeen||0)-(b.p.lastSeen||0);
      return a.tie-b.tie;
    });
    return ranked[0]?.q||null;
  }

  function remember(list,key,limit=RECENT_LIMIT){
    const out=(Array.isArray(list)?list:[]).filter(x=>x!==key);
    if(key)out.push(key);
    return out.slice(-limit);
  }

  function domainNeed(domain,domains,domainStats,sessionCounts,target){
    const s=(domainStats&&domainStats[domain])||{attempts:0,correct:0};
    const attempts=s.attempts||0;
    const acc=attempts?(s.correct||0)/attempts:0.5;
    const deficit=Math.max(0,target-acc);
    const weight=((domains&&domains[domain]&&domains[domain].weight)||0)/100;
    const evidenceBonus=1/Math.sqrt(attempts+1);
    const sessionPenalty=((sessionCounts&&sessionCounts[domain])||0)*0.13;
    return deficit*3.2+weight*0.8+evidenceBonus-sessionPenalty;
  }

  function conceptPriority(variants,qProgress,recentConcepts,key,now){
    const p=conceptProgress(variants,qProgress);
    const acc=p.attempts?p.correct/p.attempts:0;
    let score=0;
    if(!p.attempts)score-=40;
    else{
      score+=acc*18;
      score+=Math.min(p.attempts,6)*1.5;
      if(p.lastWrong&&now-p.lastWrong>=WRONG_RETRY_MS)score-=12;
    }
    if(p.lastSeen){
      const hours=(now-p.lastSeen)/3600000;
      if(hours<24)score+=(24-hours)*2.5;
    }
    if((recentConcepts||[]).includes(key))score+=80;
    return score;
  }

  function practiceSet({questions,profileCode,qProgress,recentConcepts,n=20,rng=Math.random}){
    const groups=[...grouped(questions,profileCode).entries()];
    const recent=new Set(recentConcepts||[]);
    const fresh=groups.filter(([k])=>!recent.has(k));
    const rest=groups.filter(([k])=>recent.has(k));
    const randomize=a=>a.map(x=>({x,r:rng()})).sort((a,b)=>a.r-b.r).map(y=>y.x);
    const ordered=[...randomize(fresh),...randomize(rest)];
    return ordered.slice(0,Math.min(n,ordered.length))
      .map(([,variants])=>chooseVariant(variants,qProgress,rng))
      .filter(Boolean).map(q=>q.id);
  }

  function nextAdaptiveQuestion({
    questions,profileCode,qProgress,domainStats,domains,recentConcepts,usedIds=[],
    targetAccuracy=0.9,now=Date.now(),rng=Math.random
  }){
    const usedConcepts=new Set((usedIds||[]).map(id=>{
      const q=(questions||[]).find(x=>x.id===id);
      return conceptKey(q,profileCode);
    }).filter(Boolean));
    const sessionCounts={};
    (usedIds||[]).forEach(id=>{
      const q=(questions||[]).find(x=>x.id===id);
      if(q)sessionCounts[q.domain]=(sessionCounts[q.domain]||0)+1;
    });

    const byDomain={};
    Object.keys(domains||{}).forEach(d=>{
      byDomain[d]=[...grouped(questions,profileCode,d).entries()]
        .filter(([key])=>!usedConcepts.has(key));
    });

    for(const allowRecent of [false,true]){
      const eligibleDomains=Object.keys(domains||{}).filter(d=>
        byDomain[d].some(([key,variants])=>{
          if(allowRecent)return true;
          const p=conceptProgress(variants,qProgress);
          const wrongDue=p.lastWrong&&now-p.lastWrong>=WRONG_RETRY_MS;
          return !(recentConcepts||[]).includes(key)||wrongDue;
        })
      ).sort((a,b)=>domainNeed(b,domains,domainStats,sessionCounts,targetAccuracy)-domainNeed(a,domains,domainStats,sessionCounts,targetAccuracy));

      for(const d of eligibleDomains){
        const candidates=byDomain[d]
          .filter(([key,variants])=>{
            if(allowRecent)return true;
            const p=conceptProgress(variants,qProgress);
            const wrongDue=p.lastWrong&&now-p.lastWrong>=WRONG_RETRY_MS;
            return !(recentConcepts||[]).includes(key)||wrongDue;
          })
          .map(([key,variants])=>({key,variants,score:conceptPriority(variants,qProgress,recentConcepts,key,now),tie:rng()}))
          .sort((a,b)=>a.score-b.score||a.tie-b.tie);
        if(candidates.length){
          return chooseVariant(candidates[0].variants,qProgress,rng);
        }
      }
    }
    return null;
  }

  function mockSet({questions,profileCode,qProgress,domains,rng=Math.random}){
    const ids=[];
    for(const [domain,meta] of Object.entries(domains||{})){
      const need=meta.mock||0;
      const domainQuestions=(questions||[]).filter(q=>q.domain===domain);
      if(domainQuestions.length<need)return [];

      const ranked=[...grouped(domainQuestions,profileCode,domain).entries()].map(([key,variants])=>{
        const p=conceptProgress(variants,qProgress);
        const ordered=variants.map(q=>{
          const qp=progressFor(qProgress,q.id);
          return {q,attempts:qp.attempts||0,lastSeen:qp.lastSeen||0,tie:rng()};
        }).sort((a,b)=>a.attempts-b.attempts||a.lastSeen-b.lastSeen||a.tie-b.tie).map(x=>x.q);
        const objectiveId=ordered.find(q=>q.objectiveId)?.objectiveId||"";
        return {key,variants:ordered,objectiveId,lastSeen:p.lastSeen||0,attempts:p.attempts||0,tie:rng()};
      }).sort((a,b)=>a.attempts-b.attempts||a.lastSeen-b.lastSeen||a.tie-b.tie);

      const selected=[];
      const selectedKeys=new Set();
      const objectiveIds=[...new Set(ranked.map(g=>g.objectiveId).filter(Boolean))];

      // If the bank carries objective metadata and the blueprint quota can fit it,
      // reserve one concept family per objective before filling additional breadth.
      if(objectiveIds.length&&objectiveIds.length<=need){
        for(const objectiveId of objectiveIds){
          const g=ranked.find(x=>x.objectiveId===objectiveId&&!selectedKeys.has(x.key));
          if(g&&g.variants.length){
            selected.push(g.variants[0]);
            selectedKeys.add(g.key);
          }
        }
      }

      // Fill the rest of the quota with unseen families before repeating a family.
      for(const g of ranked){
        if(selected.length>=need)break;
        if(selectedKeys.has(g.key)||!g.variants.length)continue;
        selected.push(g.variants[0]);
        selectedKeys.add(g.key);
      }

      // Only after family breadth is exhausted, round-robin through extra variants.
      let round=1;
      while(selected.length<need){
        let added=false;
        for(const g of ranked){
          if(selected.length>=need)break;
          if(g.variants[round]){
            selected.push(g.variants[round]);
            added=true;
          }
        }
        if(!added)break;
        round++;
      }
      if(selected.length!==need)return [];
      ids.push(...selected.map(q=>q.id));
    }
    return ids.map(id=>({id,r:rng()})).sort((a,b)=>a.r-b.r).map(x=>x.id);
  }

  return {
    WRONG_RETRY_MS,RECENT_LIMIT,conceptKey,grouped,uniqueConceptCount,conceptProgress,
    chooseVariant,remember,practiceSet,nextAdaptiveQuestion,mockSet
  };
});
