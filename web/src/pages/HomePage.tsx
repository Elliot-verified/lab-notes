import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  FlaskConical,
  Plus,
  X,
  Beaker,
  History,
  AlertTriangle,
} from "lucide-react";
import { api } from "../api";
import type { Health } from "../api";
import type { NoteSummary, Protocol, Run } from "../types";

export default function HomePage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.listProtocols(), api.listRuns(), api.listNotes(), api.health()])
      .then(([p, r, n, h]) => {
        setProtocols(p);
        setRuns(r);
        setNotes(n);
        setHealth(h);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function start(protocolId: string) {
    try {
      const run = await api.createRun(protocolId);
      navigate(`/runs/${run.id}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function newNote() {
    try {
      const note = await api.createNote();
      navigate(`/notes/${note.id}`);
    } catch (e) {
      setError(String(e));
    }
  }

  async function deleteNote(id: string, title: string) {
    if (!confirm(`Delete "${title || "Untitled note"}"?`)) return;
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {/* ── Notes ────────────────────────────────────────────── */}
      <section>
        <div className="section-head">
          <h2>Notes</h2>
          <button className="primary" onClick={newNote}>
            <Plus size={14} /> New note
          </button>
        </div>
        {health && !health.persistent && (
          <div className="callout" style={{ marginBottom: 12 }}>
            <AlertTriangle size={14} style={{ marginTop: 2 }} />
            <span>
              Storage is ephemeral ({health.db_backend}). {health.note}
            </span>
          </div>
        )}
        <p className="section-intro">
          Free-form scratch space. Press <kbd>/</kbd> or drag a template in — each
          step becomes an editable, checkable block.
        </p>

        {notes.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} />
            <h3>No notes yet</h3>
            <p className="small">Start a fresh lab notebook entry.</p>
          </div>
        ) : (
          <ul className="note-index">
            {notes.map((n) => (
              <li key={n.id}>
                <a href={`/notes/${n.id}`} className="note-index-link">
                  <span className="note-index-icon">
                    <FileText size={16} />
                  </span>
                  <span className="note-index-body">
                    <span className="note-index-title">
                      {n.title || "Untitled note"}
                    </span>
                    <span className="note-index-meta">
                      <span>
                        {n.block_count} block{n.block_count === 1 ? "" : "s"}
                      </span>
                      <span className="dot" />
                      <span>{new Date(n.updated_at).toLocaleString()}</span>
                    </span>
                  </span>
                </a>
                <button
                  className="icon-btn danger note-delete"
                  title="Delete note"
                  onClick={() => deleteNote(n.id, n.title)}
                  aria-label="Delete note"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Protocols ────────────────────────────────────────── */}
      <section>
        <div className="section-head">
          <h2>Protocols</h2>
        </div>
        <p className="section-intro">
          Start a run — the checklist adapts as you enter results.
        </p>
        <div className="card-grid">
          {protocols.map((p) => (
            <div key={p.id} className="protocol-card">
              <span className="icon-tile">
                <Beaker size={16} />
              </span>
              <div className="protocol-card-title">{p.name}</div>
              <div className="protocol-card-meta">
                <span>v{p.version}</span>
                <span>·</span>
                <span>{p.steps.length} steps</span>
              </div>
              <p className="protocol-card-desc">{p.description}</p>
              <button className="primary" onClick={() => start(p.id)}>
                <FlaskConical size={14} /> Start run
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recent runs ──────────────────────────────────────── */}
      <section>
        <div className="section-head">
          <h2>Recent runs</h2>
        </div>
        {runs.length === 0 ? (
          <div className="empty-state">
            <History size={28} />
            <h3>No runs yet</h3>
            <p className="small">Start a protocol above to see it here.</p>
          </div>
        ) : (
          <div>
            {runs.map((r) => (
              <a key={r.id} href={`/runs/${r.id}`} className="run-row">
                <span className="run-row-icon">
                  <FlaskConical size={14} />
                </span>
                <span className="run-row-body">
                  <span className="run-row-title">{r.name}</span>
                  <span className="run-row-meta">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </span>
                </span>
                <span className={`pill pill-${r.status === "complete" ? "done" : "active"}`}>
                  {r.status === "complete" ? "complete" : "in progress"}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
