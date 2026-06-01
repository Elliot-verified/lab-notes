import type {
  Note,
  NoteBlock,
  NoteSummary,
  Protocol,
  Run,
  SuggestEditsResponse,
} from "./types";

// ── Client-side settings (API key in localStorage) ─────────────────────
const API_KEY_STORAGE = "lab-notes:anthropic-api-key";

export const settings = {
  getApiKey(): string {
    try { return localStorage.getItem(API_KEY_STORAGE) || ""; } catch { return ""; }
  },
  setApiKey(key: string) {
    try {
      if (key) localStorage.setItem(API_KEY_STORAGE, key);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch { /* ignore */ }
  },
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export type Health = { db_backend: string; persistent: boolean; note: string };

export const api = {
  health: () => req<Health>("/api/health"),
  listProtocols: () => req<Protocol[]>("/api/protocols"),
  listRuns: () => req<Run[]>("/api/runs"),
  createRun: (protocol_id: string, name?: string) =>
    req<Run>("/api/runs", {
      method: "POST",
      body: JSON.stringify({ protocol_id, name }),
    }),
  getRun: (id: string) => req<Run>(`/api/runs/${id}`),
  completeStep: (
    runId: string,
    stepId: string,
    payload: { results?: Record<string, unknown>; note?: string; skip?: boolean }
  ) =>
    req<Run>(`/api/runs/${runId}/steps/${stepId}/complete`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sync: (runId: string) =>
    req<{ benchling_entry_id: string; web_url: string | null }>(
      `/api/runs/${runId}/sync`,
      { method: "POST" }
    ),

  listNotes: () => req<NoteSummary[]>("/api/notes"),
  createNote: (title?: string) =>
    req<Note>("/api/notes", { method: "POST", body: JSON.stringify({ title }) }),
  getNote: (id: string) => req<Note>(`/api/notes/${id}`),
  updateNote: (id: string, payload: { title?: string; blocks?: NoteBlock[] }) =>
    req<Note>(`/api/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteNote: (id: string) =>
    fetch(`/api/notes/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(`delete failed: ${r.status}`);
    }),
  suggestEdits: (noteId: string, apiKey: string) =>
    req<SuggestEditsResponse>(`/api/notes/${noteId}/suggest_edits`, {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey }),
    }),
};
