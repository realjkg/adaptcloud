(() => {
  const body = document.getElementById("quizBody");
  if (!body) return;

  function syncExamIntro() {
    const profile = window.CERT_PROFILE;
    if (!profile) return;
    const values = body.querySelectorAll(".exam-intro-grid strong");
    if (values.length >= 2) {
      if (Number.isInteger(profile.questionCount)) values[0].textContent = String(profile.questionCount);
      if (Number.isFinite(profile.minutes)) values[1].textContent = String(profile.minutes);
    }
  }

  const observer = new MutationObserver(syncExamIntro);
  observer.observe(body, { childList: true, subtree: true });
  syncExamIntro();
})();
