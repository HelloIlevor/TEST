"""业务库表结构查询。Phase 3 (P3-2) 接入 schema 反射后填充实现。"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/schema", tags=["schema"])


@router.get("")
async def get_schema() -> dict:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "表结构反射将在 P3-2 实现",
    )
