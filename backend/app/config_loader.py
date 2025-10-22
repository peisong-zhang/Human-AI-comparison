from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from typing import Optional

from pydantic import BaseModel, Field, ValidationError

from .settings import get_settings


class GroupConfig(BaseModel):
    name: str
    per_item_seconds: Optional[int] = None
    hard_timeout: bool = False
    soft_timeout: bool = True
    quota: Optional[int] = None


class ModeConfig(BaseModel):
    name: str
    image_dir: str
    task_markdown: str
    guidelines_markdown: str
    randomize: bool = True
    per_item_seconds: Optional[int] = None


class ExperimentConfig(BaseModel):
    batch_id: str
    groups: dict[str, GroupConfig]
    modes: dict[str, ModeConfig]
    default_per_item_seconds: int = Field(default=60, ge=1)
    allow_resume: bool = True

    def resolve_image_dir(self, mode_id: str) -> Path:
        mode = self.modes[mode_id]
        image_dir = Path(mode.image_dir)
        if image_dir.is_absolute():
            return image_dir
        settings = get_settings()
        if settings.project_root:
            return (settings.project_root / image_dir).resolve()
        config_path = settings.config_path.resolve()
        # assume project root is one level above config directory
        potential_root = config_path.parent
        if potential_root.name == "config" and len(config_path.parents) >= 2:
            potential_root = config_path.parents[1]
        return (potential_root / image_dir).resolve()


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


def list_mode_images(mode_id: str) -> list[dict[str, Any]]:
    config = load_config()
    images_dir = config.resolve_image_dir(mode_id)
    images_dir.mkdir(parents=True, exist_ok=True)
    image_entries: list[dict[str, Any]] = []
    for image_path in sorted(images_dir.glob("*")):
        if not image_path.is_file():
            continue
        if image_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            continue
        image_id = image_path.stem
        image_entries.append(
            {
                "image_id": image_id,
                "filename": image_path.name,
                "title": image_id.replace("_", " ").title(),
                "url": f"/images/{mode_id}/{image_path.name}",
            }
        )
    return image_entries


def get_project_root() -> Path:
    settings = get_settings()
    config_path = settings.config_path.resolve()
    if config_path.parent.name == "config" and len(config_path.parents) >= 2:
        return config_path.parents[1]
    return config_path.parent
