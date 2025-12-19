from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional, Union

from pydantic import BaseModel, Field, ValidationError

from .settings import get_settings


ImageDirConfig = Union[str, dict[str, str]]

_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


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
    image_dirs: dict[str, ImageDirConfig]


class ExperimentConfig(BaseModel):
    batch_id: str
    groups: dict[str, GroupConfig]
    modes: dict[str, ModeConfig]
    subsets: dict[str, SubsetConfig]
    default_per_item_seconds: int = Field(default=60, ge=1)
    allow_resume: bool = True
    participant_roles: list[str] = Field(default_factory=list)

    def resolve_image_dir(self, subset_id: str, mode_id: str, language: Optional[str] = None) -> Path:
        subset = self.subsets[subset_id]
        if mode_id not in subset.image_dirs:
            raise KeyError(f"Subset '{subset_id}' has no image directory for mode '{mode_id}'")

        def resolve_base_path(image_dir: Path) -> Path:
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

        image_dir_cfg = subset.image_dirs[mode_id]
        if isinstance(image_dir_cfg, dict):
            chosen = None
            if language:
                chosen = image_dir_cfg.get(language)
            if not chosen:
                chosen = image_dir_cfg.get("en")
            if not chosen:
                chosen = next(iter(image_dir_cfg.values()))
            return resolve_base_path(Path(chosen))

        base_dir = resolve_base_path(Path(image_dir_cfg))
        if language:
            candidate = base_dir / language
            if candidate.exists() and candidate.is_dir():
                return candidate.resolve()
        return base_dir


def load_config() -> ExperimentConfig:
    settings = get_settings()
    config_path = settings.config_path
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found at {config_path}")
    mtime = config_path.stat().st_mtime
    return _load_config_cached(config_path.resolve(), mtime)


@lru_cache(maxsize=2)
def _load_config_cached(config_path: Path, mtime: float) -> ExperimentConfig:
    """Load experiment config, reloading when the underlying file changes."""
    with config_path.open("r", encoding="utf-8") as config_file:
        data: dict[str, Any] = json.load(config_file)

    try:
        return ExperimentConfig.model_validate(data)
    except ValidationError as exc:
        raise RuntimeError(f"Invalid experiment config: {exc}") from exc


def _directory_has_images(images_dir: Path) -> bool:
    if not images_dir.exists() or not images_dir.is_dir():
        return False
    for image_path in images_dir.rglob("*"):
        if image_path.is_file() and image_path.suffix.lower() in _IMAGE_SUFFIXES:
            return True
    return False


def list_subset_images(
    subset_id: str, mode_id: str, language: Optional[str] = None
) -> list[dict[str, Any]]:
    config = load_config()

    images_dir: Optional[Path] = None
    if language:
        images_dir = config.resolve_image_dir(subset_id, mode_id, language)
    else:
        subset = config.subsets[subset_id]
        image_dir_cfg = subset.image_dirs.get(mode_id)
        if image_dir_cfg is None:
            raise KeyError(f"Subset '{subset_id}' has no image directory for mode '{mode_id}'")

        candidates: list[str] = []
        if isinstance(image_dir_cfg, dict):
            if "en" in image_dir_cfg:
                candidates.append("en")
            if "zh" in image_dir_cfg:
                candidates.append("zh")
            candidates.extend(sorted([key for key in image_dir_cfg.keys() if key not in {"en", "zh"}]))
        else:
            candidates = ["en", "zh"]

        for candidate in candidates:
            candidate_dir = config.resolve_image_dir(subset_id, mode_id, candidate)
            if _directory_has_images(candidate_dir):
                images_dir = candidate_dir
                break

        if images_dir is None:
            images_dir = config.resolve_image_dir(subset_id, mode_id, "en")

    entries: list[dict[str, Any]] = []
    for image_path in sorted(images_dir.rglob("*")):
        if not image_path.is_file():
            continue
        if image_path.suffix.lower() not in _IMAGE_SUFFIXES:
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
