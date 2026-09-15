(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"] = root["ccar-p"] || {cards:[],questions:[]};
  bank.cards.push({
    id:"P-P4-10-C",domain:"P4",term:"Bias, fairness, and transparency",
    definition:"Evaluate outcomes across relevant groups, identify where skew enters the system, and provide decision-level evidence appropriate to affected users, reviewers, and regulators.",
    example:"A decision-support workflow shows acceptable aggregate accuracy but materially worse error rates for one customer segment."
  });
  bank.questions.push(
    {
      id:"P-P4-10-A",domain:"P4",
      q:"A customer decision-support system meets its aggregate quality target, but error analysis shows one demographic segment experiences a materially higher false-negative rate. What is the strongest architecture response?",
      choices:["Segment the evaluation, investigate corpus/prompt/routing sources of the disparity, and require remediation or explicit risk acceptance before rollout","Keep the aggregate score because it meets the target","Hide demographic breakdowns to reduce privacy risk","Switch to a larger model without measuring subgroup outcomes again"],
      answer:0,
      why:"Fairness cannot be inferred from an aggregate metric; the architect should measure subgroup outcomes, trace where the skew enters, and govern the residual risk explicitly."
    },
    {
      id:"P-P4-10-B",domain:"P4",
      q:"A regulated AI-assisted decision must be explainable to both an affected customer and an auditor. Which design is most defensible?",
      choices:["Retain decision-level inputs, evidence, routing, and outcome records under governed access, then present audience-appropriate explanations from that evidence","Store only the final model response","Provide the model's hidden reasoning as the compliance record","Use one generic explanation for every decision regardless of evidence"],
      answer:0,
      why:"Transparency needs reconstructable decision evidence with governed retention; explanations should be derived from observable inputs and controls, not unsupported generic text."
    }
  );
})();
