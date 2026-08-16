from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Data Agent API"
    version: str = "0.1.0"

    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen3-max"

    demo_db_path: Path = Path("data/demo.db")
    meta_db_path: Path = Path("data/meta.db")

    sql_timeout_seconds: int = 10
    sql_max_rows: int = 1000

    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def llm_configured(self) -> bool:
        """只判断 key 是否已配置，不发起真实请求，保证无 key 时服务仍能启动。"""
        return bool(self.dashscope_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
