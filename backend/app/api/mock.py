"""Mock 流式服务。

Phase 2 前端全程对着这里开发，事件格式与 P3-6 的真实接口完全一致，
届时前端只需把 VITE_USE_MOCK 关掉，组件代码无需改动。

三套剧本刻意包含一条异常路径，让错误与重试的 UI 能在 Phase 2 一次做对，
而不是拖到联调期返工。
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from sse_starlette.sse import EventSourceResponse

from app.schemas.dto import (
    ChatRequest,
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
)
from app.schemas.events import (
    ChartEvent,
    ChartType,
    DoneEvent,
    ErrorEvent,
    RowsEvent,
    SqlEvent,
    Stage,
    StreamEvent,
    TokenEvent,
    stage_event,
    to_sse,
)

router = APIRouter(prefix="/mock", tags=["mock"])

# ---------------------------------------------------------------- 会话存储

_conversations: dict[str, dict[str, Any]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations() -> list[ConversationOut]:
    items = sorted(_conversations.values(), key=lambda c: c["updated_at"], reverse=True)
    return [ConversationOut(**item) for item in items]


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(payload: ConversationCreate) -> ConversationOut:
    now = _now()
    item = {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "created_at": now,
        "updated_at": now,
    }
    _conversations[item["id"]] = item
    return ConversationOut(**item)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(conversation_id: str, payload: ConversationUpdate) -> ConversationOut:
    item = _conversations.get(conversation_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
    item["title"] = payload.title
    item["updated_at"] = _now()
    return ConversationOut(**item)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str) -> None:
    if _conversations.pop(conversation_id, None) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str) -> list[dict[str, Any]]:
    if conversation_id not in _conversations:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "会话不存在")
    return []


# ---------------------------------------------------------------- 图表构造

def _bar_option(title: str, categories: list[str], values: list[float], series_name: str) -> dict[str, Any]:
    return {
        "title": {"text": title, "left": "center"},
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}},
        "grid": {"left": 60, "right": 30, "top": 60, "bottom": 50},
        "xAxis": {"type": "category", "data": categories, "axisLabel": {"interval": 0}},
        "yAxis": {"type": "value", "name": series_name},
        "series": [{"name": series_name, "type": "bar", "data": values, "barMaxWidth": 48}],
    }


def _line_option(title: str, categories: list[str], values: list[float], series_name: str) -> dict[str, Any]:
    return {
        "title": {"text": title, "left": "center"},
        "tooltip": {"trigger": "axis"},
        "grid": {"left": 60, "right": 30, "top": 60, "bottom": 50},
        "xAxis": {"type": "category", "boundaryGap": False, "data": categories},
        "yAxis": {"type": "value", "name": series_name},
        "series": [
            {
                "name": series_name,
                "type": "line",
                "data": values,
                "smooth": True,
                "areaStyle": {"opacity": 0.12},
            }
        ],
    }


# ---------------------------------------------------------------- 剧本数据

_BAR_COLUMNS = ["品类", "销售额"]
_BAR_ROWS: list[list[Any]] = [
    ["数码", 128400],
    ["家居", 96300],
    ["服饰", 78900],
    ["食品", 64200],
    ["图书", 41500],
    ["运动", 33800],
]
_BAR_SQL = """SELECT p.category AS 品类,
       SUM(oi.quantity * oi.unit_price) AS 销售额
FROM order_items oi
JOIN products p ON p.id = oi.product_id
GROUP BY p.category
ORDER BY 销售额 DESC
LIMIT 1000"""

_LINE_COLUMNS = ["月份", "销售额"]
_LINE_ROWS: list[list[Any]] = [
    ["2025-09", 42100],
    ["2025-10", 45800],
    ["2025-11", 61200],
    ["2025-12", 73400],
    ["2026-01", 51900],
    ["2026-02", 47300],
    ["2026-03", 55600],
    ["2026-04", 58100],
    ["2026-05", 63700],
    ["2026-06", 69200],
    ["2026-07", 71500],
    ["2026-08", 66800],
]
_LINE_SQL = """SELECT strftime('%Y-%m', o.created_at) AS 月份,
       SUM(oi.quantity * oi.unit_price) AS 销售额
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY 月份
ORDER BY 月份
LIMIT 1000"""

_RETRY_BAD_SQL = """SELECT r.region_name AS 区域,
       SUM(o.amount) AS 销售额
