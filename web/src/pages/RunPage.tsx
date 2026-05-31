import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Clock,
  GitBranch,
  Share2,
  SkipForward,
} from "lucide-react";
import { api } from "../api";
import type { ResultField, Run, RunStep } from "../types";

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [branchedIds, setBranchedIds] = useState<Set<number>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    api.getRun(runId).then(setRun).catch((e) => setError(String(e)));
  }, [runId]);

  async function handleComplete(
    step: RunStep,
    results: Record<string, unknown>,
    note: string,
    skip: boolean
  ) {
    if (!run) return;
    const before = new Set(run.steps.map((s) => s.id));
    try {
      const updated = await api.completeStep(run.id, step.step_id, {
        results,
        note,
        skip,
      });
      const newIds = new Set(
        updated.steps.filter((s) => !before.has(s.id)).map((s) => s.id)
      );
      setBranchedIds(newIds);
      if (newIds.size > 0) {
        setBanner(
          `Protocol adapted — ${newIds.size} step${
            newIds.size === 1 ? "" : "s"
          } added based on your result.`
        );
        window.setTimeout(() => setBanner(null), 6000);
      }
      setRun(updated);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSync() {
    if (!run) return;
    try {
      const res = await api.sync(run.id);
      setSyncResult(res.web_url || res.benchling_entry_id);
      setRun(await api.getRun(run.id));
    } catch (e) {
      setError(String(e));
    }
  }

  if (!run) return <p>{error || "Loading…"}</p>;

  const nextStepIndex = run.steps.findIndex((s) => s.status === "pending");
  const doneCount = run.steps.filter((s) => s.status !== "pending").length;
  const pct = Math.round((doneCount / run.steps.length) * 100);

  return (
    <div>
      <Link to="/" className="back-link">
        <ArrowLeft size={14} /> All runs
      </Link>

      <div className="run-header">
        <div>
          <h1>{run.name}</h1>
          <div className="run-header-meta">
            <span className="mono">{run.protocol_id}</span>
            <span>·</span>
            <span>v{run.protocol_version}</span>
            <span>·</span>
            <span
              className={`pill pill-${
                run.status === "complete" ? "done" : "active"
              }`}
            >
              {run.status === "complete" ? "complete" : "in progress"}
            </span>
          </div>
        </div>
        <div className="run-actions">
          <button className="ghost" onClick={handleSync}>
            <Share2 size={14} />
            {run.benchling_entry_id ? "Re-sync" : "Sync to Benchling"}
          </button>
          {syncResult && (
            <a
              href={syncResult}
              target="_blank"
              rel="noreferrer"
              className="small"
              style={{ color: "var(--accent)" }}
            >
              open ↗
            </a>
          )}
        </div>
      </div>

      <div className="run-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="run-progress-text">
          {doneCount} of {run.steps.length} steps
        </span>
      </div>

      {banner && (
        <div className="banner">
          <GitBranch size={14} />
          <span>{banner}</span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <ol className="steps">
        {run.steps.map((s, i) => (
          <StepRow
            key={s.id}
            step={s}
            isActive={i === nextStepIndex}
            isBranched={branchedIds.has(s.id)}
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
  isBranched,
  onComplete,
}: {
  step: RunStep;
  isActive: boolean;
  isBranched: boolean;
  onComplete: (
    s: RunStep,
    results: Record<string, unknown>,
    note: string,
    skip: boolean
  ) => void;
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

  const statusClass = `is-${step.status}`;

  return (
    <li
      className={`step ${statusClass} ${isActive ? "active" : ""} ${
        isBranched ? "is-branched" : ""
      }`}
    >
      <span className="step-marker" aria-hidden>
        {step.status === "done" && <Check size={14} strokeWidth={3} />}
        {step.status === "skipped" && <SkipForward size={12} />}
      </span>

      <div className="step-body">
        <div className="step-title-row">
          <span className="step-title">{step.title}</span>
          {step.duration && (
            <span className="chip">
              <Clock size={11} /> {step.duration}
            </span>
          )}
          {isBranched && (
            <span className="pill pill-branched">
              <GitBranch size={10} /> branched
            </span>
          )}
        </div>

        {step.description && <p className="step-desc">{step.description}</p>}

        {step.status === "done" && Object.keys(step.results).length > 0 && (
          <div className="step-results">
            {Object.entries(step.results).map(([k, v]) => (
              <span key={k} className="result-chip">
                <span className="k">{k}</span>
                {String(v)}
              </span>
            ))}
          </div>
        )}

        {isActive && (
          <div className="step-form">
            {step.result_fields.map((f: ResultField) => (
              <label key={f.name} className="field">
                <span>
                  {f.label || f.name}
                  {f.unit ? ` (${f.unit})` : ""}
                </span>
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
              <button className="primary" onClick={() => submit(false)}>
                <Check size={14} /> Mark done
              </button>
              <button className="ghost" onClick={() => submit(true)}>
                <SkipForward size={14} /> Skip
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
