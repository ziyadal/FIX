"""FastAPI application -- entry point for the FIX Trading Platform backend."""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.fix_client import FixClient
from backend.websocket_manager import WebSocketManager
from backend.routes import instruments as instruments_route
from backend.routes import market_data as market_data_route

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app(fix_client: FixClient | None = None) -> FastAPI:
    """Create the FastAPI application.

    Args:
        fix_client: Injected FIX client (for testing). If None, creates a real one.
    """
    ws_manager = WebSocketManager()

    if fix_client is None:
        fix_client = FixClient(ws_manager)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if hasattr(fix_client, 'connect') and not hasattr(fix_client, '_mock_name'):
            try:
                await fix_client.connect()
            except Exception:
                logger.exception("Failed to connect FIX session on startup")
        yield
        if hasattr(fix_client, 'disconnect') and not hasattr(fix_client, '_mock_name'):
            await fix_client.disconnect()

    app = FastAPI(title="FIX Trading Platform", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    instruments_route.init_router(fix_client)
    market_data_route.init_router(fix_client)

    app.include_router(instruments_route.router)
    app.include_router(market_data_route.router)

    @app.websocket("/ws/market-data")
    async def ws_market_data(websocket: WebSocket):
        await ws_manager.connect(websocket, "market-data")
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket, "market-data")

    @app.websocket("/ws/fix-messages")
    async def ws_fix_messages(websocket: WebSocket):
        await ws_manager.connect(websocket, "fix-messages")
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket, "fix-messages")

    return app


app = create_app()
