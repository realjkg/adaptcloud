(() => {
  const selection = window.CCARFSelection;
  if (!selection) throw new Error("CCAR-F selection engine is not loaded");
  if (typeof QUESTIONS === "undefined" || typeof DOMAINS === "undefined") throw new Error("CCAR-F runtime data is unavailable");

  randomPractice = function(n = 20) {
    return selection.practiceSet(QUESTIONS, n, Math.random);
  };

  adaptiveSet = function(n = 25) {
    const chosen = [];
    const usedIds = new Set();
    const usedFamilies = new Set();

    const rank = q => {
      const p = qP(q.id);
      const attempts = p.attempts || 0;
      const accuracy = attempts ? (p.correct || 0) / attempts : 0;
      return [-(p.lastWrong || 0), attempts, accuracy, Math.random()];
    };
    const cmp = (a, b) => {
      const A = rank(a), B = rank(b);
      for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] - B[i];
      return 0;
    };

    while (chosen.length < n) {
      const domains = Object.keys(DOMAINS).sort((a, b) => weakScore(a) - weakScore(b));
      let pick = null;

      for (const domain of domains) {
        const freshFamilies = QUESTIONS.filter(q =>
          q.domain === domain &&
          !usedIds.has(q.id) &&
          !usedFamilies.has(selection.familyKey(q))
        ).sort(cmp);
        if (freshFamilies.length) {
          pick = freshFamilies[0];
          break;
        }
      }

      if (!pick) {
        for (const domain of domains) {
          const remaining = QUESTIONS.filter(q => q.domain === domain && !usedIds.has(q.id)).sort(cmp);
          if (remaining.length) {
            pick = remaining[0];
            break;
          }
        }
      }

      if (!pick) break;
      chosen.push(pick.id);
      usedIds.add(pick.id);
      usedFamilies.add(selection.familyKey(pick));
    }

    return chosen;
  };

  weightedMock = function() {
    const ids = selection.weightedMock(QUESTIONS, DOMAINS, Math.random);
    const expected = Object.values(DOMAINS).reduce((sum, d) => sum + (d.mock || 0), 0);
    if (ids.length !== expected || new Set(ids).size !== ids.length) {
      throw new Error(`CCAR-F mock selection failed closed: expected ${expected} unique items, received ${ids.length}`);
    }
    return ids;
  };

  window.CCARF_SELECTION_PATCHED = true;
})();
