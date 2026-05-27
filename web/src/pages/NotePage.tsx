import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

import { api } from "../api";
import type { Note, NoteBlock, Protocol } from "../types";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const TPL_PREFIX = "tpl:";
const BLOCK_PREFIX = "block:";
const EMPTY_DROP_ID = "empty-note";

function blocksFromProtocol(p: Protocol): NoteBlock[] {
  return p.steps.map((s) => ({
    id: newId(),
    type: "step" as const,
    title: s.title,
    description: s.description ?? "",
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

  useEffect(() => {
    if (!noteId) return;
    Promise.all([api.getNote(noteId), api.listProtocols()])
      .then(([n, p]) => {
        setNote(n);
        setProtocols(p);
      })
      .catch((e) => setError(String(e)));
  }, [noteId]);

  const queueSave = useCallback((next: Note) => {
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
  }, []);

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
      const target = idx + delta;
      if (target < 0 || target >= n.blocks.length) return n;
      const blocks = n.blocks.slice();
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
            Drag templates from the sidebar, or press <kbd>/</kbd> in an empty block.
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
                  index={idx}
                  total={note.blocks.length}
                  overId={overId}
                  externalDragActive={activeDragId?.startsWith(TPL_PREFIX) ?? false}
                  onChange={(patch) => updateBlock(idx, patch)}
                  onRemove={() => removeBlock(idx)}
                  onMove={(delta) => moveBlock(idx, delta)}
                  onKeyDown={(e) => handleBlockKeyDown(e, idx)}
                />
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
          </SortableContext>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragActiveProtocol && (
          <div className="drag-ghost template-card">
            <div className="card-title">{dragActiveProtocol.name}</div>
            <div className="muted small">
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
                  onClick={() => insertProtocolFromSlash(p)}
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
    </DndContext>
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
      <div className="card-title">{protocol.name}</div>
      <div className="muted small">
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
      <div>Drop a template here, or</div>
      <button className="ghost" onClick={onAddText}>+ Add first text block</button>
    </div>
  );
}

function SortableBlock({
  block,
  index,
  total,
  overId,
  externalDragActive,
  onChange,
  onRemove,
  onMove,
  onKeyDown,
}: {
  block: NoteBlock;
  index: number;
  total: number;
  overId: string | null;
  externalDragActive: boolean;
  onChange: (patch: Partial<NoteBlock>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block block-${block.type} ${isDragging ? "is-dragging" : ""}`}
    >
      <div className="block-gutter">
        <button
          ref={setActivatorNodeRef}
          className="icon grip"
          title="Drag to reorder"
          {...listeners}
          {...attributes}
        >⋮⋮</button>
        <button
          className="icon"
          title="Move up"
          onClick={() => onMove(-1)}
          disabled={index === 0}
        >↑</button>
        <button
          className="icon"
          title="Move down"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
        >↓</button>
        <button
          className="icon icon-danger"
          title="Delete block"
          onClick={onRemove}
        >×</button>
      </div>

      <div className="block-body">
        {block.type === "text" ? (
          <textarea
            value={block.content}
            placeholder="Write something… (press / for templates)"
            onChange={(e) => onChange({ content: e.target.value })}
            onKeyDown={onKeyDown}
            rows={Math.max(2, block.content.split("\n").length + 1)}
          />
        ) : (
          <div className="step-block">
            <input
              className="step-block-title"
              value={block.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Step title"
            />
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