FROM orders o
JOIN regions r ON r.id = o.region_id
GROUP BY 区域
ORDER BY 销售额 DESC
LIMIT 1000"""
_RETRY_GOOD_SQL = """SELECT r.region_name AS 区域,
       SUM(oi.quantity * oi.unit_price) AS 销售额
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN regions r ON r.id = o.region_id
GROUP BY 区域
ORDER BY 销售额 DESC
LIMIT 1000"""
_RETRY_COLUMNS = ["区域", "销售额"]
_RETRY_ROWS: list[list[Any]] = [
    ["华东", 156700],
    ["华南", 112300],
    ["华北", 98400],
    ["西南", 61200],
    ["东北", 38900],
]


def _script_bar() -> list[tuple[float, StreamEvent]]:
    categories = [str(row[0]) for row in _BAR_ROWS]
    values = [float(row[1]) for row in _BAR_ROWS]
    return [
        (0.3, stage_event(Stage.UNDERSTANDING)),
        (0.6, stage_event(Stage.GENERATING_SQL)),
        (0.9, SqlEvent(sql=_BAR_SQL, reasoning="按商品品类聚合销售额，取降序前若干条。")),
        (0.3, stage_event(Stage.EXECUTING_SQL)),
        (0.7, RowsEvent(columns=_BAR_COLUMNS, rows=_BAR_ROWS, row_count=len(_BAR_ROWS))),
        (0.3, stage_event(Stage.BUILDING_CHART)),
        (
            0.5,
            ChartEvent(
                chart_type=ChartType.BAR,
                option=_bar_option("各品类销售额", categories, values, "销售额"),
            ),
        ),
        (0.2, stage_event(Stage.SUMMARIZING)),
    ]


def _script_line() -> list[tuple[float, StreamEvent]]:
    categories = [str(row[0]) for row in _LINE_ROWS]
    values = [float(row[1]) for row in _LINE_ROWS]
    return [
        (0.3, stage_event(Stage.UNDERSTANDING)),
        (0.6, stage_event(Stage.GENERATING_SQL)),
        (0.9, SqlEvent(sql=_LINE_SQL, reasoning="按月份聚合销售额，观察时间趋势。")),
        (0.3, stage_event(Stage.EXECUTING_SQL)),
        (0.7, RowsEvent(columns=_LINE_COLUMNS, rows=_LINE_ROWS, row_count=len(_LINE_ROWS))),
        (0.3, stage_event(Stage.BUILDING_CHART)),
        (
            0.5,
            ChartEvent(
                chart_type=ChartType.LINE,
                option=_line_option("近 12 个月销售额趋势", categories, values, "销售额"),
            ),
        ),
        (0.2, stage_event(Stage.SUMMARIZING)),
    ]


def _script_retry() -> list[tuple[float, StreamEvent]]:
    categories = [str(row[0]) for row in _RETRY_ROWS]
    values = [float(row[1]) for row in _RETRY_ROWS]
    return [
        (0.3, stage_event(Stage.UNDERSTANDING)),
        (0.6, stage_event(Stage.GENERATING_SQL)),
        (0.9, SqlEvent(sql=_RETRY_BAD_SQL, reasoning="按区域聚合订单金额。")),
        (0.3, stage_event(Stage.EXECUTING_SQL)),
        (
            0.8,
            ErrorEvent(
                code="sql_error",
                message="no such column: o.amount",
                stage=Stage.EXECUTING_SQL,
                recoverable=True,
            ),
        ),
        (0.4, stage_event(Stage.GENERATING_SQL)),
        (
            1.0,
            SqlEvent(
                sql=_RETRY_GOOD_SQL,
                reasoning="orders 表没有 amount 列，改为从 order_items 计算金额后再聚合。",
            ),
        ),
        (0.3, stage_event(Stage.EXECUTING_SQL)),
        (0.7, RowsEvent(columns=_RETRY_COLUMNS, rows=_RETRY_ROWS, row_count=len(_RETRY_ROWS))),
        (0.3, stage_event(Stage.BUILDING_CHART)),
        (
            0.5,
            ChartEvent(
                chart_type=ChartType.BAR,
                option=_bar_option("各区域销售额", categories, values, "销售额"),
            ),
        ),
        (0.2, stage_event(Stage.SUMMARIZING)),
    ]


_SUMMARIES = {
    "bar": "数码品类以 12.84 万元排在首位，约占前六个品类总额的 30%。家居与服饰紧随其后，"
    "三者合计贡献超过六成销售额。运动品类垫底，仅为数码的四分之一左右，可以考虑排查其选品或投放策略。",
    "line": "近 12 个月销售额整体呈上升趋势，2025 年 12 月出现一次明显峰值，推测与年末大促相关。"
    "随后 1 至 2 月回落至低点，此后逐月回升，2026 年 7 月创下 7.15 万元的次高点。",
    "retry": "华东以 15.67 万元领先，接近排名末位的东北区域的四倍，区域间差距较为悬殊。"
    "华南与华北处于第二梯队，三个头部区域合计占比约七成。",
}

_SCRIPTS = {"bar": _script_bar, "line": _script_line, "retry": _script_retry}


def _pick_scenario(payload: ChatRequest) -> str:
    if payload.scenario:
        return payload.scenario
    question = payload.question
    if any(word in question for word in ("趋势", "月", "变化", "增长")):
        return "line"
    if any(word in question for word in ("区域", "地区", "报错", "重试")):
        return "retry"
    return "bar"


def _chunk_text(text: str, size: int = 6) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


async def _event_stream(request: Request, payload: ChatRequest) -> AsyncIterator[dict[str, str]]:
    started = asyncio.get_event_loop().time()
    scenario = _pick_scenario(payload)

    for delay, event in _SCRIPTS[scenario]():
        if await request.is_disconnected():
            return
        await asyncio.sleep(delay)
        yield to_sse(event)

    for chunk in _chunk_text(_SUMMARIES[scenario]):
        if await request.is_disconnected():
            return
        await asyncio.sleep(0.05)
        yield to_sse(TokenEvent(text=chunk))

    elapsed_ms = int((asyncio.get_event_loop().time() - started) * 1000)
    yield to_sse(DoneEvent(message_id=str(uuid.uuid4()), elapsed_ms=elapsed_ms))


@router.post("/chat/stream")
async def mock_chat_stream(payload: ChatRequest, request: Request) -> EventSourceResponse:
    return EventSourceResponse(
        _event_stream(request, payload),
        ping=15,
        headers={
            # 缺了这两个头，事件会被中间层攒着一次性下发，实时效果就没了
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
