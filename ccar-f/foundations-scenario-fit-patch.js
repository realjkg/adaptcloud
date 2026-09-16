(() => {
  const sim = (window.FOUNDATIONS_EXAM_SIM || {})["CCAR-F"];
  if (!sim || typeof sim.buildForm !== "function") return;

  const baseBuildForm = sim.buildForm;
  const stems = {
    D1: "Within this scenario, the team wants Claude to retain useful autonomy while execution remains predictable and high-impact actions stay behind a hard boundary. Which TWO architecture controls best satisfy that requirement?",
    D2: "Within this scenario, the available tool surface is growing, some capabilities overlap, and at least one action has a materially larger blast radius. Which TWO design changes most improve tool-selection quality and safety?",
    D3: "Within this scenario, Claude Code behavior must be consistent across people or automation while execution permissions remain appropriately bounded. Which TWO configuration practices best support that goal?",
    D4: "Within this scenario, a machine-consumed Claude step sometimes produces malformed structure or fills missing information with unsupported values. Which TWO controls most directly address those failure modes?",
    D5: "Within this scenario, context is growing and intermediate steps are returning more history than the next step actually needs. Which TWO context-management choices best preserve useful state without flooding the working context?"
  };

  sim.buildForm = (rng = Math.random) => baseBuildForm(rng).map(item => {
    if (item?.itemType !== "multi" || !stems[item.domain]) return item;
    return {...item, q: stems[item.domain], scenarioFit:"ccar-f-context-neutral-v1"};
  });
  sim.scenarioFitPatch = "ccar-f-context-neutral-v1";
})();
