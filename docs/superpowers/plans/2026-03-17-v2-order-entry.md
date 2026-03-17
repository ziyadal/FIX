# v2 Order Entry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full order entry to the FIX trading terminal — place Limit/Market orders, cancel, cancel/replace, mass-cancel, and see live order status in a blotter.

**Architecture:** Two parallel FIX sessions: existing `FixClient` for market data (fix-md) + new `FixOrderEntryClient` for order entry (fix-oe). Both run at startup. ExecutionReports and OrderCancelRejects are multiplexed into the existing `/ws/market-data` WebSocket channel using a `type` field. No new WebSocket connection needed on the frontend.

**Tech Stack:** Python/FastAPI/binance_fix_connector (backend), React/Next.js/Tailwind/TypeScript (frontend), existing WebSocketManager and `init_router` pattern throughout.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `config.ini` | Modify | Add `oe_endpoint` key |
| `backend/config.py` | Modify | Return `oe_endpoint` from `load_config()` |
| `backend/fix_order_entry_client.py` | **Create** | fix-oe session: connect, poll, place/cancel/replace/mass-cancel orders, dispatch ExecutionReports |
| `backend/routes/order_entry.py` | **Create** | REST routes: POST/DELETE/PUT/GET `/api/orders` |
| `backend/routes/market_data.py` | Modify | Pass `oe_client` to `init_router`; add `oe_state` to `/api/status` |
| `backend/main.py` | Modify | Init `FixOrderEntryClient`, connect in lifespan, mount order_entry routes |
| `backend/tests/conftest.py` | Modify | Add `mock_oe_client` fixture; update `app_client` to inject both clients |
| `backend/tests/test_order_entry_routes.py` | **Create** | Tests for all 5 order entry endpoints |
| `frontend/src/lib/types.ts` | Modify | Add `OrderState`, `PlaceOrderRequest`, `ModifyOrderRequest`; extend `MarketDataUpdate` |
| `frontend/src/lib/api.ts` | Modify | Add `placeOrder`, `cancelOrder`, `modifyOrder`, `massCancel`, `getOrders` |
| `frontend/src/hooks/useMarketData.ts` | Modify | Forward `execution_report` / `order_cancel_reject` events via `onOrderEvent` callback |
| `frontend/src/hooks/useOrderEntry.ts` | **Create** | Manage orders map, expose place/cancel/modify/massCancel, process incoming reports |
| `frontend/src/components/OrderEntry.tsx` | **Create** | Form: Symbol, Side, OrdType, Qty, Price, TIF — submits to REST |
| `frontend/src/components/OrderBlotter.tsx` | **Create** | Live orders table with cancel/modify actions, status color-coding, flash on change |
| `frontend/src/components/ModifyOrderModal.tsx` | **Create** | Modal pre-filled with current Qty/Price, calls PUT /api/orders/:id |
| `frontend/src/app/page.tsx` | Modify | Add OrderEntry to right panel (above FIXInspector); add OrderBlotter below OrderBook |

---

## Chunk 1: Backend — Config + FixOrderEntryClient

### Task 1: Add oe_endpoint to config

**Files:**
- Modify: `config.ini`
- Modify: `backend/config.py`

- [ ] **Step 1: Update `config.ini`** — add `oe_endpoint` under `[connection]`:

```ini
[keys]
api_key = <your_key>
private_key_path = id_ed25519test.pem
[connection]
endpoint = tcp+tls://fix-md.testnet.binance.vision:9000
oe_endpoint = tcp+tls://fix-oe.testnet.binance.vision:9000
port = 9000
```

- [ ] **Step 2: Update `backend/config.py`** — add `oe_endpoint` to the returned dict:

```python
from configparser import ConfigParser
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

def load_config(config_path: str | None = None) -> dict:
    """Load settings from config.ini."""
    path = Path(config_path) if config_path else _PROJECT_ROOT / "config.ini"
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    cp = ConfigParser()
    cp.read(path)
    return {
        "api_key": cp["keys"]["api_key"],
        "private_key_path": str(_PROJECT_ROOT / cp["keys"]["private_key_path"]),
        "endpoint": cp.get("connection", "endpoint",
                           fallback="tcp+tls://fix-md.testnet.binance.vision:9000"),
        "oe_endpoint": cp.get("connection", "oe_endpoint",
                              fallback="tcp+tls://fix-oe.testnet.binance.vision:9000"),
    }
```

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

```bash
pytest backend/tests/ -v
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add config.ini backend/config.py
git commit -m "feat: add oe_endpoint to config"
```

---

### Task 2: Create FixOrderEntryClient

**Files:**
- Create: `backend/fix_order_entry_client.py`
- Create: `backend/tests/test_fix_order_entry_client.py`

- [ ] **Step 1: Write failing tests** in `backend/tests/test_fix_order_entry_client.py`:

```python
"""Tests for FixOrderEntryClient."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from backend.fix_order_entry_client import FixOrderEntryClient, ConnectionState


@pytest.fixture
def ws_manager():
    return AsyncMock()


@pytest.fixture
def oe_client(ws_manager):
    return FixOrderEntryClient(ws_manager)


class TestFixOrderEntryClientState:
    def test_initial_state_is_disconnected(self, oe_client):
        assert oe_client.state == ConnectionState.DISCONNECTED

    def test_initial_orders_empty(self, oe_client):
        assert oe_client.get_orders() == {}

    def test_get_order_returns_none_for_unknown(self, oe_client):
        assert oe_client.get_order("nonexistent") is None


class TestOrderStateManagement:
    def test_execution_report_stored_as_new(self, oe_client):
        report = {
            "cl_ord_id": "BTC-123-abcd",
            "order_id": "EX-001",
            "symbol": "BTCUSDT",
            "side": "1",
            "ord_type": "2",
            "qty": "0.001",
            "price": "50000",
            "cum_qty": "0",
            "leaves_qty": "0.001",
            "ord_status": "0",
            "text": "",
            "timestamp": "20260317-10:00:00",
        }
        oe_client._update_order(report)
        assert oe_client.get_order("BTC-123-abcd")["ord_status"] == "0"

    def test_execution_report_updates_existing(self, oe_client):
        oe_client._update_order({"cl_ord_id": "X", "ord_status": "0", "symbol": "BTCUSDT",
                                  "side": "1", "ord_type": "2", "qty": "0.001", "cum_qty": "0",
                                  "leaves_qty": "0.001", "timestamp": "t"})
        oe_client._update_order({"cl_ord_id": "X", "ord_status": "2", "symbol": "BTCUSDT",
                                  "side": "1", "ord_type": "2", "qty": "0.001", "cum_qty": "0.001",
                                  "leaves_qty": "0", "timestamp": "t2"})
        assert oe_client.get_order("X")["ord_status"] == "2"
        assert oe_client.get_order("X")["cum_qty"] == "0.001"
```

- [ ] **Step 2: Run to confirm failure**

