"""Application configuration sourced from environment variables."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "云上融融资服务作业平台")
    app_version: str = os.getenv("APP_VERSION", "1.0.0")
    database_url: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "finance.db"),
    )
    secret_key: str = os.getenv("SECRET_KEY", "qiyefuwu-secret-key-change-in-production-2026")


settings = Settings()
