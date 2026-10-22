import asyncio
import contextlib
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from .api import router
from .rooms import CLOSE_UNKNOWN, RoomManager
from .settings import AppSettings, load_settings
from .store import RoomStore

logging.basicConfig(level=logging.INFO)
CLEANUP_INTERVAL_SECONDS = 600


def create_app(settings: AppSettings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = RoomStore(settings.data_dir / "rooms.sqlite3")
        app.state.manager = RoomManager(store, ttl_hours=settings.room_ttl_hours)
        task = asyncio.create_task(_cleanup_loop(app.state.manager))
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        store.close()

    app = FastAPI(title="古董局中局", lifespan=lifespan)
    app.state.settings = settings
    app.include_router(router)

    @app.websocket("/ws/{code}")
    async def room_socket(ws: WebSocket, code: str, token: str = "") -> None:
        await ws.accept()
        manager: RoomManager = app.state.manager
        joined = manager.connect(code, token, ws)
        if joined is None:
            await ws.send_text(json.dumps(
                {"type": "removed", "message": "房間不存在或身分已失效"}, ensure_ascii=False))
            await ws.close(code=CLOSE_UNKNOWN)
            return
        lr, pid = joined
        await manager.broadcast(lr)
        try:
            while True:
                try:
                    msg = json.loads(await ws.receive_text())
                except json.JSONDecodeError:
                    continue
                if not isinstance(msg, dict):
                    continue
                if msg.get("type") == "ping":
                    await ws.send_text('{"type":"pong"}')
                elif msg.get("type") == "action":
                    error = await manager.handle(lr, pid, msg.get("action"))
                    if error:
                        await ws.send_text(json.dumps(
                            {"type": "error", "message": error}, ensure_ascii=False))
        except WebSocketDisconnect:
            pass
        finally:
            await manager.disconnect(lr, pid, ws)

    _mount_frontend(app, settings)
    return app


async def _cleanup_loop(manager: RoomManager) -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            await manager.cleanup()
        except Exception:
            logging.exception("清房失敗")


def _mount_frontend(app: FastAPI, settings: AppSettings) -> None:
    """前端 build 出來的 SPA：有檔案就回檔案，其餘一律回 index.html。"""
    static_dir = settings.static_dir.resolve()
    index = static_dir / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        if not index.exists():
            raise HTTPException(404, "前端尚未 build，請執行 npm run build 或改用 Vite dev server")
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(static_dir):
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


app = create_app()
