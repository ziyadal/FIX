# FIX Trading Platform Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based FIX trading platform that connects to Binance's testnet FIX API to display live market data with raw FIX protocol message visibility.

**Architecture:** Three-tier: React/Next.js frontend communicates via WebSocket/REST with a Python/FastAPI backend, which maintains a FIX 4.4 session to Binance testnet over TCP+TLS. The backend wraps `binance_fix_connector` for session management and relays parsed market data and raw FIX messages to the browser in real-time.

**Tech Stack:** Python 3.14+ / FastAPI / uvicorn (backend), React / Next.js / Tailwind CSS (frontend), binance_fix_connector + simplefix (FIX), WebSocket (real-time), pytest (backend tests), Jest + React Testing Library (frontend tests), uv (Python deps), npm (JS deps).

**Spec:** `PROJECT_v1.md` — always consult for detailed requirements.

---

## File Structure

### Backend

| File | Responsibility |
|------|---------------|
| `backend/__init__.py` | Package marker |
| `backend/config.py` | Load settings from `config.ini` (API key, private key path, endpoint) |
| `backend/fix_dictionary.py` | Parse `spot-fix-md.xml` → tag name/description lookups, enum value descriptions |
| `backend/fix_parser.py` | Parse raw FIX `tag=value\x01` byte strings → structured Python dicts with tag names |
| `backend/fix_client.py` | Async wrapper around `binance_fix_connector` session; manages connection lifecycle, message sending, polling loop |
| `backend/websocket_manager.py` | Track connected WebSocket clients; broadcast messages to all clients on a given channel |
| `backend/routes/__init__.py` | Package marker |
| `backend/routes/instruments.py` | `/api/instruments`, `/api/instruments/search` endpoints |
| `backend/routes/market_data.py` | `/api/subscribe`, `/api/unsubscribe`, `/api/status`, `/api/limits` endpoints |
| `backend/main.py` | FastAPI app: mount routes, startup/shutdown hooks for FIX client, WebSocket endpoints |
| `backend/schemas/spot-fix-md.xml` | Binance FIX data dictionary (downloaded from Binance GitHub) |
| `backend/tests/__init__.py` | Package marker |
| `backend/tests/conftest.py` | Shared fixtures: mock FIX messages, test client, mock FIX session |
| `backend/tests/test_fix_dictionary.py` | Tests for tag/enum lookups |
| `backend/tests/test_fix_parser.py` | Tests for message parsing |
| `backend/tests/test_routes.py` | Tests for REST endpoints |
| `backend/tests/test_websocket_manager.py` | Tests for WS broadcast |

### Frontend

| File | Responsibility |
|------|---------------|
| `frontend/src/app/layout.tsx` | Root layout: dark theme, global fonts, metadata |
| `frontend/src/app/page.tsx` | Main page: composes all components into trading terminal layout |
| `frontend/src/app/globals.css` | Tailwind imports + custom CSS variables for trading theme |
| `frontend/src/components/ConnectionStatus.tsx` | Connection indicator (connected/disconnected/reconnecting) |
| `frontend/src/components/MaintenanceBanner.tsx` | Maintenance warning banner when News messages arrive |
| `frontend/src/components/FIXInspector.tsx` | Raw FIX message feed with filtering, expansion, color-coding |
| `frontend/src/components/InstrumentSearch.tsx` | Search bar + results for finding trading pairs |
| `frontend/src/components/PriceDisplay.tsx` | Best bid/ask with spread and price movement indicators |
| `frontend/src/components/OrderBook.tsx` | Depth display: bid/ask levels with visual bars |
| `frontend/src/components/Watchlist.tsx` | Multi-symbol tracking with localStorage persistence |
| `frontend/src/hooks/useWebSocket.ts` | Generic WebSocket hook with auto-reconnect |
| `frontend/src/hooks/useMarketData.ts` | Market data state management: subscriptions, order book, watchlist |
| `frontend/src/lib/api.ts` | REST API client (subscribe, unsubscribe, instruments, status) |
| `frontend/src/lib/fixDictionary.ts` | Client-side FIX tag name lookup for inspector |
| `frontend/src/lib/types.ts` | Shared TypeScript types |

---

## Chunk 1: Project Setup + Backend Core

### Task 1: Project scaffolding and dependencies

**Files:**
- Create: `backend/__init__.py`
- Create: `backend/routes/__init__.py`
- Create: `backend/tests/__init__.py`
- Modify: `pyproject.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Add backend dependencies to pyproject.toml**

Add `fastapi`, `uvicorn[standard]`, `websockets`, `pytest`, `pytest-asyncio`, `httpx` to `pyproject.toml`:

```toml
[project]
name = "fix"
version = "0.1.0"
description = "FIX Trading Platform — Binance testnet market data viewer"
readme = "README.md"
requires-python = ">=3.14"
dependencies = [
    "binance-fix-connector>=1.2.0",
    "cryptography>=46.0.5",
    "simplefix>=1.0.17",
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "websockets>=14.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
]
```

- [ ] **Step 2: Install dependencies**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv sync --all-extras`
Expected: All deps install successfully.

- [ ] **Step 3: Create package init files**

Create empty `backend/__init__.py`, `backend/routes/__init__.py`, `backend/tests/__init__.py`.

- [ ] **Step 4: Update .gitignore**

Add frontend ignores and common patterns:

```
.env
*.pem
config.ini
__pycache__/
*.pyc
.venv/
log/
store/
node_modules/
.next/
frontend/.next/
frontend/node_modules/
```

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml .gitignore backend/__init__.py backend/routes/__init__.py backend/tests/__init__.py
git commit -m "chore: add backend dependencies and package structure"
```

---

### Task 2: Backend config module

**Files:**
- Create: `backend/config.py`

- [ ] **Step 1: Write config.py**

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
    }
```

- [ ] **Step 2: Fix config.ini endpoint**

Change the endpoint in `config.ini` from `fix-oe.testnet.binance.vision` to `fix-md.testnet.binance.vision` (market data, not order entry).

- [ ] **Step 3: Commit**

```bash
git add backend/config.py config.ini
git commit -m "feat: add config module for loading FIX connection settings"
```

---

### Task 3: Download FIX data dictionary

**Files:**
- Create: `backend/schemas/spot-fix-md.xml`

- [ ] **Step 1: Create schemas directory and download XML**

Download the Binance FIX market data dictionary from the official Binance GitHub repository:

```bash
mkdir -p backend/schemas
curl -L "https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/fix/schemas/spot-fix-md.xml" -o backend/schemas/spot-fix-md.xml
```

If the download fails or URL has changed, search the Binance GitHub repo for the file. The XML follows the QuickFIX data dictionary format with `<fix>` root element containing `<header>`, `<messages>`, `<components>`, and `<fields>` sections.

- [ ] **Step 2: Verify the XML is valid**

```bash
python -c "import xml.etree.ElementTree as ET; ET.parse('backend/schemas/spot-fix-md.xml'); print('XML is valid')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/schemas/spot-fix-md.xml
git commit -m "chore: add Binance FIX market data dictionary schema"
```

---

### Task 4: FIX dictionary — tag and enum lookups

**Files:**
- Create: `backend/tests/test_fix_dictionary.py`
- Create: `backend/fix_dictionary.py`

- [ ] **Step 1: Write failing tests**

```python
"""Tests for FIX dictionary tag/enum lookups."""
import pytest
from backend.fix_dictionary import FixDictionary


@pytest.fixture(scope="module")
def dictionary():
    return FixDictionary()


class TestTagLookup:
    def test_known_tag_name(self, dictionary):
        """Standard FIX tags resolve to their names."""
        assert dictionary.get_tag_name(35) == "MsgType"
        assert dictionary.get_tag_name(55) == "Symbol"
        assert dictionary.get_tag_name(269) == "MDEntryType"

    def test_unknown_tag_returns_tag_number(self, dictionary):
        """Unknown tags return 'Tag_NNNNN' string."""
        assert dictionary.get_tag_name(99999) == "Tag_99999"

    def test_tag_name_from_string(self, dictionary):
        """Tags passed as strings are handled."""
        assert dictionary.get_tag_name("35") == "MsgType"


class TestEnumLookup:
    def test_msg_type_enum(self, dictionary):
        """MsgType enum values resolve to descriptions."""
        assert dictionary.get_enum_value(35, "W") == "MarketDataSnapshotFullRefresh"
        assert dictionary.get_enum_value(35, "X") == "MarketDataIncrementalRefresh"
        assert dictionary.get_enum_value(35, "V") == "MarketDataRequest"

    def test_md_entry_type_enum(self, dictionary):
        """MDEntryType enum values resolve."""
        assert dictionary.get_enum_value(269, "0") == "BID"
        assert dictionary.get_enum_value(269, "1") == "OFFER"
        assert dictionary.get_enum_value(269, "2") == "TRADE"

    def test_unknown_enum_returns_raw_value(self, dictionary):
        """Unknown enum values return the raw value."""
        assert dictionary.get_enum_value(35, "ZZZ") == "ZZZ"

    def test_unknown_tag_enum_returns_raw_value(self, dictionary):
        """Enum lookup on unknown tag returns raw value."""
        assert dictionary.get_enum_value(99999, "X") == "X"


class TestDescribeTag:
    def test_describe_returns_full_info(self, dictionary):
        """describe_tag returns tag name, raw value, and human description."""
        result = dictionary.describe_tag(35, "W")
        assert result["tag"] == 35
        assert result["name"] == "MsgType"
        assert result["value"] == "W"
        assert result["description"] == "MarketDataSnapshotFullRefresh"

    def test_describe_non_enum_tag(self, dictionary):
        """Non-enum tags have value as description."""
        result = dictionary.describe_tag(55, "BTCUSDT")
        assert result["name"] == "Symbol"
        assert result["value"] == "BTCUSDT"
        assert result["description"] == "BTCUSDT"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_fix_dictionary.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.fix_dictionary'`

