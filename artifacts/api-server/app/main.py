import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db import init_db
from app.redis_client import room_broker
from app.routers import analytics, auth, catalog, duels, health, quizzes, social

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        await init_db()
    except Exception:
        logging.getLogger(__name__).warning("Database initialization unavailable; API will start without it", exc_info=True)
    try:
        await room_broker.connect()
    except Exception:
        logging.getLogger(__name__).warning("Redis unavailable; using local room coordination", exc_info=True)
    yield
    await room_broker.close()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Competitive aptitude practice and real-time quiz battles.",
    lifespan=lifespan,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    # Netlify deploy previews and local dev use origins that are not stable
    # enough to enumerate in the Render environment variables.
    allow_origin_regex=(
        r"^https?://localhost(:\d+)?$|^https://[a-z0-9-]+\.netlify\.app$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(quizzes.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(duels.router, prefix="/api")
app.include_router(social.router, prefix="/api")
