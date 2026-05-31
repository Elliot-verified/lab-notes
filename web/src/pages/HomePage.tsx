import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Beaker,
  Check,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api";
import type { Health } from "../api";
import type { NoteBlock, NoteSummary, Protocol } from "../types";

type NoteStatus = "draft" | "in_progress" | "complete";

function noteStatus(n: NoteSummary): NoteStatus {
  if (n.step_count === 0) return "draft";
  if (n.step_done_count >= n.step_count) return "complete";
  return "in_progress";
}

const STATUS_PILL: Record<NoteStatus, { label: string; cls: string }> = {
  draft:       { label: "draft",        cls: "pill-pending" },
  in_progress: { label: "in progress",  cls: "pill-active" },
  complete:    { label: "complete",     cls: "pill-done" },
};

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function HomePage() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.listProtocols(), api.listNotes(), api.health()])
      .then(([p, n, h]) => {
        setProtocols(p);
        setNotes(n);
        setHealth(h);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function createBlank() {
    try {
      const note = await api.createNote();
      navigate(`/notes/${note.id}`);
    } catch (e) { setError(String(e)); }
  }

  async function createFromTemplate(p: Protocol) {
    try {
      const note = await api.createNote(p.name);
      const blocks: NoteBlock[] = p.steps.map((s) => ({
        id: newId(),
        type: "step" as const,
        title: s.title,
        description: s.description ?? "",
        duration: s.duration ?? null,
        status: "pending" as const,
      }));
      await api.updateNote(note.id, { blocks });
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

      <section>
        <div className="section-head">
          <h2>Notes</h2>
          <button className="primary" onClick={() => setPickerOpen(true)}>
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
            <p className="small">
              Click <strong>New note</strong> to start blank or from a template.
            </p>
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

      {pickerOpen && (
        <NewNotePicker
          protocols={protocols}
          onClose={() => setPickerOpen(false)}
          onPickBlank={() => {
            setPickerOpen(false);
            createBlank();
          }}
          onPickTemplate={(p) => {
            setPickerOpen(false);
            createFromTemplate(p);
          }}
        />
      )}
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

function NewNotePicker({
  protocols,
  onClose,
  onPickBlank,
  onPickTemplate,
}: {
  protocols: Protocol[];
  onClose: () => void;
  onPickBlank: () => void;
  onPickTemplate: (p: Protocol) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const filteredProtocols = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return protocols;
    return protocols.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [protocols, query]);

  // Items: "Blank note" is always at index 0 when query is empty; otherwise hide it.
  const showBlank = query.trim() === "";
  const totalItems = (showBlank ? 1 : 0) + filteredProtocols.length;

  function pickAt(i: number) {
    if (showBlank && i === 0) return onPickBlank();
    const tplIdx = showBlank ? i - 1 : i;
    const p = filteredProtocols[tplIdx];
    if (p) onPickTemplate(p);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickAt(index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="slash-backdrop" onClick={onClose}>
      <div className="slash-popover" onClick={(e) => e.stopPropagation()}>
        <div className="slash-search">
          <Search size={14} color="var(--muted)" />
          <input
            autoFocus
            placeholder="Start blank or search a template…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="slash-list">
          {showBlank && (
            <li
              className={index === 0 ? "active" : ""}
              onMouseEnter={() => setIndex(0)}
              onClick={onPickBlank}
            >
              <span className="icon-tile">
                <FileText size={14} />
              </span>
              <div>
                <div className="slash-name">Blank note</div>
                <div className="slash-meta">Start with an empty notebook</div>
              </div>
            </li>
          )}
          {filteredProtocols.length === 0 && !showBlank && (
            <li className="muted small">No matches</li>
          )}
          {filteredProtocols.map((p, i) => {
            const itemIdx = (showBlank ? 1 : 0) + i;
            return (
              <li
                key={p.id}
                className={itemIdx === index ? "active" : ""}
                onMouseEnter={() => setIndex(itemIdx)}
                onClick={() => onPickTemplate(p)}
              >
                <span className="icon-tile">
                  <Beaker size={14} />
                </span>
                <div>
                  <div className="slash-name">{p.name}</div>
                  <div className="slash-meta">
                    {p.steps.length} steps · v{p.version}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="slash-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> create ·{" "}
          <kbd>Esc</kbd> cancel
        </div>
      </div>
    </div>
  );
}