- [ ] **Step 3: Implement fix_dictionary.py**

```python
"""FIX data dictionary — maps tag numbers to names and enum values to descriptions.

Parses the QuickFIX-format XML schema (spot-fix-md.xml) to provide lookups.
"""
import xml.etree.ElementTree as ET
from pathlib import Path

_SCHEMA_PATH = Path(__file__).parent / "schemas" / "spot-fix-md.xml"


class FixDictionary:
    """Lookup service for FIX tag names and enum descriptions."""

    def __init__(self, schema_path: str | Path | None = None):
        self._tag_names: dict[int, str] = {}
        self._enum_values: dict[int, dict[str, str]] = {}
        self._parse(Path(schema_path) if schema_path else _SCHEMA_PATH)

    def _parse(self, path: Path) -> None:
        tree = ET.parse(path)
        root = tree.getroot()
        for field in root.iter("field"):
            tag_num = int(field.attrib["number"])
            tag_name = field.attrib["name"]
            self._tag_names[tag_num] = tag_name
            enums = {}
            for val in field.iter("value"):
                enums[val.attrib["enum"]] = val.attrib["description"]
            if enums:
                self._enum_values[tag_num] = enums

    def get_tag_name(self, tag: int | str) -> str:
        tag_num = int(tag)
        return self._tag_names.get(tag_num, f"Tag_{tag_num}")

    def get_enum_value(self, tag: int | str, value: str) -> str:
        tag_num = int(tag)
        enums = self._enum_values.get(tag_num, {})
        return enums.get(value, value)

    def describe_tag(self, tag: int | str, value: str) -> dict:
        tag_num = int(tag)
        return {
            "tag": tag_num,
            "name": self.get_tag_name(tag_num),
            "value": value,
            "description": self.get_enum_value(tag_num, value),
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_fix_dictionary.py -v`
Expected: All tests PASS. (Note: tests depend on spot-fix-md.xml being present. If tag names don't match exactly, adjust test expectations to match the actual XML content.)

- [ ] **Step 5: Commit**

```bash
git add backend/fix_dictionary.py backend/tests/test_fix_dictionary.py
git commit -m "feat: FIX dictionary with tag name and enum value lookups"
```

---

### Task 5: FIX parser — raw messages to structured dicts

**Files:**
- Create: `backend/tests/test_fix_parser.py`
- Create: `backend/fix_parser.py`

- [ ] **Step 1: Write failing tests**

```python
"""Tests for FIX message parser."""
import pytest
import simplefix
from backend.fix_parser import parse_fix_message, fix_message_to_raw_string


def _build_fix_message(pairs: list[tuple[int, str]]) -> simplefix.FixMessage:
    """Helper to build a FixMessage from tag/value pairs."""
    msg = simplefix.FixMessage()
    for tag, value in pairs:
        msg.append_pair(tag, value)
    return msg


class TestParseFixMessage:
    def test_parse_snapshot_message(self):
        """Parse a MarketDataSnapshot (35=W) message."""
        msg = _build_fix_message([
            (8, "FIX.4.4"),
            (35, "W"),
            (49, "SPOT"),
            (56, "BMDWATCH"),
            (34, "5"),
            (52, "20260316-12:00:00.000"),
            (262, "req-001"),
            (55, "BTCUSDT"),
            (268, "2"),
            (269, "0"), (270, "50000.00"), (271, "1.5"),
            (269, "1"), (270, "50001.00"), (271, "2.0"),
            (10, "128"),
        ])
        result = parse_fix_message(msg)
        assert result["msg_type"] == "W"
        assert result["tags"][262] == "req-001"
        assert result["tags"][55] == "BTCUSDT"
        assert len(result["raw_pairs"]) > 0
        assert all("tag" in p and "value" in p for p in result["raw_pairs"])

    def test_parse_empty_message(self):
        """Parse a message with just header fields."""
        msg = _build_fix_message([
            (8, "FIX.4.4"),
            (35, "0"),
            (34, "1"),
            (10, "000"),
        ])
        result = parse_fix_message(msg)
        assert result["msg_type"] == "0"

    def test_parse_repeating_group(self):
        """Repeating groups are captured as a list."""
        msg = _build_fix_message([
            (8, "FIX.4.4"),
            (35, "W"),
            (34, "1"),
            (268, "2"),
            (269, "0"), (270, "100.00"),
            (269, "1"), (270, "101.00"),
            (10, "000"),
        ])
        result = parse_fix_message(msg)
        assert len(result["raw_pairs"]) >= 6


class TestFixMessageToRawString:
    def test_raw_string_format(self):
        """Encoded message produces pipe-delimited string."""
        msg = _build_fix_message([
            (8, "FIX.4.4"),
            (35, "0"),
            (34, "1"),
            (10, "000"),
        ])
        raw = fix_message_to_raw_string(msg)
        assert "8=FIX.4.4" in raw
        assert "35=0" in raw
        assert "|" in raw

    def test_raw_string_from_bytes(self):
        """Can convert raw byte string to readable format."""
        raw_bytes = b"8=FIX.4.4\x0135=0\x0134=1\x0110=000\x01"
        raw = fix_message_to_raw_string(raw_bytes)
        assert "8=FIX.4.4" in raw
        assert "|" in raw
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_fix_parser.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement fix_parser.py**

```python
"""Parse raw FIX messages into structured Python dicts.

Handles both simplefix.FixMessage objects and raw byte strings.
"""
from __future__ import annotations

import simplefix


def parse_fix_message(msg: simplefix.FixMessage | bytes) -> dict:
    """Parse a FIX message into a structured dict.

    Returns:
        {
            "msg_type": str,       # e.g. "W", "X", "0"
            "tags": dict[int, str], # tag_num → last value (for simple lookup)
            "raw_pairs": list[dict] # [{"tag": int, "value": str}, ...]
        }
    """
    if isinstance(msg, (bytes, bytearray)):
        parser = simplefix.FixParser()
        parser.append_buffer(msg)
        msg = parser.get_message()
        if msg is None:
            return {"msg_type": "", "tags": {}, "raw_pairs": []}

    raw_pairs: list[dict] = []
    tags: dict[int, str] = {}
    msg_type = ""

    for tag_bytes, value_bytes in msg.pairs:
        tag = int(tag_bytes) if isinstance(tag_bytes, (bytes, bytearray)) else int(tag_bytes)
        value = value_bytes.decode("utf-8", errors="replace") if isinstance(value_bytes, (bytes, bytearray)) else str(value_bytes)
        raw_pairs.append({"tag": tag, "value": value})
        tags[tag] = value
        if tag == 35:
            msg_type = value

    return {"msg_type": msg_type, "tags": tags, "raw_pairs": raw_pairs}


def fix_message_to_raw_string(msg: simplefix.FixMessage | bytes) -> str:
    """Convert a FIX message to a human-readable pipe-delimited string.

    SOH bytes (0x01) are replaced with '|' for display.
    """
    if isinstance(msg, simplefix.FixMessage):
        raw = msg.encode()
    elif isinstance(msg, (bytes, bytearray)):
        raw = msg
    else:
        return str(msg)
    return raw.decode("utf-8", errors="replace").replace("\x01", "|").rstrip("|")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_fix_parser.py -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/fix_parser.py backend/tests/test_fix_parser.py
git commit -m "feat: FIX message parser with raw string conversion"
```

---

## Chunk 2: Backend FIX Client + WebSocket Manager

### Task 6: WebSocket manager for broadcasting to frontend

**Files:**
- Create: `backend/tests/test_websocket_manager.py`
- Create: `backend/websocket_manager.py`

- [ ] **Step 1: Write failing tests**

```python
"""Tests for WebSocket connection manager."""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_websocket_manager.py -v`
Expected: FAIL

- [ ] **Step 3: Implement websocket_manager.py**

```python
"""Manage WebSocket connections and broadcast messages to frontend clients."""
from __future__ import annotations

import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Track connected WebSocket clients per channel and broadcast messages."""

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_websocket_manager.py -v`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/websocket_manager.py backend/tests/test_websocket_manager.py
git commit -m "feat: WebSocket manager for multi-channel client broadcasting"
```

---

### Task 7: FIX client — async wrapper around binance_fix_connector

**Files:**
- Create: `backend/fix_client.py`

This is the core FIX session manager. It wraps `binance_fix_connector` to:
- Create and manage a market data session
- Run a background polling loop (asyncio) that reads messages from the connector's queue
- Parse messages and broadcast them to WebSocket clients
- Send market data requests (subscribe/unsubscribe/instrument list)
- Handle reconnection, News messages, and Reject messages

Key design decisions:
- The `binance_fix_connector` is synchronous (uses threads internally). We use `asyncio.to_thread()` for blocking calls.
- A polling loop runs every 100ms, calling `get_all_new_messages_received()` and processing results.
- State (subscriptions, instruments, order book) is held in-memory.

- [ ] **Step 1: Implement fix_client.py**

```python
"""Async FIX session manager wrapping binance_fix_connector.

Manages session lifecycle, message polling, and market data subscriptions.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from enum import Enum

import simplefix
from binance_fix_connector.fix_connector import (
    create_market_data_session,
    FixMessage,
    FixTags,
)
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


class FixClient:
    """Async FIX client for Binance testnet market data."""

    def __init__(self, ws_manager: WebSocketManager):
        self._ws_manager = ws_manager
        self._session = None
        self._poll_task: asyncio.Task | None = None
        self._state = ConnectionState.DISCONNECTED
        self._subscriptions: dict[str, str] = {}  # symbol → MDReqID
        self._instruments: list[dict] = []
        self._order_books: dict[str, dict] = {}  # symbol → {"bids": [...], "asks": [...]}
        self._maintenance_warning = False
        self._config: dict = {}

    @property
    def state(self) -> ConnectionState:
        return self._state

    @property
    def instruments(self) -> list[dict]:
        return self._instruments

    @property
    def subscriptions(self) -> dict[str, str]:
        return self._subscriptions

    def get_order_book(self, symbol: str) -> dict:
        return self._order_books.get(symbol, {"bids": [], "asks": []})

    @property
    def maintenance_warning(self) -> bool:
        return self._maintenance_warning

    async def connect(self) -> None:
        """Connect to Binance FIX testnet."""
        self._state = ConnectionState.CONNECTING
        self._config = load_config()
        try:
            private_key = get_private_key(self._config["private_key_path"])
            self._session = await asyncio.to_thread(
                create_market_data_session,
                api_key=self._config["api_key"],
                private_key=private_key,
                endpoint=self._config["endpoint"],
            )
            self._state = ConnectionState.CONNECTED
            logger.info("FIX session connected")
            self._poll_task = asyncio.create_task(self._poll_messages())
        except Exception:
            self._state = ConnectionState.DISCONNECTED
            logger.exception("Failed to connect FIX session")
            raise

    async def disconnect(self) -> None:
        """Disconnect from Binance FIX."""
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        if self._session:
            try:
                await asyncio.to_thread(self._session.disconnect)
            except Exception:
                logger.exception("Error during disconnect")
        self._session = None
        self._state = ConnectionState.DISCONNECTED
        self._subscriptions.clear()
        logger.info("FIX session disconnected")

    async def _poll_messages(self) -> None:
        """Background loop: poll connector queue and process messages."""
        while True:
            try:
                if self._session:
                    messages = await asyncio.to_thread(
                        self._session.get_all_new_messages_received
                    )
                    for msg in messages:
                        await self._handle_message(msg)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in message polling loop")
            await asyncio.sleep(0.1)

    async def _handle_message(self, msg: FixMessage) -> None:
        """Route a received FIX message to the appropriate handler."""
        parsed = parse_fix_message(msg)
        raw_str = fix_message_to_raw_string(msg)
        msg_type = parsed["msg_type"]

        # Broadcast raw message to FIX inspector
        await self._ws_manager.broadcast("fix-messages", {
            "direction": "server",
            "raw": raw_str,
            "parsed": parsed["raw_pairs"],
            "msg_type": msg_type,
            "timestamp": parsed["tags"].get(52, ""),
        })

        # Route by message type
        if msg_type == "W":  # MarketDataSnapshotFullRefresh
            await self._handle_snapshot(parsed)
        elif msg_type == "X":  # MarketDataIncrementalRefresh
            await self._handle_incremental(parsed)
        elif msg_type == "y":  # InstrumentListResponse
            self._handle_instrument_list(parsed)
        elif msg_type == "Y":  # MarketDataRequestReject
            await self._handle_md_reject(parsed)
        elif msg_type == "B":  # News (maintenance)
            self._maintenance_warning = True
            logger.warning("Maintenance warning: %s", parsed["tags"].get(148, ""))
            await self._ws_manager.broadcast("market-data", {
                "type": "maintenance",
                "headline": parsed["tags"].get(148, "Server maintenance"),
            })
        elif msg_type == "3":  # Reject
            logger.error("Reject: reason=%s ref_tag=%s",
                         parsed["tags"].get(373, "?"), parsed["tags"].get(371, "?"))

    async def _handle_snapshot(self, parsed: dict) -> None:
        """Process MarketDataSnapshotFullRefresh — build initial order book."""
        tags = parsed["tags"]
        symbol = tags.get(55, "")
        if not symbol:
            return

        bids, asks = [], []
        current_entry: dict = {}
        for pair in parsed["raw_pairs"]:
            t, v = pair["tag"], pair["value"]
            if t == 269:  # MDEntryType
                if current_entry:
                    if current_entry.get("side") == "0":
                        bids.append(current_entry)
                    elif current_entry.get("side") == "1":
                        asks.append(current_entry)
                current_entry = {"side": v}
            elif t == 270:  # MDEntryPx
                current_entry["price"] = v
            elif t == 271:  # MDEntrySize
                current_entry["qty"] = v
        # Don't forget last entry
        if current_entry:
            if current_entry.get("side") == "0":
                bids.append(current_entry)
            elif current_entry.get("side") == "1":
                asks.append(current_entry)

        self._order_books[symbol] = {"bids": bids, "asks": asks}
        await self._ws_manager.broadcast("market-data", {
            "type": "snapshot",
            "symbol": symbol,
            "bids": bids,
            "asks": asks,
        })

    async def _handle_incremental(self, parsed: dict) -> None:
        """Process MarketDataIncrementalRefresh — update order book state."""
        symbol = parsed["tags"].get(55, "")
        updates = []
        current: dict = {}
        for pair in parsed["raw_pairs"]:
            t, v = pair["tag"], pair["value"]
            if t == 279:  # MDUpdateAction
                if current:
                    updates.append(current)
                current = {"action": v}
            elif t == 269:  # MDEntryType
                current["side"] = v
            elif t == 270:  # MDEntryPx
                current["price"] = v
            elif t == 271:  # MDEntrySize
                current["qty"] = v
            elif t == 55:   # Symbol (within repeating group)
                current["symbol"] = v
                if not symbol:
                    symbol = v

        if current:
            updates.append(current)

        if symbol and symbol in self._order_books:
            book = self._order_books[symbol]
            for u in updates:
                side_key = "bids" if u.get("side") == "0" else "asks"
                action = u.get("action", "0")
                price = u.get("price", "")
                if action == "0":  # NEW
                    book[side_key].append({"side": u.get("side", ""), "price": price, "qty": u.get("qty", "0")})
                elif action == "1":  # CHANGE
                    for entry in book[side_key]:
                        if entry.get("price") == price:
                            entry["qty"] = u.get("qty", "0")
                            break
                elif action == "2":  # DELETE
                    book[side_key] = [e for e in book[side_key] if e.get("price") != price]

        await self._ws_manager.broadcast("market-data", {
            "type": "update",
            "symbol": symbol,
            "updates": updates,
        })

    def _handle_instrument_list(self, parsed: dict) -> None:
        """Process InstrumentList response — store instrument info."""
        instruments = []
        current: dict = {}
        for pair in parsed["raw_pairs"]:
            t, v = pair["tag"], pair["value"]
            if t == 55:  # Symbol
                if current:
                    instruments.append(current)
                current = {"symbol": v}
            elif t == 15:  # Currency
                current["currency"] = v
            elif t == 6215:  # BaseCurrency (Binance custom)
                current["base_currency"] = v
            elif t == 562:  # MinTradeVol
                current["min_trade_vol"] = v
            elif t == 1140:  # MaxTradeVol
                current["max_trade_vol"] = v
            elif t == 969:  # MinPriceIncrement
                current["tick_size"] = v
        if current:
            instruments.append(current)
        self._instruments = instruments
        logger.info("Loaded %d instruments", len(instruments))

    async def _handle_md_reject(self, parsed: dict) -> None:
        """Process MarketDataRequestReject."""
        tags = parsed["tags"]
        error_code = tags.get(25016, "")
        error_text = tags.get(58, "Unknown error")
        req_id = tags.get(262, "")
        logger.error("MarketDataRequestReject: req=%s code=%s text=%s",
                     req_id, error_code, error_text)
        await self._ws_manager.broadcast("market-data", {
            "type": "error",
            "error": error_text,
            "error_code": error_code,
            "req_id": req_id,
        })

    def _send_and_broadcast(self, msg: FixMessage) -> None:
        """Send message and broadcast to FIX inspector."""
        if not self._session:
            return
        self._session.send_message(msg)

    async def _send_message(self, msg: FixMessage) -> None:
        """Async wrapper to send a FIX message and broadcast it."""
        raw_before = fix_message_to_raw_string(msg)
        parsed_before = parse_fix_message(msg)
        await asyncio.to_thread(self._send_and_broadcast, msg)
        await self._ws_manager.broadcast("fix-messages", {
            "direction": "client",
            "raw": raw_before,
            "parsed": parsed_before["raw_pairs"],
            "msg_type": parsed_before["msg_type"],
            "timestamp": parsed_before["tags"].get(52, ""),
        })

    async def request_instrument_list(self) -> None:
        """Send InstrumentListRequest (35=x) to get all available symbols."""
        if not self._session:
            raise RuntimeError("Not connected")
        msg = self._session.create_fix_message_with_basic_header("x")
        msg.append_pair(320, str(uuid.uuid4())[:8])  # SecurityReqID
        msg.append_pair(559, "4")  # SecurityListRequestType=4 (ALL)
        await self._send_message(msg)

    async def subscribe(self, symbol: str, depth: int = 10) -> str:
        """Subscribe to market data for a symbol. Returns MDReqID."""
        if not self._session:
            raise RuntimeError("Not connected")
        if symbol in self._subscriptions:
            return self._subscriptions[symbol]

        req_id = f"md-{symbol}-{uuid.uuid4().hex[:6]}"
        msg = self._session.create_fix_message_with_basic_header("V")
        msg.append_pair(262, req_id)        # MDReqID
        msg.append_pair(263, "1")           # SubscriptionRequestType=SNAPSHOT_PLUS_UPDATES
        msg.append_pair(264, str(depth))    # MarketDepth
        msg.append_pair(266, "Y")           # AggregatedBook
        msg.append_pair(146, "1")           # NoRelatedSym
        msg.append_pair(55, symbol)         # Symbol
        msg.append_pair(267, "2")           # NoMDEntryTypes
        msg.append_pair(269, "0")           # MDEntryType=BID
        msg.append_pair(269, "1")           # MDEntryType=OFFER
        await self._send_message(msg)
        self._subscriptions[symbol] = req_id
        return req_id

    async def unsubscribe(self, symbol: str) -> None:
        """Unsubscribe from market data for a symbol."""
        if not self._session:
            raise RuntimeError("Not connected")
        req_id = self._subscriptions.pop(symbol, None)
        if not req_id:
            return
        msg = self._session.create_fix_message_with_basic_header("V")
        msg.append_pair(262, req_id)   # MDReqID (must match original)
        msg.append_pair(263, "2")      # SubscriptionRequestType=UNSUBSCRIBE
        msg.append_pair(264, "1")      # MarketDepth
        await self._send_message(msg)
        self._order_books.pop(symbol, None)

    async def request_limits(self) -> None:
        """Send LimitQuery (35=XLQ) to check rate limits."""
        if not self._session:
            raise RuntimeError("Not connected")
        msg = self._session.create_fix_message_with_basic_header("XLQ")
        await self._send_message(msg)
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run python -c "from backend.fix_client import FixClient; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/fix_client.py
git commit -m "feat: async FIX client with session management, subscriptions, and order book state"
```

---

## Chunk 3: Backend FastAPI App + Routes

### Task 8: Test fixtures (conftest.py)

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Write shared test fixtures**

```python
"""Shared test fixtures for backend tests."""
import pytest
import simplefix
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient


def build_fix_message(pairs: list[tuple[int, str]]) -> simplefix.FixMessage:
    """Build a FixMessage from tag/value pairs."""
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/tests/conftest.py
git commit -m "chore: add shared test fixtures for backend tests"
```

---

### Task 9: Instrument routes

**Files:**
- Create: `backend/routes/instruments.py`
- Add to: `backend/tests/test_routes.py`

- [ ] **Step 1: Write failing tests for instrument endpoints**

```python
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
        assert len(data["instruments"]) == 3  # returns all
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_routes.py::TestInstrumentRoutes -v`
Expected: FAIL

- [ ] **Step 3: Implement instrument routes**

```python
"""Instrument search and listing endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api", tags=["instruments"])

# fix_client is injected via app state at startup
_fix_client = None


def init_router(fix_client) -> None:
    global _fix_client
    _fix_client = fix_client


@router.get("/instruments")
async def get_instruments():
    """List all available instruments. Triggers instrument list request if needed."""
    if not _fix_client.instruments:
        await _fix_client.request_instrument_list()
    return {"instruments": _fix_client.instruments}


@router.get("/instruments/search")
async def search_instruments(q: str = Query(default="")):
    """Search instruments by symbol name (client-side filter on cached list)."""
    instruments = _fix_client.instruments
    if q:
        q_upper = q.upper()
        instruments = [i for i in instruments if q_upper in i.get("symbol", "").upper()]
    return {"instruments": instruments}
```

- [ ] **Step 4: Implement market_data routes**

```python
"""Market data subscribe/unsubscribe and status endpoints."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["market_data"])

_fix_client = None


def init_router(fix_client) -> None:
    global _fix_client
    _fix_client = fix_client


class SubscribeRequest(BaseModel):
    symbol: str
    depth: int = 10


class UnsubscribeRequest(BaseModel):
    symbol: str


@router.post("/subscribe")
async def subscribe(req: SubscribeRequest):
    """Subscribe to market data for a symbol."""
    req_id = await _fix_client.subscribe(req.symbol, req.depth)
    return {"status": "subscribed", "symbol": req.symbol, "req_id": req_id}


@router.post("/unsubscribe")
async def unsubscribe(req: UnsubscribeRequest):
    """Unsubscribe from market data for a symbol."""
    await _fix_client.unsubscribe(req.symbol)
    return {"status": "unsubscribed", "symbol": req.symbol}


@router.get("/status")
async def get_status():
    """Get FIX connection status."""
    return {
        "state": _fix_client.state if hasattr(_fix_client.state, 'value') else _fix_client.state,
        "subscriptions": list(_fix_client.subscriptions.keys()),
        "maintenance_warning": _fix_client.maintenance_warning,
    }


@router.get("/limits")
async def get_limits():
    """Trigger a rate limit query."""
    await _fix_client.request_limits()
    return {"status": "limit_query_sent"}
```

- [ ] **Step 5: Add market data route tests**

Append to `backend/tests/test_routes.py`:

```python
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
```

- [ ] **Step 6: Run tests to verify they fail (routes not yet wired)**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_routes.py -v`
Expected: FAIL — need `create_app` in `main.py`.

- [ ] **Step 7: Commit routes**

```bash
git add backend/routes/instruments.py backend/routes/market_data.py backend/tests/test_routes.py
git commit -m "feat: REST routes for instruments and market data"
```

---

### Task 10: FastAPI main app with WebSocket endpoints

**Files:**
- Create: `backend/main.py`

- [ ] **Step 1: Implement main.py**

```python
"""FastAPI application — entry point for the FIX Trading Platform backend."""
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
        # Startup: connect FIX session (skip if mock/test client)
        if hasattr(fix_client, 'connect') and not hasattr(fix_client, '_mock_name'):
            try:
                await fix_client.connect()
            except Exception:
                logger.exception("Failed to connect FIX session on startup")
        yield
        # Shutdown: disconnect FIX session
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

    # Initialize route modules with the FIX client
    instruments_route.init_router(fix_client)
    market_data_route.init_router(fix_client)

    app.include_router(instruments_route.router)
    app.include_router(market_data_route.router)

    @app.websocket("/ws/market-data")
    async def ws_market_data(websocket: WebSocket):
        await ws_manager.connect(websocket, "market-data")
        try:
            while True:
                await websocket.receive_text()  # Keep alive
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


# Default app instance for `uvicorn backend.main:app`
app = create_app()
```

- [ ] **Step 2: Run all route tests**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/test_routes.py -v`
Expected: All PASS.

- [ ] **Step 3: Run full backend test suite**

Run: `cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/ -v`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "feat: FastAPI app with CORS, WebSocket endpoints, and lifespan hooks"
```

---

## Chunk 4: Frontend Setup + Design System

### Task 11: Initialize Next.js frontend

**Files:**
- Create: `frontend/` (via `create-next-app`)

- [ ] **Step 1: Create Next.js app**

```bash
cd /c/Users/Ziyad/Desktop/FIX
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm
```

Accept defaults. This creates the full Next.js project structure.

- [ ] **Step 2: Install additional dependencies**

```bash
cd /c/Users/Ziyad/Desktop/FIX/frontend
npm install @testing-library/react @testing-library/jest-dom jest jest-environment-jsdom @types/jest ts-jest --save-dev
```

- [ ] **Step 3: Configure Jest**

Create `frontend/jest.config.ts`:

```typescript
import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterSetup: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default createJestConfig(config);
```

Create `frontend/jest.setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

Add to `frontend/package.json` scripts:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add frontend/
git commit -m "chore: initialize Next.js frontend with TypeScript, Tailwind, and Jest"
```

---

### Task 12: Dark trading terminal theme + layout

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: Configure Tailwind for trading terminal theme**

Update `frontend/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0a0e17",
          panel: "#111827",
          border: "#1e293b",
          text: "#e2e8f0",
          muted: "#64748b",
          bid: "#22c55e",
          ask: "#ef4444",
          accent: "#3b82f6",
          warning: "#f59e0b",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "Consolas", "monospace"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Set up global styles**

Replace `frontend/src/app/globals.css`:

```css
@import "tailwindcss";

@layer base {
  body {
    @apply bg-terminal-bg text-terminal-text font-sans antialiased;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    @apply bg-terminal-bg;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-terminal-border rounded;
  }
}
```

- [ ] **Step 3: Set up root layout**

Replace `frontend/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FIX Trading Platform",
  description: "Binance testnet market data via FIX protocol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify dev server starts**

```bash
cd /c/Users/Ziyad/Desktop/FIX/frontend && npm run dev
```

Expected: Dev server starts on http://localhost:3000 with dark background.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add frontend/tailwind.config.ts frontend/src/app/globals.css frontend/src/app/layout.tsx
git commit -m "feat: dark trading terminal theme with custom colors and typography"
```

---

### Task 13: TypeScript types and API client

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/fixDictionary.ts`

- [ ] **Step 1: Define shared types**

```typescript
// frontend/src/lib/types.ts

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

export interface MarketDataUpdate {
  type: "snapshot" | "update" | "error" | "maintenance";
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
}

export type ConnectionState = "connected" | "disconnected" | "connecting" | "reconnecting";
```

- [ ] **Step 2: Create REST API client**

```typescript
// frontend/src/lib/api.ts

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
    fetchJSON<{ state: string; subscriptions: string[]; maintenance_warning: boolean }>(
      "/api/status"
    ),

  getLimits: () =>
    fetchJSON<{ status: string }>("/api/limits"),
};
```

- [ ] **Step 3: Create client-side FIX dictionary**

```typescript
// frontend/src/lib/fixDictionary.ts

/** Common FIX tag names for the inspector display. */
const TAG_NAMES: Record<number, string> = {
  8: "BeginString", 9: "BodyLength", 10: "Checksum",
  34: "MsgSeqNum", 35: "MsgType", 49: "SenderCompID",
  52: "SendingTime", 55: "Symbol", 56: "TargetCompID", 58: "Text",
  98: "EncryptMethod", 108: "HeartBtInt", 112: "TestReqID",
  141: "ResetSeqNumFlag", 146: "NoRelatedSym", 148: "Headline",
  262: "MDReqID", 263: "SubscriptionRequestType", 264: "MarketDepth",
  266: "AggregatedBook", 267: "NoMDEntryTypes", 268: "NoMDEntries",
  269: "MDEntryType", 270: "MDEntryPx", 271: "MDEntrySize",
  279: "MDUpdateAction", 320: "SecurityReqID",
  371: "RefTagID", 372: "RefMsgType", 373: "SessionRejectReason",
  553: "Username", 559: "SecurityListRequestType",
  562: "MinTradeVol", 893: "LastFragment", 969: "MinPriceIncrement",
  1140: "MaxTradeVol",
  25016: "ErrorCode", 25000: "RecvWindow",
};

const MSG_TYPE_NAMES: Record<string, string> = {
  "0": "Heartbeat", "1": "TestRequest", "3": "Reject",
  "5": "Logout", "A": "Logon", "B": "News",
  "V": "MarketDataRequest", "W": "MarketDataSnapshotFullRefresh",
  "X": "MarketDataIncrementalRefresh", "Y": "MarketDataRequestReject",
  "x": "SecurityListRequest", "y": "SecurityList",
  "XLQ": "LimitQuery", "XLR": "LimitResponse",
};

const MD_ENTRY_TYPES: Record<string, string> = {
  "0": "BID", "1": "OFFER", "2": "TRADE",
};

const MD_UPDATE_ACTIONS: Record<string, string> = {
  "0": "NEW", "1": "CHANGE", "2": "DELETE",
};

export function getTagName(tag: number): string {
  return TAG_NAMES[tag] || `Tag_${tag}`;
}

export function getMsgTypeName(value: string): string {
  return MSG_TYPE_NAMES[value] || value;
}

export function describeTagValue(tag: number, value: string): string {
  if (tag === 35) return MSG_TYPE_NAMES[value] || value;
  if (tag === 269) return MD_ENTRY_TYPES[value] || value;
  if (tag === 279) return MD_UPDATE_ACTIONS[value] || value;
  return value;
}
```

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add frontend/src/lib/
git commit -m "feat: TypeScript types, REST API client, and FIX dictionary for frontend"
```

---

### Task 14: WebSocket hooks

**Files:**
- Create: `frontend/src/hooks/useWebSocket.ts`
- Create: `frontend/src/hooks/useMarketData.ts`

- [ ] **Step 1: Implement generic WebSocket hook**

```typescript
// frontend/src/hooks/useWebSocket.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function useWebSocket<T>(
  path: string,
  onMessage: (data: T) => void
) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}${path}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        onMessageRef.current(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
```

- [ ] **Step 2: Implement market data hook**

```typescript
// frontend/src/hooks/useMarketData.ts
"use client";

import { useState, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import type {
  FIXMessage,
  MarketDataUpdate,
  OrderBook,
  ConnectionState,
} from "@/lib/types";

const MAX_FIX_MESSAGES = 500;

export function useMarketData() {
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBook>>({});
  const [fixMessages, setFixMessages] = useState<FIXMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);

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
            // NEW
            newBook[sideKey].push({ side: u.side || "", price: u.price || "", qty: u.qty || "" });
          } else if (u.action === "1") {
            // CHANGE
            const idx = newBook[sideKey].findIndex((e) => e.price === u.price);
            if (idx >= 0) newBook[sideKey][idx] = { ...newBook[sideKey][idx], qty: u.qty || "0" };
          } else if (u.action === "2") {
            // DELETE
            newBook[sideKey] = newBook[sideKey].filter((e) => e.price !== u.price);
          }
        }
        return { ...prev, [data.symbol!]: newBook };
      });
    } else if (data.type === "error") {
      setError(data.error || "Unknown error");
    } else if (data.type === "maintenance") {
      setMaintenance(true);
    }
  }, []);

  const handleFixMessage = useCallback((data: FIXMessage) => {
    setFixMessages((prev) => {
      const next = [...prev, data];
      return next.length > MAX_FIX_MESSAGES ? next.slice(-MAX_FIX_MESSAGES) : next;
    });
  }, []);

  const { connected: mdConnected } = useWebSocket<MarketDataUpdate>(
    "/ws/market-data",
    handleMarketData
  );

  const { connected: fixConnected } = useWebSocket<FIXMessage>(
    "/ws/fix-messages",
    handleFixMessage
  );

  const clearError = useCallback(() => setError(null), []);
  const clearMaintenance = useCallback(() => setMaintenance(false), []);

  return {
    orderBooks,
    fixMessages,
    error,
    maintenance,
    connected: mdConnected && fixConnected,
    clearError,
    clearMaintenance,
  };
}
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add frontend/src/hooks/
git commit -m "feat: WebSocket hooks for real-time market data and FIX messages"
```

---

## Chunk 5: Frontend Components

### Task 15: ConnectionStatus component

**Files:**
- Create: `frontend/src/components/ConnectionStatus.tsx`

- [ ] **Step 1: Implement ConnectionStatus**

```tsx
"use client";

