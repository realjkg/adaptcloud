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
  bank.questions.push({
    id:"ARX-D4-007",
    domain:"D4",
    q:"A backend API parses Claude output to trigger workflows. Which approach best reduces parsing drift over time?",
    choices:[
      "Define a strict structured schema and reject responses that fail validation",
      "Accept any prose and use regex patches when formats change",
      "Let each caller parse output differently",
      "Rely on higher temperature to improve consistency"
    ],
    answer:0,
    why:"Schema-based validation makes machine consumption reliable and surfaces regressions early when output contracts change."
  });
  bank.questions.push({
    id:"ARX-D4-008",
    domain:"D4",
    q:"A team injects retrieved documentation into prompts. What prompt design most protects system instructions from being overridden?",
    choices:[
      "Clearly delimit retrieved text as untrusted data and keep policy instructions in separate trusted sections",
      "Merge retrieved text and policy into one block so all instructions are equal",
      "Put policy rules at the very end of retrieved content",
      "Let retrieved snippets redefine policy when they look authoritative"
    ],
    answer:0,
    why:"Separating trusted instructions from untrusted retrieved content preserves instruction hierarchy and reduces prompt-injection risk."
  });
  bank.questions.push({
    id:"ARX-D4-009",
    domain:"D4",
    q:"Several services reuse a core prompt with minor task variations. Which structure is most maintainable?",
    choices:[
      "Compose prompts from shared policy modules plus task-specific context blocks",
      "Copy the full prompt into every service and edit independently",
      "Keep one giant prompt with all variants always included",
      "Allow each caller to redefine the safety and output rules ad hoc"
    ],
    answer:0,
    why:"Modular prompt composition minimizes drift, improves reuse, and keeps stable policy centralized while allowing controlled variation."
  });
  bank.questions.push({
    id:"ARX-D4-010",
    domain:"D4",
    q:"A system must emit JSON objects consumed by strict downstream validators. Which testing strategy gives the strongest confidence?",
    choices:[
      "Run contract tests that validate generated output against the schema across representative scenarios",
      "Manually spot-check a few successful responses in production",
      "Check only that responses are non-empty strings",
      "Disable validation for edge-case inputs"
    ],
    answer:0,
    why:"Contract tests over representative cases verify structured output behavior before deployment and catch schema violations consistently."
  });
})();
