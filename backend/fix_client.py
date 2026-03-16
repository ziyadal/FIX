"""Async FIX session manager wrapping binance_fix_connector."""
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
    def __init__(self, ws_manager: WebSocketManager):
        self._ws_manager = ws_manager
        self._session = None
        self._poll_task: asyncio.Task | None = None
        self._state = ConnectionState.DISCONNECTED
        self._subscriptions: dict[str, str] = {}  # symbol -> MDReqID
        self._instruments: list[dict] = []
        self._order_books: dict[str, dict] = {}
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
        parsed = parse_fix_message(msg)
        raw_str = fix_message_to_raw_string(msg)
        msg_type = parsed["msg_type"]

        await self._ws_manager.broadcast("fix-messages", {
            "direction": "server",
            "raw": raw_str,
            "parsed": parsed["raw_pairs"],
            "msg_type": msg_type,
            "timestamp": parsed["tags"].get(52, ""),
        })

        if msg_type == "W":
            await self._handle_snapshot(parsed)
        elif msg_type == "X":
            await self._handle_incremental(parsed)
        elif msg_type == "y":
            self._handle_instrument_list(parsed)
        elif msg_type == "Y":
            await self._handle_md_reject(parsed)
        elif msg_type == "B":
            self._maintenance_warning = True
            logger.warning("Maintenance warning: %s", parsed["tags"].get(148, ""))
            await self._ws_manager.broadcast("market-data", {
                "type": "maintenance",
                "headline": parsed["tags"].get(148, "Server maintenance"),
            })
        elif msg_type == "3":
            logger.error("Reject: reason=%s ref_tag=%s",
                         parsed["tags"].get(373, "?"), parsed["tags"].get(371, "?"))

    async def _handle_snapshot(self, parsed: dict) -> None:
        tags = parsed["tags"]
        symbol = tags.get(55, "")
        if not symbol:
            return
        bids, asks = [], []
        current_entry: dict = {}
        for pair in parsed["raw_pairs"]:
            t, v = pair["tag"], pair["value"]
            if t == 269:
                if current_entry:
                    if current_entry.get("side") == "0":
                        bids.append(current_entry)
                    elif current_entry.get("side") == "1":
                        asks.append(current_entry)
                current_entry = {"side": v}
            elif t == 270:
                current_entry["price"] = v
            elif t == 271:
                current_entry["qty"] = v
        if current_entry:
            if current_entry.get("side") == "0":
                bids.append(current_entry)
            elif current_entry.get("side") == "1":
                asks.append(current_entry)
        self._order_books[symbol] = {"bids": bids, "asks": asks}
        await self._ws_manager.broadcast("market-data", {
            "type": "snapshot", "symbol": symbol, "bids": bids, "asks": asks,
        })

    async def _handle_incremental(self, parsed: dict) -> None:
        symbol = parsed["tags"].get(55, "")
        updates = []
        current: dict = {}
        for pair in parsed["raw_pairs"]:
            t, v = pair["tag"], pair["value"]
            if t == 279:
                if current:
                    updates.append(current)
                current = {"action": v}
            elif t == 269:
                current["side"] = v
            elif t == 270:
                current["price"] = v
            elif t == 271:
                current["qty"] = v
            elif t == 55:
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
                if action == "0":
                    book[side_key].append({"side": u.get("side", ""), "price": price, "qty": u.get("qty", "0")})
                elif action == "1":
                    for entry in book[side_key]:
                        if entry.get("price") == price:
                            entry["qty"] = u.get("qty", "0")
                            break
                elif action == "2":
                    book[side_key] = [e for e in book[side_key] if e.get("price") != price]
        await self._ws_manager.broadcast("market-data", {
            "type": "update", "symbol": symbol, "updates": updates,
        })

    def _handle_instrument_list(self, parsed: dict) -> None:
        instruments = []
        current: dict = {}
        for pair in parsed["raw_pairs"]:
            t, v = pair["tag"], pair["value"]
            if t == 55:
                if current:
                    instruments.append(current)
                current = {"symbol": v}
            elif t == 15:
                current["currency"] = v
            elif t == 6215:
                current["base_currency"] = v
            elif t == 562:
                current["min_trade_vol"] = v
            elif t == 1140:
                current["max_trade_vol"] = v
            elif t == 969:
                current["tick_size"] = v
        if current:
            instruments.append(current)
        self._instruments = instruments
        logger.info("Loaded %d instruments", len(instruments))

    async def _handle_md_reject(self, parsed: dict) -> None:
        tags = parsed["tags"]
        error_code = tags.get(25016, "")
        error_text = tags.get(58, "Unknown error")
        req_id = tags.get(262, "")
        logger.error("MarketDataRequestReject: req=%s code=%s text=%s", req_id, error_code, error_text)
        await self._ws_manager.broadcast("market-data", {
            "type": "error", "error": error_text, "error_code": error_code, "req_id": req_id,
        })

    def _send_and_broadcast(self, msg: FixMessage) -> None:
        if not self._session:
            return
        self._session.send_message(msg)

    async def _send_message(self, msg: FixMessage) -> None:
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
        if not self._session:
            raise RuntimeError("Not connected")
        msg = self._session.create_fix_message_with_basic_header("x")
        msg.append_pair(320, str(uuid.uuid4())[:8])
        msg.append_pair(559, "4")
        await self._send_message(msg)

    async def subscribe(self, symbol: str, depth: int = 10) -> str:
        if not self._session:
            raise RuntimeError("Not connected")
        if symbol in self._subscriptions:
            return self._subscriptions[symbol]
        req_id = f"md-{symbol}-{uuid.uuid4().hex[:6]}"
        msg = self._session.create_fix_message_with_basic_header("V")
        msg.append_pair(262, req_id)
        msg.append_pair(263, "1")
        msg.append_pair(264, str(depth))
        msg.append_pair(266, "Y")
        msg.append_pair(146, "1")
        msg.append_pair(55, symbol)
        msg.append_pair(267, "2")
        msg.append_pair(269, "0")
        msg.append_pair(269, "1")
        await self._send_message(msg)
        self._subscriptions[symbol] = req_id
        return req_id

    async def unsubscribe(self, symbol: str) -> None:
        if not self._session:
            raise RuntimeError("Not connected")
        req_id = self._subscriptions.pop(symbol, None)
        if not req_id:
            return
        msg = self._session.create_fix_message_with_basic_header("V")
        msg.append_pair(262, req_id)
        msg.append_pair(263, "2")
        msg.append_pair(264, "1")
        await self._send_message(msg)
        self._order_books.pop(symbol, None)

    async def request_limits(self) -> None:
        if not self._session:
            raise RuntimeError("Not connected")
        msg = self._session.create_fix_message_with_basic_header("XLQ")
        await self._send_message(msg)
