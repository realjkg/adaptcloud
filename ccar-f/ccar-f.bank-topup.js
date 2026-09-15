(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-f"] = root["ccar-f"] || {cards:[],questions:[]};
  bank.questions.push({
    id:"ARX-D3-007",
    domain:"D3",
    q:"A platform team wants Claude Code to follow repository conventions while keeping one-time ticket details out of durable project guidance. Which design is best?",
    choices:[
      "Put stable repository conventions in durable guidance and supply ticket-specific context only for the current task",
      "Store every ticket and temporary discussion permanently in repository guidance",
      "Remove repository guidance and rely on model memory",
      "Duplicate all historical task context into every new session"
    ],
    answer:0,
    why:"Stable project rules belong in durable repository guidance, while transient task details should stay scoped to the current work so context remains maintainable and relevant."
  });
})();
