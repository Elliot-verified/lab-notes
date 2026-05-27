from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    protocol_id: Mapped[str] = mapped_column(String, index=True)
    protocol_version: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="in_progress")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Ordered list of step ids as currently computed (mutated by branching).
    step_order: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Benchling notebook entry id (if synced).
    benchling_entry_id: Mapped[str | None] = mapped_column(String, nullable=True)

    steps: Mapped[list["RunStep"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="RunStep.position",
    )


class RunStep(Base):
    __tablename__ = "run_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    step_id: Mapped[str] = mapped_column(String)  # protocol step id
    position: Mapped[int] = mapped_column()       # order within run
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|done|skipped
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    run: Mapped[Run] = relationship(back_populates="steps")
