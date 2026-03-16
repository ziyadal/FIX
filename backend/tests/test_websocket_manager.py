"""Tests for WebSocket connection manager."""
import pytest
from unittest.mock import AsyncMock
from backend.websocket_manager import WebSocketManager


@pytest.fixture
def manager():
    return WebSocketManager()


@pytest.mark.asyncio
async def test_connect_adds_client(manager):
    ws = AsyncMock()
    await manager.connect(ws, "market-data")
    assert ws in manager.get_clients("market-data")


@pytest.mark.asyncio
async def test_disconnect_removes_client(manager):
    ws = AsyncMock()
    await manager.connect(ws, "market-data")
    manager.disconnect(ws, "market-data")
    assert ws not in manager.get_clients("market-data")


@pytest.mark.asyncio
async def test_broadcast_sends_to_all(manager):
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await manager.connect(ws1, "market-data")
    await manager.connect(ws2, "market-data")
    await manager.broadcast("market-data", {"price": 100})
    ws1.send_json.assert_called_once_with({"price": 100})
    ws2.send_json.assert_called_once_with({"price": 100})


@pytest.mark.asyncio
async def test_broadcast_removes_dead_clients(manager):
    ws_alive = AsyncMock()
    ws_dead = AsyncMock()
    ws_dead.send_json.side_effect = Exception("connection closed")
    await manager.connect(ws_alive, "market-data")
    await manager.connect(ws_dead, "market-data")
    await manager.broadcast("market-data", {"price": 100})
    assert ws_dead not in manager.get_clients("market-data")
    assert ws_alive in manager.get_clients("market-data")


@pytest.mark.asyncio
async def test_separate_channels(manager):
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await manager.connect(ws1, "market-data")
    await manager.connect(ws2, "fix-messages")
    await manager.broadcast("market-data", {"price": 100})
    ws1.send_json.assert_called_once()
    ws2.send_json.assert_not_called()
