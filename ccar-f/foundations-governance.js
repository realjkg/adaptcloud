(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.FoundationSourceGovernance=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const TRACKS=new Set(["ccao-f","ccdv-f","ccar-f"]);
  const RUNTIME_ALLOWED=new Set(["internal-original","approved-derived"]);
  const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};

  function validateSource(source){
    assert(source&&typeof source==="object","Source must be an object");
    assert(source.id,"Source id is required");
    assert(source.status,"Source status is required");
    assert(source.reviewedAt,"Source reviewedAt is required");
    assert(Array.isArray(source.tracks)&&source.tracks.length,`${source.id}: tracks are required`);
    source.tracks.forEach(t=>assert(TRACKS.has(t),`${source.id}: unsupported track ${t}`));
    assert(source.provenance&&typeof source.provenance==="object",`${source.id}: provenance is required`);
    assert(source.rights&&typeof source.rights==="object",`${source.id}: rights are required`);

    const runtime=!!source.allowedForRuntimeImport;
    if(runtime){
      assert(RUNTIME_ALLOWED.has(source.status),`${source.id}: runtime import requires internal-original or approved-derived status`);
      assert(source.provenance.liveExamMaterial===false,`${source.id}: liveExamMaterial must be false`);
      assert(source.provenance.recalledExamMaterial===false,`${source.id}: recalledExamMaterial must be false`);
      assert(source.rights.adaptationAllowed===true,`${source.id}: adaptation rights are required`);
      if(source.status==="approved-derived"){
        assert(source.provenance.authorOriginal===true,`${source.id}: derived imports require authorOriginal=true`);
        assert(source.rights.licenseId||source.rights.permissionRef,`${source.id}: derived imports require license or explicit permission`);
      }
    }

    if(source.status==="authoritative"){
      assert(runtime===false,`${source.id}: official scope documents must never be runtime question sources`);
      assert(source.provenance.officialProgramSource===true,`${source.id}: authoritative source must be official`);
      assert(source.document&&source.document.version&&source.document.effective,`${source.id}: document version/effective date required`);
    }

    if(source.status==="blocked")assert(runtime===false,`${source.id}: blocked source cannot be runtime-importable`);
    if(source.provenance.liveExamMaterial===true||source.provenance.recalledExamMaterial===true){
      assert(runtime===false,`${source.id}: live/recalled exam material must be blocked from runtime`);
    }
    return true;
  }

  function validateRegistry(registry){
    assert(registry&&registry.schemaVersion,"registry schemaVersion is required");
    assert(Array.isArray(registry.sources),"registry sources must be an array");
    const ids=new Set();
    registry.sources.forEach(s=>{validateSource(s);assert(!ids.has(s.id),`Duplicate source id ${s.id}`);ids.add(s.id)});
    for(const track of TRACKS){
      const guides=registry.sources.filter(s=>s.status==="authoritative"&&s.tracks.includes(track)&&s.kind==="exam-guide");
      assert(guides.length===1,`${track}: exactly one authoritative exam guide is required`);
    }
    return {sources:registry.sources.length,runtimeApproved:registry.sources.filter(s=>s.allowedForRuntimeImport).length};
  }

  function validateTrackProfile(audit,profile){
    assert(audit&&profile,"audit and profile are required");
    assert(audit.track===audit.track.toLowerCase(),"audit track must be lowercase");
    assert(audit.code===profile.code,`${audit.track}: code mismatch`);
    assert(audit.questionCount===profile.questionCount,`${audit.track}: question count mismatch`);
    assert(audit.minutes===profile.minutes,`${audit.track}: duration mismatch`);
    assert(audit.scaledPassingScore===profile.scaledPassingScore,`${audit.track}: passing score mismatch`);
    const auditDomains=audit.domains||{};
    const profileDomains=profile.domains||{};
    assert(Object.keys(auditDomains).length===Object.keys(profileDomains).length,`${audit.track}: domain count mismatch`);
    for(const [id,p] of Object.entries(profileDomains)){
      const a=auditDomains[id];assert(a,`${audit.track}: missing domain ${id}`);
      assert(a.name===p.name,`${audit.track}/${id}: name mismatch`);
      assert(Number(a.weight)===Number(p.weight),`${audit.track}/${id}: weight mismatch`);
      assert(Number(a.mock)===Number(p.mock),`${audit.track}/${id}: mock allocation mismatch`);
    }
    return true;
  }

  function validateQuestionShape(q){
    assert(q&&q.id&&q.domain&&q.q,`Question id/domain/text required`);
    assert(Array.isArray(q.choices)&&q.choices.length===4,`${q.id}: exactly four choices required`);
    assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4,`${q.id}: invalid answer index`);
    assert(typeof q.why==="string"&&q.why.trim().length>=24,`${q.id}: explanation is required`);
    return true;
  }

  function validateImportedQuestion(q,registry){
    validateQuestionShape(q);
    assert(q.provenance&&q.provenance.sourceId,`${q.id}: imported question provenance required`);
    assert(q.provenance.liveExamMaterial===false,`${q.id}: liveExamMaterial must be explicitly false`);
    assert(q.provenance.recalledExamMaterial===false,`${q.id}: recalledExamMaterial must be explicitly false`);
    assert(q.provenance.verbatimReuse===false||q.provenance.permissionStatus==="explicit",`${q.id}: verbatim reuse requires explicit permission`);
    const source=(registry.sources||[]).find(s=>s.id===q.provenance.sourceId);
    assert(source,`${q.id}: unknown source ${q.provenance.sourceId}`);
    validateSource(source);
    assert(source.allowedForRuntimeImport===true,`${q.id}: source ${source.id} is not runtime-approved`);
    return true;
  }

  function normalizedQuestionText(q){return String(q.q||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}

  return {TRACKS,RUNTIME_ALLOWED,validateSource,validateRegistry,validateTrackProfile,validateQuestionShape,validateImportedQuestion,normalizedQuestionText};
});
