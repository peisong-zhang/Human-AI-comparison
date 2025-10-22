from __future__ import annotations

import datetime as dt
from typing import Any

from typing import Optional

from pydantic import BaseModel, Field


class SessionStartRequest(BaseModel):
    participant_id: str = Field(min_length=1, max_length=100)
    group_id: str
    mode_id: str
    user_agent: Optional[str] = None


class SessionItem(BaseModel):
    image_id: str
    filename: str
    title: str
    order_index: int
    url: str


class SessionStartResponse(BaseModel):
    session_id: str
    batch_id: str
    mode_id: str
    group_id: str
    participant_id: str
    items: list[SessionItem]
    allow_resume: bool


class RecordPayload(BaseModel):
    session_id: str
    image_id: str
    answer: str
    order_index: Optional[int] = None
    elapsed_ms_item: Optional[int] = Field(default=None, ge=0)
    elapsed_ms_global: Optional[int] = Field(default=None, ge=0)
    skipped: bool = False
    item_timeout: bool = False
    ts_client: Optional[dt.datetime] = None
    user_agent: Optional[str] = None


class SessionFinishRequest(BaseModel):
    session_id: str
    total_elapsed_ms: Optional[int] = Field(default=None, ge=0)


class ConfigMode(BaseModel):
    mode_id: str
    name: str
    task_markdown: str
    guidelines_markdown: str
    randomize: bool
    per_item_seconds: Optional[int] = None
    images: list[dict[str, Any]] = Field(default_factory=list)


class ConfigGroup(BaseModel):
    group_id: str
    name: str
    per_item_seconds: Optional[int]
    hard_timeout: bool
    soft_timeout: bool
    quota: Optional[int]


class ConfigResponse(BaseModel):
    batch_id: str
    default_per_item_seconds: int
    allow_resume: bool
    groups: list[ConfigGroup]
    modes: list[ConfigMode]
