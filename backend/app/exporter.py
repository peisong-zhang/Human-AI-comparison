from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable, Tuple, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .config_loader import load_config
from .settings import get_settings


CSV_HEADER = [
    "session_id",
    "participant_id",
    "group_id",
    "mode_id",
    "stage_index",
    "subset_id",
    "batch_id",
    "image_id",
    "answer",
    "order_index",
    "elapsed_ms_item",
    "elapsed_ms_global",
    "skipped",
    "item_timeout",
    "ts_server",
    "ts_client",
    "user_agent",
    "ip_hash",
    "started_at",
    "finished_at",
    "total_elapsed_ms",
]


def iter_records(
    session: Session,
    *,
    session_id: Optional[str] = None,
    participant_id: Optional[str] = None,
    mode_id: Optional[str] = None,
) -> Iterable[Tuple[models.RecordModel, models.SessionModel]]:
    stmt = (
        select(models.RecordModel, models.SessionModel)
        .join(
            models.SessionModel,
            models.SessionModel.session_id == models.RecordModel.session_id,
        )
        .order_by(
            models.SessionModel.started_at.asc(),
            models.RecordModel.order_index.asc(),
        )
    )
    if session_id:
        stmt = stmt.where(models.SessionModel.session_id == session_id)
    if participant_id:
        stmt = stmt.where(models.SessionModel.participant_id == participant_id)
    if mode_id:
        stmt = stmt.where(models.SessionModel.mode_id == mode_id)
    yield from session.execute(stmt)


def _sanitize(value: str) -> str:
    lower = value.lower().replace(" ", "-")
    cleaned = "".join(c for c in lower if c.isalnum() or c in ("-", "_"))
    return cleaned.strip("-_") or lower.replace(" ", "-")


def write_csv_snapshot(
    session: Session,
    *,
    participant_id: Optional[str] = None,
    mode_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> None:
    settings = get_settings()
    if not settings.auto_export_enabled:
        return

    export_dir: Path = settings.auto_export_dir
    export_dir.mkdir(parents=True, exist_ok=True)
    filename = settings.auto_export_filename
    stem = Path(filename).stem or "records"
    suffix = Path(filename).suffix or ".csv"
    parts = [stem]
    if participant_id:
        parts.append(_sanitize(participant_id))
    if mode_id:
        config = load_config()
        mode_label = None
        if mode_id in config.modes:
            mode_label = config.modes[mode_id].name
        else:
            mode_label = mode_id
        parts.append(_sanitize(mode_label))
    filename = "_".join(filter(None, parts)) + suffix
    file_path = export_dir / filename

    session.flush()

    with file_path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(CSV_HEADER)
        for record_model, session_model in iter_records(
            session,
            session_id=session_id,
            participant_id=participant_id,
            mode_id=mode_id,
        ):
            writer.writerow(
                [
                    session_model.session_id,
                    session_model.participant_id,
                    session_model.group_id,
                    session_model.mode_id,
                    record_model.stage_index,
                    record_model.subset_id,
                    session_model.batch_id,
                    record_model.image_id,
                    record_model.answer,
                    record_model.order_index,
                    record_model.elapsed_ms_item,
                    record_model.elapsed_ms_global,
                    int(record_model.skipped),
                    int(record_model.item_timeout),
                    record_model.ts_server.isoformat() if record_model.ts_server else "",
                    record_model.ts_client.isoformat() if record_model.ts_client else "",
                    record_model.user_agent or "",
                    record_model.ip_hash or "",
                    session_model.started_at.isoformat() if session_model.started_at else "",
                    session_model.finished_at.isoformat() if session_model.finished_at else "",
                    session_model.total_elapsed_ms or "",
                ]
            )
