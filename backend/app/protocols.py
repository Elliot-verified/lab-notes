"""Load protocol templates from YAML files on disk."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

PROTOCOLS_DIR = Path(
    os.environ.get("LAB_NOTES_PROTOCOLS_DIR", Path(__file__).parent.parent / "protocols")
)


@dataclass
class ResultField:
    name: str
    type: str  # "number" | "boolean" | "string"
    label: str | None = None
    unit: str | None = None


@dataclass
class Step:
    id: str
    title: str
    description: str = ""
    results: list[ResultField] = field(default_factory=list)
    rules: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Protocol:
    id: str
    name: str
    version: str
    description: str
    steps: list[Step]  # default ordered sequence
    step_library: dict[str, Step]  # extras referenced by branching rules

    def all_steps(self) -> dict[str, Step]:
        out = {s.id: s for s in self.steps}
        out.update(self.step_library)
        return out


def _parse_step(raw: dict[str, Any]) -> Step:
    return Step(
        id=raw["id"],
        title=raw["title"],
        description=raw.get("description", ""),
        results=[ResultField(**r) for r in raw.get("results", [])],
        rules=list(raw.get("rules", [])),
    )


def load_protocol(path: Path) -> Protocol:
    with path.open() as fh:
        raw = yaml.safe_load(fh)
    steps = [_parse_step(s) for s in raw.get("steps", [])]
    library = {s["id"]: _parse_step(s) for s in raw.get("step_library", [])}
    return Protocol(
        id=raw["id"],
        name=raw["name"],
        version=str(raw.get("version", "0.1")),
        description=raw.get("description", ""),
        steps=steps,
        step_library=library,
    )


def load_all() -> dict[str, Protocol]:
    out: dict[str, Protocol] = {}
    for path in sorted(PROTOCOLS_DIR.glob("*.yaml")):
        proto = load_protocol(path)
        out[proto.id] = proto
    return out


def get_protocol(protocol_id: str) -> Protocol:
    protos = load_all()
    if protocol_id not in protos:
        raise KeyError(protocol_id)
    return protos[protocol_id]
