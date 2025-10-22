from __future__ import annotations

import csv
import datetime as dt
import io
import random
from collections.abc import Generator
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from . import models
from .config_loader import list_mode_images, load_config
from .exporter import write_csv_snapshot
from .database import SessionLocal, engine
from .schemas import (
    ConfigGroup,
    ConfigMode,
    ConfigResponse,
    RecordPayload,
    SessionFinishRequest,
    SessionItem,
    SessionStartRequest,
    SessionStartResponse,
)
from .settings import get_settings
from .utils import get_client_ip, hash_ip

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Human-AI Comparison Experiment API")

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db_session() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


DBSession = Annotated[Session, Depends(get_db_session)]


def _ensure_mode_exists(mode_id: str) -> None:
    config = load_config()
    if mode_id not in config.modes:
        raise HTTPException(status_code=404, detail=f"Mode '{mode_id}' not found")


@app.get("/api/config", response_model=ConfigResponse)
def read_config() -> ConfigResponse:
    config = load_config()
    groups = [
        ConfigGroup(
            group_id=group_id,
            name=group_config.name,
            per_item_seconds=group_config.per_item_seconds,
            hard_timeout=group_config.hard_timeout,
            soft_timeout=group_config.soft_timeout,
            quota=group_config.quota,
        )
        for group_id, group_config in config.groups.items()
    ]

    modes = []
    for mode_id, mode_config in config.modes.items():
        images = list_mode_images(mode_id)
        modes.append(
            ConfigMode(
                mode_id=mode_id,
                name=mode_config.name,
                task_markdown=mode_config.task_markdown,
                guidelines_markdown=mode_config.guidelines_markdown,
                randomize=mode_config.randomize,
                per_item_seconds=mode_config.per_item_seconds,
                images=images,
            )
        )

    return ConfigResponse(
        batch_id=config.batch_id,
        default_per_item_seconds=config.default_per_item_seconds,
        allow_resume=config.allow_resume,
        groups=groups,
        modes=modes,
    )


@app.post("/api/session/start", response_model=SessionStartResponse)
def start_session(
    payload: SessionStartRequest, request: Request, db: DBSession
) -> SessionStartResponse:
    config = load_config()

    participant_id = payload.participant_id.strip()
    if not participant_id:
        raise HTTPException(status_code=400, detail="participant_id is required")
    if payload.group_id not in config.groups:
        raise HTTPException(status_code=400, detail="Unknown group_id")
    if payload.mode_id not in config.modes:
        raise HTTPException(status_code=400, detail="Unknown mode_id")

    client_ip = get_client_ip(request)
    ip_digest = hash_ip(client_ip)
    user_agent = payload.user_agent or request.headers.get("user-agent")

    session_model: Optional[models.SessionModel] = None
    if config.allow_resume:
        stmt: Select[tuple[models.SessionModel]] = (
            select(models.SessionModel)
            .where(
                models.SessionModel.participant_id == participant_id,
                models.SessionModel.group_id == payload.group_id,
                models.SessionModel.mode_id == payload.mode_id,
            )
            .order_by(models.SessionModel.started_at.desc())
        )
        session_model = db.scalars(stmt).first()
        if session_model and session_model.finished_at is None:
            items = (
                db.query(models.ItemModel)
                .filter(models.ItemModel.session_id == session_model.session_id)
                .order_by(models.ItemModel.order_index.asc())
                .all()
            )
            return SessionStartResponse(
                session_id=session_model.session_id,
                batch_id=session_model.batch_id,
                mode_id=session_model.mode_id,
                group_id=session_model.group_id,
                participant_id=session_model.participant_id,
                items=[
                    SessionItem(
                        image_id=item.image_id,
                        filename=item.filename,
                        title=item.image_id.replace("_", " ").title(),
                        order_index=item.order_index,
                        url=f"/images/{payload.mode_id}/{item.filename}",
                    )
                    for item in items
                ],
                allow_resume=config.allow_resume,
            )

    image_entries = list_mode_images(payload.mode_id)
    if not image_entries:
        raise HTTPException(status_code=404, detail="No images configured for mode")

    if config.modes[payload.mode_id].randomize:
        random.shuffle(image_entries)

    session_model = models.SessionModel(
        participant_id=participant_id,
        group_id=payload.group_id,
        mode_id=payload.mode_id,
        batch_id=config.batch_id,
        user_agent=user_agent,
        ip_hash=ip_digest,
    )
    db.add(session_model)
    db.flush()

    session_items: list[models.ItemModel] = []
    response_items: list[SessionItem] = []
    for order_index, entry in enumerate(image_entries):
        item = models.ItemModel(
            session_id=session_model.session_id,
            image_id=entry["image_id"],
            filename=entry["filename"],
            order_index=order_index,
        )
        session_items.append(item)
        response_items.append(
            SessionItem(
                image_id=entry["image_id"],
                filename=entry["filename"],
                title=entry["title"],
                order_index=order_index,
                url=entry["url"],
            )
        )
    db.add_all(session_items)

    return SessionStartResponse(
        session_id=session_model.session_id,
        batch_id=session_model.batch_id,
        mode_id=session_model.mode_id,
        group_id=session_model.group_id,
        participant_id=session_model.participant_id,
        items=response_items,
        allow_resume=config.allow_resume,
    )


