from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ResultFieldOut(BaseModel):
    name: str
    type: str
    label: str | None = None
    unit: str | None = None


class StepOut(BaseModel):
    id: str
    title: str
    description: str = ""
    results: list[ResultFieldOut] = []


class ProtocolOut(BaseModel):
    id: str
    name: str
    version: str
    description: str
    steps: list[StepOut]


class RunStepOut(BaseModel):
    step_id: str
    position: int
    status: str
    results: dict[str, Any] = {}
    note: str | None = None
    completed_at: datetime | None = None
    # Hydrated from protocol definition for the client.
    title: str
    description: str = ""
    result_fields: list[ResultFieldOut] = []


class RunOut(BaseModel):
    id: str
    protocol_id: str
    protocol_version: str
    name: str
    status: str
    created_at: datetime
    updated_at: datetime
    benchling_entry_id: str | None = None
    steps: list[RunStepOut]


class CreateRunIn(BaseModel):
    protocol_id: str
    name: str | None = None


class CompleteStepIn(BaseModel):
    results: dict[str, Any] = {}
    note: str | None = None
    skip: bool = False


class SyncResponse(BaseModel):
    benchling_entry_id: str
    web_url: str | None


class NoteOut(BaseModel):
    id: str
    title: str
    blocks: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class NoteSummary(BaseModel):
    id: str
    title: str
    updated_at: datetime
    block_count: int


class CreateNoteIn(BaseModel):
    title: str | None = None


class UpdateNoteIn(BaseModel):
    title: str | None = None
    blocks: list[dict[str, Any]] | None = None