```bash
pytest backend/tests/test_fix_order_entry_client.py -v
```
Expected: `ImportError` — module does not exist yet.

- [ ] **Step 3: Create `backend/fix_order_entry_client.py`**:

```python
"""Async FIX order entry session manager."""
from __future__ import annotations
import asyncio
import logging
import random
import string
import time
from enum import Enum

from binance_fix_connector.fix_connector import create_order_entry_session, FixMessage
from binance_fix_connector.utils import get_private_key

from backend.config import load_config
from backend.fix_parser import parse_fix_message, fix_message_to_raw_string
from backend.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


class ConnectionState(str, Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


def _generate_cl_ord_id(symbol: str) -> str:
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"{symbol}-{int(time.time() * 1000)}-{rand}"


class FixOrderEntryClient:
    def __init__(self, ws_manager: WebSocketManager):
        self._ws_manager = ws_manager
        self._session = None
        self._poll_task: asyncio.Task | None = None
        self._state = ConnectionState.DISCONNECTED
        self._orders: dict[str, dict] = {}  # cl_ord_id -> order state

    @property
    def state(self) -> ConnectionState:
        return self._state

    def get_orders(self) -> dict:
        return dict(self._orders)

    def get_order(self, cl_ord_id: str) -> dict | None:
        return self._orders.get(cl_ord_id)

    def _update_order(self, report: dict) -> None:
        cl_ord_id = report.get("cl_ord_id", "")
        if not cl_ord_id:
            return
        self._orders[cl_ord_id] = {**self._orders.get(cl_ord_id, {}), **report}

    async def connect(self) -> None:
        self._state = ConnectionState.CONNECTING
        config = load_config()
        try:
            private_key = get_private_key(config["private_key_path"])
            self._session = await asyncio.to_thread(
                create_order_entry_session,
                api_key=config["api_key"],
                private_key=private_key,
                endpoint=config["oe_endpoint"],
            )
            self._state = ConnectionState.CONNECTED
            logger.info("FIX OE session connected")
            self._poll_task = asyncio.create_task(self._poll_messages())
        except Exception:
            self._state = ConnectionState.DISCONNECTED
            logger.exception("Failed to connect FIX OE session")
            raise

    async def disconnect(self) -> None:
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        if self._session:
            try:
                logout_msg = self._session.create_fix_message_with_basic_header("5")
                self._session.send_message(logout_msg)
                await asyncio.sleep(2)
            except Exception:
                logger.exception("Error sending OE Logout")
            try:
                await asyncio.to_thread(self._session.disconnect)
            except Exception:
                logger.exception("Error during OE disconnect")
        self._session = None
        self._state = ConnectionState.DISCONNECTED
        logger.info("FIX OE session disconnected")

    async def _poll_messages(self) -> None:
        while True:
            try:
                if self._session and self._state == ConnectionState.CONNECTED:
                    messages = await asyncio.to_thread(
                        self._session.get_all_new_messages_received
                    )
                    for msg in messages:
                        await self._handle_message(msg)
            except asyncio.CancelledError:
                raise
            except (OSError, ConnectionError) as e:
                logger.warning("OE connection lost: %s", e)
                self._state = ConnectionState.DISCONNECTED
            except Exception:
                logger.exception("Error in OE message polling loop")
            await asyncio.sleep(0.1)

    async def _handle_message(self, msg: FixMessage) -> None:
        parsed = parse_fix_message(msg)
        raw_str = fix_message_to_raw_string(msg)
        msg_type = parsed["msg_type"]

        # Always relay raw FIX to the inspector
        await self._ws_manager.broadcast("fix-messages", {
            "direction": "server",
            "raw": raw_str,
            "parsed": parsed["raw_pairs"],
            "msg_type": msg_type,
            "timestamp": parsed["tags"].get(52, ""),
        })

        if msg_type == "8":
            await self._handle_execution_report(parsed)
        elif msg_type == "9":
            await self._handle_cancel_reject(parsed)
        elif msg_type == "j":
            logger.error("BusinessMessageReject: %s", parsed["tags"].get(58, ""))
        elif msg_type == "5":
            logger.warning("OE Logout: %s", parsed["tags"].get(58, ""))
            self._state = ConnectionState.DISCONNECTED
        elif msg_type == "3":
            logger.error("OE Reject: ref_tag=%s text=%s",
                         parsed["tags"].get(371, "?"), parsed["tags"].get(58, "?"))

    async def _handle_execution_report(self, parsed: dict) -> None:
        tags = parsed["tags"]
        report = {
            "cl_ord_id": tags.get(11, ""),
            "order_id": tags.get(37, ""),
            "symbol": tags.get(55, ""),
            "side": tags.get(54, ""),
            "ord_type": tags.get(40, ""),
            "qty": tags.get(38, ""),
            "price": tags.get(44, ""),
            "cum_qty": tags.get(14, "0"),
            "leaves_qty": tags.get(151, "0"),
            "ord_status": tags.get(39, ""),
            "last_px": tags.get(31, ""),
            "last_qty": tags.get(32, ""),
            "text": tags.get(58, ""),
            "timestamp": tags.get(52, ""),
        }
        self._update_order(report)
        await self._ws_manager.broadcast("market-data", {
            "type": "execution_report",
            "order": report,
        })

    async def _handle_cancel_reject(self, parsed: dict) -> None:
        tags = parsed["tags"]
        await self._ws_manager.broadcast("market-data", {
            "type": "order_cancel_reject",
            "cl_ord_id": tags.get(11, ""),
            "orig_cl_ord_id": tags.get(41, ""),
            "reason": tags.get(102, ""),
            "text": tags.get(58, ""),
        })

    async def _send_message(self, msg: FixMessage) -> None:
        if not self._session or self._state != ConnectionState.CONNECTED:
            raise RuntimeError("OE session not connected")
        raw = fix_message_to_raw_string(msg)
        parsed = parse_fix_message(msg)
        await asyncio.to_thread(self._session.send_message, msg)
        await self._ws_manager.broadcast("fix-messages", {
            "direction": "client",
            "raw": raw,
            "parsed": parsed["raw_pairs"],
            "msg_type": parsed["msg_type"],
            "timestamp": parsed["tags"].get(52, ""),
        })

    def _require_connected(self) -> None:
        if not self._session or self._state != ConnectionState.CONNECTED:
            raise RuntimeError("OE session not connected")

    async def place_order(
        self, symbol: str, side: str, ord_type: str,
        qty: str, price: str | None = None, tif: str = "1"
    ) -> str:
        self._require_connected()
        cl_ord_id = _generate_cl_ord_id(symbol)
        msg = self._session.create_fix_message_with_basic_header("D")
        msg.append_pair(11, cl_ord_id)
        msg.append_pair(55, symbol)
        msg.append_pair(54, side)
        msg.append_pair(38, qty)
        msg.append_pair(40, ord_type)
        if ord_type == "2":
            if price:
                msg.append_pair(44, price)
            msg.append_pair(59, tif)  # TIF only for Limit; Binance rejects GTC on Market orders
        await self._send_message(msg)
        return cl_ord_id

    async def cancel_order(
        self, cl_ord_id: str, symbol: str, side: str
    ) -> str:
        self._require_connected()
        new_cl_ord_id = _generate_cl_ord_id(symbol)
        msg = self._session.create_fix_message_with_basic_header("F")
        msg.append_pair(41, cl_ord_id)
        msg.append_pair(11, new_cl_ord_id)
        msg.append_pair(55, symbol)
        msg.append_pair(54, side)
        await self._send_message(msg)
        return new_cl_ord_id

    async def replace_order(
        self, cl_ord_id: str, symbol: str, side: str,
        qty: str, price: str, ord_type: str = "2", tif: str = "1"
    ) -> str:
        self._require_connected()
        new_cl_ord_id = _generate_cl_ord_id(symbol)
        msg = self._session.create_fix_message_with_basic_header("G")
        msg.append_pair(41, cl_ord_id)
        msg.append_pair(11, new_cl_ord_id)
        msg.append_pair(55, symbol)
        msg.append_pair(54, side)
        msg.append_pair(38, qty)
        msg.append_pair(44, price)
        msg.append_pair(40, ord_type)
        msg.append_pair(59, tif)
        await self._send_message(msg)
        return new_cl_ord_id

    async def mass_cancel(self) -> str:
        self._require_connected()
        cl_ord_id = _generate_cl_ord_id("MASS")
        msg = self._session.create_fix_message_with_basic_header("q")
        msg.append_pair(11, cl_ord_id)
        msg.append_pair(530, "7")  # Cancel all orders
        await self._send_message(msg)
        return cl_ord_id
```

