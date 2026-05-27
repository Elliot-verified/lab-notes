import type { Protocol, Run } from "./types";

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

export const api = {
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
};
