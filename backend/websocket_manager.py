"""Manage WebSocket connections and broadcast messages to frontend clients."""
from __future__ import annotations
import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self._channels: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        await websocket.accept()
        self._channels[channel].append(websocket)
        logger.info("Client connected to channel: %s", channel)

    def disconnect(self, websocket: WebSocket, channel: str) -> None:
        clients = self._channels[channel]
        if websocket in clients:
            clients.remove(websocket)
        logger.info("Client disconnected from channel: %s", channel)

    def get_clients(self, channel: str) -> list[WebSocket]:
        return self._channels[channel]

    async def broadcast(self, channel: str, data: dict) -> None:
        dead: list[WebSocket] = []
        for ws in self._channels[channel]:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, channel)
