import os
from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="QuizIt API", validation_alias="APP_NAME")
    environment: str = Field(default="development", validation_alias="ENVIRONMENT")

    # Local SQLite fallback
    database_url: str = Field(
        default="sqlite+aiosqlite:///./quizit.db",
        validation_alias="DATABASE_URL",
    )

    # Primary database: Supabase PostgreSQL
    supabase_database_url: str | None = Field(
        default=None,
        validation_alias="SUPABASE_DATABASE_URL",
    )

    redis_url: str | None = Field(
        default=None,
        validation_alias="REDIS_URL",
    )

    jwt_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("JWT_SECRET", "SESSION_SECRET"),
    )

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    cors_origins: str = Field(
        default="*",
        validation_alias="CORS_ORIGINS",
    )

    auto_create_tables: bool = Field(
        default=True,
        validation_alias="AUTO_CREATE_TABLES",
    )

    cookie_secure: bool = Field(
        default=False,
        validation_alias="COOKIE_SECURE",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @field_validator("database_url", "supabase_database_url", "redis_url", mode="before")
    @classmethod
    def strip_connection_urls(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def normalize_cors_origins(cls, value: str) -> str:
        return ",".join(origin.strip() for origin in value.split(",") if origin.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return self.cors_origins.split(",") if self.cors_origins else []

    @property
    def async_database_url(self) -> str:
        """
        Use Supabase PostgreSQL when SUPABASE_DATABASE_URL is configured.
        Convert PostgreSQL URLs to SQLAlchemy's asyncpg driver format.
        """
        database_url = (self.supabase_database_url or self.database_url).strip()

        if database_url.startswith("postgresql://"):
            return database_url.replace(
                "postgresql://",
                "postgresql+asyncpg://",
                1,
            )

        if database_url.startswith("postgres://"):
            return database_url.replace(
                "postgres://",
                "postgresql+asyncpg://",
                1,
            )

        return database_url

    @property
    def jwt_signing_secret(self) -> str:
        return (
            self.jwt_secret
            or os.getenv("SESSION_SECRET")
            or "change-me-in-production"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
