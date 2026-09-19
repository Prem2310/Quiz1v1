from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # pool_pre_ping would send a SELECT 1 before EVERY checkout: one extra network round trip (100-300 ms to a
    # remote Supabase) on every API request. pool_recycle retires connections before the pooler's idle timeout
    # instead; LIFO keeps hot connections hot so idle ones age out.
    return {"pool_pre_ping": False, "pool_recycle": 240, "pool_size": 5, "max_overflow": 10, "pool_use_lifo": True}


settings = get_settings()
engine = create_async_engine(settings.async_database_url, echo=False, **_engine_kwargs(settings.async_database_url))
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    if not settings.auto_create_tables and not settings.async_database_url.startswith("sqlite"):
        return
    from app import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)