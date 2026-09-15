(() => {
  const root = window.CLAUDE_CERT_BANK_EXPANSIONS = window.CLAUDE_CERT_BANK_EXPANSIONS || {};
  const bank = root["ccar-f"] = root["ccar-f"] || {cards:[],questions:[]};
  bank.questions.push(
    {
      id:"ARX-D3-007",domain:"D3",
      q:"A platform team wants Claude Code to follow repository conventions while keeping one-time ticket details out of durable project guidance. Which design is best?",
      choices:["Put stable repository conventions in durable guidance and supply ticket-specific context only for the current task","Store every ticket and temporary discussion permanently in repository guidance","Remove repository guidance and rely on model memory","Duplicate all historical task context into every new session"],
      answer:0,
      why:"Stable project rules belong in durable repository guidance, while transient task details should stay scoped to the current work so context remains maintainable and relevant."
    },
    {
      id:"ARX-D4-007",domain:"D4",
      q:"A classification prompt consistently confuses two adjacent categories even though their definitions are documented. What change is most likely to help?",
      choices:["Add representative labeled examples near the decision boundary","Remove the category definitions","Increase output length without changing instructions","Ask the model to choose randomly when uncertain"],
      answer:0,
      why:"Examples near the decision boundary make subtle distinctions concrete and are especially useful when definitions alone are insufficient."
    },
    {
      id:"ARX-D4-008",domain:"D4",
      q:"A downstream service consumes Claude output programmatically and breaks when wording changes. Which architecture is strongest?",
      choices:["Define a structured output contract and validate it before downstream use","Parse free-form prose with more regular expressions","Rely on a single formatting example without validation","Increase response creativity so formats vary less predictably"],
      answer:0,
      why:"Structured contracts turn machine-consumed output into a testable interface instead of a fragile prose convention."
    },
    {
      id:"ARX-D4-009",domain:"D4",
      q:"A prompt change improves a few demos but may affect many production cases. What should the team do before rollout?",
      choices:["Run the revised prompt against a representative regression eval set","Deploy immediately because the demos improved","Judge only whether the new prompt is shorter","Remove the old test cases so the new version is not constrained"],
      answer:0,
      why:"Prompt changes should be evaluated against representative fixed cases so improvements and regressions are measured rather than guessed."
    },
    {
      id:"ARX-D4-010",domain:"D4",
      q:"A complex task requires extracting evidence, comparing alternatives, and producing a recommendation. What prompt design improves inspectability?",
      choices:["Break the task into explicit stages with checkable intermediate outputs","Ask for one unstructured answer with no intermediate artifacts","Hide the success criteria until the final step","Repeat the source material several times"],
      answer:0,
      why:"Staged prompting makes intermediate work observable and reduces the chance that an early error silently contaminates the final recommendation."
    },
    {
      id:"ARX-D4-011",domain:"D4",
      q:"A high-volume route reuses the same system policy and tool definitions while only user data changes. Which prompt organization best supports maintainability and reuse?",
      choices:["Keep stable shared instructions separate from request-specific dynamic content","Rewrite the shared instructions differently on every call","Mix stable and changing content into one variable block","Duplicate user data inside every instruction section"],
      answer:0,
      why:"Separating stable and dynamic prompt components reduces drift and supports reuse and caching strategies where appropriate."
    },
    {
      id:"ARX-D4-012",domain:"D4",
      q:"An executive summary must distinguish verified facts from assumptions. What should the prompt require?",
      choices:["Label sourced facts, assumptions, and unresolved uncertainty explicitly","Make every statement sound equally certain","Remove source references for readability","Prefer persuasive wording over evidence distinctions"],
      answer:0,
      why:"Explicit evidence labeling makes generated analysis easier to review and reduces the risk of presenting inference as fact."
    },
    {
      id:"ARX-D5-007",domain:"D5",
      q:"A long-running agent accumulates large amounts of history that no longer affect the current task. What is the best context strategy?",
      choices:["Compact durable state and retain or retrieve only task-relevant evidence","Keep the full transcript indefinitely","Repeat old history to increase salience","Discard the current objective instead of old context"],
      answer:0,
      why:"Context should be actively managed so durable state and relevant evidence are preserved without carrying every obsolete token."
    },
    {
      id:"ARX-D5-008",domain:"D5",
      q:"A knowledge corpus is much larger than the useful context for any single request. Which architecture is most appropriate?",
      choices:["Retrieve the most relevant evidence for the current request","Attach the entire corpus to every request","Remove grounding and rely on memory","Choose documents at random to reduce context size"],
      answer:0,
      why:"Retrieval keeps context focused on the evidence needed for the current task and scales better than sending the full corpus repeatedly."
    },
    {
      id:"ARX-D5-009",domain:"D5",
      q:"A multi-step workflow may retry after a temporary service failure. Which design best avoids repeating already-completed effects?",
      choices:["Persist step state and use idempotent or deduplicated operations","Restart every step blindly","Store progress only in model prose","Assume a failed response means no external action occurred"],
      answer:0,
      why:"Durable step state and idempotent operations make retries safer when the completion state of a prior attempt may be uncertain."
    },
    {
      id:"ARX-D5-010",domain:"D5",
      q:"An agent occasionally fails after several model and tool interactions. What observability design most improves diagnosis?",
      choices:["Trace model calls, tool calls, results, timing, and application errors under one correlated run","Log only the final answer","Record only successful tool calls","Use different unrelated identifiers for every step"],
      answer:0,
      why:"A correlated end-to-end trace shows which layer failed and makes multi-step reliability issues diagnosable."
    },
    {
      id:"ARX-D5-011",domain:"D5",
      q:"A noncritical enrichment service is temporarily unavailable, but the core user request can still be completed. What reliability pattern is strongest?",
      choices:["Degrade gracefully by completing the core path and surfacing the missing enrichment","Fail the entire workflow even when the optional step is not required","Invent enrichment data","Retry forever before returning anything"],
      answer:0,
      why:"Graceful degradation preserves useful service when optional dependencies fail while making the limitation explicit."
    },
    {
      id:"ARX-D5-012",domain:"D5",
      q:"How should an architecture team define whether a Claude workflow is reliable enough for production?",
      choices:["Use measurable service objectives plus representative evals that include normal and failure cases","Rely on a single successful demonstration","Use the model's confidence as the reliability metric","Define reliability as producing long answers"],
      answer:0,
      why:"Production reliability needs measurable operational objectives and representative behavioral evaluation, including failure scenarios."
    }
  );
})();
