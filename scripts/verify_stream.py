"""Phase 1 验证：确认 SSE 事件是逐条到达而非被缓冲后一次性下发。

默认打 Vite 代理端口（5173），也就是浏览器实际走的链路，
这样能一并验证代理层没有把流攒起来。

用法：
    .\\backend\\.venv\\Scripts\\python.exe scripts\\verify_stream.py [scenario] [port]
"""

import json
import sys
import time

import httpx

scenario = sys.argv[1] if len(sys.argv) > 1 else "retry"
port = sys.argv[2] if len(sys.argv) > 2 else "5173"
url = f"http://localhost:{port}/api/mock/chat/stream"
payload = {"conversation_id": "verify", "question": "Phase 1 验证", "scenario": scenario}

started = time.perf_counter()
arrivals: list[float] = []
buffer = ""

print(f"POST {url}  scenario={scenario}\n")
print(f"{'耗时':>9}  {'事件':<8}  摘要")
print("-" * 72)

with httpx.Client(timeout=60) as client:
    with client.stream("POST", url, json=payload) as response:
        response.raise_for_status()
        for chunk in response.iter_text():
            buffer += chunk.replace("\r\n", "\n")
            while "\n\n" in buffer:
                frame, buffer = buffer.split("\n\n", 1)
                data = [line[5:].strip() for line in frame.split("\n") if line.startswith("data:")]
                if not data:
                    continue

                event = json.loads("\n".join(data))
                elapsed = time.perf_counter() - started
                arrivals.append(elapsed)

                summary = {
                    "stage": lambda e: e["label"],
                    "sql": lambda e: e["sql"].split("\n")[0] + " …",
                    "rows": lambda e: f"{len(e['columns'])} 列 / {e['row_count']} 行",
                    "chart": lambda e: f"chart_type={e['chart_type']}",
                    "token": lambda e: repr(e["text"]),
                    "error": lambda e: f"[{e['code']}] {e['message']} recoverable={e['recoverable']}",
                    "done": lambda e: f"耗时 {e['elapsed_ms']} ms",
                }[event["type"]](event)

                print(f"{elapsed * 1000:8.0f}ms  {event['type']:<8}  {summary}")

span = arrivals[-1] - arrivals[0] if len(arrivals) > 1 else 0.0
print("-" * 72)
print(f"共 {len(arrivals)} 条事件，首尾间隔 {span * 1000:.0f} ms")
print("判定：" + ("逐条到达，未被缓冲" if span > 0.5 else "疑似被缓冲后一次性下发，需检查代理配置"))