interface ConnectionStatusProps {
  connected: boolean;
}

export default function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-terminal-panel border border-terminal-border">
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          connected
            ? "bg-terminal-bid shadow-[0_0_6px_rgba(34,197,94,0.5)]"
            : "bg-terminal-ask shadow-[0_0_6px_rgba(239,68,68,0.5)]"
        }`}
      />
      <span className="text-xs font-medium text-terminal-muted">
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ConnectionStatus.tsx
git commit -m "feat: ConnectionStatus indicator component"
```

---

### Task 16: MaintenanceBanner component

**Files:**
- Create: `frontend/src/components/MaintenanceBanner.tsx`

- [ ] **Step 1: Implement MaintenanceBanner**

```tsx
"use client";

interface MaintenanceBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function MaintenanceBanner({ visible, onDismiss }: MaintenanceBannerProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-terminal-warning/10 border border-terminal-warning/30 rounded-md">
      <div className="flex items-center gap-2">
        <span className="text-terminal-warning text-sm font-medium">
          Server maintenance scheduled — connection may be interrupted
        </span>
      </div>
      <button
        onClick={onDismiss}
        className="text-terminal-muted hover:text-terminal-text text-xs px-2 py-1"
      >
        Dismiss
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/MaintenanceBanner.tsx
git commit -m "feat: MaintenanceBanner component for server maintenance warnings"
```

