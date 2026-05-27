export type ResultField = {
  name: string;
  type: "number" | "boolean" | "string";
  label?: string | null;
  unit?: string | null;
};

export type Step = {
  id: string;
  title: string;
  description?: string;
  results?: ResultField[];
};

export type Protocol = {
  id: string;
  name: string;
  version: string;
  description: string;
  steps: Step[];
};

export type RunStep = {
  step_id: string;
  position: number;
  status: "pending" | "done" | "skipped";
  results: Record<string, unknown>;
  note: string | null;
  completed_at: string | null;
  title: string;
  description: string;
  result_fields: ResultField[];
};

export type NoteBlock =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "step"; title: string; description: string };

export type Note = {
  id: string;
  title: string;
  blocks: NoteBlock[];
  created_at: string;
  updated_at: string;
};

export type NoteSummary = {
  id: string;
  title: string;
  updated_at: string;
  block_count: number;
};

export type Run = {
  id: string;
  protocol_id: string;
  protocol_version: string;
  name: string;
  status: "in_progress" | "complete";
  created_at: string;
  updated_at: string;
  benchling_entry_id: string | null;
  steps: RunStep[];
};
