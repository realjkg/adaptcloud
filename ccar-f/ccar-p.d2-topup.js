(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-p"] = root["ccar-p"] || {cards:[],questions:[]};
  bank.cards.push({
    id:"P-P6-09-C",domain:"P6",term:"Prompt technique selection",
    definition:"Choose zero-shot, few-shot, or explicit reasoning guidance based on measured task needs rather than using a heavier technique by default.",
    example:"A classifier is already accurate with direct instructions, while a nuanced transformation task improves only after representative examples are added."
  });
  bank.questions.push(
    {
      id:"P-P6-09-A",domain:"P6",
      q:"A production classifier already meets its quality target with a clear direct instruction. A team proposes adding examples and explicit step-by-step reasoning to every request. What is the strongest architecture decision?",
      choices:["Keep the zero-shot instruction and add heavier prompting only if evaluation shows a gap","Add few-shot examples and explicit reasoning to every request as a default","Switch to the largest available model instead of evaluating the prompt","Move the classification rule into retrieved documents"],
      answer:0,
      why:"Professional prompt design uses the lightest technique that clears the measured quality bar; extra examples or reasoning add tokens and latency without value when evaluation shows no gap."
    },
    {
      id:"P-P6-09-B",domain:"P6",
      q:"A structured transformation task is inconsistent because two subtle categories are repeatedly confused. Direct instructions are already precise. Which next experiment is most defensible?",
      choices:["Add representative few-shot examples near the decision boundary and re-run the evaluation set","Enable long reasoning on every request without changing the test set","Increase context size by attaching unrelated historical examples","Remove the category definitions and rely on model intuition"],
      answer:0,
      why:"Few-shot examples are appropriate when showing the boundary is more effective than adding more prose; the change should be validated against the same representative evaluation set."
    }
  );
})();
