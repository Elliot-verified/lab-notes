import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import type { ResultField, Run, RunStep } from "../types";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    api.getRun(runId).then(setRun).catch((e) => setError(String(e)));
  }, [runId]);

  if (!run) return <p>{error || "Loading…"}</p>;

  const nextStepIndex = run.steps.findIndex((s) => s.status === "pending");

  async function handleComplete(step: RunStep, results: Record<string, unknown>, note: string, skip: boolean) {
    try {
      const updated = await api.completeStep(run!.id, step.step_id, { results, note, skip });
      setRun(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSync() {
    try {
      const res = await api.sync(run!.id);
      setSyncResult(res.web_url || res.benchling_entry_id);
      setRun(await api.getRun(run!.id));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      <div className="run-header">
        <div>
          <h2>{run.name}</h2>
          <div className="muted">
            {run.protocol_id} · v{run.protocol_version} ·{" "}
            <span className={`status status-${run.status}`}>{run.status}</span>
          </div>
        </div>
        <div className="run-actions">
          <button onClick={handleSync}>
            {run.benchling_entry_id ? "Re-sync to Benchling" : "Sync to Benchling"}
          </button>
          {run.benchling_entry_id && (
            <div className="muted small">entry: {run.benchling_entry_id}</div>
          )}
          {syncResult && (
            <div className="small">
              <a href={syncResult} target="_blank" rel="noreferrer">open in Benchling →</a>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <ol className="steps">
        {run.steps.map((s, i) => (
          <StepRow
            key={`${s.step_id}-${s.position}`}
            step={s}
            isActive={i === nextStepIndex}
            onComplete={handleComplete}
          />
        ))}
      </ol>
    </div>
  );
}

function StepRow({
  step,
  isActive,
  onComplete,
}: {
  step: RunStep;
  isActive: boolean;
  onComplete: (s: RunStep, results: Record<string, unknown>, note: string, skip: boolean) => void;
}) {
  const [results, setResults] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  function submit(skip: boolean) {
    const parsed: Record<string, unknown> = {};
    for (const field of step.result_fields) {
      const raw = results[field.name];
      if (raw === undefined || raw === "") continue;
      if (field.type === "number") parsed[field.name] = Number(raw);
      else if (field.type === "boolean") parsed[field.name] = raw === "true";
      else parsed[field.name] = raw;
    }
    onComplete(step, parsed, note, skip);
  }

  return (
    <li className={`step step-${step.status} ${isActive ? "active" : ""}`}>
      <div className="step-header">
        <span className={`pill pill-${step.status}`}>{step.status}</span>
        <span className="step-title">{step.title}</span>
        {step.duration && <span className="duration-chip">⏱ {step.duration}</span>}
      </div>
      {step.description && <p className="step-desc">{step.description}</p>}

      {step.status === "done" && Object.keys(step.results).length > 0 && (
        <div className="step-results small">
          {Object.entries(step.results).map(([k, v]) => (
            <span key={k} className="result-chip">
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}

      {isActive && (
        <div className="step-form">
          {step.result_fields.map((f: ResultField) => (
            <label key={f.name} className="field">
              <span>{f.label || f.name}{f.unit ? ` (${f.unit})` : ""}</span>
              {f.type === "boolean" ? (
                <select
                  value={results[f.name] ?? ""}
                  onChange={(e) =>
                    setResults((r) => ({ ...r, [f.name]: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  step="any"
                  value={results[f.name] ?? ""}
                  onChange={(e) =>
                    setResults((r) => ({ ...r, [f.name]: e.target.value }))
                  }
                />
              )}
            </label>
          ))}
          <label className="field">
            <span>Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <button onClick={() => submit(false)}>Mark done</button>
            <button className="ghost" onClick={() => submit(true)}>Skip</button>
          </div>
        </div>
      )}
    </li>
  );
}
