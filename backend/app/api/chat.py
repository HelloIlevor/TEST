"""真实问答 SSE 接口。Phase 3 (P3-6) 接入 LangGraph 后填充实现。

届时用 EventSourceResponse 消费 graph.astream，把节点进展翻译成
app.schemas.events 里的契约事件，事件格式与 /api/mock/chat/stream 完全一致，
前端只需切换 VITE_USE_MOCK 开关。
"""

from fastapi import APIRouter, HTTPException, status

from app.schemas.dto import ChatRequest

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(payload: ChatRequest) -> None:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "真实问答流将在 P3-6 实现，当前请使用 /api/mock/chat/stream",
    )
