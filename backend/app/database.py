from __future__ import annotations

from contextlib import contextmanager

from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from .settings import get_settings


engine = create_engine(
    get_settings().database_url,
    connect_args={"check_same_thread": False}
    if get_settings().database_url.startswith("sqlite")
    else {},
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


@contextmanager
def get_session() -> Session:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _row_name(row: Any) -> str:
    if hasattr(row, "_mapping"):
        return row._mapping["name"]
    return row[1]


def ensure_schema() -> None:
    """Ensure newly added columns exist without requiring manual migrations."""
    dialect = engine.dialect.name
    with engine.connect() as conn:
        if dialect == "sqlite":
            items_cols = {
                _row_name(row)
                for row in conn.execute(text("PRAGMA table_info(items)"))
            }
            if "subset_id" not in items_cols:
                conn.execute(text("ALTER TABLE items ADD COLUMN subset_id TEXT"))
            if "stage_index" not in items_cols:
                conn.execute(text("ALTER TABLE items ADD COLUMN stage_index INTEGER"))
            if "mode_id" not in items_cols:
                conn.execute(text("ALTER TABLE items ADD COLUMN mode_id TEXT"))
            if "ai_hint" not in items_cols:
                conn.execute(text("ALTER TABLE items ADD COLUMN ai_hint TEXT"))

            record_cols = {
                _row_name(row)
                for row in conn.execute(text("PRAGMA table_info(records)"))
            }
            if "subset_id" not in record_cols:
                conn.execute(text("ALTER TABLE records ADD COLUMN subset_id TEXT"))
            if "stage_index" not in record_cols:
                conn.execute(text("ALTER TABLE records ADD COLUMN stage_index INTEGER"))
            if "mode_id" not in record_cols:
                conn.execute(text("ALTER TABLE records ADD COLUMN mode_id TEXT"))

            session_cols = {
                _row_name(row)
                for row in conn.execute(text("PRAGMA table_info(sessions)"))
            }
            if "participant_role" not in session_cols:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN participant_role TEXT"))
        else:
            # For Postgres or other dialects supporting IF NOT EXISTS syntax.
            conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS subset_id VARCHAR(50)"))
            conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS stage_index INTEGER"))
            conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS mode_id VARCHAR(50)"))
            conn.execute(text("ALTER TABLE items ADD COLUMN IF NOT EXISTS ai_hint TEXT"))
            conn.execute(text("ALTER TABLE records ADD COLUMN IF NOT EXISTS subset_id VARCHAR(50)"))
            conn.execute(text("ALTER TABLE records ADD COLUMN IF NOT EXISTS stage_index INTEGER"))
            conn.execute(text("ALTER TABLE records ADD COLUMN IF NOT EXISTS mode_id VARCHAR(50)"))
            conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participant_role VARCHAR(100)"))
        try:
            conn.commit()
        except Exception:
            pass
