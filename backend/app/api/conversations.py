"""会话 CRUD。Phase 3 (P3-5) 接入 SQLite 元数据库后填充实现。

Phase 1 与 Phase 2 期间前端请走 /api/mock/conversations。
"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/conversations", tags=["conversations"])

_NOT_IMPLEMENTED = "会话持久化将在 P3-5 实现，当前请使用 /api/mock/conversations"


@router.get("")
async def list_conversations() -> list[dict]:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, _NOT_IMPLEMENTED)


@router.post("")
async def create_conversation() -> dict:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, _NOT_IMPLEMENTED)


@router.get("/{conversation_id}/messages")
async def list_messages(conversation_id: str) -> list[dict]:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, _NOT_IMPLEMENTED)


@router.patch("/{conversation_id}")
async def rename_conversation(conversation_id: str) -> dict:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, _NOT_IMPLEMENTED)


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str) -> None:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, _NOT_IMPLEMENTED)
