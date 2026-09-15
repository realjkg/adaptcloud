window.CLAUDE_CERTIFICATIONS = {
  "ccao-f": {
    code: "CCAO-F",
    role: "Associate",
    level: "Foundations",
    title: "Claude Certified Associate – Foundations",
    audience: "Non-developer professionals using Claude for practical business and productivity work.",
    questionCount: 60,
    minutes: 120,
    scaledPassingScore: 720,
    progressKey: "claude-cert-ccao-f-v1",
    readinessProfile: "associate",
    bankStatus: "seed",
    domains: {
      A1: { name: "Output Evaluation and Validation", weight: 21, mock: 13 },
      A2: { name: "Workflow Integration and Solution Design", weight: 16, mock: 10 },
      A3: { name: "Governance, Risk, and Responsible Use", weight: 15, mock: 9 },
      A4: { name: "Prompting and Task Execution", weight: 14, mock: 8 },
      A5: { name: "Product and Model Selection", weight: 12, mock: 7 },
      A6: { name: "Configuration and Knowledge Management", weight: 12, mock: 7 },
      A7: { name: "Troubleshooting and Optimization", weight: 10, mock: 6 }
    },
    adaptive: {
      focus: "business judgment, output validation, workflow quality, product selection, responsible use",
      minDomainAttempts: 8,
      targetAccuracy: 0.88,
      fullMockReadyWhenBankComplete: true
    }
  },
  "ccdv-f": {
    code: "CCDV-F",
    role: "Developer",
    level: "Foundations",
    title: "Claude Certified Developer – Foundations",
    audience: "Engineers building and shipping applications, agents, tools, and integrations on Claude.",
    questionCount: 53,
    minutes: 120,
    scaledPassingScore: 720,
    progressKey: "claude-cert-ccdv-f-v1",
    readinessProfile: "developer",
    bankStatus: "seed",
    domains: {
      D1: { name: "Applications and Integration", weight: 33.1, mock: 18 },
      D2: { name: "Model Selection and Optimization", weight: 16.8, mock: 9 },
      D3: { name: "Agents and Workflows", weight: 14.7, mock: 8 },
      D4: { name: "Prompt and Context Engineering", weight: 11.0, mock: 6 },
      D5: { name: "Tools and MCPs", weight: 10.6, mock: 5 },
      D6: { name: "Security and Safety", weight: 8.1, mock: 4 },
      D7: { name: "Claude Code", weight: 3.1, mock: 2 },
      D8: { name: "Eval, Testing, and Debugging", weight: 2.6, mock: 1 }
    },
    adaptive: {
      focus: "implementation correctness, API mechanics, debugging, production engineering, security, tool/MCP behavior",
      minDomainAttempts: 10,
      targetAccuracy: 0.90,
      fullMockReadyWhenBankComplete: true
    }
  },
  "ccar-f": {
    code: "CCAR-F",
    role: "Architect",
    level: "Foundations",
    title: "Claude Certified Architect – Foundations",
    audience: "Solution architects designing and building production agent systems with Claude.",
    questionCount: 60,
    minutes: 120,
    scaledPassingScore: 720,
    progressKey: "ccar-f-study-sim-v2",
    readinessProfile: "architect",
    bankStatus: "complete",
    domains: {
      D1: { name: "Agentic Architecture & Orchestration", weight: 27, mock: 16 },
      D2: { name: "Tool Design & MCP Integration", weight: 18, mock: 11 },
      D3: { name: "Claude Code Configuration & Workflows", weight: 20, mock: 12 },
      D4: { name: "Prompt Engineering & Structured Output", weight: 20, mock: 12 },
      D5: { name: "Context Management & Reliability", weight: 15, mock: 9 }
    },
    adaptive: {
      focus: "architecture tradeoffs, orchestration, governance boundaries, reliability, context strategy",
      minDomainAttempts: 10,
      targetAccuracy: 0.90,
      fullMockReadyWhenBankComplete: true
    }
  },
  "ccar-p": {
    code: "CCAR-P",
    role: "Architect",
    level: "Professional",
    title: "Claude Certified Architect – Professional",
    audience: "Senior architects designing, integrating, evaluating, and governing Claude systems at enterprise scale.",
    questionCount: null,
    minutes: 120,
    scaledPassingScore: 720,
    progressKey: "claude-cert-ccar-p-v1",
    readinessProfile: "professional-architect",
    bankStatus: "planned",
    domains: {},
    adaptive: {
      focus: "enterprise integration architecture, governance, evaluation, lifecycle, scale, and defensible tradeoffs",
      minDomainAttempts: 12,
      targetAccuracy: 0.92,
      fullMockReadyWhenBankComplete: false
    }
  }
};

window.CLAUDE_CERT_DEFAULT = "ccar-f";
