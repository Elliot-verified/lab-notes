import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Beaker,
  Check,
  Clock,
  GripVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { api } from "../api";
import type { Note, NoteBlock, Protocol } from "../types";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const TPL_PREFIX = "tpl:";
const BLOCK_PREFIX = "block:";
const EMPTY_DROP_ID = "empty-note";

function isStepBlock(b: NoteBlock): b is Extract<NoteBlock, { type: "step" }> {
  return b.type === "step";
}

function blocksFromProtocol(p: Protocol): NoteBlock[] {
  return p.steps.map((s) => ({
    id: newId(),
    type: "step" as const,
    title: s.title,
    description: s.description ?? "",
    duration: s.duration ?? null,
    status: "pending" as const,
  }));
}


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

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);
  const pendingPayload = useRef<Note | null>(null);

  useEffect(() => {
    if (!noteId) return;
    Promise.all([api.getNote(noteId), api.listProtocols()])
      .then(([n, p]) => {
        setNote(n);
        setProtocols(p);
      })
      .catch((e) => setError(String(e)));
  }, [noteId]);

  const flushSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const next = pendingPayload.current;
    if (!next) return;
    pendingPayload.current = null;
    try {
      await api.updateNote(next.id, { title: next.title, blocks: next.blocks });
      setSaveState("saved");
    } catch (e) {
      setError(String(e));
      setSaveState("idle");
    }
  }, []);

  const queueSave = useCallback(
    (next: Note) => {
      setSaveState("saving");
      pendingPayload.current = next;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        flushSave();
      }, 500);
    },
    [flushSave]
  );

  // Flush on unmount and on tab hide / navigation, so notes don't lose data
  // when the user clicks away during the debounce window.
  useEffect(() => {
    const onHide = () => {
      if (pendingPayload.current) {
        const next = pendingPayload.current;
        // keepalive lets the request complete even after the page unloads.
        fetch(`/api/notes/${next.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: next.title, blocks: next.blocks }),
          keepalive: true,
        }).catch(() => {});
        pendingPayload.current = null;
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      // On normal unmount (route change), flush via the real API.
      flushSave();
    };
  }, [flushSave]);

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

  function appendTextBlock() {
    patchNote((n) => ({
      ...n,
      blocks: [
        ...n.blocks,
        { id: newId(), type: "text", content: "", status: "pending" },
      ],
    }));
  }

  // ── Slash popover ────────────────────────────────────────────────────
  function openSlashAt(blockIdx: number) {
    insertAtRef.current = blockIdx;
    setSlashQuery("");
    setSlashIndex(0);
    setSlashOpen(true);
  }

  function insertProtocolFromSlash(proto: Protocol) {
    const stepBlocks = blocksFromProtocol(proto);
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
      if (p) insertProtocolFromSlash(p);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSlashOpen(false);
    }
  }

  // ── Drag & drop ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overRaw = e.over ? String(e.over.id) : null;
    setActiveDragId(null);
    setOverId(null);
    if (!note) return;

    // Case 1 — dragging a protocol template into the editor.
    if (activeId.startsWith(TPL_PREFIX)) {
      const protoId = activeId.slice(TPL_PREFIX.length);
      const proto = protocols.find((p) => p.id === protoId);
      if (!proto) return;
      const stepBlocks = blocksFromProtocol(proto);

      patchNote((n) => {
        if (n.blocks.length === 0 || overRaw === EMPTY_DROP_ID || overRaw === null) {
          return { ...n, blocks: [...n.blocks, ...stepBlocks] };
        }
        if (overRaw.startsWith(BLOCK_PREFIX)) {
          const overBlockId = overRaw.slice(BLOCK_PREFIX.length);
          const idx = n.blocks.findIndex((b) => b.id === overBlockId);
          if (idx < 0) return { ...n, blocks: [...n.blocks, ...stepBlocks] };
          const before = n.blocks.slice(0, idx + 1);
          const after = n.blocks.slice(idx + 1);
          return { ...n, blocks: [...before, ...stepBlocks, ...after] };
        }
        return n;
      });
      return;
    }

    // Case 2 — reordering a block within the editor.
    if (activeId.startsWith(BLOCK_PREFIX) && overRaw && overRaw.startsWith(BLOCK_PREFIX)) {
      const activeBlockId = activeId.slice(BLOCK_PREFIX.length);
      const overBlockId = overRaw.slice(BLOCK_PREFIX.length);
      if (activeBlockId === overBlockId) return;
      patchNote((n) => {
        const oldIndex = n.blocks.findIndex((b) => b.id === activeBlockId);
        const newIndex = n.blocks.findIndex((b) => b.id === overBlockId);
        if (oldIndex < 0 || newIndex < 0) return n;
        return { ...n, blocks: arrayMove(n.blocks, oldIndex, newIndex) };
      });
    }
  }

  async function handleDelete() {
    if (!note) return;
    if (!confirm("Delete this note?")) return;
    await api.deleteNote(note.id);
    navigate("/");
  }

  if (!note) return <p>{error || "Loading…"}</p>;

  const sortableIds = note.blocks.map((b) => BLOCK_PREFIX + b.id);
  const dragActiveProtocol =
    activeDragId?.startsWith(TPL_PREFIX)
      ? protocols.find((p) => p.id === activeDragId.slice(TPL_PREFIX.length))
      : null;
  const dragActiveBlock =
    activeDragId?.startsWith(BLOCK_PREFIX)
      ? note.blocks.find((b) => b.id === activeDragId.slice(BLOCK_PREFIX.length))
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="note-layout">
        <aside className="template-sidebar">
          <div className="sidebar-head">Templates</div>
          <div className="sidebar-hint muted small">
            Drag a card into the note or press <kbd>/</kbd> in the editor.
          </div>
          <div className="sidebar-list">
            {protocols.map((p) => (
              <TemplateCard key={p.id} protocol={p} />
            ))}
          </div>
        </aside>

        <div className="note-main">
          <Link to="/" className="back-link">
            <ArrowLeft size={14} /> All notes
          </Link>
          <div className="note-header">
            <input
              className="note-title"
              value={note.title}
              onChange={(e) => patchNote((n) => ({ ...n, title: e.target.value }))}
              placeholder="Untitled note"
            />
            <div className="note-meta">
              <span className={`save-state ${saveState === "saved" ? "saved" : ""}`}>
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && (
                  <>
                    <Check size={11} /> Saved
                  </>
                )}
              </span>
              <button className="ghost danger-ghost" onClick={handleDelete} title="Delete note">
                <Trash2 size={14} /> Delete note
              </button>
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <NoteProgress blocks={note.blocks} />

          <p className="note-hint">
            Drag templates from the sidebar, or press <kbd>/</kbd> in an empty
            block. Click a checkbox to mark a step done.
          </p>

          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="blocks">
              {note.blocks.length === 0 && (
                <EmptyDropZone onAddText={appendTextBlock} active={!!activeDragId} />
              )}

              {note.blocks.map((block, idx) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  overId={overId}
                  externalDragActive={activeDragId?.startsWith(TPL_PREFIX) ?? false}
                  onChange={(patch) => updateBlock(idx, patch)}
                  onRemove={() => removeBlock(idx)}
                  onKeyDown={(e) => handleBlockKeyDown(e, idx)}
                />
              ))}

              {note.blocks.length > 0 && (
                <div className="block-add-row">
                  <button className="ghost" onClick={appendTextBlock}>
                    <Plus size={14} /> Text block
                  </button>
                  <button
                    className="ghost"
                    onClick={() => openSlashAt(note.blocks.length - 1)}
                  >
                    <Plus size={14} /> Template (<kbd>/</kbd>)
                  </button>
                </div>
              )}
            </div>
          </SortableContext>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragActiveProtocol && (
          <div className="drag-ghost">
            <div className="template-card-title">{dragActiveProtocol.name}</div>
            <div className="template-card-meta">
              {dragActiveProtocol.steps.length} steps · v{dragActiveProtocol.version}
            </div>
          </div>
        )}
        {dragActiveBlock && (
          <div className="drag-ghost block-ghost">
            {dragActiveBlock.type === "step"
              ? dragActiveBlock.title
              : (dragActiveBlock.content.split("\n")[0] || "(empty text block)")}
          </div>
        )}
      </DragOverlay>

      {slashOpen && (
        <div className="slash-backdrop" onClick={() => setSlashOpen(false)}>
          <div className="slash-popover" onClick={(e) => e.stopPropagation()}>
            <div className="slash-search">
              <Search size={14} color="var(--muted)" />
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
            </div>
            <ul className="slash-list">
              {filteredProtocols.length === 0 && (
                <li className="muted small">No matches</li>
              )}
              {filteredProtocols.map((p, i) => (
                <li
                  key={p.id}
                  className={i === slashIndex ? "active" : ""}
                  onMouseEnter={() => setSlashIndex(i)}
                  onClick={() => insertProtocolFromSlash(p)}
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
              ))}
            </ul>
            <div className="slash-hint">
              <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> insert ·{" "}
              <kbd>Esc</kbd> cancel
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}

function NoteProgress({ blocks }: { blocks: NoteBlock[] }) {
  const steps = blocks.filter(isStepBlock);
  if (steps.length === 0) return null;
  const done = steps.filter((s) => (s.status ?? "pending") === "done").length;
  const pct = Math.round((done / steps.length) * 100);
  const allDone = done === steps.length;
  return (
    <div className={`progress-row ${allDone ? "all-done" : ""}`}>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">
        {done} of {steps.length} step{steps.length === 1 ? "" : "s"} done
        {allDone && " · ✓"}
      </div>
    </div>
  );
}

function TemplateCard({ protocol }: { protocol: Protocol }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: TPL_PREFIX + protocol.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`template-card ${isDragging ? "dragging" : ""}`}
      title="Drag into the note"
    >
      <div className="template-card-title">{protocol.name}</div>
      <div className="template-card-meta">
        {protocol.steps.length} steps · v{protocol.version}
      </div>
    </div>
  );
}

function EmptyDropZone({
  onAddText,
  active,
}: {
  onAddText: () => void;
  active: boolean;
}) {
  // Use a sortable item with the magic empty-id so onDragEnd can detect it.
  const { setNodeRef, isOver } = useSortable({ id: EMPTY_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={`empty-drop ${active ? "active" : ""} ${isOver ? "over" : ""}`}
    >
      <Beaker size={28} />
      <div>Drop a protocol template here</div>
      <button className="subtle" onClick={onAddText}>
        <Plus size={14} /> or start with a text block
      </button>
    </div>
  );
}

function SortableBlock({
  block,
  overId,
  externalDragActive,
  onChange,
  onRemove,
  onKeyDown,
}: {
  block: NoteBlock;
  overId: string | null;
  externalDragActive: boolean;
  onChange: (patch: Partial<NoteBlock>) => void;
  onRemove: () => void;
  onKeyDown: (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => void;
}) {
  const sortableId = BLOCK_PREFIX + block.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const showDropIndicator = externalDragActive && overId === sortableId;
  const status = block.status ?? "pending";
  const isDone = status === "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block block-${block.type} ${isDragging ? "is-dragging" : ""} ${
        isDone ? "is-done" : ""
      }`}
    >
      <div className="block-gutter">
        <button
          ref={setActivatorNodeRef}
          className="icon-btn"
          title="Drag to reorder"
          {...listeners}
          {...attributes}
        >
          <GripVertical size={14} />
        </button>
        <button
          className="icon-btn danger"
          title="Delete block"
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      </div>

      <div className="block-body">
        {block.type === "text" ? (
          <div className="text-block">
            <textarea
              value={block.content}
              placeholder="Write something… (press / for templates)"
              onChange={(e) => onChange({ content: e.target.value })}
              onKeyDown={onKeyDown}
              rows={Math.max(2, block.content.split("\n").length + 1)}
            />
          </div>
        ) : (
          <div className="step-block">
            <div className="step-row">
              <input
                type="checkbox"
                className="step-check"
                checked={isDone}
                onChange={(e) =>
                  onChange({ status: e.target.checked ? "done" : "pending" })
                }
                title={isDone ? "Mark as not done" : "Mark as done"}
              />
              <input
                className="step-block-title"
                value={block.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Step title"
              />
              <span className="duration-field">
                <Clock size={11} />
                <input
                  className="duration-input"
                  value={block.type === "step" ? block.duration ?? "" : ""}
                  onChange={(e) => onChange({ duration: e.target.value })}
                  placeholder="time"
                />
              </span>
            </div>
            <textarea
              value={block.description}
              placeholder="Step description (optional)"
              onChange={(e) => onChange({ description: e.target.value })}
              rows={Math.max(1, block.description.split("\n").length)}
            />
          </div>
        )}
      </div>

      {showDropIndicator && <div className="drop-indicator" />}
    </div>
  );
}
