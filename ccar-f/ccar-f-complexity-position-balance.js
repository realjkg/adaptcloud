(() => {
  if (window.CERT_TRACK !== "ccar-f" || !Array.isArray(window.CCARF_QUESTIONS)) return;
  const calibrated = window.CCARF_QUESTIONS.filter(q => /^CCARF-CX-/.test(q.id));
  calibrated.forEach((q, i) => {
    const target = i % 4;
    if (q.answer === target) return;
    const choices = q.choices.slice();
    [choices[q.answer], choices[target]] = [choices[target], choices[q.answer]];
    q.choices = choices;
    q.answer = target;
  });
})();