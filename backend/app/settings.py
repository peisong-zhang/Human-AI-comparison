from functools import lru_cache
from pathlib import Path
from typing import Literal
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ===================== Core paths =====================
    config_path: Path = Path("config/experiment.json")

    # 1️⃣ 优先使用 Render 或环境变量中的 DATABASE_URL
    database_url: str | None = None

    # ===================== CORS / security =====================
    allow_origins: list[str] = ["*"]
    ip_hash_secret: str = "change-me"
    environment: Literal["development", "production", "test"] = "development"

    # ===================== Auto export =====================
    auto_export_enabled: bool = True
    auto_export_dir: Path = Path("exports")
    auto_export_filename: str = "records.csv"

    class Config:
        env_prefix = "EXPERIMENT_"
        env_file = ".env"

    # 2️⃣ 自动确定 SQLite 的绝对路径（如果没有 DATABASE_URL）
    def __init__(self, **data):
        super().__init__(**data)

        if not self.database_url:
            # ✅ 兼容本地和 Render：使用 settings.py 所在目录为基准
            base_dir = Path(__file__).resolve().parent  # backend/app
            db_path = base_dir / "experiment.db"

            # 确保路径存在（Render 上关键）
            db_path.parent.mkdir(parents=True, exist_ok=True)

            # 生成 SQLite URL
            self.database_url = f"sqlite:///{db_path.as_posix()}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
