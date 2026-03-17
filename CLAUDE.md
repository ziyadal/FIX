# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FIX Trading Platform — a web-based trading app connecting to Binance's FIX API (testnet) for live market data with raw FIX protocol message visibility. Portfolio project for trade support roles.

## Tech Stack

- **Backend**: Python 3.14+ / FastAPI / WebSocket relay
- **Frontend**: React / Next.js / Tailwind CSS (dark trading terminal theme)
- **FIX Libraries**: `binance-fix-connector`, `simplefix`
- **Auth**: Ed25519 key pair (not RSA)
- **Dependency Manager**: `uv`

## Commands

```bash
# Python environment
uv sync                    # Install dependencies
uv pip install -e .        # Install in editable mode

# Backend
uvicorn backend.main:app --reload    # Run FastAPI dev server
pytest backend/tests/                # Run all backend tests
pytest backend/tests/test_fix_parser.py -k "test_name"  # Run single test

# Frontend (once created)
cd frontend && npm install
npm run dev                # Next.js dev server
npm test                   # Jest tests
npm test -- --testPathPattern="ComponentName"  # Single test
```

## Architecture

Three-tier system:

1. **React Frontend** → WebSocket/REST → **Python Backend** → FIX over TCP+TLS → **Binance Testnet**

### Backend (`backend/`)

- `main.py` — FastAPI entry point, mounts routes and WebSocket endpoints
- `fix_client.py` — FIX session manager wrapping `binance_fix_connector` (logon, heartbeat, reconnect)
- `fix_parser.py` — Converts raw FIX `tag=value|` strings to structured dicts
- `fix_dictionary.py` — Maps tag numbers → names and enum values → descriptions using `spot-fix-md.xml`
- `websocket_manager.py` — Broadcasts parsed FIX updates to connected frontend clients
- `routes/instruments.py` — Instrument search and listing endpoints
- `routes/market_data.py` — Subscribe/unsubscribe and market data endpoints
- `schemas/spot-fix-md.xml` — Binance FIX data dictionary (tag definitions)

### Frontend (`frontend/src/`)

- `components/` — InstrumentSearch, OrderBook, Watchlist, FIXInspector, ConnectionStatus
- `hooks/` — `useWebSocket.ts`, `useMarketData.ts` for real-time state
- `lib/api.ts` — Centralized REST client

### API Surface

- **REST**: `/api/instruments`, `/api/instruments/search`, `/api/subscribe`, `/api/unsubscribe`, `/api/status`, `/api/limits`
- **WebSocket**: `/ws/market-data` (parsed prices), `/ws/fix-messages` (raw FIX feed)

## FIX Protocol Context

- **Protocol**: FIX 4.4
- **Endpoint**: `tcp+tls://fix-md.testnet.binance.vision:9000` (market data)
- **Key message types**: Logon (A), Heartbeat (0), MarketDataRequest (V), Snapshot (W), IncrementalRefresh (X), InstrumentList (y), Reject (3), News (B)
- **Rate limit**: 2000 messages/60s per market data session
- **Server sends News (35=B) every 10s for 10min before maintenance disconnect** — must handle gracefully
- **Resend requests not supported** on Binance FIX
- **IncrementalRefresh may fragment** when NoMDEntry > 10000

## Important Constraints

- Testnet only (no real money)
- Market data only in v1 (no order entry)
- Single user, desktop browser
- Ed25519 keys required for authentication
- `config.ini` and `.pem` files are gitignored — never commit credentials

## Specification

`PROJECT_v1.md` contains the complete product spec including detailed feature requirements, error handling strategy, UI design requirements, and a 10-phase build order. **Always consult this file** before implementing features.
