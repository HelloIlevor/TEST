# 智能数据分析助手

用自然语言提问，后端自动生成并安全执行 SQL，通过 SSE 分阶段流式推送到前端三列界面，右侧实时渲染 ECharts 图表。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 模型 | 阿里云百炼 Qwen3（OpenAI 兼容模式）+ langchain-openai 1.5 |
| 编排 | langchain 1.3 + langgraph 1.2 StateGraph |
| 后端 | FastAPI 0.141 + sse-starlette 3.4 + uvicorn |
| 数据库 | SQLite3（只读连接 + 代码层校验） |
| 记忆 | langgraph-checkpoint-sqlite 3.1 |
| 前端 | Vite 8.2 + React 19.2 + TypeScript + antd 6.6 + zustand 5.0 + ECharts 6.1 + zod 4.4 |

有两处刻意的选型偏离常见做法：**不使用 `ChatTongyi`**，改用 `ChatOpenAI` 指向百炼兼容端点，因为它所在的 `langchain-community` 已于 2026 年 5 月停止维护；同理**不使用 `SQLDatabaseToolkit`**，改用标准库 `sqlite3` 自研 schema 反射与只读校验，安全边界完全自己掌控。

## 快速开始

```powershell
.\scripts\start-backend.ps1     # 终端 1，首次运行会自动建 venv 装依赖
.\scripts\start-frontend.ps1    # 终端 2
```

打开 http://localhost:5173 ，右上角出现绿点即表示前后端连通。点击中间栏任一剧本按钮，可以看到 Mock SSE 事件逐条到达。

Phase 1 与 Phase 2 全程走 Mock，**不需要 API Key**。

## 目录结构

```
backend/
  app/
    main.py              FastAPI 装配：CORS、lifespan、全局异常处理
    core/config.py       pydantic-settings 读取 .env
    schemas/events.py    SSE 事件契约（与前端 types/events.ts 同构）
    schemas/dto.py       REST 请求与响应模型
    api/health.py        GET /api/health
    api/mock.py          Mock 流式服务与会话 CRUD
    api/chat.py          真实问答流（P3-6 填充）
    api/conversations.py 会话持久化（P3-5 填充）
    api/schema_api.py    表结构反射（P3-2 填充）
  tests/test_smoke.py    健康检查与事件序列冒烟测试
frontend/
  src/
    types/events.ts      事件契约 + zod 运行时校验
    types/chat.ts        前端消息模型
    api/client.ts        REST 客户端
    api/sse.ts           fetch + ReadableStream 手写 SSE 解析
    store/applyEvent.ts  事件归约：7 类事件 → 消息状态变更
    store/useChatStore.ts zustand 状态中枢
    charts/buildOption.ts 用本地结果集重算 ECharts option
    layout/AppLayout.tsx 可拖拽三列栅格
    components/          SessionPanel / ChatPanel / ChartPanel
  e2e/smoke.spec.ts      Playwright 端到端验收
```

## 前端架构的一条主线

整个前端只有 `store/applyEvent.ts` 一个文件理解 SSE 事件的语义，它把 7 类事件归约成一个 `AssistantMessage`。UI 组件一律只读这个对象，不碰网络也不碰事件解析。

这样做的直接收益是 Phase 4 从 Mock 切到真实接口时，只要事件契约不变，组件代码一行都不用动；顺带好处是这个归约函数是纯函数，可以脱离浏览器单独测。

图表类型切换同理走本地重算（`charts/buildOption.ts`），不回后端——数据已经在手里，重跑一次 SQL 和 LLM 既慢又费钱，还可能因为模型不确定性返回不一样的结果集。

## 事件契约

前后端唯一契约。后端出站一律经 pydantic 序列化，前端入站一律经 zod 校验，任何字段漂移会在第一条事件就报错。

| 事件 | 载荷 | 用途 |
| --- | --- | --- |
| `stage` | `stage`, `label` | 驱动阶段时间线 |
| `sql` | `sql`, `reasoning` | 折叠展示生成的 SQL |
| `rows` | `columns`, `rows`, `row_count`, `truncated` | 结果表格 |
| `chart` | `chart_type`, `option` | 右侧直接 setOption |
| `token` | `text` | 总结文字增量 |
| `error` | `code`, `message`, `stage`, `recoverable` | `recoverable` 为真表示会自行重试 |
| `done` | `message_id`, `elapsed_ms` | 唯一的终止信号 |

## 环境变量

后端见 `backend/.env.example`，前端见 `frontend/.env.example`。

`DASHSCOPE_API_KEY` 到 Phase 3 才需要，从[百炼控制台](https://bailian.console.aliyun.com/)获取。`.env` 已在 `.gitignore` 中。

把 `frontend/.env` 里的 `VITE_USE_MOCK` 改为 `false`，前端即从 Mock 切换到真实接口。

## 开发阶段

- **Phase 1 基础框架**：骨架、契约冻结、Mock 服务。已完成。
- **Phase 2 前端 UI**：完整三列交互，全程对着 Mock 开发。已完成。
- **Phase 3 后端接口**：LLM 接入、demo 数据集、SQL 校验、LangGraph 编排、记忆、真实 SSE。
- **Phase 4 联调**：切真接口、七类场景回归、稳定性验证。

## 测试

```powershell
# 后端接口与事件契约
cd backend; .\.venv\Scripts\python.exe -m pytest -q

# 接口回归（需两端都已启动）
.\backend\.venv\Scripts\python.exe scripts\api_check.py

# 前端端到端（需后端已启动，会自动拉起前端）
cd frontend; npx playwright test
```

端到端用例每条都断言「零 console 报错」。这是 P2-6 的验收项，靠肉眼看控制台不可靠，所以固化成断言。同时有一条整页不出现纵向滚动条的回归断言——这个问题曾因 antd `<App>` 多插一层 div 截断 `height:100%` 继承链而出现过。

## 已知待办

前端产物 2.1 MB（gzip 688 KB），主要来自 echarts 与 antd 全量引入，首屏偏重。留到 Phase 4 交付阶段做按需引入与代码分割。
