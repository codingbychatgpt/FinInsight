from typing import Dict

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok"}
