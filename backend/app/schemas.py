from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from pydantic import BaseModel, Field


class GroupSequenceStage(BaseModel):
    subset_id: str
    mode_id: str
    label: Optional[str] = None


class ConfigSubset(BaseModel):
    subset_id: str
    name: str
    description: Optional[str]
    case_count: int


class ConfigMode(BaseModel):
    mode_id: str
    name: str
    ai_enabled: bool
    task_markdown: str
    guidelines_markdown: str
    per_item_seconds: Optional[int]


class ConfigGroup(BaseModel):
    group_id: str
    name: str
    per_item_seconds: Optional[int]
    hard_timeout: bool
    soft_timeout: bool
    quota: Optional[int]
    sequence: list[GroupSequenceStage]


class ConfigResponse(BaseModel):
    batch_id: str
    default_per_item_seconds: int
    allow_resume: bool
    subsets: list[ConfigSubset]
    modes: list[ConfigMode]
    groups: list[ConfigGroup]


class SessionStartRequest(BaseModel):
    participant_id: str = Field(min_length=1, max_length=100)
    group_id: str
    user_agent: Optional[str] = None


class StageInfo(BaseModel):
    stage_index: int
    subset_id: str
    subset_name: str
    mode_id: str
    mode_name: str
    label: Optional[str]
    ai_enabled: bool
    task_markdown: str
    guidelines_markdown: str
    total_items: int


class SessionItem(BaseModel):
    stage_index: int
    subset_id: str
    mode_id: str
    image_id: str
    filename: str
    title: str
    order_index: int
    url: str


class SessionStartResponse(BaseModel):
    session_id: str
    batch_id: str
    group_id: str
    participant_id: str
    stages: list[StageInfo]
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
