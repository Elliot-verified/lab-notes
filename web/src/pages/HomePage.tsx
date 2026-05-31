import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Beaker,
  Check,
  FileText,
  FlaskConical,
  History,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api";
import type { Health } from "../api";
import type { NoteSummary, Protocol, Run } from "../types";

type NoteStatus = "draft" | "in_progress" | "complete";

function noteStatus(n: NoteSummary): NoteStatus {
  if (n.step_count === 0) return "draft";
  if (n.step_done_count >= n.step_count) return "complete";
  return "in_progress";
}

const STATUS_PILL: Record<NoteStatus | Run["status"], { label: string; cls: string }> = {
  draft:       { label: "draft",        cls: "pill-pending" },
  in_progress: { label: "in progress",  cls: "pill-active" },
  complete:    { label: "complete",     cls: "pill-done" },
};

export default function HomePage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
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
    } catch (e) { setError(String(e)); }
  }

  async function newNote() {
    try {
      const note = await api.createNote();
      navigate(`/notes/${note.id}`);
    } catch (e) { setError(String(e)); }
  }

  async function deleteNote(id: string, title: string) {
    if (!confirm(`Delete "${title || "Untitled note"}"?`)) return;
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) { setError(String(e)); }
  }

  function startRename(n: NoteSummary) {
    setEditingId(n.id);
    setEditTitle(n.title || "");
  }

  async function commitRename(id: string) {
    const next = editTitle.trim() || "Untitled note";
    setEditingId(null);
    const original = notes.find((n) => n.id === id);
    if (!original || original.title === next) return;
    // optimistic update
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title: next } : n)));
    try {
      await api.updateNote(id, { title: next });
    } catch (e) {
      setError(String(e));
      if (original) {
        setNotes((prev) => prev.map((n) => (n.id === id ? original : n)));
      }
    }
  }

  function cancelRename() {
    setEditingId(null);
    setEditTitle("");
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
          <div className="list-rows">
            {notes.map((n) => {
              const status = noteStatus(n);
              const pill = STATUS_PILL[status];
              const isEditing = editingId === n.id;
              return (
                <div key={n.id} className="list-row">
                  {isEditing ? (
                    <RenameRow
                      icon={<FileText size={14} />}
                      value={editTitle}
                      onChange={setEditTitle}
                      onSave={() => commitRename(n.id)}
                      onCancel={cancelRename}
                    />
                  ) : (
                    <a href={`/notes/${n.id}`} className="list-row-link">
                      <span className="list-row-icon">
                        <FileText size={14} />
                      </span>
                      <span className="list-row-body">
                        <span className="list-row-title">
                          {n.title || "Untitled note"}
                        </span>
                        <span className="list-row-meta">
                          <span>
                            {n.step_count > 0
                              ? `${n.step_done_count}/${n.step_count} steps`
                              : `${n.block_count} block${n.block_count === 1 ? "" : "s"}`}
                          </span>
                          <span className="dot" />
                          <span>{new Date(n.updated_at).toLocaleString()}</span>
                        </span>
                      </span>
                    </a>
                  )}

                  {!isEditing && (
                    <>
                      <span className={`pill ${pill.cls}`}>{pill.label}</span>
                      <span className="list-row-actions">
                        <button
                          className="icon-btn"
                          title="Rename note"
                          onClick={() => startRename(n)}
                          aria-label="Rename note"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Delete note"
                          onClick={() => deleteNote(n.id, n.title)}
                          aria-label="Delete note"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Protocols ────────────────────────────────────────── */}
      <section>
        <div className="section-head"><h2>Protocols</h2></div>
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
        <div className="section-head"><h2>Recent runs</h2></div>
        {runs.length === 0 ? (
          <div className="empty-state">
            <History size={28} />
            <h3>No runs yet</h3>
            <p className="small">Start a protocol above to see it here.</p>
          </div>
        ) : (
          <div className="list-rows">
            {runs.map((r) => {
              const pill = STATUS_PILL[r.status];
              return (
                <div key={r.id} className="list-row">
                  <a href={`/runs/${r.id}`} className="list-row-link">
                    <span className="list-row-icon">
                      <FlaskConical size={14} />
                    </span>
                    <span className="list-row-body">
                      <span className="list-row-title">{r.name}</span>
                      <span className="list-row-meta">
                        <span>{new Date(r.created_at).toLocaleString()}</span>
                      </span>
                    </span>
                  </a>
                  <span className={`pill ${pill.cls}`}>{pill.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function RenameRow({
  icon,
  value,
  onChange,
  onSave,
  onCancel,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="list-row-rename">
      <span className="list-row-icon">{icon}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button className="icon-btn" title="Save" onMouseDown={(e) => { e.preventDefault(); onSave(); }}>
        <Check size={14} />
      </button>
      <button className="icon-btn" title="Cancel" onMouseDown={(e) => { e.preventDefault(); onCancel(); }}>
        <X size={14} />
      </button>
    </div>
  );
}
