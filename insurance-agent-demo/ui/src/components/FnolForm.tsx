interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export default function FnolForm({ value, onChange, onSubmit, loading }: Props) {
  return (
    <section className="fnol">
      <label htmlFor="narrative">First notice of loss (FNOL)</label>
      <textarea
        id="narrative"
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe what happened…"
      />
      <button onClick={onSubmit} disabled={loading || value.trim().length < 10}>
        {loading ? "Triaging…" : "Submit FNOL"}
      </button>
    </section>
  );
}
