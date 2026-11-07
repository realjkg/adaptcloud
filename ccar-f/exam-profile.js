(() => {
  const body = document.getElementById("quizBody");
  if (!body) return;

  function setIfChanged(el, value) {
    if (value !== null && el.textContent !== value) el.textContent = value;
  }

  function syncExamIntro() {
    const profile = window.CERT_PROFILE;
    if (!profile) return;
    const values = body.querySelectorAll(".exam-intro-grid strong");
    if (values.length >= 2) {
      // Write only when the value differs: setting textContent replaces the text node, which is a
      // childList mutation, so an unconditional write re-triggers this observer forever and freezes the page.
      setIfChanged(values[0], Number.isInteger(profile.questionCount) ? String(profile.questionCount) : null);
      setIfChanged(values[1], Number.isFinite(profile.minutes) ? String(profile.minutes) : null);
    }
  }

  const observer = new MutationObserver(syncExamIntro);
  observer.observe(body, { childList: true, subtree: true });
  syncExamIntro();
})();
