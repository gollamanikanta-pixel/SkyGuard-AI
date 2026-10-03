from __future__ import annotations

import os
from functools import lru_cache
from urllib.parse import quote, urlparse

from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_env = os.getenv("APP_ENV", "development")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        self.database_backend = os.getenv("DATABASE_BACKEND", "sqlite").lower()
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_db_password = os.getenv("SUPABASE_DB_PASSWORD")
        supabase_db_url = os.getenv("SUPABASE_DB_URL")
        database_url = os.getenv("DATABASE_URL")
        if self.database_backend == "supabase":
            if not supabase_url and not supabase_db_url:
                raise ValueError("Set SUPABASE_URL or SUPABASE_DB_URL to use the Supabase database backend.")
            if supabase_db_url:
                self.database_url = supabase_db_url
            elif not supabase_db_password:
                raise ValueError("Set SUPABASE_DB_PASSWORD in the local environment to connect to Supabase.")
            else:
                project_address = urlparse(supabase_url or "")
                project_host = project_address.hostname
                if project_address.scheme != "https" or not project_host or not project_host.endswith(".supabase.co"):
                    raise ValueError("SUPABASE_URL must be a Supabase project URL.")
                project_ref = project_host.removesuffix(".supabase.co")
                self.database_url = (
                    "postgresql+psycopg://postgres:"
                    f"{quote(supabase_db_password, safe='')}@db.{project_ref}.supabase.co:5432/postgres?sslmode=require"
                )
        elif self.database_backend == "sqlite":
            self.database_url = database_url or "sqlite:///./skyguard.db"
        elif database_url:
            self.database_url = database_url
        else:
            raise ValueError("DATABASE_BACKEND must be 'sqlite' or 'supabase', or configure DATABASE_URL.")
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.weather_api_key = os.getenv("WEATHER_API_KEY")
        self.weather_api_base_url = os.getenv("WEATHER_API_BASE_URL", "https://demo.example.com")
        self.api_auth_token = os.getenv("API_AUTH_TOKEN")
        self.cron_secret = os.getenv("CRON_SECRET")


@lru_cache
def get_settings() -> Settings:
    return Settings()