---

### Task 17: FIX Inspector panel

**Files:**
- Create: `frontend/src/components/FIXInspector.tsx`

- [ ] **Step 1: Implement FIXInspector**

This is the most important frontend component for demonstrating FIX protocol knowledge.

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import type { FIXMessage, FIXMessagePair } from "@/lib/types";
import { getTagName, getMsgTypeName, describeTagValue } from "@/lib/fixDictionary";

interface FIXInspectorProps {
  messages: FIXMessage[];
}

type FilterDirection = "all" | "client" | "server";
type FilterCategory = "all" | "admin" | "market_data";

const ADMIN_TYPES = new Set(["0", "1", "3", "5", "A", "B"]);

export default function FIXInspector({ messages }: FIXInspectorProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [hideHeartbeats, setHideHeartbeats] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<FilterDirection>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const filtered = messages.filter((m) => {
    if (hideHeartbeats && (m.msg_type === "0" || m.msg_type === "1")) return false;
    if (directionFilter !== "all" && m.direction !== directionFilter) return false;
    if (categoryFilter === "admin" && !ADMIN_TYPES.has(m.msg_type)) return false;
    if (categoryFilter === "market_data" && ADMIN_TYPES.has(m.msg_type)) return false;
    if (searchTerm && !m.raw.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  return (
    <div className="flex flex-col h-full bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border">
        <h2 className="text-sm font-semibold text-terminal-text">FIX Message Inspector</h2>
        <span className="text-xs text-terminal-muted">{filtered.length} messages</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-terminal-border">
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as FilterDirection)}
          className="text-xs bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text"
        >
          <option value="all">All Directions</option>
          <option value="client">Client → Server</option>
          <option value="server">Server → Client</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as FilterCategory)}
          className="text-xs bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text"
        >
          <option value="all">All Types</option>
          <option value="admin">Admin</option>
          <option value="market_data">Market Data</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-terminal-muted cursor-pointer">
          <input
            type="checkbox"
            checked={hideHeartbeats}
            onChange={(e) => setHideHeartbeats(e.target.checked)}
            className="rounded border-terminal-border"
          />
          Hide heartbeats
        </label>

        <input
          type="text"
          placeholder="Search tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-xs bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text placeholder-terminal-muted flex-1 min-w-[120px]"
        />
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-terminal-muted">
            Waiting for FIX messages...
          </div>
        ) : (
          filtered.map((msg, i) => (
            <MessageRow
              key={i}
              message={msg}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  expanded,
  onToggle,
}: {
  message: FIXMessage;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dirColor = message.direction === "server" ? "text-terminal-bid" : "text-terminal-accent";
  const dirLabel = message.direction === "server" ? "←" : "→";
  const msgName = getMsgTypeName(message.msg_type);

  return (
    <div className="border-b border-terminal-border/50">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-1.5 hover:bg-terminal-bg/50 transition-colors flex items-center gap-2"
      >
        <span className={`${dirColor} w-3 shrink-0`}>{dirLabel}</span>
        <span className="text-terminal-muted shrink-0 w-20">
          {message.timestamp ? message.timestamp.split("-").pop()?.split(".")[0] || "" : ""}
        </span>
        <span className="text-terminal-warning font-medium shrink-0 w-6">{message.msg_type}</span>
        <span className="text-terminal-text shrink-0">{msgName}</span>
        <span className="text-terminal-muted truncate ml-auto">{message.raw.slice(0, 80)}</span>
      </button>

      {expanded && (
        <div className="px-8 py-2 bg-terminal-bg/30">
          <table className="w-full">
            <thead>
              <tr className="text-terminal-muted">
                <th className="text-left pr-3 py-0.5 font-normal">Tag</th>
                <th className="text-left pr-3 py-0.5 font-normal">Name</th>
                <th className="text-left pr-3 py-0.5 font-normal">Value</th>
                <th className="text-left py-0.5 font-normal">Description</th>
              </tr>
            </thead>
            <tbody>
              {message.parsed.map((pair, j) => (
                <tr key={j} className="hover:bg-terminal-border/20">
                  <td className="pr-3 py-0.5 text-terminal-muted">{pair.tag}</td>
                  <td className="pr-3 py-0.5 text-terminal-accent">{getTagName(pair.tag)}</td>
                  <td className="pr-3 py-0.5 text-terminal-text">{pair.value}</td>
                  <td className="py-0.5 text-terminal-muted">
                    {describeTagValue(pair.tag, pair.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/FIXInspector.tsx
git commit -m "feat: FIX Inspector panel with filtering, expansion, and color-coded messages"
```

---

### Task 18: InstrumentSearch component

**Files:**
- Create: `frontend/src/components/InstrumentSearch.tsx`

- [ ] **Step 1: Implement InstrumentSearch**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Instrument } from "@/lib/types";
import { api } from "@/lib/api";

interface InstrumentSearchProps {
  onSelect: (symbol: string) => void;
}

export default function InstrumentSearch({ onSelect }: InstrumentSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = q
        ? await api.searchInstruments(q)
        : await api.getInstruments();
      setResults(data.instruments);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="flex flex-col bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-terminal-border">
        <input
          type="text"
          placeholder="Search instruments... (e.g. BTC)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full text-sm bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-terminal-text placeholder-terminal-muted focus:outline-none focus:border-terminal-accent"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 border-2 border-terminal-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-8 text-sm text-terminal-muted">
            {query ? "No instruments found" : "Type to search instruments"}
          </div>
        ) : (
          results.map((inst) => (
            <button
              key={inst.symbol}
              onClick={() => onSelect(inst.symbol)}
              className="w-full text-left px-4 py-2 hover:bg-terminal-bg/50 transition-colors border-b border-terminal-border/30 flex items-center justify-between"
            >
              <div>
                <span className="text-sm font-medium text-terminal-text">{inst.symbol}</span>
                {inst.base_currency && inst.currency && (
                  <span className="text-xs text-terminal-muted ml-2">
                    {inst.base_currency}/{inst.currency}
                  </span>
                )}
              </div>
              {inst.tick_size && (
                <span className="text-xs text-terminal-muted">tick: {inst.tick_size}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/InstrumentSearch.tsx
git commit -m "feat: InstrumentSearch component with debounced search"
```

---

### Task 19: PriceDisplay component

**Files:**
- Create: `frontend/src/components/PriceDisplay.tsx`

- [ ] **Step 1: Implement PriceDisplay**

```tsx
"use client";

import { useRef, useEffect, useState } from "react";
import type { OrderBook } from "@/lib/types";

interface PriceDisplayProps {
  symbol: string;
  orderBook: OrderBook;
}

export default function PriceDisplay({ symbol, orderBook }: PriceDisplayProps) {
  const bestBid = orderBook.bids[0];
  const bestAsk = orderBook.asks[0];
  const [bidFlash, setBidFlash] = useState<"up" | "down" | null>(null);
  const [askFlash, setAskFlash] = useState<"up" | "down" | null>(null);
  const prevBid = useRef(bestBid?.price);
  const prevAsk = useRef(bestAsk?.price);

  useEffect(() => {
    if (bestBid?.price && prevBid.current && bestBid.price !== prevBid.current) {
      setBidFlash(parseFloat(bestBid.price) > parseFloat(prevBid.current) ? "up" : "down");
      const t = setTimeout(() => setBidFlash(null), 400);
      prevBid.current = bestBid.price;
      return () => clearTimeout(t);
    }
    prevBid.current = bestBid?.price;
  }, [bestBid?.price]);

  useEffect(() => {
    if (bestAsk?.price && prevAsk.current && bestAsk.price !== prevAsk.current) {
      setAskFlash(parseFloat(bestAsk.price) > parseFloat(prevAsk.current) ? "up" : "down");
      const t = setTimeout(() => setAskFlash(null), 400);
      prevAsk.current = bestAsk.price;
      return () => clearTimeout(t);
    }
    prevAsk.current = bestAsk?.price;
  }, [bestAsk?.price]);

  const spread =
    bestBid && bestAsk
      ? (parseFloat(bestAsk.price) - parseFloat(bestBid.price)).toFixed(2)
      : "—";

  const flashClass = (flash: "up" | "down" | null) =>
    flash === "up"
      ? "bg-terminal-bid/20 transition-colors"
      : flash === "down"
      ? "bg-terminal-ask/20 transition-colors"
      : "transition-colors";

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4">
      <h2 className="text-lg font-semibold text-terminal-text mb-3">{symbol}</h2>
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-md p-3 ${flashClass(bidFlash)}`}>
          <div className="text-xs text-terminal-muted mb-1">Best Bid</div>
          <div className="text-xl font-mono font-bold text-terminal-bid">
            {bestBid?.price || "—"}
          </div>
          <div className="text-xs font-mono text-terminal-muted mt-1">
            Qty: {bestBid?.qty || "—"}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="text-xs text-terminal-muted mb-1">Spread</div>
          <div className="text-lg font-mono font-medium text-terminal-warning">{spread}</div>
        </div>
        <div className={`rounded-md p-3 ${flashClass(askFlash)}`}>
          <div className="text-xs text-terminal-muted mb-1">Best Ask</div>
          <div className="text-xl font-mono font-bold text-terminal-ask">
            {bestAsk?.price || "—"}
          </div>
          <div className="text-xs font-mono text-terminal-muted mt-1">
            Qty: {bestAsk?.qty || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/PriceDisplay.tsx
git commit -m "feat: PriceDisplay component with bid/ask/spread and flash animations"
```

---

### Task 20: OrderBook component

**Files:**
- Create: `frontend/src/components/OrderBook.tsx`

- [ ] **Step 1: Implement OrderBook**

```tsx
"use client";

import type { OrderBook as OrderBookType, OrderBookEntry } from "@/lib/types";

interface OrderBookProps {
  orderBook: OrderBookType;
  maxRows?: number;
}

export default function OrderBook({ orderBook, maxRows = 15 }: OrderBookProps) {
  const bids = orderBook.bids
    .sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    .slice(0, maxRows);
  const asks = orderBook.asks
    .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
    .slice(0, maxRows);

  const maxBidQty = Math.max(...bids.map((b) => parseFloat(b.qty) || 0), 1);
  const maxAskQty = Math.max(...asks.map((a) => parseFloat(a.qty) || 0), 1);

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-terminal-border">
        <h2 className="text-sm font-semibold text-terminal-text">Order Book</h2>
      </div>

      <div className="grid grid-cols-2 divide-x divide-terminal-border">
        {/* Bids */}
        <div>
          <div className="grid grid-cols-2 px-4 py-1.5 text-xs text-terminal-muted border-b border-terminal-border/50">
            <span>Price</span>
            <span className="text-right">Quantity</span>
          </div>
          {bids.length === 0 ? (
            <div className="py-8 text-center text-xs text-terminal-muted">No bids</div>
          ) : (
            bids.map((entry, i) => (
              <BookRow key={i} entry={entry} maxQty={maxBidQty} side="bid" />
            ))
          )}
        </div>

        {/* Asks */}
        <div>
          <div className="grid grid-cols-2 px-4 py-1.5 text-xs text-terminal-muted border-b border-terminal-border/50">
            <span>Price</span>
            <span className="text-right">Quantity</span>
          </div>
          {asks.length === 0 ? (
            <div className="py-8 text-center text-xs text-terminal-muted">No asks</div>
          ) : (
            asks.map((entry, i) => (
              <BookRow key={i} entry={entry} maxQty={maxAskQty} side="ask" />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BookRow({
  entry,
  maxQty,
  side,
}: {
  entry: OrderBookEntry;
  maxQty: number;
  side: "bid" | "ask";
}) {
  const pct = (parseFloat(entry.qty) / maxQty) * 100;
  const bgColor = side === "bid" ? "bg-terminal-bid/10" : "bg-terminal-ask/10";
  const textColor = side === "bid" ? "text-terminal-bid" : "text-terminal-ask";

  return (
    <div className="relative grid grid-cols-2 px-4 py-0.5 font-mono text-xs">
      <div
        className={`absolute inset-0 ${bgColor}`}
        style={{ width: `${pct}%`, [side === "bid" ? "right" : "left"]: 0 }}
      />
      <span className={`relative ${textColor}`}>{parseFloat(entry.price).toFixed(2)}</span>
      <span className="relative text-right text-terminal-text">
        {parseFloat(entry.qty).toFixed(4)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OrderBook.tsx
git commit -m "feat: OrderBook component with depth visualization bars"
```

---

### Task 21: Watchlist component

**Files:**
- Create: `frontend/src/components/Watchlist.tsx`

- [ ] **Step 1: Implement Watchlist with localStorage persistence**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import type { OrderBook } from "@/lib/types";
import { api } from "@/lib/api";

const STORAGE_KEY = "fix-watchlist";

interface WatchlistProps {
  orderBooks: Record<string, OrderBook>;
  activeSymbol: string | null;
  onSelect: (symbol: string) => void;
}

export default function Watchlist({ orderBooks, activeSymbol, onSelect }: WatchlistProps) {
  const [symbols, setSymbols] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSymbols(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  }, [symbols]);

  const addSymbol = useCallback(
    async (symbol: string) => {
      if (symbols.includes(symbol)) return;
      setSymbols((prev) => [...prev, symbol]);
      try {
        await api.subscribe(symbol);
      } catch {
        // subscription error handled by WebSocket
      }
    },
    [symbols]
  );

  const removeSymbol = useCallback(
    async (symbol: string) => {
      setSymbols((prev) => prev.filter((s) => s !== symbol));
      try {
        await api.unsubscribe(symbol);
      } catch {
        // ignore
      }
    },
    []
  );

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-terminal-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-terminal-text">Watchlist</h2>
        <span className="text-xs text-terminal-muted">{symbols.length} symbols</span>
      </div>

      {symbols.length === 0 ? (
        <div className="py-8 text-center text-sm text-terminal-muted">
          Search and select instruments to add to your watchlist
        </div>
      ) : (
        <div className="divide-y divide-terminal-border/30">
          {symbols.map((symbol) => {
            const book = orderBooks[symbol] || { bids: [], asks: [] };
            const bid = book.bids[0];
            const ask = book.asks[0];
            const spread =
              bid && ask
                ? (parseFloat(ask.price) - parseFloat(bid.price)).toFixed(2)
                : "—";

            return (
              <div
                key={symbol}
                onClick={() => onSelect(symbol)}
                className={`flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-terminal-bg/50 transition-colors ${
                  activeSymbol === symbol ? "bg-terminal-bg/30" : ""
                }`}
              >
                <span className="text-sm font-medium text-terminal-text">{symbol}</span>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-terminal-bid">{bid?.price || "—"}</span>
                  <span className="text-terminal-muted">{spread}</span>
                  <span className="text-terminal-ask">{ask?.price || "—"}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSymbol(symbol);
                    }}
                    className="text-terminal-muted hover:text-terminal-ask ml-2"
                    title="Remove from watchlist"
                  >
                    x
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Export addSymbol helper for use by InstrumentSearch
export { STORAGE_KEY };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Watchlist.tsx
git commit -m "feat: Watchlist component with localStorage persistence"
```

---

## Chunk 6: Frontend Main Page + Integration

### Task 22: Main page — compose all components

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Implement main page layout**

```tsx
"use client";

import { useState, useCallback } from "react";
import { useMarketData } from "@/hooks/useMarketData";
import { api } from "@/lib/api";
import ConnectionStatus from "@/components/ConnectionStatus";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import InstrumentSearch from "@/components/InstrumentSearch";
import PriceDisplay from "@/components/PriceDisplay";
import OrderBook from "@/components/OrderBook";
import Watchlist from "@/components/Watchlist";
import FIXInspector from "@/components/FIXInspector";

export default function Home() {
  const {
    orderBooks,
    fixMessages,
    error,
    maintenance,
    connected,
    clearError,
    clearMaintenance,
  } = useMarketData();

  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  const handleSelectInstrument = useCallback(
    async (symbol: string) => {
      setActiveSymbol(symbol);
      try {
        await api.subscribe(symbol);
      } catch {
        // error handled via WebSocket
      }
    },
    []
  );

  const activeBook = activeSymbol ? orderBooks[activeSymbol] : null;

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-panel">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-terminal-text tracking-wide">
            FIX TRADING PLATFORM
          </h1>
          <span className="text-xs text-terminal-muted">Binance Testnet</span>
        </div>
        <ConnectionStatus connected={connected} />
      </header>

      {/* Maintenance banner */}
      <MaintenanceBanner visible={maintenance} onDismiss={clearMaintenance} />

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between px-4 py-2 bg-terminal-ask/10 border-b border-terminal-ask/30">
          <span className="text-sm text-terminal-ask">{error}</span>
          <button onClick={clearError} className="text-xs text-terminal-muted hover:text-terminal-text px-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — search + watchlist */}
        <aside className="w-80 flex flex-col gap-2 p-2 border-r border-terminal-border overflow-y-auto">
          <InstrumentSearch onSelect={handleSelectInstrument} />
          <Watchlist
            orderBooks={orderBooks}
            activeSymbol={activeSymbol}
            onSelect={(symbol) => {
              setActiveSymbol(symbol);
            }}
          />
        </aside>

        {/* Center — price display + order book */}
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
        </main>

        {/* Right sidebar — FIX inspector */}
        <aside className="w-[480px] border-l border-terminal-border">
          <FIXInspector messages={fixMessages} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd /c/Users/Ziyad/Desktop/FIX/frontend && npm run build
```

Expected: Build succeeds (may have minor lint warnings, but no errors).

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add frontend/src/app/page.tsx
git commit -m "feat: main page composing all components into trading terminal layout"
```

---

### Task 23: Frontend tests

**Files:**
- Create: `frontend/src/__tests__/OrderBook.test.tsx`
- Create: `frontend/src/__tests__/FIXInspector.test.tsx`
- Create: `frontend/src/__tests__/Watchlist.test.tsx`

- [ ] **Step 1: Write OrderBook tests**

```tsx
import { render, screen } from "@testing-library/react";
import OrderBook from "@/components/OrderBook";

describe("OrderBook", () => {
  const emptyBook = { bids: [], asks: [] };
  const sampleBook = {
    bids: [
      { side: "0", price: "50000.00", qty: "1.5" },
      { side: "0", price: "49999.00", qty: "2.0" },
    ],
    asks: [
      { side: "1", price: "50001.00", qty: "1.0" },
      { side: "1", price: "50002.00", qty: "3.0" },
    ],
  };

  it("renders empty state when no entries", () => {
    render(<OrderBook orderBook={emptyBook} />);
    expect(screen.getByText("No bids")).toBeInTheDocument();
    expect(screen.getByText("No asks")).toBeInTheDocument();
  });

  it("renders bid and ask entries", () => {
    render(<OrderBook orderBook={sampleBook} />);
    expect(screen.getByText("50000.00")).toBeInTheDocument();
    expect(screen.getByText("50001.00")).toBeInTheDocument();
  });

  it("sorts bids descending and asks ascending", () => {
    render(<OrderBook orderBook={sampleBook} />);
    const prices = screen.getAllByText(/5000[0-2]\.00/).map((el) => el.textContent);
    // Bids column: 50000, 49999 | Asks column: 50001, 50002
    expect(prices).toContain("50000.00");
    expect(prices).toContain("50001.00");
  });
});
```

- [ ] **Step 2: Write FIXInspector tests**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import FIXInspector from "@/components/FIXInspector";
import type { FIXMessage } from "@/lib/types";

const mockMessages: FIXMessage[] = [
  {
    direction: "server",
    raw: "8=FIX.4.4|35=W|55=BTCUSDT",
    parsed: [
      { tag: 8, value: "FIX.4.4" },
      { tag: 35, value: "W" },
      { tag: 55, value: "BTCUSDT" },
    ],
    msg_type: "W",
    timestamp: "20260316-12:00:00.000",
  },
  {
    direction: "client",
    raw: "8=FIX.4.4|35=V|55=BTCUSDT",
    parsed: [
      { tag: 8, value: "FIX.4.4" },
      { tag: 35, value: "V" },
    ],
    msg_type: "V",
    timestamp: "20260316-12:00:01.000",
  },
  {
    direction: "server",
    raw: "8=FIX.4.4|35=0",
    parsed: [{ tag: 8, value: "FIX.4.4" }, { tag: 35, value: "0" }],
    msg_type: "0",
    timestamp: "20260316-12:00:02.000",
  },
];

describe("FIXInspector", () => {
  it("renders messages", () => {
    render(<FIXInspector messages={mockMessages} />);
    expect(screen.getByText("FIX Message Inspector")).toBeInTheDocument();
  });

  it("hides heartbeats by default", () => {
    render(<FIXInspector messages={mockMessages} />);
    // Heartbeat (35=0) should be hidden
    expect(screen.getByText("2 messages")).toBeInTheDocument();
  });

  it("shows heartbeats when filter unchecked", () => {
    render(<FIXInspector messages={mockMessages} />);
    fireEvent.click(screen.getByLabelText("Hide heartbeats"));
    expect(screen.getByText("3 messages")).toBeInTheDocument();
  });

  it("expands message to show tag breakdown", () => {
    render(<FIXInspector messages={mockMessages} />);
    // Click the first non-heartbeat message (W)
    const msgRow = screen.getByText("MarketDataSnapshotFullRefresh");
    fireEvent.click(msgRow);
    expect(screen.getByText("MsgType")).toBeInTheDocument();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Write Watchlist tests**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import Watchlist from "@/components/Watchlist";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Watchlist", () => {
  beforeEach(() => localStorageMock.clear());

  it("renders empty state", () => {
    render(
      <Watchlist orderBooks={{}} activeSymbol={null} onSelect={() => {}} />
    );
    expect(screen.getByText(/Search and select/)).toBeInTheDocument();
  });

  it("renders watchlist symbols from localStorage", () => {
    localStorageMock.setItem("fix-watchlist", '["BTCUSDT","ETHUSDT"]');
    render(
      <Watchlist orderBooks={{}} activeSymbol={null} onSelect={() => {}} />
    );
    expect(screen.getByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
  });

  it("highlights active symbol", () => {
    localStorageMock.setItem("fix-watchlist", '["BTCUSDT"]');
    render(
      <Watchlist orderBooks={{}} activeSymbol="BTCUSDT" onSelect={() => {}} />
    );
    const row = screen.getByText("BTCUSDT").closest("div");
    expect(row?.className).toContain("bg-terminal-bg/30");
  });

  it("calls onSelect when symbol clicked", () => {
    localStorageMock.setItem("fix-watchlist", '["BTCUSDT"]');
    const onSelect = jest.fn();
    render(
      <Watchlist orderBooks={{}} activeSymbol={null} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("BTCUSDT");
  });
});
```

- [ ] **Step 4: Run frontend tests**

```bash
cd /c/Users/Ziyad/Desktop/FIX/frontend && npm test -- --watchAll=false
```

Expected: All tests pass (or minor config adjustments needed for Jest setup).

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add frontend/src/__tests__/
git commit -m "test: frontend component tests for OrderBook, FIXInspector, and Watchlist"
```

---

### Task 24: Final integration verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd /c/Users/Ziyad/Desktop/FIX && uv run pytest backend/tests/ -v
```

Expected: All PASS.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd /c/Users/Ziyad/Desktop/FIX/frontend && npm test -- --watchAll=false
```

Expected: All PASS.

- [ ] **Step 3: Start backend server (manual verification)**

```bash
cd /c/Users/Ziyad/Desktop/FIX && uv run uvicorn backend.main:app --reload --port 8000
```

Expected: Server starts, FIX session connection attempt logged.

- [ ] **Step 4: Start frontend (manual verification)**

```bash
cd /c/Users/Ziyad/Desktop/FIX/frontend && npm run dev
```

Expected: Frontend loads at http://localhost:3000 with dark theme, search bar, empty watchlist, and FIX inspector panel.

- [ ] **Step 5: Final commit**

```bash
cd /c/Users/Ziyad/Desktop/FIX
git add -A
git commit -m "feat: FIX Trading Platform v1 — complete market data viewer with FIX inspector"
```
