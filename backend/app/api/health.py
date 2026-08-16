from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.dto import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    settings = get_settings()
    return HealthOut(
        version=settings.version,
        llm_configured=settings.llm_configured,
        db_ready=settings.demo_db_path.exists(),
    )