- [ ] **Step 4: Run tests**

```bash
pytest backend/tests/test_fix_order_entry_client.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/fix_order_entry_client.py backend/tests/test_fix_order_entry_client.py
git commit -m "feat: add FixOrderEntryClient for fix-oe session"
```

---

### Task 3: Create order entry REST routes

**Files:**
- Create: `backend/routes/order_entry.py`
- Create: `backend/tests/test_order_entry_routes.py`
- Modify: `backend/tests/conftest.py`

> **⚠️ Step ordering note:** Steps 1 (conftest.py) and 5 (main.py) must be applied together before running tests, because conftest.py calls `create_app(oe_client=...)` which requires the updated main.py signature. Do not run tests between Step 1 and Step 5.

- [ ] **Step 1: Add `mock_oe_client` fixture and update `app_client` in `conftest.py`**:

```python
@pytest.fixture
def mock_oe_client():
    """A mock FixOrderEntryClient for route tests."""
    client = AsyncMock()
    client.state = "connected"
    client.get_orders.return_value = {}
    client.place_order.return_value = "BTCUSDT-1234567890-abcd"
    client.cancel_order.return_value = "BTCUSDT-1234567891-efgh"
    client.replace_order.return_value = "BTCUSDT-1234567892-ijkl"
    client.mass_cancel.return_value = "MASS-1234567893-mnop"
    return client


@pytest.fixture
def app_client(mock_fix_client, mock_oe_client):
    """FastAPI test client with mocked FIX clients."""
    from backend.main import create_app
    app = create_app(fix_client=mock_fix_client, oe_client=mock_oe_client)
    return TestClient(app)
```

- [ ] **Step 2: Write failing tests** in `backend/tests/test_order_entry_routes.py`:

```python
"""Tests for order entry REST routes."""
import pytest


class TestOrderEntryRoutes:
    def test_place_limit_order(self, app_client, mock_oe_client):
        response = app_client.post("/api/orders", json={
            "symbol": "BTCUSDT", "side": "1", "ord_type": "2",
            "qty": "0.001", "price": "50000", "tif": "1"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "order_sent"
        assert "cl_ord_id" in data
        mock_oe_client.place_order.assert_called_once_with(
            "BTCUSDT", "1", "2", "0.001", "50000", "1"
        )

    def test_place_market_order(self, app_client, mock_oe_client):
        response = app_client.post("/api/orders", json={
            "symbol": "BTCUSDT", "side": "2", "ord_type": "1", "qty": "0.001"
        })
        assert response.status_code == 200
        mock_oe_client.place_order.assert_called_once_with(
            "BTCUSDT", "2", "1", "0.001", None, "1"
        )

    def test_place_order_disconnected(self, app_client, mock_oe_client):
        mock_oe_client.place_order.side_effect = RuntimeError("OE session not connected")
        response = app_client.post("/api/orders", json={
            "symbol": "BTCUSDT", "side": "1", "ord_type": "2", "qty": "0.001", "price": "50000"
        })
        assert response.status_code == 503

    def test_cancel_order(self, app_client, mock_oe_client):
        response = app_client.delete(
            "/api/orders/BTCUSDT-123-abcd",
            params={"symbol": "BTCUSDT", "side": "1"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cancel_sent"
        mock_oe_client.cancel_order.assert_called_once_with(
            "BTCUSDT-123-abcd", "BTCUSDT", "1"
        )

    def test_modify_order(self, app_client, mock_oe_client):
        response = app_client.put("/api/orders/BTCUSDT-123-abcd", json={
            "symbol": "BTCUSDT", "side": "1", "qty": "0.002", "price": "51000"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "replace_sent"
        mock_oe_client.replace_order.assert_called_once_with(
            "BTCUSDT-123-abcd", "BTCUSDT", "1", "0.002", "51000"
        )

    def test_mass_cancel(self, app_client, mock_oe_client):
        response = app_client.delete("/api/orders")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "mass_cancel_sent"
        mock_oe_client.mass_cancel.assert_called_once()

    def test_get_orders(self, app_client, mock_oe_client):
        mock_oe_client.get_orders.return_value = {
            "BTCUSDT-1-abcd": {"cl_ord_id": "BTCUSDT-1-abcd", "ord_status": "0"}
        }
        response = app_client.get("/api/orders")
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        assert "BTCUSDT-1-abcd" in data["orders"]
```

- [ ] **Step 3: Run to confirm failure**

