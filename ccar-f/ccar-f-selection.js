(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.CCARFSelection=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function familyKey(q){return q&&q.familyId?q.familyId:String(q&&q.id||"")}
  function shuf(a,rng=Math.random){const b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}
  function groupsFor(questions,domain){
    const m=new Map();
    (questions||[]).forEach(q=>{if(domain&&q.domain!==domain)return;const k=familyKey(q);if(!m.has(k))m.set(k,[]);m.get(k).push(q)});
    return m;
  }
  function practiceSet(questions,n=20,rng=Math.random){
    const groups=shuf([...groupsFor(questions).values()],rng);
    const out=[];
    for(const variants of groups){if(out.length>=n)break;out.push(shuf(variants,rng)[0])}
    let round=1;
    while(out.length<n){let added=false;for(const variants of groups){if(out.length>=n)break;const v=shuf(variants,rng)[round];if(v){out.push(v);added=true}}if(!added)break;round++}
    return shuf(out,rng).map(q=>q.id);
  }
  function weightedMock(questions,domains,rng=Math.random){
    const ids=[];
    for(const [domain,meta] of Object.entries(domains||{})){
      const need=meta.mock||0;
      const groups=shuf([...groupsFor(questions,domain).entries()],rng).map(([key,variants])=>({key,variants:shuf(variants,rng),objectiveId:(variants.find(q=>q.objectiveId)||{}).objectiveId||""}));
      const selected=[],used=new Set();
      const objectives=[...new Set(groups.map(g=>g.objectiveId).filter(Boolean))];
      if(objectives.length>need)return [];
      for(const objectiveId of objectives){
        const g=groups.find(x=>x.objectiveId===objectiveId&&!used.has(x.key));
        if(g&&g.variants.length){selected.push(g.variants[0]);used.add(g.key)}
      }
      for(const g of groups){if(selected.length>=need)break;if(used.has(g.key)||!g.variants.length)continue;selected.push(g.variants[0]);used.add(g.key)}
      let round=1;
      while(selected.length<need){let added=false;for(const g of groups){if(selected.length>=need)break;if(g.variants[round]){selected.push(g.variants[round]);added=true}}if(!added)break;round++}
      if(selected.length!==need)return [];
      ids.push(...selected.map(q=>q.id));
    }
    return shuf(ids,rng);
  }
  return {familyKey,shuf,groupsFor,practiceSet,weightedMock};
});
