from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ---------- Core paths ----------
    config_path: Path = Path("config/experiment.json")

    # ✅ 支持环境变量 DATABASE_URL，默认使用本地 SQLite
    database_url: Optional[str] = None

    # ---------- CORS / security ----------
    allow_origins: list[str] = ["*"]
    ip_hash_secret: str = "change-me"
    environment: Literal["development", "production", "test"] = "development"

    # ---------- Auto export ----------
    auto_export_enabled: bool = True
    auto_export_dir: Path = Path("exports")
    auto_export_filename: str = "records.csv"

    class Config:
        env_prefix = "EXPERIMENT_"
        env_file = ".env"

    def __init__(self, **data):
        super().__init__(**data)

        # 若未设置 DATABASE_URL，则使用 backend/app 下的 SQLite
        if not self.database_url:
            base_dir = Path(__file__).resolve().parent  # backend/app
            db_path = base_dir / "experiment.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self.database_url = f"sqlite:///{db_path.as_posix()}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