```bash
pytest backend/tests/test_order_entry_routes.py -v
```
Expected: errors (route file not created yet, `create_app` doesn't accept `oe_client`).

- [ ] **Step 4: Create `backend/routes/order_entry.py`**:

```python
"""Order entry REST routes."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["order_entry"])

_oe_client = None


def init_router(oe_client) -> None:
    global _oe_client
    _oe_client = oe_client


class PlaceOrderRequest(BaseModel):
    symbol: str
    side: str          # "1"=Buy, "2"=Sell
    ord_type: str      # "1"=Market, "2"=Limit
    qty: str
    price: str | None = None
    tif: str = "1"     # "1"=GTC, "3"=IOC, "4"=FOK


class ModifyOrderRequest(BaseModel):
    symbol: str
    side: str
    qty: str
    price: str


@router.post("/orders")
async def place_order(req: PlaceOrderRequest):
    try:
        cl_ord_id = await _oe_client.place_order(
            req.symbol, req.side, req.ord_type, req.qty, req.price, req.tif
        )
    except RuntimeError:
        raise HTTPException(status_code=503, detail="OE session not connected")
    return {"status": "order_sent", "cl_ord_id": cl_ord_id}


@router.delete("/orders")
async def mass_cancel():
    # NOTE: must be registered BEFORE /orders/{cl_ord_id} — FastAPI matches literals first only
    # when they appear earlier in the file.
    try:
        cl_ord_id = await _oe_client.mass_cancel()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="OE session not connected")
    return {"status": "mass_cancel_sent", "cl_ord_id": cl_ord_id}


@router.delete("/orders/{cl_ord_id}")
async def cancel_order(
    cl_ord_id: str,
    symbol: str = Query(...),
    side: str = Query(...),
):
    try:
        new_id = await _oe_client.cancel_order(cl_ord_id, symbol, side)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="OE session not connected")
    return {"status": "cancel_sent", "cl_ord_id": new_id}


@router.put("/orders/{cl_ord_id}")
async def modify_order(cl_ord_id: str, req: ModifyOrderRequest):
    try:
        new_id = await _oe_client.replace_order(
            cl_ord_id, req.symbol, req.side, req.qty, req.price
        )
    except RuntimeError:
        raise HTTPException(status_code=503, detail="OE session not connected")
    return {"status": "replace_sent", "cl_ord_id": new_id}


@router.get("/orders")
async def get_orders():
    return {"orders": _oe_client.get_orders()}
```

- [ ] **Step 5: Update `backend/main.py`** — add `oe_client` parameter and wire up routes:

```python
"""FastAPI application -- entry point for the FIX Trading Platform backend."""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.fix_client import FixClient
from backend.fix_order_entry_client import FixOrderEntryClient
from backend.websocket_manager import WebSocketManager
from backend.routes import instruments as instruments_route
from backend.routes import market_data as market_data_route
from backend.routes import order_entry as order_entry_route

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app(
    fix_client: FixClient | None = None,
    oe_client: FixOrderEntryClient | None = None,
) -> FastAPI:
    ws_manager = WebSocketManager()

    if fix_client is None:
        fix_client = FixClient(ws_manager)
    if oe_client is None:
        oe_client = FixOrderEntryClient(ws_manager)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if hasattr(fix_client, 'connect') and not hasattr(fix_client, '_mock_name'):
            try:
                await fix_client.connect()
            except Exception:
                logger.exception("Failed to connect FIX MD session on startup")
        if hasattr(oe_client, 'connect') and not hasattr(oe_client, '_mock_name'):
            try:
                await oe_client.connect()
            except Exception:
                logger.exception("Failed to connect FIX OE session on startup")
        yield
        if hasattr(fix_client, 'disconnect') and not hasattr(fix_client, '_mock_name'):
            await fix_client.disconnect()
        if hasattr(oe_client, 'disconnect') and not hasattr(oe_client, '_mock_name'):
            await oe_client.disconnect()

    app = FastAPI(title="FIX Trading Platform", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    instruments_route.init_router(fix_client)
    market_data_route.init_router(fix_client, oe_client)
    order_entry_route.init_router(oe_client)

    app.include_router(instruments_route.router)
    app.include_router(market_data_route.router)
    app.include_router(order_entry_route.router)

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
```

- [ ] **Step 6: Update `backend/routes/market_data.py`** — accept `oe_client` and include `oe_state` in status:

```python
"""Market data subscribe/unsubscribe and status endpoints."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["market_data"])

_fix_client = None
_oe_client = None


def init_router(fix_client, oe_client=None) -> None:
    global _fix_client, _oe_client
    _fix_client = fix_client
    _oe_client = oe_client


class SubscribeRequest(BaseModel):
    symbol: str
    depth: int = 10


class UnsubscribeRequest(BaseModel):
    symbol: str


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest):
    try:
        req_id = await _fix_client.subscribe(req.symbol, req.depth)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="FIX session not connected")
    return {"status": "subscribed", "symbol": req.symbol, "req_id": req_id}


@router.post("/unsubscribe")
async def unsubscribe(req: UnsubscribeRequest):
    try:
        await _fix_client.unsubscribe(req.symbol)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="FIX session not connected")
    return {"status": "unsubscribed", "symbol": req.symbol}


@router.get("/status")
async def get_status():
    oe_state = _oe_client.state if _oe_client and hasattr(_oe_client, "state") else "disconnected"
    return {
        "state": _fix_client.state.value if hasattr(_fix_client.state, 'value') else _fix_client.state,
        "subscriptions": list(_fix_client.subscriptions.keys()),
        "maintenance_warning": _fix_client.maintenance_warning,
        "oe_state": oe_state.value if hasattr(oe_state, 'value') else oe_state,
    }


@router.get("/limits")
async def get_limits():
    await _fix_client.request_limits()
    return {"status": "limit_query_sent"}
```

- [ ] **Step 7: Run all backend tests**

```bash
pytest backend/tests/ -v
```
Expected: all pass including new test_order_entry_routes.py.

- [ ] **Step 8: Commit**

```bash
git add backend/routes/order_entry.py backend/routes/market_data.py backend/main.py \
        backend/tests/conftest.py backend/tests/test_order_entry_routes.py
git commit -m "feat: add order entry routes and wire up oe_client in main"
```

---

## Chunk 2: Frontend — Types, API, Hook

### Task 4: Extend types and API client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update `frontend/src/lib/types.ts`** — add order types and extend `MarketDataUpdate`:

```typescript
export interface OrderBookEntry {
  side: string;
  price: string;
  qty: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface Instrument {
  symbol: string;
  base_currency?: string;
  currency?: string;
  min_trade_vol?: string;
  max_trade_vol?: string;
  tick_size?: string;
}

export interface FIXMessagePair {
  tag: number;
  value: string;
}

export interface FIXMessage {
  direction: "client" | "server";
  raw: string;
  parsed: FIXMessagePair[];
  msg_type: string;
  timestamp: string;
}

// Order entry types
export type OrdStatus = "0" | "1" | "2" | "4" | "8"; // New, PartFill, Filled, Cancelled, Rejected

export interface OrderState {
  cl_ord_id: string;
  order_id?: string;
  symbol: string;
  side: "1" | "2";
  ord_type: "1" | "2";
  qty: string;
  price?: string;
  tif?: string;
  cum_qty: string;
  leaves_qty: string;
  ord_status: OrdStatus;
  last_px?: string;
  last_qty?: string;
  text?: string;
  timestamp: string;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: "1" | "2";
  ord_type: "1" | "2";
  qty: string;
  price?: string;
  tif?: string;
}

export interface ModifyOrderRequest {
  symbol: string;
  side: "1" | "2";
  qty: string;
  price: string;
}

export interface MarketDataUpdate {
  type: "snapshot" | "update" | "error" | "maintenance" | "execution_report" | "order_cancel_reject";
  // Market data fields
  symbol?: string;
  bids?: OrderBookEntry[];
  asks?: OrderBookEntry[];
  updates?: Array<{
    action: string;
    side?: string;
    price?: string;
    qty?: string;
    symbol?: string;
  }>;
  error?: string;
  error_code?: string;
  headline?: string;
  // Order event fields
  order?: OrderState;
  cl_ord_id?: string;
  reason?: string;
  text?: string;
}

export type ConnectionState = "connected" | "disconnected" | "connecting" | "reconnecting";
```

- [ ] **Step 2: Update `frontend/src/lib/api.ts`** — add order entry functions:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getInstruments: () =>
    fetchJSON<{ instruments: import("./types").Instrument[] }>("/api/instruments"),

  searchInstruments: (q: string) =>
    fetchJSON<{ instruments: import("./types").Instrument[] }>(
      `/api/instruments/search?q=${encodeURIComponent(q)}`
    ),

  subscribe: (symbol: string, depth = 10) =>
    fetchJSON<{ status: string; symbol: string; req_id: string }>(
      "/api/subscribe",
      { method: "POST", body: JSON.stringify({ symbol, depth }) }
    ),

  unsubscribe: (symbol: string) =>
    fetchJSON<{ status: string; symbol: string }>(
      "/api/unsubscribe",
      { method: "POST", body: JSON.stringify({ symbol }) }
    ),

  getStatus: () =>
    fetchJSON<{ state: string; subscriptions: string[]; maintenance_warning: boolean; oe_state: string }>(
      "/api/status"
    ),

  getLimits: () =>
    fetchJSON<{ status: string }>("/api/limits"),

  // Order entry
  placeOrder: (req: import("./types").PlaceOrderRequest) =>
    fetchJSON<{ status: string; cl_ord_id: string }>(
      "/api/orders",
      { method: "POST", body: JSON.stringify(req) }
    ),

  cancelOrder: (clOrdId: string, symbol: string, side: string) =>
    fetchJSON<{ status: string; cl_ord_id: string }>(
      `/api/orders/${encodeURIComponent(clOrdId)}?symbol=${encodeURIComponent(symbol)}&side=${encodeURIComponent(side)}`,
      { method: "DELETE" }
    ),

  modifyOrder: (clOrdId: string, req: import("./types").ModifyOrderRequest) =>
    fetchJSON<{ status: string; cl_ord_id: string }>(
      `/api/orders/${encodeURIComponent(clOrdId)}`,
      { method: "PUT", body: JSON.stringify(req) }
    ),

  massCancel: () =>
    fetchJSON<{ status: string; cl_ord_id: string }>(
      "/api/orders",
      { method: "DELETE" }
    ),

  getOrders: () =>
    fetchJSON<{ orders: Record<string, import("./types").OrderState> }>("/api/orders"),
};
```

- [ ] **Step 3: Run existing frontend tests to confirm no regressions**

```bash
cd frontend && npm test -- --passWithNoTests
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: add order types and REST functions to frontend"
```

---

### Task 5: Create useOrderEntry hook and update useMarketData

**Files:**
- Modify: `frontend/src/hooks/useMarketData.ts`
- Create: `frontend/src/hooks/useOrderEntry.ts`

- [ ] **Step 1: Update `frontend/src/hooks/useMarketData.ts`** — accept `onOrderEvent` callback and forward order events:

```typescript
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { api } from "@/lib/api";
import type { FIXMessage, MarketDataUpdate, OrderBook } from "@/lib/types";

