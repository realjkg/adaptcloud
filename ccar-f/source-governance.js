(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.CCARPSourceGovernance=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const APPROVED_IMPORT="approved-import";
  const APPROVED_DERIVED="approved-derived";
  const VALIDATOR="validator";
  const REFERENCE="reference";
  const PENDING="reference-pending-credential";
  const EXCLUDED="excluded";
  const BLOCKED="blocked";
  const ALLOWED_RUNTIME=new Set([APPROVED_IMPORT,APPROVED_DERIVED]);

  function assert(ok,msg){if(!ok)throw new Error(msg)}

  function validateSource(source){
    assert(source&&typeof source==="object","Source must be an object");
    assert(source.id,"Source id is required");
    assert(source.status,"Source status is required");
    assert(source.reviewedAt,"Source reviewedAt is required");
    assert(source.provenance&&typeof source.provenance==="object",`${source.id}: provenance is required`);
    assert(source.rights&&typeof source.rights==="object",`${source.id}: rights are required`);
    assert(source.credential&&typeof source.credential==="object",`${source.id}: credential classification is required`);

    const runtime=!!source.allowedForRuntimeImport;
    if(runtime){
      assert(ALLOWED_RUNTIME.has(source.status),`${source.id}: runtime import requires approved status`);
      assert(source.provenance.authorOriginal===true,`${source.id}: runtime import requires authorOriginal=true`);
      assert(source.provenance.liveExamMaterial===false,`${source.id}: runtime import requires liveExamMaterial=false`);
      assert(source.provenance.recalledExamMaterial===false,`${source.id}: runtime import requires recalledExamMaterial=false`);
      assert(source.rights.adaptationAllowed===true,`${source.id}: runtime import requires adaptation rights`);
      assert(source.rights.licenseId||source.rights.permissionRef,`${source.id}: runtime import requires license or permission`);
      assert(source.credential.eligibleAsCertifiedPractitioner===true,`${source.id}: runtime import requires verified certified-practitioner eligibility`);
      assert(source.credential.identityMatch==="verified",`${source.id}: runtime import requires verified identity match`);
    }

    if(source.status===BLOCKED||source.status===EXCLUDED){
      assert(runtime===false,`${source.id}: blocked/excluded source cannot be runtime-importable`);
    }
    if(source.provenance.liveExamMaterial===true||source.provenance.recalledExamMaterial===true){
      assert(runtime===false,`${source.id}: live/recalled exam provenance must be blocked from runtime`);
    }
    if(source.credential.type==="academy-course-completion"){
      assert(source.credential.eligibleAsCertifiedPractitioner===false,`${source.id}: Academy completion is not proctored certification`);
    }
    return true;
  }

  function validateRegistry(registry){
    assert(registry&&registry.schemaVersion,"registry schemaVersion is required");
    assert(Array.isArray(registry.sources),"registry sources must be an array");
    const ids=new Set();
    registry.sources.forEach(source=>{
      validateSource(source);
      assert(!ids.has(source.id),`Duplicate source id ${source.id}`);
      ids.add(source.id);
    });
    return {sources:registry.sources.length,runtimeApproved:registry.sources.filter(s=>s.allowedForRuntimeImport).length};
  }

  function validateQuestionProvenance(question,registry){
    assert(question&&question.provenance,"Question provenance is required");
    assert(question.provenance.liveExamMaterial===false,"liveExamMaterial must be explicitly false");
    assert(question.provenance.verbatimReuse===false||question.provenance.permissionStatus==="explicit","Verbatim reuse requires explicit permission");
    const source=(registry.sources||[]).find(s=>s.id===question.provenance.sourceId);
    assert(source,`Unknown source ${question.provenance.sourceId}`);
    validateSource(source);
    assert(source.allowedForRuntimeImport===true,`Source ${source.id} is not approved for runtime import`);
    return true;
  }

  return {APPROVED_IMPORT,APPROVED_DERIVED,VALIDATOR,REFERENCE,PENDING,EXCLUDED,BLOCKED,validateSource,validateRegistry,validateQuestionProvenance};
});
