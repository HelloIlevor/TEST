"""Phase 1 冒烟测试：健康检查通、Mock 事件序列符合契约。

这里断言的是「事件类型的顺序」而非具体数值，
因为 Phase 2 前端依赖的正是这个顺序，而剧本里的数字随时可能调整。
"""

import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as instance:
        yield instance


async def collect_events(client: AsyncClient, scenario: str) -> list[dict]:
    payload = {"conversation_id": "test", "question": "冒烟测试", "scenario": scenario}
    events: list[dict] = []
    async with client.stream("POST", "/api/mock/chat/stream", json=payload) as response:
        assert response.status_code == 200
        buffer = ""
        async for chunk in response.aiter_text():
            buffer += chunk.replace("\r\n", "\n")
            while "\n\n" in buffer:
                frame, buffer = buffer.split("\n\n", 1)
                data_lines = [
                    line[5:].strip() for line in frame.split("\n") if line.startswith("data:")
                ]
                if data_lines:
                    events.append(json.loads("\n".join(data_lines)))
    return events


async def test_health(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "version", "llm_configured", "db_ready"}


async def test_real_endpoints_are_not_implemented_yet(client: AsyncClient):
    """Phase 3 之前真实接口应明确返回 501，而不是 404 或 500。"""
    assert (await client.get("/api/conversations")).status_code == 501
    assert (await client.get("/api/schema")).status_code == 501


async def test_mock_conversation_crud(client: AsyncClient):
    created = await client.post("/api/mock/conversations", json={"title": "冒烟会话"})
    assert created.status_code == 201
    conversation_id = created.json()["id"]

    listed = await client.get("/api/mock/conversations")
    assert any(item["id"] == conversation_id for item in listed.json())

    renamed = await client.patch(
        f"/api/mock/conversations/{conversation_id}", json={"title": "改名后"}
    )
    assert renamed.json()["title"] == "改名后"

    assert (await client.delete(f"/api/mock/conversations/{conversation_id}")).status_code == 204
    assert (await client.get(f"/api/mock/conversations/{conversation_id}/messages")).status_code == 404


@pytest.mark.parametrize("scenario", ["bar", "line"])
async def test_mock_stream_happy_path(client: AsyncClient, scenario: str):
    events = await collect_events(client, scenario)
    types = [event["type"] for event in events]

    assert types[0] == "stage"
    assert types[-1] == "done"
    for expected in ("sql", "rows", "chart", "token"):
        assert expected in types, f"缺少 {expected} 事件"

    # 顺序约束：SQL 必须先于结果，结果必须先于图表
    assert types.index("sql") < types.index("rows") < types.index("chart")

    chart = next(event for event in events if event["type"] == "chart")
    assert chart["chart_type"] == ("bar" if scenario == "bar" else "line")
    assert "series" in chart["option"]

    rows = next(event for event in events if event["type"] == "rows")
    assert rows["row_count"] == len(rows["rows"])
    assert all(len(row) == len(rows["columns"]) for row in rows["rows"])


async def test_mock_stream_retry_path(client: AsyncClient):
    """异常剧本：先报一次可恢复错误，重试后仍要正常出图并收尾。"""
    events = await collect_events(client, "retry")
    types = [event["type"] for event in events]

    errors = [event for event in events if event["type"] == "error"]
    assert len(errors) == 1
    assert errors[0]["recoverable"] is True

    # 报错之后必须又生成了一次 SQL，并且最终仍然出图、正常结束
    error_index = types.index("error")
    assert "sql" in types[error_index:]
    assert "chart" in types[error_index:]
    assert types[-1] == "done"
