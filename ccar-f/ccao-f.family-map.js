(() => {
  const families = {
    A1:["AO1.1","AO1.2","AO1.3","AO1.4","AO1.5","AO1.6","AO1.7","AO1.8"],
    A2:["AO2.1","AO2.2","AO2.3","AO2.4","AO2.5","AO2.6","AO2.7","AO2.8","AO2.9"],
    A3:["AO3.1","AO3.2","AO3.3","AO3.4","AO3.5","AO3.6","AO3.7","AO3.8"],
    A4:["AO4.1","AO4.2","AO4.3","AO4.4","AO4.5","AO4.6","AO4.7"],
    A5:["AO5.1","AO5.2","AO5.3","AO5.4","AO5.5","AO5.6"],
    A6:["AO6.1","AO6.2","AO6.3","AO6.4","AO6.5","AO6.6"],
    A7:["AO7.1","AO7.2","AO7.3","AO7.4","AO7.5"]
  };
  const contexts={A1:3,A2:2,A3:2,A4:2,A5:2,A6:2,A7:2};
  const seedFamilies={
    "AOQ-A1-01":"AO1.1","AOQ-A1-02":"AO1.2","AOQ-A1-03":"AO1.5",
    "AOQ-A2-01":"AO2.2","AOQ-A2-02":"AO2.1","AOQ-A2-03":"AO2.3",
    "AOQ-A3-01":"AO3.1","AOQ-A3-02":"AO3.2","AOQ-A3-03":"AO3.8",
    "AOQ-A4-01":"AO4.1","AOQ-A4-02":"AO4.2","AOQ-A4-03":"AO4.3",
    "AOQ-A5-01":"AO5.3","AOQ-A5-02":"AO5.1","AOQ-A5-03":"AO5.6",
    "AOQ-A6-01":"AO6.1","AOQ-A6-02":"AO6.2","AOQ-A6-03":"AO6.1",
    "AOQ-A7-01":"AO7.1","AOQ-A7-02":"AO7.2","AOQ-A7-03":"AO7.5"
  };

  const seed=((window.CLAUDE_CERT_SEED_DATA||{})["ccao-f"]||{}).questions||[];
  seed.forEach(q=>{
    const familyId=seedFamilies[q.id];
    if(familyId){q.familyId=familyId;q.variantId=q.id}
  });

  const expansion=((window.CLAUDE_CERT_BANK_EXPANSIONS||{})["ccao-f"]||{}).questions||[];
  expansion.forEach(q=>{
    const m=String(q.id||"").match(/^AOX-(A[1-7])-(\d{3})$/);
    if(!m)return;
    const domain=m[1], n=Number(m[2]);
    const family=families[domain]?.[Math.floor((n-1)/contexts[domain])];
    if(family){q.familyId=family;q.variantId=q.id}
  });

  window.CCAOF_FAMILY_MAP={families,contexts,seedFamilies};
})();
