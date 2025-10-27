from __future__ import annotations

import csv
import datetime as dt
import io
import random
from collections.abc import Generator
from typing import Annotated, Optional, Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from . import models
from .config_loader import list_subset_images, load_config
from .exporter import write_csv_snapshot
from .database import SessionLocal, engine, ensure_schema
from .schemas import (
    ConfigGroup,
    ConfigMode,
    ConfigResponse,
    ConfigSubset,
    GroupSequenceStage,
    RecordPayload,
    SessionFinishRequest,
    SessionItem,
    SessionStartRequest,
    SessionStartResponse,
    StageInfo,
)
from .settings import get_settings
from .utils import get_client_ip, hash_ip

models.Base.metadata.create_all(bind=engine)
ensure_schema()

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
def _build_stage_info_from_items(
    items: list[models.ItemModel], group_config, config
) -> list[StageInfo]:
    stages: dict[int, dict[str, Any]] = {}
    for item in items:
        stage_meta = stages.setdefault(
            item.stage_index,
            {
                "subset_id": item.subset_id,
                "mode_id": item.mode_id,
                "count": 0,
            },
        )
        stage_meta["count"] += 1

    stage_infos: list[StageInfo] = []
    for stage_index, stage_config in enumerate(group_config.sequence):
        meta = stages.get(stage_index, {"count": 0})
        mode_cfg = config.modes[stage_config.mode]
        subset_cfg = config.subsets[stage_config.subset]
        stage_infos.append(
            StageInfo(
                stage_index=stage_index,
                subset_id=stage_config.subset,
                subset_name=subset_cfg.name,
                mode_id=stage_config.mode,
                mode_name=mode_cfg.name,
                label=stage_config.label,
                ai_enabled=mode_cfg.ai_enabled,
                task_markdown=mode_cfg.task_markdown,
                guidelines_markdown=mode_cfg.guidelines_markdown,
                total_items=meta.get("count", 0),
            )
        )
    return stage_infos


