import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { Note, NoteBlock, Protocol } from "../types";

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

export default function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const insertAtRef = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!noteId) return;
    Promise.all([api.getNote(noteId), api.listProtocols()])
      .then(([n, p]) => {
        setNote(n);
        setProtocols(p);
      })
      .catch((e) => setError(String(e)));
  }, [noteId]);

  // Debounced auto-save
  const queueSave = useCallback(
    (next: Note) => {
      setSaveState("saving");
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        try {
          await api.updateNote(next.id, { title: next.title, blocks: next.blocks });
          setSaveState("saved");
        } catch (e) {
          setError(String(e));
          setSaveState("idle");
        }
      }, 500);
    },
    []
  );

  function patchNote(mutate: (n: Note) => Note) {
    setNote((prev) => {
      if (!prev) return prev;
      const next = mutate(prev);
      queueSave(next);
      return next;
    });
  }

  function updateBlock(idx: number, patch: Partial<NoteBlock>) {
    patchNote((n) => {
      const blocks = n.blocks.slice();
      blocks[idx] = { ...blocks[idx], ...patch } as NoteBlock;
      return { ...n, blocks };
    });
  }

  function removeBlock(idx: number) {
    patchNote((n) => ({ ...n, blocks: n.blocks.filter((_, i) => i !== idx) }));
  }

  function moveBlock(idx: number, delta: number) {
    patchNote((n) => {
      const blocks = n.blocks.slice();
      const target = idx + delta;
      if (target < 0 || target >= blocks.length) return n;
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      return { ...n, blocks };
    });
  }

  function appendTextBlock() {
    patchNote((n) => ({
      ...n,
      blocks: [...n.blocks, { id: newId(), type: "text", content: "" }],
    }));
  }

  function openSlashAt(blockIdx: number) {
    insertAtRef.current = blockIdx;
    setSlashQuery("");
    setSlashIndex(0);
    setSlashOpen(true);
  }

  function insertProtocol(proto: Protocol) {
    const stepBlocks: NoteBlock[] = proto.steps.map((s) => ({
      id: newId(),
      type: "step" as const,
      title: s.title,
      description: s.description ?? "",
    }));
    patchNote((n) => {
      const idx = insertAtRef.current ?? n.blocks.length - 1;
      const before = n.blocks.slice(0, idx + 1);
      const after = n.blocks.slice(idx + 1);
      return { ...n, blocks: [...before, ...stepBlocks, ...after] };
    });
    setSlashOpen(false);
    insertAtRef.current = null;
  }

  const filteredProtocols = useMemo(() => {
    const q = slashQuery.trim().toLowerCase();
    if (!q) return protocols;
    return protocols.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [protocols, slashQuery]);

  function handleBlockKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    blockIdx: number
  ) {
    if (slashOpen) return;
    if (e.key === "/" && (e.target as HTMLTextAreaElement).value === "") {
      e.preventDefault();
      openSlashAt(blockIdx);
    }
  }

  function handleSlashKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlashIndex((i) => Math.min(i + 1, filteredProtocols.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlashIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filteredProtocols[slashIndex];
      if (p) insertProtocol(p);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSlashOpen(false);
    }
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirm("Delete this note?")) return;
    await api.deleteNote(note.id);
    navigate("/");
  }

  if (!note) return <p>{error || "Loading…"}</p>;

  return (
    <div className="note-page">
      <div className="note-header">
        <input
          className="note-title"
          value={note.title}
          onChange={(e) => patchNote((n) => ({ ...n, title: e.target.value }))}
          placeholder="Untitled note"
        />
        <div className="note-meta">
          <span className="muted small">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
          </span>
          <button className="ghost small" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <p className="muted small note-hint">
        Press <kbd>/</kbd> in an empty block to insert a protocol template.
      </p>

      <div className="blocks">
        {note.blocks.length === 0 && (
          <button className="ghost block-add" onClick={appendTextBlock}>
            + Add first block
          </button>
        )}

        {note.blocks.map((block, idx) => (
          <div key={block.id} className={`block block-${block.type}`}>
            <div className="block-gutter">
              <button
                className="icon"
                title="Move up"
                onClick={() => moveBlock(idx, -1)}
                disabled={idx === 0}
              >↑</button>
              <button
                className="icon"
                title="Move down"
                onClick={() => moveBlock(idx, 1)}
                disabled={idx === note.blocks.length - 1}
              >↓</button>
              <button
                className="icon icon-danger"
                title="Delete block"
                onClick={() => removeBlock(idx)}
              >×</button>
            </div>

            <div className="block-body">
              {block.type === "text" ? (
                <textarea
                  value={block.content}
                  placeholder="Write something… (press / for templates)"
                  onChange={(e) => updateBlock(idx, { content: e.target.value })}
                  onKeyDown={(e) => handleBlockKeyDown(e, idx)}
                  rows={Math.max(2, block.content.split("\n").length + 1)}
                />
              ) : (
                <div className="step-block">
                  <input
                    className="step-block-title"
                    value={block.title}
                    onChange={(e) => updateBlock(idx, { title: e.target.value })}
                    placeholder="Step title"
                  />
                  <textarea
                    value={block.description}
                    placeholder="Step description (optional)"
                    onChange={(e) => updateBlock(idx, { description: e.target.value })}
                    rows={Math.max(1, block.description.split("\n").length)}
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        {note.blocks.length > 0 && (
          <div className="block-add-row">
            <button className="ghost" onClick={appendTextBlock}>+ Text block</button>
            <button
              className="ghost"
              onClick={() => openSlashAt(note.blocks.length - 1)}
            >
              + Insert template (/)
            </button>
          </div>
        )}
      </div>

      {slashOpen && (
        <div className="slash-backdrop" onClick={() => setSlashOpen(false)}>
          <div className="slash-popover" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Search protocols…"
              value={slashQuery}
              onChange={(e) => {
                setSlashQuery(e.target.value);
                setSlashIndex(0);
              }}
              onKeyDown={handleSlashKeyDown}
            />
            <ul className="slash-list">
              {filteredProtocols.length === 0 && (
                <li className="muted small">No matches</li>
              )}
              {filteredProtocols.map((p, i) => (
                <li
                  key={p.id}
                  className={i === slashIndex ? "active" : ""}
                  onMouseEnter={() => setSlashIndex(i)}
                  onClick={() => insertProtocol(p)}
                >
                  <div className="slash-name">{p.name}</div>
                  <div className="muted small">
                    {p.steps.length} steps · v{p.version}
                  </div>
                </li>
              ))}
            </ul>
            <div className="muted small slash-hint">
              ↑/↓ to navigate · Enter to insert · Esc to cancel
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
