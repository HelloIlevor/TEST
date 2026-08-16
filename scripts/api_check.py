"""接口回归检查：把所有已实现的接口跑一遍，并用后端自己的 pydantic 契约校验实际报文。

直接引用 app.schemas.events 来校验下发的每一条事件，
测的是真实网络报文而不只是状态码，因此契约漂移一定会在这里暴露。

用法：
    .\\backend\\.venv\\Scripts\\python.exe scripts\\api_check.py
"""

import json
import pathlib
import sys
import time

import httpx
from pydantic import TypeAdapter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
from app.schemas.events import StreamEvent  # noqa: E402

event_adapter: TypeAdapter = TypeAdapter(StreamEvent)

BACKEND = "http://127.0.0.1:8000"
PROXY = "http://localhost:5173"

passed = 0
failed = 0


def check(name: str, condition: bool, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {name}" + (f"  ({detail})" if detail else ""))
    else:
        failed += 1
        print(f"  [FAIL] {name}" + (f"  ({detail})" if detail else ""))


def section(title: str) -> None:
    print(f"\n{title}\n" + "-" * 76)


def read_stream(base: str, scenario: str) -> tuple[list[dict], list[float]]:
    """返回 (事件列表, 每条事件的到达耗时秒)。每条都过一遍契约校验。"""
    payload = {"conversation_id": "api-check", "question": "接口回归", "scenario": scenario}
    events: list[dict] = []
    arrivals: list[float] = []
    buffer = ""
    started = time.perf_counter()

    with httpx.Client(timeout=60) as client:
        with client.stream("POST", f"{base}/api/mock/chat/stream", json=payload) as response:
            response.raise_for_status()
            for chunk in response.iter_text():
                buffer += chunk.replace("\r\n", "\n")
                while "\n\n" in buffer:
                    frame, buffer = buffer.split("\n\n", 1)
                    data = [
                        line[5:].strip() for line in frame.split("\n") if line.startswith("data:")
                    ]
                    if not data:
                        continue
                    raw = json.loads("\n".join(data))
                    event_adapter.validate_python(raw)  # 契约校验，不符会直接抛出
                    events.append(raw)
                    arrivals.append(time.perf_counter() - started)
    return events, arrivals


client = httpx.Client(timeout=30)

# ---------------------------------------------------------------- 健康检查

section("1. 健康检查")

response = client.get(f"{BACKEND}/api/health")
body = response.json()
check("GET /api/health 直连 8000", response.status_code == 200, f"HTTP {response.status_code}")
check(
    "健康检查字段完整",
    set(body) == {"status", "version", "llm_configured", "db_ready"},
    ", ".join(f"{k}={v}" for k, v in body.items()),
)

proxied = client.get(f"{PROXY}/api/health")
check(
    "GET /api/health 经 Vite 代理 5173",
    proxied.status_code == 200 and proxied.json() == body,
    "代理与直连返回一致",
)

check("GET /openapi.json", client.get(f"{BACKEND}/openapi.json").status_code == 200)
check("GET /docs 交互文档", client.get(f"{BACKEND}/docs").status_code == 200)

# ---------------------------------------------------------------- 未实现接口

section("2. 真实接口（Phase 3 填充，现应明确返回 501）")

for method, path in [
    ("GET", "/api/conversations"),
    ("GET", "/api/schema"),
]:
    status = client.request(method, f"{BACKEND}{path}").status_code
    check(f"{method} {path}", status == 501, f"HTTP {status}")

status = client.post(
    f"{BACKEND}/api/chat/stream",
    json={"conversation_id": "x", "question": "y"},
).status_code
check("POST /api/chat/stream", status == 501, f"HTTP {status}")

# ---------------------------------------------------------------- 会话 CRUD

section("3. Mock 会话 CRUD")

created = client.post(f"{BACKEND}/api/mock/conversations", json={"title": "接口回归会话"})
check("POST 新建会话", created.status_code == 201, f"HTTP {created.status_code}")
conversation_id = created.json()["id"]

listed = client.get(f"{BACKEND}/api/mock/conversations")
check(
    "GET 列表包含新建项",
    any(item["id"] == conversation_id for item in listed.json()),
    f"共 {len(listed.json())} 条",
)

renamed = client.patch(
    f"{BACKEND}/api/mock/conversations/{conversation_id}", json={"title": "改名后"}
)
check("PATCH 重命名", renamed.json()["title"] == "改名后", renamed.json()["title"])

messages = client.get(f"{BACKEND}/api/mock/conversations/{conversation_id}/messages")
check("GET 消息列表", messages.status_code == 200 and messages.json() == [], "新会话为空")

deleted = client.delete(f"{BACKEND}/api/mock/conversations/{conversation_id}")
check("DELETE 删除会话", deleted.status_code == 204, f"HTTP {deleted.status_code}")

gone = client.get(f"{BACKEND}/api/mock/conversations/{conversation_id}/messages")
check("删除后访问返回 404", gone.status_code == 404, f"HTTP {gone.status_code}")

missing = client.patch(f"{BACKEND}/api/mock/conversations/not-exist", json={"title": "x"})
check("重命名不存在的会话返回 404", missing.status_code == 404, f"HTTP {missing.status_code}")

# ---------------------------------------------------------------- 参数校验

section("4. 参数校验与跨域")

invalid = client.post(f"{BACKEND}/api/mock/chat/stream", json={})
check("空请求体返回 422", invalid.status_code == 422, f"HTTP {invalid.status_code}")

blank = client.post(
    f"{BACKEND}/api/mock/chat/stream", json={"conversation_id": "x", "question": ""}
)
check("空问题返回 422", blank.status_code == 422, f"HTTP {blank.status_code}")

preflight = client.request(
    "OPTIONS",
    f"{BACKEND}/api/health",
    headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
    },
)
check(
    "CORS 预检放行 localhost:5173",
    preflight.headers.get("access-control-allow-origin") == "http://localhost:5173",
    preflight.headers.get("access-control-allow-origin", "无该响应头"),
)

