"""REST 接口的请求与响应模型。"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.events import ChartType


class HealthOut(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    llm_configured: bool
    db_ready: bool


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationCreate(BaseModel):
    title: str = "新会话"


class ConversationUpdate(BaseModel):
    title: str


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str = ""
    sql: str | None = None
    columns: list[str] | None = None
    rows: list[list[Any]] | None = None
    chart_type: ChartType | None = None
    chart_option: dict[str, Any] | None = None
    created_at: datetime


class ChatRequest(BaseModel):
    conversation_id: str
    question: str = Field(min_length=1)
    # 仅 Mock 服务使用：显式指定剧本，省得靠关键词猜
    scenario: Literal["bar", "line", "retry"] | None = None