const MAX_FIX_MESSAGES = 500;
const STATUS_POLL_INTERVAL = 5000;

interface UseMarketDataOptions {
  onOrderEvent?: (event: MarketDataUpdate) => void;
}

export function useMarketData({ onOrderEvent }: UseMarketDataOptions = {}) {
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBook>>({});
  const [fixMessages, setFixMessages] = useState<FIXMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [fixConnected, setFixConnected] = useState(false);
  const [oeConnected, setOeConnected] = useState(false);
  const fixConnectedRef = useRef(false);
  const onOrderEventRef = useRef(onOrderEvent);
  onOrderEventRef.current = onOrderEvent;

  const handleMarketData = useCallback((data: MarketDataUpdate) => {
    if (data.type === "snapshot" && data.symbol) {
      setOrderBooks((prev) => ({
        ...prev,
        [data.symbol!]: { bids: data.bids || [], asks: data.asks || [] },
      }));
    } else if (data.type === "update" && data.symbol && data.updates) {
      setOrderBooks((prev) => {
        const book = prev[data.symbol!] || { bids: [], asks: [] };
        const newBook = { bids: [...book.bids], asks: [...book.asks] };
        for (const u of data.updates!) {
          const sideKey = u.side === "0" ? "bids" : "asks";
          if (u.action === "0") {
            newBook[sideKey].push({ side: u.side || "", price: u.price || "", qty: u.qty || "" });
          } else if (u.action === "1") {
            const idx = newBook[sideKey].findIndex((e) => e.price === u.price);
            if (idx >= 0) newBook[sideKey][idx] = { ...newBook[sideKey][idx], qty: u.qty || "0" };
          } else if (u.action === "2") {
            newBook[sideKey] = newBook[sideKey].filter((e) => e.price !== u.price);
          }
        }
        return { ...prev, [data.symbol!]: newBook };
      });
    } else if (data.type === "error") {
      setError(data.error || "Unknown error");
    } else if (data.type === "maintenance") {
      setMaintenance(true);
    } else if (data.type === "execution_report" || data.type === "order_cancel_reject") {
      onOrderEventRef.current?.(data);
    }
  }, []);

  const handleFixMessage = useCallback((data: FIXMessage) => {
    setFixMessages((prev) => {
      const next = [...prev, data];
      return next.length > MAX_FIX_MESSAGES ? next.slice(-MAX_FIX_MESSAGES) : next;
    });
  }, []);

  const { connected: mdConnected } = useWebSocket<MarketDataUpdate>("/ws/market-data", handleMarketData);
  const { connected: fixWsConnected } = useWebSocket<FIXMessage>("/ws/fix-messages", handleFixMessage);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const status = await api.getStatus();
        if (!mounted) return;
        const isMdConnected = status.state === "connected";
        const isOeConnected = status.oe_state === "connected";
        setFixConnected(isMdConnected);
        setOeConnected(isOeConnected);
        fixConnectedRef.current = isMdConnected;
      } catch {
        if (!mounted) return;
        setFixConnected(false);
        setOeConnected(false);
        fixConnectedRef.current = false;
      }
    };
    poll();
    const id = setInterval(poll, STATUS_POLL_INTERVAL);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearMaintenance = useCallback(() => setMaintenance(false), []);

  return {
    orderBooks, fixMessages, error, maintenance,
    connected: mdConnected && fixConnected,
    fixConnected, oeConnected, fixConnectedRef,
    clearError, clearMaintenance,
  };
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useOrderEntry.ts`**:

```typescript
"use client";

import { useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import type { OrderState, PlaceOrderRequest, ModifyOrderRequest, MarketDataUpdate } from "@/lib/types";

export function useOrderEntry() {
  const [orders, setOrders] = useState<Record<string, OrderState>>({});
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);

  const updateOrder = useCallback((order: OrderState) => {
    setOrders((prev) => ({ ...prev, [order.cl_ord_id]: { ...prev[order.cl_ord_id], ...order } }));
    if (order.ord_status === "8") {
      setLastResult({ success: false, message: order.text || "Order rejected" });
    } else if (order.ord_status === "0") {
      setLastResult({ success: true, message: "Order accepted" });
    }
  }, []);

  const handleOrderEvent = useCallback((event: MarketDataUpdate) => {
    if (event.type === "execution_report" && event.order) {
      updateOrder(event.order);
    } else if (event.type === "order_cancel_reject") {
      setLastResult({
        success: false,
        message: `Cancel rejected: ${event.text || event.reason || "Unknown reason"}`,
      });
    }
  }, [updateOrder]);

  const placeOrder = useCallback(async (req: PlaceOrderRequest) => {
    setLastResult(null);
    await api.placeOrder(req);
  }, []);

  const cancelOrder = useCallback(async (clOrdId: string, symbol: string, side: string) => {
    await api.cancelOrder(clOrdId, symbol, side);
  }, []);

  const modifyOrder = useCallback(async (clOrdId: string, req: ModifyOrderRequest) => {
    await api.modifyOrder(clOrdId, req);
  }, []);

  const massCancelAll = useCallback(async () => {
    await api.massCancel();
  }, []);

  const clearLastResult = useCallback(() => setLastResult(null), []);

  return {
    orders,
    lastResult,
    handleOrderEvent,
    placeOrder,
    cancelOrder,
    modifyOrder,
    massCancelAll,
    clearLastResult,
  };
}
```

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npm test
```
Expected: all pass (hooks are not directly tested here; existing component tests still pass).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useMarketData.ts frontend/src/hooks/useOrderEntry.ts
git commit -m "feat: add useOrderEntry hook and wire order events through useMarketData"
```

---

## Chunk 3: Frontend Components + Layout

### Task 6: Create OrderEntry component

**Files:**
- Create: `frontend/src/components/OrderEntry.tsx`

- [ ] **Step 1: Create `frontend/src/components/OrderEntry.tsx`**:

```typescript
"use client";

import { useState } from "react";
import type { PlaceOrderRequest } from "@/lib/types";

interface OrderEntryProps {
  activeSymbol: string | null;
  oeConnected: boolean;
  onPlaceOrder: (req: PlaceOrderRequest) => Promise<void>;
  lastResult: { success: boolean; message: string } | null;
  onClearResult: () => void;
}

