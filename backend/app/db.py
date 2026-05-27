from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Local dev defaults to sqlite under ./data. On Vercel set DATABASE_URL to a
# hosted Postgres connection string (Neon, Vercel Postgres, etc.).
DATA_DIR = Path(os.environ.get("LAB_NOTES_DATA_DIR", "data"))

# Vercel exposes Neon as DATABASE_URL; LAB_NOTES_DATABASE_URL kept for explicit override.
DATABASE_URL = (
    os.environ.get("LAB_NOTES_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
)

if DATABASE_URL is None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DATABASE_URL = f"sqlite:///{DATA_DIR / 'lab-notes.sqlite'}"

# SQLAlchemy 2.x wants the explicit driver in the URL; Neon hands out
# postgres:// or postgresql:// — normalise both to psycopg3.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL.split("://", 1)[0]:
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
