from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    config_path: Path = Path("config/experiment.json")
    database_url: str = "sqlite:///./backend/app/experiment.db"
    allow_origins: list[str] = ["*"]
    ip_hash_secret: str = "change-me"
    environment: Literal["development", "production", "test"] = "development"
    auto_export_enabled: bool = True
    auto_export_dir: Path = Path("exports")
    auto_export_filename: str = "records.csv"

    class Config:
        env_prefix = "EXPERIMENT_"
        env_file = ".env"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
