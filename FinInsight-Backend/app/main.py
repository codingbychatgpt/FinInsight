from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.articles import router as articles_router
from app.api.v1.health import router as health_router
from app.api.v1.sync import router as sync_router
from app.core.database import init_db

app = FastAPI(
    title="FinInsight Backend",
    description="Financial AI assistant backend service.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:10086",
        "http://localhost:10086",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()


app.include_router(health_router)
app.include_router(articles_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