export default function OrderEntry({
  activeSymbol,
  oeConnected,
  onPlaceOrder,
  lastResult,
  onClearResult,
}: OrderEntryProps) {
  const [side, setSide] = useState<"1" | "2">("1");
  const [ordType, setOrdType] = useState<"1" | "2">("2");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [tif, setTif] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSymbol) return;
    setError(null);
    onClearResult();
    setSubmitting(true);
    try {
      await onPlaceOrder({
        symbol: activeSymbol,
        side,
        ord_type: ordType,
        qty,
        price: ordType === "2" ? price : undefined,
        tif,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send order");
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !oeConnected || !activeSymbol || submitting;

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-terminal-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-terminal-text">Order Entry</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          oeConnected
            ? "bg-terminal-bid/20 text-terminal-bid"
            : "bg-terminal-ask/20 text-terminal-ask"
        }`}>
          {oeConnected ? "OE Connected" : "OE Disconnected"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        {/* Symbol */}
        <div>
          <label className="text-xs text-terminal-muted block mb-1">Symbol</label>
          <div className="font-mono text-sm text-terminal-text bg-terminal-bg border border-terminal-border rounded px-3 py-1.5">
            {activeSymbol || "—  select from watchlist"}
          </div>
        </div>

        {/* Side */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide("1")}
            className={`py-2 text-sm font-semibold rounded border transition-colors ${
              side === "1"
                ? "bg-terminal-bid/20 border-terminal-bid text-terminal-bid"
                : "border-terminal-border text-terminal-muted hover:border-terminal-bid/50"
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setSide("2")}
            className={`py-2 text-sm font-semibold rounded border transition-colors ${
              side === "2"
                ? "bg-terminal-ask/20 border-terminal-ask text-terminal-ask"
                : "border-terminal-border text-terminal-muted hover:border-terminal-ask/50"
            }`}
          >
            SELL
          </button>
        </div>

        {/* Order Type */}
        <div className="grid grid-cols-2 gap-2">
          {(["2", "1"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrdType(type)}
              className={`py-1.5 text-xs rounded border transition-colors ${
                ordType === type
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/10"
                  : "border-terminal-border text-terminal-muted hover:border-terminal-accent/50"
              }`}
            >
              {type === "2" ? "Limit" : "Market"}
            </button>
          ))}
        </div>

        {/* Qty */}
        <div>
          <label className="text-xs text-terminal-muted block mb-1">Quantity</label>
          <input
            type="number"
            step="any"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0.001"
            className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
            required
          />
        </div>

        {/* Price (Limit only) */}
        {ordType === "2" && (
          <div>
            <label className="text-xs text-terminal-muted block mb-1">Price</label>
            <input
              type="number"
              step="any"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="50000"
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
              required
            />
          </div>
        )}

        {/* TIF (Limit only) */}
        {ordType === "2" && (
          <div>
            <label className="text-xs text-terminal-muted block mb-1">Time in Force</label>
            <select
              value={tif}
              onChange={(e) => setTif(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm text-terminal-text focus:outline-none focus:border-terminal-accent"
            >
              <option value="1">GTC — Good Till Cancel</option>
              <option value="3">IOC — Immediate or Cancel</option>
              <option value="4">FOK — Fill or Kill</option>
            </select>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={disabled}
          className={`w-full py-2.5 text-sm font-semibold rounded transition-colors ${
            disabled
              ? "bg-terminal-border/30 text-terminal-muted cursor-not-allowed"
              : side === "1"
              ? "bg-terminal-bid/20 border border-terminal-bid text-terminal-bid hover:bg-terminal-bid/30"
              : "bg-terminal-ask/20 border border-terminal-ask text-terminal-ask hover:bg-terminal-ask/30"
          }`}
        >
          {submitting ? "Sending..." : `${side === "1" ? "BUY" : "SELL"} ${activeSymbol || ""}`}
        </button>

        {/* Result feedback */}
        {(error || lastResult) && (
          <div className={`text-xs px-3 py-2 rounded border ${
            error || !lastResult?.success
              ? "border-terminal-ask/30 text-terminal-ask bg-terminal-ask/10"
              : "border-terminal-bid/30 text-terminal-bid bg-terminal-bid/10"
          }`}>
            {error || lastResult?.message}
          </div>
        )}

        {!oeConnected && (
          <p className="text-xs text-terminal-muted text-center">
            Order entry session offline
          </p>
        )}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OrderEntry.tsx
git commit -m "feat: add OrderEntry form component"
```

---

### Task 7: Create OrderBlotter and ModifyOrderModal

**Files:**
- Create: `frontend/src/components/OrderBlotter.tsx`
- Create: `frontend/src/components/ModifyOrderModal.tsx`

- [ ] **Step 1: Create `frontend/src/components/ModifyOrderModal.tsx`**:

```typescript
"use client";

import { useState } from "react";
import type { OrderState, ModifyOrderRequest } from "@/lib/types";

interface ModifyOrderModalProps {
  order: OrderState;
  onConfirm: (req: ModifyOrderRequest) => Promise<void>;
  onClose: () => void;
}

export default function ModifyOrderModal({ order, onConfirm, onClose }: ModifyOrderModalProps) {
  const [qty, setQty] = useState(order.qty);
  const [price, setPrice] = useState(order.price || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm({ symbol: order.symbol, side: order.side, qty, price });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-terminal-panel border border-terminal-border rounded-lg w-80 p-5">
        <h3 className="text-sm font-semibold text-terminal-text mb-4">
          Modify Order — {order.symbol}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-terminal-muted block mb-1">Quantity</label>
            <input
              type="number" step="any" min="0" value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
              required
            />
          </div>
          <div>
            <label className="text-xs text-terminal-muted block mb-1">Price</label>
            <input
              type="number" step="any" min="0" value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent"
              required
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 text-sm border border-terminal-border text-terminal-muted rounded hover:border-terminal-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={submitting}
              className="flex-1 py-2 text-sm border border-terminal-accent text-terminal-accent bg-terminal-accent/10 rounded hover:bg-terminal-accent/20 transition-colors disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/components/OrderBlotter.tsx`**:

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import type { OrderState, ModifyOrderRequest } from "@/lib/types";
import ModifyOrderModal from "./ModifyOrderModal";

interface OrderBlotterProps {
  orders: Record<string, OrderState>;
  onCancel: (clOrdId: string, symbol: string, side: string) => Promise<void>;
  onModify: (clOrdId: string, req: ModifyOrderRequest) => Promise<void>;
  onMassCancel: () => Promise<void>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  "0": { label: "New",      color: "text-terminal-text" },
  "1": { label: "Part Fill", color: "text-terminal-warning" },
  "2": { label: "Filled",   color: "text-terminal-bid" },
  "4": { label: "Cancelled", color: "text-terminal-muted" },
  "8": { label: "Rejected", color: "text-terminal-ask" },
};

function useFlash(value: string) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value !== prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);
  return flash;
}

function BlotterRow({
  order,
  onCancel,
  onModify,
}: {
  order: OrderState;
  onCancel: () => void;
  onModify: () => void;
}) {
  const flash = useFlash(order.ord_status);
  const status = STATUS_LABELS[order.ord_status] ?? { label: order.ord_status, color: "text-terminal-text" };
  const isOpen = order.ord_status === "0" || order.ord_status === "1";

  return (
    <tr className={`border-b border-terminal-border/30 text-xs font-mono transition-colors ${flash ? "bg-terminal-accent/10" : ""}`}>
      <td className="px-3 py-1.5 text-terminal-muted">{order.timestamp?.slice(9, 17) || "—"}</td>
      <td className="px-3 py-1.5 text-terminal-text">{order.symbol}</td>
      <td className={`px-3 py-1.5 font-semibold ${order.side === "1" ? "text-terminal-bid" : "text-terminal-ask"}`}>
        {order.side === "1" ? "BUY" : "SELL"}
      </td>
      <td className="px-3 py-1.5 text-terminal-muted">{order.ord_type === "2" ? "LMT" : "MKT"}</td>
      <td className="px-3 py-1.5 text-right">{order.qty}</td>
      <td className="px-3 py-1.5 text-right text-terminal-bid">{order.cum_qty || "0"}</td>
      <td className="px-3 py-1.5 text-right">{order.price || "—"}</td>
      <td className={`px-3 py-1.5 ${status.color}`}>{status.label}</td>
      <td className="px-3 py-1.5">
        <div className="flex gap-1.5">
          {isOpen && (
            <>
              <button
                onClick={onCancel}
                className="px-2 py-0.5 text-xs border border-terminal-ask/40 text-terminal-ask rounded hover:bg-terminal-ask/10 transition-colors"
              >
                Cancel
              </button>
              {order.ord_type === "2" && (
                <button
                  onClick={onModify}
                  className="px-2 py-0.5 text-xs border border-terminal-accent/40 text-terminal-accent rounded hover:bg-terminal-accent/10 transition-colors"
                >
                  Modify
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function OrderBlotter({ orders, onCancel, onModify, onMassCancel }: OrderBlotterProps) {
  const [modifyingOrder, setModifyingOrder] = useState<OrderState | null>(null);
  const [confirming, setConfirming] = useState(false);

  const orderList = Object.values(orders).sort((a, b) =>
    (b.timestamp || "").localeCompare(a.timestamp || "")
  );
  const openCount = orderList.filter((o) => o.ord_status === "0" || o.ord_status === "1").length;

  const handleMassCancel = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    await onMassCancel();
  };

  return (
    <>
      <div className="bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-terminal-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-terminal-text">
            Order Blotter {openCount > 0 && <span className="text-terminal-muted ml-1">({openCount} open)</span>}
          </h2>
          {openCount > 0 && (
            <button
              onClick={handleMassCancel}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                confirming
                  ? "border-terminal-ask text-terminal-ask bg-terminal-ask/10 animate-pulse"
                  : "border-terminal-ask/40 text-terminal-ask hover:bg-terminal-ask/10"
              }`}
            >
              {confirming ? "Confirm Cancel All" : "Cancel All"}
            </button>
          )}
        </div>

        {orderList.length === 0 ? (
          <div className="py-8 text-center text-xs text-terminal-muted">No orders</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-terminal-muted border-b border-terminal-border/50">
                  <th className="px-3 py-1.5 text-left font-normal">Time</th>
                  <th className="px-3 py-1.5 text-left font-normal">Symbol</th>
                  <th className="px-3 py-1.5 text-left font-normal">Side</th>
                  <th className="px-3 py-1.5 text-left font-normal">Type</th>
                  <th className="px-3 py-1.5 text-right font-normal">Qty</th>
                  <th className="px-3 py-1.5 text-right font-normal">Filled</th>
                  <th className="px-3 py-1.5 text-right font-normal">Price</th>
                  <th className="px-3 py-1.5 text-left font-normal">Status</th>
                  <th className="px-3 py-1.5 text-left font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderList.map((order) => (
                  <BlotterRow
                    key={order.cl_ord_id}
                    order={order}
                    onCancel={() => onCancel(order.cl_ord_id, order.symbol, order.side)}
                    onModify={() => setModifyingOrder(order)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modifyingOrder && (
        <ModifyOrderModal
          order={modifyingOrder}
          onConfirm={(req) => onModify(modifyingOrder.cl_ord_id, req)}
          onClose={() => setModifyingOrder(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OrderBlotter.tsx frontend/src/components/ModifyOrderModal.tsx
git commit -m "feat: add OrderBlotter and ModifyOrderModal components"
```

---

### Task 8: Update page.tsx layout

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Update `frontend/src/app/page.tsx`** — wire up order entry + blotter:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMarketData } from "@/hooks/useMarketData";
import { useOrderEntry } from "@/hooks/useOrderEntry";
import { api } from "@/lib/api";
import ConnectionStatus from "@/components/ConnectionStatus";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import InstrumentSearch from "@/components/InstrumentSearch";
import PriceDisplay from "@/components/PriceDisplay";
import OrderBook from "@/components/OrderBook";
import Watchlist from "@/components/Watchlist";
import FIXInspector from "@/components/FIXInspector";
import OrderEntry from "@/components/OrderEntry";
import OrderBlotter from "@/components/OrderBlotter";

const STORAGE_KEY = "fix-watchlist";
const QUICK_ADD_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function Home() {
  const {
    orders, lastResult, handleOrderEvent, placeOrder, cancelOrder, modifyOrder, massCancelAll, clearLastResult,
  } = useOrderEntry();

  const {
    orderBooks, fixMessages, error, maintenance, connected, fixConnected, oeConnected, fixConnectedRef, clearError, clearMaintenance,
  } = useMarketData({ onOrderEvent: handleOrderEvent });

  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setWatchlistSymbols(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  const prevFixConnected = useRef(false);
  useEffect(() => {
    if (fixConnected && !prevFixConnected.current && watchlistSymbols.length > 0) {
      for (const symbol of watchlistSymbols) {
        api.subscribe(symbol).catch(() => {});
      }
    }
    prevFixConnected.current = fixConnected;
  }, [fixConnected, watchlistSymbols]);

  const addToWatchlist = useCallback(async (symbol: string) => {
    setWatchlistSymbols((prev) => {
      if (prev.includes(symbol)) return prev;
      return [...prev, symbol];
    });
    setActiveSymbol(symbol);
    try { await api.subscribe(symbol); } catch { /* error via WS */ }
  }, []);

  const removeFromWatchlist = useCallback(async (symbol: string) => {
    setWatchlistSymbols((prev) => prev.filter((s) => s !== symbol));
    if (activeSymbol === symbol) setActiveSymbol(null);
    try { await api.unsubscribe(symbol); } catch { /* ignore */ }
  }, [activeSymbol]);

  const activeBook = activeSymbol ? orderBooks[activeSymbol] : null;

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-panel">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-terminal-text tracking-wide">FIX TRADING PLATFORM</h1>
          <span className="text-xs text-terminal-muted">Binance Testnet</span>
        </div>
        <ConnectionStatus connected={connected} />
      </header>

      <MaintenanceBanner visible={maintenance} onDismiss={clearMaintenance} />

      {error && (
        <div className="flex items-center justify-between px-4 py-2 bg-terminal-ask/10 border-b border-terminal-ask/30">
          <span className="text-sm text-terminal-ask">{error}</span>
          <button onClick={clearError} className="text-xs text-terminal-muted hover:text-terminal-text px-2">Dismiss</button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 flex flex-col gap-2 p-2 border-r border-terminal-border overflow-y-auto">
          <InstrumentSearch onSelect={addToWatchlist} />
          <div className="flex gap-1.5">
            {QUICK_ADD_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                onClick={() => addToWatchlist(symbol)}
                disabled={watchlistSymbols.includes(symbol)}
                className={`flex-1 text-xs font-medium py-1.5 rounded border transition-colors ${
                  watchlistSymbols.includes(symbol)
                    ? "border-terminal-border/50 text-terminal-muted cursor-default"
                    : "border-terminal-accent/50 text-terminal-accent hover:bg-terminal-accent/10 cursor-pointer"
                }`}
              >
                + {symbol.replace("USDT", "")}
              </button>
            ))}
          </div>
          <Watchlist
            symbols={watchlistSymbols}
            orderBooks={orderBooks}
            activeSymbol={activeSymbol}
            onSelect={setActiveSymbol}
            onRemove={removeFromWatchlist}
          />
        </aside>

        {/* Center: OrderBook + Blotter */}
        <main className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto">
          {activeSymbol && activeBook ? (
            <>
              <PriceDisplay symbol={activeSymbol} orderBook={activeBook} />
              <OrderBook orderBook={activeBook} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-terminal-muted">
              <div className="text-center">
                <p className="text-lg mb-2">Select an instrument to view market data</p>
                <p className="text-sm">Search for a trading pair in the left panel</p>
              </div>
            </div>
          )}
          <OrderBlotter
            orders={orders}
            onCancel={cancelOrder}
            onModify={modifyOrder}
            onMassCancel={massCancelAll}
          />
        </main>

        {/* Right: OrderEntry + FIXInspector */}
        <aside className="w-[480px] border-l border-terminal-border flex flex-col overflow-hidden">
          <div className="p-2 border-b border-terminal-border">
            <OrderEntry
              activeSymbol={activeSymbol}
              oeConnected={oeConnected}
              onPlaceOrder={placeOrder}
              lastResult={lastResult}
              onClearResult={clearLastResult}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <FIXInspector messages={fixMessages} />
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm test
```
Expected: all pass.

- [ ] **Step 3: Run backend tests**

```bash
pytest backend/tests/ -v
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: wire OrderEntry and OrderBlotter into main layout"
```

---

## Verification Checklist

- [ ] `uvicorn backend.main:app --reload` — two "FIX session connected" log lines (MD + OE)
- [ ] `GET /api/status` — returns both `state: connected` and `oe_state: connected`
- [ ] Select BTCUSDT from watchlist → OE Connected badge appears in OrderEntry
- [ ] Submit Limit Buy 0.001 BTC @ 50000 → row appears in blotter with Status=New, seen in FIXInspector
- [ ] Click Cancel on blotter row → Status updates to Cancelled
- [ ] Submit Limit order → click Modify → change price → confirm → new ExecutionReport in blotter
- [ ] Click "Cancel All" → confirm dialog (button turns red) → click again → all open orders cancelled
- [ ] Submit Market order → Status=Filled immediately
- [ ] Stop backend → OE Disconnected badge → Submit button disabled
- [ ] `pytest backend/tests/ -v` — all pass
- [ ] `cd frontend && npm test` — all pass
