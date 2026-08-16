"""SSE 事件契约。

前后端唯一契约，与 frontend/src/types/events.ts 一一对应，改动必须两侧同步。
后端出站一律经这里的模型序列化，前端入站一律经 zod 校验，
任何字段漂移会在第一条事件就报错，而不是让图表静默不显示。
"""

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field


class Stage(StrEnum):
    UNDERSTANDING = "understanding"
    GENERATING_SQL = "generating_sql"
    EXECUTING_SQL = "executing_sql"
    BUILDING_CHART = "building_chart"
    SUMMARIZING = "summarizing"


STAGE_LABELS: dict[Stage, str] = {
    Stage.UNDERSTANDING: "正在理解问题",
    Stage.GENERATING_SQL: "正在生成 SQL",
    Stage.EXECUTING_SQL: "正在执行查询",
    Stage.BUILDING_CHART: "正在生成图表",
    Stage.SUMMARIZING: "正在总结",
}


class ChartType(StrEnum):
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    SCATTER = "scatter"
    TABLE = "table"
    METRIC = "metric"


class StageEvent(BaseModel):
    """阶段推进，驱动中间栏时间线。"""

    type: Literal["stage"] = "stage"
    stage: Stage
    label: str


class SqlEvent(BaseModel):
    """生成的 SQL 与理由，中间栏折叠展示。"""

    type: Literal["sql"] = "sql"
    sql: str
    reasoning: str = ""


class RowsEvent(BaseModel):
    """查询结果集。rows 为二维数组而非字典列表，省带宽且顺序稳定。"""

    type: Literal["rows"] = "rows"
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    truncated: bool = False


class ChartEvent(BaseModel):
    """ECharts option 由后端 Python 拼装，前端拿到即可直接 setOption。"""

    type: Literal["chart"] = "chart"
    chart_type: ChartType
    option: dict[str, Any]


class TokenEvent(BaseModel):
    """总结文字的增量，前端做打字机效果。"""

    type: Literal["token"] = "token"
    text: str


class ErrorEvent(BaseModel):
    """recoverable=True 表示流程会自行重试并继续，前端不应据此终止渲染。"""

    type: Literal["error"] = "error"
    code: str
    message: str
    stage: Stage | None = None
    recoverable: bool = False


class DoneEvent(BaseModel):
    """终止事件。前端只以此判定一轮结束。"""

    type: Literal["done"] = "done"
    message_id: str
    elapsed_ms: int


StreamEvent = Annotated[
    StageEvent | SqlEvent | RowsEvent | ChartEvent | TokenEvent | ErrorEvent | DoneEvent,
    Field(discriminator="type"),
]


def stage_event(stage: Stage) -> StageEvent:
    return StageEvent(stage=stage, label=STAGE_LABELS[stage])


def to_sse(event: StreamEvent) -> dict[str, str]:
    """转成 sse-starlette 的 {event, data} 结构。

    SSE 的 event 名与 payload 里的 type 保持一致，前端两种方式取用都可以。
    """
    return {
        "event": event.type,
        "data": event.model_dump_json(),
    }
