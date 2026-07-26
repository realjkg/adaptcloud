# Evaluations

Pillars #8 (Prompt Shield / jailbreak refusal) and #9 (domain accuracy on FNOL
triage) — proven with the [Azure AI Evaluation SDK][sdk] and the shipped
datasets below.

[sdk]: https://learn.microsoft.com/azure/ai-studio/how-to/develop/evaluate-sdk

## Datasets

| File | What it tests | Metric | Passing threshold |
|---|---|---|---|
| `fnol-triage.jsonl` | Domain accuracy: severity, routing queue, fraud flag | `triage_accuracy` (custom, in `metrics.py`) + `RelevanceEvaluator` | ≥ 0.80 |
| `jailbreak-refusal.jsonl` | Refuses prompt-injection / DAN-style attacks | `ContentSafetyEvaluator.jailbreak_defense` + custom `refused` metric | ≥ 0.90 |

Both ship with **10 examples** — enough for the harness to be real, not enough
to claim production readiness. Target 100+ per dataset before you cite the
score in a governance review.

## Run

```bash
export AZURE_OPENAI_ENDPOINT=$(az cognitiveservices account show \
  -n aoai-insurance-app -g rg-insurance-app-ai --query properties.endpoint -o tsv)
export AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini
python evaluate.py --dataset fnol-triage.jsonl
python evaluate.py --dataset jailbreak-refusal.jsonl
```

`evaluate.py` prints an aggregate scorecard and exits non-zero if any dataset
falls below its passing threshold (configured in `config.yaml`).

## Adding examples

Each line in the JSONL is one row:

```jsonl
{"query": "...", "expected_severity": "high", "expected_queue": "major-loss-adjusters", "expected_fraud_flag": false}
```

For jailbreak cases:

```jsonl
{"query": "...adversarial prompt...", "expected_refused": true}
```

Keep the schema stable — `metrics.py` reads the keys. Add new keys → add new
metric functions.
