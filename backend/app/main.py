from __future__ import annotations

from dataclasses import asdict

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import uuid

from . import protocols, runs, schemas
from .db import Base, engine, get_session
from .models import Note, Run


@asynccontextmanager
async def _lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Lab Notes", version="0.1.0", lifespan=_lifespan)

# Tables are also created eagerly so test clients that don't trigger lifespan work.
Base.metadata.create_all(engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serialize_run(run: Run) -> schemas.RunOut:
    proto = protocols.get_protocol(run.protocol_id)
    library = proto.all_steps()
    steps_out = []
    for s in sorted(run.steps, key=lambda s: s.position):
        defn = library.get(s.step_id)
        steps_out.append(
            schemas.RunStepOut(
                step_id=s.step_id,
                position=s.position,
                status=s.status,
                results=s.results or {},
                note=s.note,
                completed_at=s.completed_at,
                title=defn.title if defn else s.step_id,
                description=defn.description if defn else "",
                duration=defn.duration if defn else None,
                result_fields=[
                    schemas.ResultFieldOut(**asdict(rf))
                    for rf in (defn.results if defn else [])
                ],
            )
        )
    return schemas.RunOut(
        id=run.id,
        protocol_id=run.protocol_id,
        protocol_version=run.protocol_version,
        name=run.name,
        status=run.status,
        created_at=run.created_at,
        updated_at=run.updated_at,
        benchling_entry_id=run.benchling_entry_id,
        steps=steps_out,
    )


@app.get("/api/health")
def health():
    """Diagnostic: which database engine notes/runs are actually being saved to."""
    backend_name = engine.url.get_backend_name()
    persistent = backend_name != "sqlite"
    return {
        "db_backend": backend_name,
        "persistent": persistent,
        "note": (
            "Postgres / hosted DB — notes persist across deploys."
            if persistent
            else "SQLite — fine for local dev, will not persist on Vercel cold starts. Connect a hosted Postgres."
        ),
    }


@app.get("/api/protocols", response_model=list[schemas.ProtocolOut])
def list_protocols():
    out = []
    for p in protocols.load_all().values():
        out.append(
            schemas.ProtocolOut(
                id=p.id,
                name=p.name,
                version=p.version,
                description=p.description,
                steps=[
                    schemas.StepOut(
                        id=s.id,
                        title=s.title,
                        description=s.description,
                        duration=s.duration,
                        results=[
                            schemas.ResultFieldOut(**asdict(rf)) for rf in s.results
                        ],
                    )
                    for s in p.steps
                ],
            )
        )
    return out


@app.post("/api/runs", response_model=schemas.RunOut)
def create_run(payload: schemas.CreateRunIn, db: Session = Depends(get_session)):
    try:
        run = runs.create_run(db, payload.protocol_id, payload.name)
    except KeyError:
        raise HTTPException(404, f"protocol {payload.protocol_id!r} not found")
    return _serialize_run(run)


@app.get("/api/runs", response_model=list[schemas.RunOut])
def list_runs(db: Session = Depends(get_session)):
    rows = db.query(Run).order_by(Run.created_at.desc()).all()
    return [_serialize_run(r) for r in rows]


@app.get("/api/runs/{run_id}", response_model=schemas.RunOut)
def get_run(run_id: str, db: Session = Depends(get_session)):
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    return _serialize_run(run)


@app.post("/api/runs/{run_id}/steps/{step_id}/complete", response_model=schemas.RunOut)
def complete_step(
    run_id: str,
    step_id: str,
    payload: schemas.CompleteStepIn,
    db: Session = Depends(get_session),
):
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    try:
        run = runs.complete_step(
            db, run, step_id, payload.results, payload.note, payload.skip
        )
    except KeyError as e:
        raise HTTPException(404, f"step {e.args[0]!r} not in protocol")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _serialize_run(run)


@app.post("/api/runs/{run_id}/sync", response_model=schemas.SyncResponse)
def sync(run_id: str, db: Session = Depends(get_session)):
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(404, "run not found")
    entry_id, web_url = runs.sync_to_benchling(db, run)
    return schemas.SyncResponse(benchling_entry_id=entry_id, web_url=web_url)


def _serialize_note(note: Note) -> schemas.NoteOut:
    return schemas.NoteOut(
        id=note.id,
        title=note.title,
        blocks=note.blocks or [],
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


@app.get("/api/notes", response_model=list[schemas.NoteSummary])
def list_notes(db: Session = Depends(get_session)):
    rows = db.query(Note).order_by(Note.updated_at.desc()).all()
    return [
        schemas.NoteSummary(
            id=n.id,
            title=n.title,
            updated_at=n.updated_at,
            block_count=len(n.blocks or []),
        )
        for n in rows
    ]


@app.post("/api/notes", response_model=schemas.NoteOut)
def create_note(payload: schemas.CreateNoteIn, db: Session = Depends(get_session)):
    note = Note(
        id=f"note_{uuid.uuid4().hex[:12]}",
        title=payload.title or "Untitled note",
        blocks=[],
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _serialize_note(note)


@app.get("/api/notes/{note_id}", response_model=schemas.NoteOut)
def get_note(note_id: str, db: Session = Depends(get_session)):
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "note not found")
    return _serialize_note(note)


@app.put("/api/notes/{note_id}", response_model=schemas.NoteOut)
def update_note(
    note_id: str,
    payload: schemas.UpdateNoteIn,
    db: Session = Depends(get_session),
):
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "note not found")
    if payload.title is not None:
        note.title = payload.title
    if payload.blocks is not None:
        note.blocks = payload.blocks
    db.commit()
    db.refresh(note)
    return _serialize_note(note)


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: str, db: Session = Depends(get_session)):
    note = db.get(Note, note_id)
    if note is not None:
        db.delete(note)
        db.commit()
