"""Run orchestration: create runs, complete steps, apply branching, sync."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from . import benchling
from .branching import BranchAction, evaluate_rules
from .models import Run, RunStep
from .protocols import Protocol, Step, get_protocol


def create_run(db: Session, protocol_id: str, name: str | None) -> Run:
    proto = get_protocol(protocol_id)
    run = Run(
        id=f"run_{uuid.uuid4().hex[:12]}",
        protocol_id=proto.id,
        protocol_version=proto.version,
        name=name or proto.name,
        step_order=[s.id for s in proto.steps],
    )
    for pos, step in enumerate(proto.steps):
        run.steps.append(RunStep(step_id=step.id, position=pos, status="pending"))
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _next_position(run: Run) -> int:
    return max((s.position for s in run.steps), default=-1) + 1


def _insert_step(run: Run, step_id: str, after_position: int) -> None:
    # shift everything after `after_position` down by one
    for s in run.steps:
        if s.position > after_position:
            s.position += 1
    run.steps.append(
        RunStep(
            run_id=run.id,
            step_id=step_id,
            position=after_position + 1,
            status="pending",
        )
    )


def _apply_action(
    db: Session,
    run: Run,
    proto: Protocol,
    current: RunStep,
    action: BranchAction,
) -> None:
    library = proto.all_steps()

    if action.kind == "insert_after":
        if action.target is None:
            anchor = current
        else:
            # Anchor on the earliest matching instance at or after current.
            anchor = next(
                (s for s in sorted(run.steps, key=lambda s: s.position)
                 if s.step_id == action.target and s.position >= current.position),
                current,
            )
        cursor = anchor.position
        for step_id in action.steps or []:
            if step_id not in library:
                raise ValueError(f"unknown step reference {step_id!r}")
            _insert_step(run, step_id, cursor)
            cursor += 1

    elif action.kind == "skip_to":
        # mark everything strictly between current and target as skipped
        target = next((s for s in run.steps if s.step_id == action.target), None)
        if target is None:
            # target not yet in plan — append it
            _insert_step(run, action.target, _next_position(run) - 1)
            target = next(s for s in run.steps if s.step_id == action.target)
        for s in run.steps:
            if current.position < s.position < target.position and s.status == "pending":
                s.status = "skipped"

    elif action.kind == "repeat":
        if action.target not in library:
            raise ValueError(f"unknown step reference {action.target!r}")
        _insert_step(run, action.target, current.position)

    elif action.kind == "end":
        for s in run.steps:
            if s.position > current.position and s.status == "pending":
                s.status = "skipped"
        run.status = "complete"

    # Recompute step_order for client convenience.
    run.step_order = [s.step_id for s in sorted(run.steps, key=lambda s: s.position)]


def complete_step(
    db: Session,
    run: Run,
    step_id: str,
    results: dict[str, Any],
    note: str | None,
    skip: bool,
) -> Run:
    proto = get_protocol(run.protocol_id)
    library = proto.all_steps()
    step_def: Step | None = library.get(step_id)
    if step_def is None:
        raise KeyError(step_id)

    # Find the earliest pending instance of this step.
    candidates = [
        s for s in sorted(run.steps, key=lambda s: s.position)
        if s.step_id == step_id and s.status == "pending"
    ]
    if not candidates:
        raise ValueError(f"step {step_id} has no pending instance")
    current = candidates[0]

    current.status = "skipped" if skip else "done"
    current.results = results
    current.note = note
    current.completed_at = datetime.now(timezone.utc)

    if not skip and step_def.rules:
        action = evaluate_rules(step_def.rules, results, current_step_id=step_id)
        if action is not None:
            _apply_action(db, run, proto, current, action)

    # If all steps resolved, mark complete.
    if all(s.status in ("done", "skipped") for s in run.steps):
        run.status = "complete"

    db.commit()
    db.refresh(run)
    return run


def sync_to_benchling(db: Session, run: Run) -> tuple[str, str | None]:
    client = benchling.get_client()
    proto = get_protocol(run.protocol_id)
    library = proto.all_steps()

    items = []
    for s in sorted(run.steps, key=lambda s: s.position):
        title = library[s.step_id].title if s.step_id in library else s.step_id
        items.append(
            benchling.ChecklistItem(
                step_id=s.step_id,
                title=title,
                status=s.status,
                note=s.note,
                results=s.results or {},
            )
        )

    if run.benchling_entry_id:
        entry = client.entries.update_checklist(run.benchling_entry_id, items)
    else:
        entry = client.entries.create(name=run.name)
        entry = client.entries.update_checklist(entry.id, items)
        run.benchling_entry_id = entry.id
        db.commit()
    return entry.id, entry.web_url
