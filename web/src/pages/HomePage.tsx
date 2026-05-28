import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

      <section>
        <div className="section-head">
          <h2>Notes</h2>
          <button onClick={newNote} className="plus" title="New note">+ New note</button>
        </div>
        {health && !health.persistent && (
          <div className="warn small">
            ⚠ Storage is ephemeral ({health.db_backend}). {health.note}
          </div>
        )}
        <p className="muted small">
          Free-form scratch space. Inside a note, press <kbd>/</kbd> or drag a
          template in — each step becomes an editable, checkable block.
        </p>
        {notes.length === 0 && <p className="muted">No notes yet.</p>}
        <ul className="note-index">
          {notes.map((n) => (
            <li key={n.id}>
              <a href={`/notes/${n.id}`} className="note-index-link">
                <span className="note-index-title">{n.title || "Untitled note"}</span>
                <span className="muted small">
                  {n.block_count} block{n.block_count === 1 ? "" : "s"} ·{" "}
                  updated {new Date(n.updated_at).toLocaleString()}
                </span>
              </a>
              <button
                className="icon icon-danger note-delete"
                title="Delete note"
                onClick={() => deleteNote(n.id, n.title)}
              >×</button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Protocols</h2>
        <div className="card-grid">
          {protocols.map((p) => (
            <div key={p.id} className="card">
              <div className="card-title">{p.name}</div>
              <div className="card-meta">v{p.version} · {p.steps.length} steps</div>
              <p className="card-desc">{p.description}</p>
              <button onClick={() => start(p.id)}>Start run</button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Recent runs</h2>
        {runs.length === 0 && <p className="muted">No runs yet.</p>}
        <ul className="run-list">
          {runs.map((r) => (
            <li key={r.id}>
              <a href={`/runs/${r.id}`}>
                {r.name}{" "}
                <span className={`status status-${r.status}`}>{r.status}</span>
              </a>
              <span className="muted">
                {" "}— {new Date(r.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
