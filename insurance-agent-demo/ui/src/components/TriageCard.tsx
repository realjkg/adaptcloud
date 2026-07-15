import type { TriageResult } from "../App";

const SEVERITY_CLASS: Record<string, string> = {
  low: "sev-low",
  medium: "sev-medium",
  high: "sev-high",
  catastrophic: "sev-catastrophic",
};

export default function TriageCard({ result }: { result: TriageResult }) {
  const { decision, claim, mode } = result;
  return (
    <section className={`triage-card ${SEVERITY_CLASS[decision.severity] ?? ""}`}>
      <div className="triage-header">
        <span className={`badge severity ${SEVERITY_CLASS[decision.severity] ?? ""}`}>
          {decision.severity.toUpperCase()}
        </span>
        <span className="badge queue">{decision.routingQueue}</span>
        {decision.fraudFlag && <span className="badge fraud">FRAUD FLAGGED</span>}
        <span className={`badge mode mode-${mode}`}>mode: {mode}</span>
      </div>
      <p className="rationale">{decision.rationale}</p>
      <dl className="claim">
        <dt>Claim ID</dt>
        <dd><code>{claim.claimId}</code></dd>
        <dt>Policy</dt>
        <dd><code>{claim.policyId}</code></dd>
        <dt>State</dt>
        <dd>{claim.state}</dd>
        <dt>Loss type / date</dt>
        <dd>{claim.lossType} · {claim.lossDate}</dd>
      </dl>
    </section>
  );
}
