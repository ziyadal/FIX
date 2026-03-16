"""Shared test fixtures for backend tests."""
import pytest
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient


def build_fix_message(pairs: list[tuple[int, str]]):
    """Build a FixMessage from tag/value pairs."""
    import simplefix
    msg = simplefix.FixMessage()
    for tag, value in pairs:
        msg.append_pair(tag, value)
    return msg


@pytest.fixture
def mock_fix_client():
    """A mock FixClient for route tests."""
    client = AsyncMock()
    client.state = "connected"
    client.instruments = [
        {"symbol": "BTCUSDT", "base_currency": "BTC", "currency": "USDT"},
        {"symbol": "ETHUSDT", "base_currency": "ETH", "currency": "USDT"},
        {"symbol": "BTCETH", "base_currency": "BTC", "currency": "ETH"},
    ]
    client.subscriptions = {}
    client.maintenance_warning = False
    client.get_order_book.return_value = {"bids": [], "asks": []}
    client.subscribe.return_value = "md-BTCUSDT-abc123"
    return client


@pytest.fixture
def app_client(mock_fix_client):
    """FastAPI test client with mocked FIX client."""
    from backend.main import create_app
    app = create_app(fix_client=mock_fix_client)
    return TestClient(app)
