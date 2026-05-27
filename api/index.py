"""Vercel entrypoint.

Vercel's Python runtime detects the `app` ASGI variable here and serves it.
All app code lives under `backend/` so local dev (`uvicorn app.main:app`)
keeps working unchanged.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# /tmp is the only writable filesystem on Vercel; we don't actually need it
# (Postgres is the source of truth) but DATA_DIR is created at import.
os.environ.setdefault("LAB_NOTES_DATA_DIR", "/tmp/lab-notes")

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
