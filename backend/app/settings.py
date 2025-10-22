from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # 优先用环境变量：EXPERIMENT_CONFIG_PATH
    config_path: Optional[Path] = None
    database_url: Optional[str] = None
    project_root: Optional[Path] = None

    allow_origins: list[str] = ["*"]
    ip_hash_secret: str = "change-me"
    environment: Literal["development", "production", "test"] = "development"
    auto_export_enabled: bool = True
    auto_export_dir: Path = Path("exports")
    auto_export_filename: str = "records.csv"

    class Config:
        env_prefix = "EXPERIMENT_"
        env_file = ".env"

    def __init__(self, **data):
        super().__init__(**data)

        # ---- 1) 解析 config_path ----
        if not self.config_path:
            app_dir = Path(__file__).resolve().parent          # backend/app
            backend_dir = app_dir.parent                       # backend
            repo_root = backend_dir.parent                     # repo 根

            candidates = [
                app_dir / "config" / "experiment.json",
                backend_dir / "config" / "experiment.json",
                repo_root / "config" / "experiment.json",
            ]
            for c in candidates:
                if c.exists():
                    self.config_path = c
                    break
            # 找不到也不要直接报错，留给业务代码去处理/提示
            # 也可以在这里 raise 更友好的错误

        # ---- 1.5) project_root ----
        if not self.project_root and self.config_path:
            config_parent = self.config_path.parent.resolve()
            if config_parent.name == "config" and len(config_parent.parents) >= 1:
                self.project_root = config_parent.parent
            else:
                self.project_root = config_parent

        # ---- 2) 解析 database_url（与之前一致）----
        if not self.database_url:
            db_path = Path(__file__).resolve().parent / "experiment.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            self.database_url = f"sqlite:///{db_path.as_posix()}"

        # ---- 3) auto_export_dir 绝对化 ----
        if self.auto_export_dir and not self.auto_export_dir.is_absolute():
            base = self.project_root or Path(__file__).resolve().parent.parent
            self.auto_export_dir = (base / self.auto_export_dir).resolve()

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
