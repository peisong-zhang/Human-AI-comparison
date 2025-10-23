from __future__ import annotations

import datetime as dt
import uuid

from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SessionModel(Base):
    __tablename__ = "sessions"

    session_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    participant_id: Mapped[str] = mapped_column(String(100), index=True)
    group_id: Mapped[str] = mapped_column(String(50), index=True)
    mode_id: Mapped[str] = mapped_column(String(50), index=True)
    participant_role: Mapped[Optional[str]] = mapped_column(String(100))
    batch_id: Mapped[str] = mapped_column(String(50), index=True)
    started_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=func.now()
    )
    finished_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    total_elapsed_ms: Mapped[Optional[int]] = mapped_column(Integer)

    records: Mapped[list["RecordModel"]] = relationship(
        "RecordModel", back_populates="session", cascade="all, delete-orphan"
    )
    items: Mapped[list["ItemModel"]] = relationship(
        "ItemModel", back_populates="session", cascade="all, delete-orphan"
    )


class ItemModel(Base):
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("session_id", "order_index", name="uq_item_order"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.session_id", ondelete="CASCADE"), index=True
    )
    image_id: Mapped[str] = mapped_column(String(200))
    filename: Mapped[str] = mapped_column(String(255))
    order_index: Mapped[int] = mapped_column(Integer)
    subset_id: Mapped[str] = mapped_column(String(50))
    stage_index: Mapped[int] = mapped_column(Integer)
    mode_id: Mapped[str] = mapped_column(String(50))
    ai_hint: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    session: Mapped["SessionModel"] = relationship("SessionModel", back_populates="items")


class RecordModel(Base):
    __tablename__ = "records"
    __table_args__ = (
        UniqueConstraint("session_id", "image_id", name="uq_session_image"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.session_id", ondelete="CASCADE"), index=True
    )
    image_id: Mapped[str] = mapped_column(String(200))
    answer: Mapped[str] = mapped_column(String(20))
    order_index: Mapped[Optional[int]] = mapped_column(Integer)
    elapsed_ms_item: Mapped[Optional[int]] = mapped_column(Integer)
    elapsed_ms_global: Mapped[Optional[int]] = mapped_column(Integer)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    item_timeout: Mapped[bool] = mapped_column(Boolean, default=False)
    ts_server: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=func.now()
    )
    ts_client: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    ip_hash: Mapped[Optional[str]] = mapped_column(String(64))
    subset_id: Mapped[Optional[str]] = mapped_column(String(50))
    stage_index: Mapped[Optional[int]] = mapped_column(Integer)
    mode_id: Mapped[Optional[str]] = mapped_column(String(50))

    session: Mapped["SessionModel"] = relationship("SessionModel", back_populates="records")