@app.post("/api/record")
def record_response(
    payload: RecordPayload, request: Request, db: DBSession
) -> JSONResponse:
    stmt_session: Select[tuple[models.SessionModel]] = select(models.SessionModel).where(
        models.SessionModel.session_id == payload.session_id
    )
    session_model = db.scalars(stmt_session).first()
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    stmt_item: Select[tuple[models.ItemModel]] = select(models.ItemModel).where(
        models.ItemModel.session_id == payload.session_id,
        models.ItemModel.image_id == payload.image_id,
    )
    item_model = db.scalars(stmt_item).first()
    if not item_model:
        raise HTTPException(status_code=400, detail="Image not part of session")

    if payload.order_index is None:
        payload.order_index = item_model.order_index

    client_ip = get_client_ip(request)
    ip_digest = hash_ip(client_ip)
    user_agent = payload.user_agent or request.headers.get("user-agent")

    stmt_record: Select[tuple[models.RecordModel]] = select(models.RecordModel).where(
        models.RecordModel.session_id == payload.session_id,
        models.RecordModel.image_id == payload.image_id,
    )
    record_model = db.scalars(stmt_record).first()

    if record_model:
        record_model.answer = payload.answer
        record_model.order_index = payload.order_index
        record_model.elapsed_ms_item = payload.elapsed_ms_item
        record_model.elapsed_ms_global = payload.elapsed_ms_global
        record_model.skipped = payload.skipped
        record_model.item_timeout = payload.item_timeout
        record_model.ts_client = payload.ts_client
        record_model.user_agent = user_agent
        record_model.ip_hash = ip_digest
    else:
        record_model = models.RecordModel(
            session_id=payload.session_id,
            image_id=payload.image_id,
            answer=payload.answer,
            order_index=payload.order_index,
            elapsed_ms_item=payload.elapsed_ms_item,
            elapsed_ms_global=payload.elapsed_ms_global,
            skipped=payload.skipped,
            item_timeout=payload.item_timeout,
            ts_client=payload.ts_client,
            user_agent=user_agent,
            ip_hash=ip_digest,
        )
        db.add(record_model)

    write_csv_snapshot(
        db,
        participant_id=session_model.participant_id,
        mode_id=session_model.mode_id,
        session_id=session_model.session_id,
    )

    return JSONResponse({"status": "ok"})


@app.post("/api/session/finish")
def finish_session(payload: SessionFinishRequest, db: DBSession) -> JSONResponse:
    stmt_session: Select[tuple[models.SessionModel]] = select(models.SessionModel).where(
        models.SessionModel.session_id == payload.session_id
    )
    session_model = db.scalars(stmt_session).first()
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_model.finished_at is None:
        session_model.finished_at = dt.datetime.utcnow()
    if payload.total_elapsed_ms is not None:
        session_model.total_elapsed_ms = payload.total_elapsed_ms

    write_csv_snapshot(
        db,
        participant_id=session_model.participant_id,
        mode_id=session_model.mode_id,
        session_id=session_model.session_id,
    )

    return JSONResponse({"status": "ok"})


@app.get("/api/export/csv")
def export_csv(
    group_id: Optional[str] = None,
    mode_id: Optional[str] = None,
    session_id: Optional[str] = None,
    db: Optional[Session] = Depends(get_db_session),
) -> StreamingResponse:
    stmt = select(models.RecordModel, models.SessionModel).join(
        models.SessionModel,
        models.SessionModel.session_id == models.RecordModel.session_id,
    )

    if group_id:
        stmt = stmt.where(models.SessionModel.group_id == group_id)
    if mode_id:
        stmt = stmt.where(models.SessionModel.mode_id == mode_id)
    if session_id:
        stmt = stmt.where(models.SessionModel.session_id == session_id)

    stmt = stmt.order_by(
        models.SessionModel.started_at.asc(), models.RecordModel.order_index.asc()
    )

    def row_iter() -> Generator[str, None, None]:
        output = io.StringIO()
        writer = csv.writer(output)
        header = [
            "session_id",
            "participant_id",
            "group_id",
            "mode_id",
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
        writer.writerow(header)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        for record_model, session_model in db.execute(stmt):
            writer.writerow(
                [
                    session_model.session_id,
                    session_model.participant_id,
                    session_model.group_id,
                    session_model.mode_id,
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
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename = "experiment_records.csv"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(
        row_iter(), media_type="text/csv", headers=headers
    )


@app.get("/images/{mode_id}/{filename}")
def serve_image(mode_id: str, filename: str) -> FileResponse:
    config = load_config()
    if mode_id not in config.modes:
        raise HTTPException(status_code=404, detail="Unknown mode")
    images_dir = config.resolve_image_dir(mode_id)
    file_path = (images_dir / filename).resolve()

    try:
        file_path.relative_to(images_dir.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid filename") from exc

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(file_path)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "message": "Human-AI comparison experiment API"}
