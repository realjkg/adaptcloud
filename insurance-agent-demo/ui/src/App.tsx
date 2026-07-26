import { useState } from "react";
import FnolForm from "./components/FnolForm";
import TriageCard from "./components/TriageCard";

export interface TriageResult {
  mode: "local" | "azure";
  claim: {
    claimId: string;
    policyId: string;
    state: string;
    lossType: string;
    lossDate: string;
  };
  decision: {
    severity: "low" | "medium" | "high" | "catastrophic";
    routingQueue: string;
    fraudFlag: boolean;
    rationale: string;
  };
  prompt_tokens_estimated: number;
}

const SAMPLE = "Rear-ended at a stop light, minor bumper damage, other driver has insurance and admitted fault. No injuries reported.";

export default function App() {
  const [narrative, setNarrative] = useState(SAMPLE);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ narrative }),
      });
      if (!r.ok) {
        const detail = await r.text();
        throw new Error(`${r.status}: ${detail}`);
      }
      setResult(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Adapt Cloud — Claims Triage Agent</h1>
        <p className="subtitle">
          Governed AI agent with an <strong>Entra Managed Service Identity</strong>. Auth to Azure OpenAI is via
          <code> DefaultAzureCredential</code> — no API keys anywhere in this container.
        </p>
      </header>

      <FnolForm value={narrative} onChange={setNarrative} onSubmit={submit} loading={loading} />

      {error && <div className="error">{error}</div>}
      {result && <TriageCard result={result} />}

      <footer>
        <a href="https://github.com/realjkg/adaptcloud/tree/main/azure" target="_blank" rel="noreferrer">
          docs
        </a>{" "}
        · MODE reflected in each response · <code>/health</code> reports the current mode
      </footer>
    </div>
  );
}
