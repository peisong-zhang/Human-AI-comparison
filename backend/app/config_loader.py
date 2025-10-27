from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

from pydantic import BaseModel, Field, ValidationError

from .settings import get_settings


class StageSequenceItem(BaseModel):
    subset: str
    mode: str
    label: Optional[str] = None


class GroupConfig(BaseModel):
    name: str
    per_item_seconds: Optional[int] = None
    hard_timeout: bool = False
    soft_timeout: bool = True
    quota: Optional[int] = None
    sequence: list[StageSequenceItem] = Field(default_factory=list)


class ModeConfig(BaseModel):
    name: str
    task_markdown: str
    guidelines_markdown: str
    randomize: bool = True
    per_item_seconds: Optional[int] = None
    ai_enabled: bool = False


class SubsetConfig(BaseModel):
    name: str
    description: Optional[str] = None
    image_dirs: dict[str, str]


class ExperimentConfig(BaseModel):
    batch_id: str
    groups: dict[str, GroupConfig]
    modes: dict[str, ModeConfig]
    subsets: dict[str, SubsetConfig]
    default_per_item_seconds: int = Field(default=60, ge=1)
    allow_resume: bool = True

    def resolve_image_dir(self, subset_id: str, mode_id: str) -> Path:
        subset = self.subsets[subset_id]
        if mode_id not in subset.image_dirs:
            raise KeyError(f"Subset '{subset_id}' has no image directory for mode '{mode_id}'")
        image_dir = Path(subset.image_dirs[mode_id])
        if image_dir.is_absolute():
            return image_dir
        settings = get_settings()
        project_root = settings.project_root
        if project_root:
            return (project_root / image_dir).resolve()
        config_path = settings.config_path.resolve()
        parent = config_path.parent
        if parent.name == "config" and len(config_path.parents) >= 2:
            parent = config_path.parents[1]
        return (parent / image_dir).resolve()


@lru_cache(maxsize=1)
def load_config() -> ExperimentConfig:
    settings = get_settings()
    config_path = settings.config_path
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found at {config_path}")
    with config_path.open("r", encoding="utf-8") as config_file:
        data: dict[str, Any] = json.load(config_file)

    try:
        return ExperimentConfig.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(f"Invalid experiment config: {exc}") from exc


def list_subset_images(subset_id: str, mode_id: str) -> list[dict[str, Any]]:
    config = load_config()
    images_dir = config.resolve_image_dir(subset_id, mode_id)
    images_dir.mkdir(parents=True, exist_ok=True)

    entries: list[dict[str, Any]] = []
    for image_path in sorted(images_dir.rglob("*")):
        if not image_path.is_file():
            continue
        if image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            continue
        image_id = image_path.stem
        rel_path = image_path.relative_to(images_dir)
        entries.append(
            {
                "subset_id": subset_id,
                "image_id": image_id,
                "filename": image_path.name,
                "relative_path": rel_path.as_posix(),
                "title": image_id.replace("_", " ").title(),
                "url": f"/images/subsets/{subset_id}/{mode_id}/{rel_path.as_posix()}",
            }
        )
    return entries


def iter_subset_images(subset_ids: Iterable[str], mode_id: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for subset_id in subset_ids:
        entries.extend(list_subset_images(subset_id, mode_id))
    return entries


def get_project_root() -> Path:
    settings = get_settings()
    if settings.project_root:
        return settings.project_root
    config_path = settings.config_path.resolve()
    if config_path.parent.name == "config" and len(config_path.parents) >= 2:
        return config_path.parents[1]
    return config_path.parent
