# FIX 4.4 Market-Data Terminal — Binance

A web-based trading terminal that connects to Binance's **FIX 4.4** API over TLS, streams live market data, and exposes a **raw-FIX message inspector** with tag-level decoding. Built as a portfolio piece demonstrating hands-on depth with the FIX protocol — the kind of protocol fluency expected in trading / trade-support engineering.

> v1 scope is **market data only** (no order entry). Order entry and drop-copy are on the v2 roadmap.

---

## Why it's interesting

Most "FIX projects" stop at a library call. This one surfaces the protocol itself:

- **Ed25519-authenticated FIX sessions** to Binance testnet (`tcp+tls`), with library-managed heartbeats and sequence numbers.
- **Live order-book reconstruction** from `MarketDataSnapshot (W)` + `MarketDataIncrementalRefresh (X)`, correctly applying **NEW / CHANGE / DELETE** (`MDUpdateAction`) to maintain accurate book state.
- **Message-fragmentation handling** (checks `LastFragment` 893 when `NoMDEntry` exceeds the per-message cap).
- **Raw-FIX inspector**: a live, colour-coded feed of every sent/received message, each expandable into `tag → name → value → human-readable description`, with heartbeat filtering and a rolling buffer.
- **Resilience**: reconnect-with-backoff, graceful handling of `Reject (3)`, `MarketDataRequestReject (Y)`, and maintenance `News (B)` messages, plus rate-limit awareness (2000 msg/min).

---

## Architecture

```
React / Next.js frontend
   │   WebSocket (live prices + raw FIX messages)
   │   REST (instrument search, snapshots, status)
Python / FastAPI backend
   │   FIX session manager · message parser · tag dictionary · WS relay
   │   FIX 4.4 over TCP+TLS (port 9000)
Binance Testnet  (fix-md.testnet.binance.vision:9000)
```

---

## Features (v1)

- **Instrument search** via `InstrumentListRequest (x)` → `InstrumentList (y)`.
- **Live prices & order book** via `MarketDataRequest (V)` with book-ticker / depth / trade streams.
- **Watchlist** with per-symbol bid/ask/spread, persisted in `localStorage`.
- **FIX message inspector** with direction colour-coding, type filters, and tag decoding from the QuickFIX XML dictionary.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) + Tailwind CSS |
| Backend | Python FastAPI (async, WebSocket) |
| FIX | `binance_fix_connector` + `simplefix` (FIX 4.4) |
| Real-time | WebSocket |
| Testing | pytest (backend) · Jest + React Testing Library (frontend) |

---

## Run it

Backend (Python 3.12 + [uv](https://docs.astral.sh/uv/)); requires Binance testnet Ed25519 keys with `FIX_API` / `FIX_API_READ_ONLY` permission:

```bash
# backend
uv sync
uv run backend/main.py

# frontend
cd frontend && npm install && npm run dev
```

See `PROJECT_v1.md` for the full protocol spec, message catalogue, and error-handling matrix.

---

## Roadmap (v2+)

Order Entry (`fix-oe`), Drop Copy (`fix-dc`), account balances/positions, testnet↔live toggle, and an agentic trade-analysis layer.

---

*Testnet only. No real money. Not financial advice.*
