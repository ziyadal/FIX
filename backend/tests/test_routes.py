"""Tests for REST API routes."""
import pytest


class TestInstrumentRoutes:
    def test_get_instruments(self, app_client, mock_fix_client):
        response = app_client.get("/api/instruments")
        assert response.status_code == 200
        data = response.json()
        assert len(data["instruments"]) == 3
        mock_fix_client.request_instrument_list.assert_called_once()

    def test_search_instruments(self, app_client):
        response = app_client.get("/api/instruments/search?q=BTC")
        assert response.status_code == 200
        data = response.json()
        symbols = [i["symbol"] for i in data["instruments"]]
        assert "BTCUSDT" in symbols
        assert "BTCETH" in symbols
        assert "ETHUSDT" not in symbols

    def test_search_empty_query(self, app_client):
        response = app_client.get("/api/instruments/search?q=")
        assert response.status_code == 200
        data = response.json()
        assert len(data["instruments"]) == 3


class TestMarketDataRoutes:
    def test_subscribe(self, app_client, mock_fix_client):
        response = app_client.post("/api/subscribe", json={"symbol": "BTCUSDT"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "subscribed"
        assert data["symbol"] == "BTCUSDT"
        mock_fix_client.subscribe.assert_called_once_with("BTCUSDT", 10)

    def test_subscribe_custom_depth(self, app_client, mock_fix_client):
        response = app_client.post("/api/subscribe", json={"symbol": "BTCUSDT", "depth": 5})
        assert response.status_code == 200
        mock_fix_client.subscribe.assert_called_once_with("BTCUSDT", 5)

    def test_unsubscribe(self, app_client, mock_fix_client):
        response = app_client.post("/api/unsubscribe", json={"symbol": "BTCUSDT"})
        assert response.status_code == 200
        mock_fix_client.unsubscribe.assert_called_once_with("BTCUSDT")

    def test_status(self, app_client):
        response = app_client.get("/api/status")
        assert response.status_code == 200
        data = response.json()
        assert "state" in data
        assert "subscriptions" in data

    def test_limits(self, app_client, mock_fix_client):
        response = app_client.get("/api/limits")
        assert response.status_code == 200
        mock_fix_client.request_limits.assert_called_once()
