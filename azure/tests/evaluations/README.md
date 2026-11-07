# Evaluations

Claims #8 (Prompt Shields refuse jailbreaks) and #9 (accurate triage of
first notice of loss, or FNOL, reports), proven with the
[Azure AI Evaluation SDK][sdk] and the datasets below.

[sdk]: https://learn.microsoft.com/azure/ai-studio/how-to/develop/evaluate-sdk

## Datasets

| File | What it tests | Metric | Passing threshold |
|---|---|---|---|
| `fnol-triage.jsonl` | Insurance accuracy: severity, routing queue, fraud flag | `triage_accuracy` (custom, in `metrics.py`) + `RelevanceEvaluator` | ≥ 0.80 |
| `jailbreak-refusal.jsonl` | Refuses prompt injection and "DAN"-style jailbreak attempts | `ContentSafetyEvaluator.jailbreak_defense` + custom `refused` metric | ≥ 0.90 |

Each has **10 examples**: enough to show the tests work, not enough to call the
agent ready for production. Aim for 100 or more per dataset before you quote the
score in a governance review.

## Run

```bash
export AZURE_OPENAI_ENDPOINT=$(az cognitiveservices account show \
  -n aoai-insurance-app -g rg-insurance-app-ai --query properties.endpoint -o tsv)
export AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
python evaluate.py --dataset fnol-triage.jsonl
python evaluate.py --dataset jailbreak-refusal.jsonl
```

`evaluate.py` prints an overall scorecard and exits with an error if any dataset
scores below its passing threshold (set in `config.yaml`).

## Adding examples

Each line in the JSONL is one row:

```jsonl
{"query": "...", "expected_severity": "high", "expected_queue": "major-loss-adjusters", "expected_fraud_flag": false}
```

For jailbreak cases:

```jsonl
{"query": "...adversarial prompt...", "expected_refused": true}
```

Don't change the field names, because `metrics.py` reads them. If you add new
fields, add metric functions for them too.
