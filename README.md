# Lab Notes

A dynamic todo list for lab protocols. The checklist mutates based on the
results you enter at each step — measure an OD that's too low, the protocol
auto-inserts a wait + remeasure; see contamination, it appends a troubleshoot
sub-protocol. When you're ready, sync the run to Benchling as a notebook entry.

## Layout

```
backend/   FastAPI + SQLite. Protocol templates live in backend/protocols/*.yaml.
web/       Vite + React + TypeScript frontend.
```

## Running locally

### Backend

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd web
npm install
npm run dev
```

App: http://localhost:5173 (proxies `/api` → backend).

### Tests

```bash
cd backend && pytest
```

## Writing a protocol

Protocols are YAML in `backend/protocols/`. A step can declare result fields it
captures and branching `rules` that fire when its results match. Targets in
rules reference step ids defined either in `steps` or in `step_library`.

```yaml
- id: measure_od
  title: Measure OD600
  results:
    - { name: od600, type: number, label: OD600 }
  rules:
    - when: "od600 < 0.5"
      then: { insert_after: this, steps: [wait_30_min, measure_od] }
    - when: "od600 >= 0.5"
      then: { skip_to: harvest }
```

Available actions inside `then`:

| key             | effect                                                       |
| --------------- | ------------------------------------------------------------ |
| `insert_after`  | Insert listed `steps` after the named step (`this` = current)|
| `skip_to`       | Mark intervening pending steps as skipped, jump to target    |
| `repeat`        | Re-queue a step                                              |
| `end`           | Skip everything remaining; mark run complete                 |

Expressions use [`simpleeval`](https://github.com/danthedeckie/simpleeval) and
have access to the names captured in the step's `results` (plus `true`/`false`).

## Benchling integration

`app/benchling.py` is a mock that mirrors the small slice of the Benchling
entries API the rest of the app touches (`entries.create`,
`entries.update_checklist`, `entries.get`). Each run can be synced to a
notebook entry; subsequent syncs update the same entry rather than creating a
new one. To wire up the real Benchling SDK, swap the implementation behind
`get_client()` and pass through `BENCHLING_API_TOKEN` / `BENCHLING_TENANT_URL`.

Synced data lives in `backend/data/benchling-mock.json` so you can inspect what
would be pushed.

## Status

v0.1 — single-tenant, no auth, SQLite, mock Benchling. Suitable for solo
benchtop use; not for a shared lab without adding auth and persistence.
