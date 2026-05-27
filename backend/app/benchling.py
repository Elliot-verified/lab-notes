"""Mock Benchling client.

Mirrors a small subset of `benchling-sdk`'s entries API so the real client can
be dropped in later by swapping the implementation behind `get_client()`.

Public surface kept intentionally small:
    client = get_client()
    entry = client.entries.create(name=..., folder_id=...)
    client.entries.update_checklist(entry.id, items=[...])
    client.entries.get(entry.id)

The mock does not persist state — the only fact that needs to survive across
requests is the entry id, which the caller stores on the Run row.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from typing import Any


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
    folder_id: str | None = None
    schema_id: str | None = None
    items: list[ChecklistItem] = field(default_factory=list)
    web_url: str | None = None


def _new_entry_id() -> str:
    return f"etr_{uuid.uuid4().hex[:12]}"


class _EntriesAPI:
    def create(
        self,
        *,
        name: str,
        folder_id: str | None = None,
        schema_id: str | None = None,
    ) -> Entry:
        entry_id = _new_entry_id()
        return Entry(
            id=entry_id,
            name=name,
            folder_id=folder_id,
            schema_id=schema_id,
            web_url=f"https://mock.benchling.com/entries/{entry_id}",
        )

    def update_checklist(self, entry_id: str, items: list[ChecklistItem]) -> Entry:
        # Mock accepts any entry id and echoes back the requested state.
        return Entry(
            id=entry_id,
            name="(mock)",
            items=list(items),
            web_url=f"https://mock.benchling.com/entries/{entry_id}",
        )

    def get(self, entry_id: str) -> Entry:
        return Entry(
            id=entry_id,
            name="(mock)",
            web_url=f"https://mock.benchling.com/entries/{entry_id}",
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
