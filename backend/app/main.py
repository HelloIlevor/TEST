import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import chat, conversations, health, mock, schema_api
from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
logger = logging.getLogger("data_agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.demo_db_path.parent.mkdir(parents=True, exist_ok=True)
    logger.info(
        "Data Agent 启动完成 version=%s llm_configured=%s",
        settings.version,
        settings.llm_configured,
    )
    yield
    logger.info("Data Agent 已停止")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("未捕获异常 path=%s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={"code": "internal_error", "message": str(exc)},
        )

    # Phase 3 只需填充各 router 的实现，无需改动这里的装配
    for router in (
        health.router,
        mock.router,
        conversations.router,
        chat.router,
        schema_api.router,
    ):
        app.include_router(router, prefix="/api")

    return app


app = create_app()
