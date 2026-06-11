import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.articles import router as articles_router
from app.api.v1.health import router as health_router
from app.api.v1.sync import router as sync_router
from app.core.config import get_settings
from app.core.database import close_db, init_db
from app.core.middleware import ProductionMiddleware

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title="FinInsight Backend",
    description="Financial AI assistant backend service.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

if settings.request_log_enabled:
    app.add_middleware(ProductionMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(health_router)
app.include_router(articles_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