# ---------------------------------------------------------------- 事件流

section("5. Mock 事件流（三套剧本，逐条契约校验）")

for scenario, expected_chart in [("bar", "bar"), ("line", "line"), ("retry", "bar")]:
    events, arrivals = read_stream(BACKEND, scenario)
    types = [event["type"] for event in events]
    span = arrivals[-1] - arrivals[0]

    check(
        f"剧本 {scenario}：全部 {len(events)} 条事件通过契约校验",
        True,
        " → ".join(dict.fromkeys(types)),
    )
    check(f"剧本 {scenario}：以 done 收尾", types[-1] == "done", f"末条为 {types[-1]}")
    check(
        f"剧本 {scenario}：SQL 先于结果、结果先于图表",
        types.index("sql") < types.index("rows") < types.index("chart"),
    )

    chart = next(event for event in events if event["type"] == "chart")
    check(
        f"剧本 {scenario}：图表类型与 option 合法",
        chart["chart_type"] == expected_chart and "series" in chart["option"],
        f"chart_type={chart['chart_type']}, series={len(chart['option']['series'])} 组",
    )

    rows = next(event for event in events if event["type"] == "rows")
    check(
        f"剧本 {scenario}：结果集行列自洽",
        rows["row_count"] == len(rows["rows"])
        and all(len(row) == len(rows["columns"]) for row in rows["rows"]),
        f"{len(rows['columns'])} 列 × {rows['row_count']} 行",
    )

    check(
        f"剧本 {scenario}：事件逐条到达未被缓冲",
        span > 0.5,
        f"首尾间隔 {span * 1000:.0f} ms",
    )

    if scenario == "retry":
        errors = [event for event in events if event["type"] == "error"]
        check(
            "剧本 retry：报出一次可恢复错误",
            len(errors) == 1 and errors[0]["recoverable"] is True,
            errors[0]["message"] if errors else "未收到 error 事件",
        )
        error_index = types.index("error")
        check(
            "剧本 retry：报错后重新生成 SQL 并成功出图",
            "sql" in types[error_index:] and "chart" in types[error_index:],
        )

# ---------------------------------------------------------------- 代理链路

section("6. Vite 代理链路（浏览器实际走的路径）")

events, arrivals = read_stream(PROXY, "bar")
check(
    "经代理的事件流完整且通过契约校验",
    events[-1]["type"] == "done",
    f"{len(events)} 条事件",
)
check(
    "经代理仍逐条到达未被缓冲",
    arrivals[-1] - arrivals[0] > 0.5,
    f"首尾间隔 {(arrivals[-1] - arrivals[0]) * 1000:.0f} ms",
)

page = client.get(f"{PROXY}/")
check("前端页面可访问", page.status_code == 200 and "<div id=\"root\">" in page.text)

client.close()

print("\n" + "=" * 76)
print(f"通过 {passed} 项，失败 {failed} 项")
sys.exit(1 if failed else 0)