@app.get("/api/config", response_model=ConfigResponse)
def read_config() -> ConfigResponse:
    config = load_config()
    subsets = []
    for subset_id, subset_config in config.subsets.items():
        mode_ids = list(subset_config.image_dirs.keys())
        if not mode_ids:
            case_count = 0
        else:
            first_mode = mode_ids[0]
            entries = list_subset_images(subset_id, first_mode)
            case_count = len(entries)
        subsets.append(
            ConfigSubset(
                subset_id=subset_id,
                name=subset_config.name,
                description=subset_config.description,
                case_count=case_count,
            )
        )

    modes = [
        ConfigMode(
            mode_id=mode_id,
            name=mode_config.name,
            ai_enabled=mode_config.ai_enabled,
            task_markdown=mode_config.task_markdown,
            guidelines_markdown=mode_config.guidelines_markdown,
            per_item_seconds=mode_config.per_item_seconds,
        )
        for mode_id, mode_config in config.modes.items()
    ]

    group_payloads = []
    for group_id, group_config in config.groups.items():
        sequence = [
            GroupSequenceStage(
                subset_id=stage.subset,
                mode_id=stage.mode,
                label=stage.label,
            )
            for stage in group_config.sequence
        ]
        group_payloads.append(
            ConfigGroup(
                group_id=group_id,
                name=group_config.name,
                per_item_seconds=group_config.per_item_seconds,
                hard_timeout=group_config.hard_timeout,
                soft_timeout=group_config.soft_timeout,
                quota=group_config.quota,
                sequence=sequence,
            )
        )

    participant_roles = list(config.participant_roles)
    if not participant_roles:
        participant_roles = [group.name for group in config.groups.values()]

    return ConfigResponse(
        batch_id=config.batch_id,
        default_per_item_seconds=config.default_per_item_seconds,
        allow_resume=config.allow_resume,
        subsets=subsets,
        modes=modes,
        groups=group_payloads,
        participant_roles=participant_roles,
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

    group_config = config.groups[payload.group_id]
    if not group_config.sequence:
        raise HTTPException(status_code=400, detail="Group has no stage sequence configured")

    participant_role = payload.participant_role.strip() if payload.participant_role else None
    if participant_role and participant_role not in (config.participant_roles or []):
        raise HTTPException(status_code=400, detail="Unknown participant_role")

    client_ip = get_client_ip(request)
    ip_digest = hash_ip(client_ip)
    user_agent = payload.user_agent or request.headers.get("user-agent")

    # Resume handling
    session_model: Optional[models.SessionModel] = None
    if config.allow_resume:
        stmt: Select[tuple[models.SessionModel]] = (
            select(models.SessionModel)
            .where(
                models.SessionModel.participant_id == participant_id,
                models.SessionModel.group_id == payload.group_id,
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
            stage_infos = _build_stage_info_from_items(items, group_config, config)
            return SessionStartResponse(
                session_id=session_model.session_id,
                batch_id=session_model.batch_id,
                group_id=session_model.group_id,
                participant_id=session_model.participant_id,
                participant_role=session_model.participant_role,
                stages=stage_infos,
                items=[
                    SessionItem(
                    stage_index=item.stage_index,
                    subset_id=item.subset_id,
                    mode_id=item.mode_id,
                    image_id=item.image_id,
                    filename=item.filename,
                    title=item.image_id.replace("_", " ").title(),
                    order_index=item.order_index,
                    url=f"/images/subsets/{item.subset_id}/{item.mode_id}/{item.filename}",
                )
                    for item in items
                ],
                allow_resume=config.allow_resume,
            )

    session_model = models.SessionModel(
        participant_id=participant_id,
        group_id=payload.group_id,
        mode_id="multi_stage",
        participant_role=participant_role,
        batch_id=config.batch_id,
        user_agent=user_agent,
        ip_hash=ip_digest,
    )
    db.add(session_model)
    db.flush()

    session_items: list[models.ItemModel] = []
    response_items: list[SessionItem] = []
    stage_infos: list[StageInfo] = []
    order_index = 0

    for stage_index, stage in enumerate(group_config.sequence):
        if stage.mode not in config.modes:
            raise HTTPException(status_code=400, detail=f"Mode '{stage.mode}' not configured")
        if stage.subset not in config.subsets:
            raise HTTPException(status_code=400, detail=f"Subset '{stage.subset}' not configured")

        mode_config = config.modes[stage.mode]
        subset_config = config.subsets[stage.subset]
        entries = list_subset_images(stage.subset, stage.mode)
        stage_random = random.Random(f"{session_model.session_id}:{stage_index}")
        if mode_config.randomize:
            stage_random.shuffle(entries)

        if not entries:
            raise HTTPException(status_code=404, detail=f"Subset '{stage.subset}' has no configured cases")

        for entry in entries:
            item = models.ItemModel(
                session_id=session_model.session_id,
                image_id=entry["image_id"],
                filename=entry["relative_path"],
                order_index=order_index,
                subset_id=stage.subset,
                stage_index=stage_index,
                mode_id=stage.mode,
            )
            session_items.append(item)
            response_items.append(
                SessionItem(
                    stage_index=stage_index,
                    subset_id=stage.subset,
                    mode_id=stage.mode,
                    image_id=entry["image_id"],
                    filename=entry["relative_path"],
                    title=entry["title"],
                    order_index=order_index,
                    url=entry["url"],
                )
            )
            order_index += 1

        stage_infos.append(
            StageInfo(
                stage_index=stage_index,
                subset_id=stage.subset,
                subset_name=subset_config.name,
                mode_id=stage.mode,
                mode_name=mode_config.name,
                label=stage.label,
                ai_enabled=mode_config.ai_enabled,
                task_markdown=mode_config.task_markdown,
                guidelines_markdown=mode_config.guidelines_markdown,
                total_items=len(entries),
            )
        )

    db.add_all(session_items)

    return SessionStartResponse(
        session_id=session_model.session_id,
        batch_id=session_model.batch_id,
        group_id=session_model.group_id,
        participant_id=session_model.participant_id,
        participant_role=session_model.participant_role,
        stages=stage_infos,
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
        record_model.subset_id = item_model.subset_id
        record_model.stage_index = item_model.stage_index
        record_model.mode_id = item_model.mode_id
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
            subset_id=item_model.subset_id,
            stage_index=item_model.stage_index,
            mode_id=item_model.mode_id,
        )
        db.add(record_model)

    write_csv_snapshot(
        db,
        participant_id=session_model.participant_id,
        participant_role=session_model.participant_role,
        mode_id=None,
        session_id=session_model.session_id,
        group_id=session_model.group_id,
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
        participant_role=session_model.participant_role,
        mode_id=None,
        session_id=session_model.session_id,
        group_id=session_model.group_id,
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
        stmt = stmt.where(models.RecordModel.mode_id == mode_id)
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
            "batch_id",
            "mode_id",
            "stage_index",
            "subset_id",
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
                    session_model.batch_id,
                    record_model.mode_id,
                    record_model.stage_index,
                    record_model.subset_id,
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


@app.get("/images/subsets/{subset_id}/{mode_id}/{path:path}")
def serve_subset_image(subset_id: str, mode_id: str, path: str) -> FileResponse:
    config = load_config()
    if subset_id not in config.subsets:
        raise HTTPException(status_code=404, detail="Unknown subset")
    try:
        images_dir = config.resolve_image_dir(subset_id, mode_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Unknown mode for subset") from exc
    file_path = (images_dir / path).resolve()

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
