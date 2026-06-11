from fastapi import APIRouter, HTTPException

from app.core.database import ping_db

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    database_status = "ok" if await ping_db() else "unavailable"
    if database_status != "ok":
        raise HTTPException(
            status_code=503,
            detail={"status": "degraded", "database": database_status},
        )

    return {"status": "ok", "database": database_status}
