"""Mock Benchling client.

Mirrors a small subset of `benchling-sdk`'s entries API so the real client can
be dropped in later by swapping the implementation behind `get_client()`.

Public surface kept intentionally small:
    client = get_client()
    entry = client.entries.create(name=..., folder_id=...)
    client.entries.update_checklist(entry.id, items=[...])
    client.entries.get(entry.id)
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .db import DATA_DIR

MOCK_STORE = DATA_DIR / "benchling-mock.json"


@dataclass
class ChecklistItem:
    step_id: str
    title: str
    status: str  # pending | done | skipped
    note: str | None = None
    results: dict[str, Any] = field(default_factory=dict)


@dataclass
class Entry:
    id: str
    name: str
    folder_id: str | None
    schema_id: str | None
    items: list[ChecklistItem] = field(default_factory=list)
    web_url: str | None = None


def _load() -> dict[str, dict]:
    if not MOCK_STORE.exists():
        return {}
    return json.loads(MOCK_STORE.read_text())


def _save(data: dict[str, dict]) -> None:
    MOCK_STORE.parent.mkdir(parents=True, exist_ok=True)
    MOCK_STORE.write_text(json.dumps(data, indent=2, default=str))


class _EntriesAPI:
    def create(
        self,
        *,
        name: str,
        folder_id: str | None = None,
        schema_id: str | None = None,
    ) -> Entry:
        entry_id = f"etr_{uuid.uuid4().hex[:12]}"
        entry = Entry(
            id=entry_id,
            name=name,
            folder_id=folder_id,
            schema_id=schema_id,
            web_url=f"https://mock.benchling.com/entries/{entry_id}",
        )
        store = _load()
        store[entry.id] = asdict(entry)
        _save(store)
        return entry

    def update_checklist(self, entry_id: str, items: list[ChecklistItem]) -> Entry:
        store = _load()
        if entry_id not in store:
            raise KeyError(entry_id)
        store[entry_id]["items"] = [asdict(i) for i in items]
        _save(store)
        return self.get(entry_id)

    def get(self, entry_id: str) -> Entry:
        store = _load()
        if entry_id not in store:
            raise KeyError(entry_id)
        raw = store[entry_id]
        return Entry(
            id=raw["id"],
            name=raw["name"],
            folder_id=raw.get("folder_id"),
            schema_id=raw.get("schema_id"),
            web_url=raw.get("web_url"),
            items=[ChecklistItem(**i) for i in raw.get("items", [])],
        )


class BenchlingClient:
    """Mock client. Real implementation would wrap `benchling_sdk.Benchling`."""

    def __init__(self, token: str | None = None, tenant_url: str | None = None):
        self.token = token
        self.tenant_url = tenant_url
        self.entries = _EntriesAPI()


def get_client() -> BenchlingClient:
    return BenchlingClient(
        token=os.environ.get("BENCHLING_API_TOKEN"),
        tenant_url=os.environ.get("BENCHLING_TENANT_URL"),
    )
