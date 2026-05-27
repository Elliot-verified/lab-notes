import os
import tempfile
from pathlib import Path

import pytest

# Point the app at a throwaway sqlite db per test session.
_tmp = tempfile.TemporaryDirectory()
os.environ["LAB_NOTES_DATA_DIR"] = _tmp.name
os.environ["LAB_NOTES_DATABASE_URL"] = f"sqlite:///{Path(_tmp.name) / 'test.sqlite'}"


@pytest.fixture
def db_session():
    from app.db import Base, SessionLocal, engine

    Base.metadata.create_all(engine)
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
        Base.metadata.drop_all(engine)
