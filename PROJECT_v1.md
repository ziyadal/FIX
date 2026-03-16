# FIX Trading Platform — v1 Spec

## Summary

A web-based trading platform that connects to Binance's FIX API (testnet) to display live market data, with raw FIX protocol message visibility. Built as a portfolio piece demonstrating deep understanding of the FIX protocol for trade support roles. Must have a slick, professional UI design.

## Architecture

```
┌──────────────────────────────┐
│   React Frontend (Next.js)   │
│   - Market Data Page         │
│   - Slick, dark-themed UI    │
└──────────┬───────────────────┘
           │ WebSocket (live prices, FIX messages)
           │ REST API (search instruments, snapshots)
           │
┌──────────┴───────────────────┐
│   Python Backend (FastAPI)   │
│   - FIX session manager      │
│   - WebSocket relay          │
│   - In-memory state          │
└──────────┬───────────────────┘
           │ FIX over TCP+TLS (port 9000)
           │
┌──────────┴───────────────────┐
│   Binance Testnet            │
│   fix-md.testnet.binance     │
│   .vision:9000               │
└──────────────────────────────┘
```

## Tech Stack

| Layer     | Technology | Reason |
|-----------|-----------|--------|
| Frontend  | React (Next.js) + Tailwind CSS | Industry standard, good for dashboards, utility-first styling |
| Backend   | Python FastAPI | Already using Python for FIX, async support, WebSocket built-in |
| FIX Lib   | binance_fix_connector + simplefix | Already working with it, handles TLS/auth/heartbeats |
| Real-time | WebSocket | Push live prices and FIX messages to browser without polling |
| Testing   | pytest (backend) + Jest/React Testing Library (frontend) | Industry standard test frameworks |

## Design Requirements

- **Dark theme** — professional trading terminal aesthetic (dark background, light text)
- **Clean, minimal layout** — no clutter, clear visual hierarchy
- **Monospace fonts** for FIX messages and price data
- **Colour coding** — green for bids/up, red for asks/down, blue for client messages, green for server messages
- **Responsive animations** — smooth price transitions, subtle hover states
- **Professional feel** — this is a portfolio piece, it should look like real trading software (think Bloomberg terminal or TradingView, not a student project)
- **Loading states and error states** — skeleton loaders, connection status indicators
- **Typography** — clean sans-serif for UI, monospace for data

## v1 Scope — Market Data Page Only

### Connection

- Single FIX session to testnet via `create_market_data_session` from `binance_fix_connector`
- Authenticates using Ed25519 API key pair (via `get_private_key` utility)
- Library handles TLS, heartbeats, and sequence numbers automatically
- Must handle News `<B>` messages for server maintenance — when received, log a warning and prepare to reconnect
- Must handle Reject `<3>` messages gracefully with error display

### Key Dependencies

```python
from binance_fix_connector.fix_connector import (
    create_market_data_session,
    FixMessage,
    FixMsgTypes,
    FixTags,
    FIX_MD_URL,
)
from binance_fix_connector.utils import get_private_key
import simplefix
```

### Binance Testnet Technical Requirements

- **Endpoint:** `tcp+tls://fix-md.testnet.binance.vision:9000`
- **Auth:** Ed25519 keys only. API key must have `FIX_API` or `FIX_API_READ_ONLY` permission
- **Rate limit:** 2000 messages per 60 seconds for Market Data sessions
- **Connection limit:** Account-level TCP connection limit. If exceeded, server sends Reject `<3>`. After disconnecting, wait up to 2x HeartBtInt for the slot to free up
- **Heartbeat:** Client must send TestRequest `<1>` if no messages received within HeartBtInt interval. If no response within another HeartBtInt, close and reconnect
- **Maintenance:** Server sends News `<B>` every 10 seconds for 10 minutes before disconnecting. Client must establish new session and close old one
- **MDReqID:** Must be unique across subscriptions. Duplicate MDReqID results in MarketDataRequestReject `<Y>` with error -1191
- **Sequence numbers:** 32-bit unsigned integer that rolls over
- **Data resets:** Testnet data is periodically deleted. App should handle empty responses gracefully
- **Fragmentation:** MarketDataIncrementalRefresh `<X>` may be fragmented when NoMDEntry exceeds 10000. Check LastFragment (893) field
- **NoMDEntry limit:** Capped at 10000 per single message
- **Resend requests:** Not supported on Binance FIX

### Market Data Subscription Types

Three subscription types available, controlled by MarketDataRequest `<V>` fields:

#### Book Ticker Stream (best bid/ask only)
```
35=V | 262=<unique_id> | 263=1 | 264=1 | 266=Y | 146=1 | 55=BTCUSDT | 267=2 | 269=0 | 269=1
```
- MarketDepth (264) = 1, AggregatedBook (266) = Y
- Updates on every change to best bid/ask
- Lowest latency option

#### Depth Stream (order book levels)
```
35=V | 262=<unique_id> | 263=1 | 264=10 | 266=Y | 146=1 | 55=BTCUSDT | 267=2 | 269=0 | 269=1
```
- MarketDepth (264) = desired depth (e.g. 5, 10, 20)
- Updates every 100ms
- Use for full order book display

#### Trade Stream
```
35=V | 262=<unique_id> | 263=1 | 264=1 | 266=Y | 146=1 | 55=BTCUSDT | 267=1 | 269=2
```
- MDEntryType (269) = 2 (TRADE)
- Real-time trade feed

#### Unsubscribe
```
35=V | 262=<original_id> | 263=2 | 264=1
```
- SubscriptionRequestType (263) = 2

### Features

#### 1. Instrument Search

- Search bar to find available trading pairs (e.g. type "BTC" → shows BTCUSDT, BTCETH, etc.)
- Sends FIX InstrumentListRequest (`35=x`) to fetch available symbols
- Can request single instrument (InstrumentListRequestType=0) or all instruments (InstrumentListRequestType=4)
- Displays results with: symbol name, base/quote currency, min/max trade volumes, price increments, market min/max trade volumes
- Click a symbol to subscribe to its market data

#### 2. Live Price Display

- After selecting a symbol, subscribe via MarketDataRequest (`35=V`)
- Display current best bid and best ask with spread
- Display order book depth (bids and asks, configurable depth via MarketDepth field)
- Real-time updates via MarketDataIncrementalRefresh (`35=X`)
  - MDUpdateAction (279): 0=NEW, 1=CHANGE, 2=DELETE
  - Must handle all three action types to maintain accurate order book state
- Initial snapshot via MarketDataSnapshot (`35=W`) followed by incremental updates
- Visual indicators for price movement (green up, red down)
- Handle fragmented messages (check LastFragment tag 893)

#### 3. Watchlist

- Add multiple symbols to a watchlist
- Each symbol shows: last price, bid, ask, spread
- Click any symbol to see its full order book
- Remove symbols from watchlist
- Watchlist persists in browser localStorage

#### 4. FIX Message Inspector (sidebar/panel)

- Live feed of raw FIX messages as they stream in (both sent and received)
- Colour-coded by direction:
  - Green: Server → Client
  - Blue: Client → Server
- Each message expandable to show parsed tag breakdown:
  - Tag number → Tag name → Value → Human-readable description
  - e.g. `35=W` → `MsgType` → `W` → `MARKET_DATA_SNAPSHOT`
- Tag lookup derived from the QuickFIX XML schema (spot-fix-md.xml)
- Filters:
  - By message type (heartbeat, market data, admin)
  - By direction (sent/received)
  - Toggle to hide heartbeats (they're noisy)
- Search by tag value
- Timestamp for each message
- No persistence — messages stream in real-time, scroll off the screen like a terminal log
- Frontend keeps a rolling buffer (last ~500 messages) in React state

## API Endpoints (FastAPI)

### REST

```
GET  /api/instruments              → List all available instruments (triggers 35=x with type=4)
GET  /api/instruments/search?q=BTC → Search instruments (client-side filter on cached instrument list)
POST /api/subscribe                → Subscribe to a symbol's market data (sends 35=V)
POST /api/unsubscribe              → Unsubscribe from a symbol (sends 35=V with 263=2)
GET  /api/status                   → Connection status (connected/disconnected/reconnecting)
GET  /api/limits                   → Current rate limit usage (triggers 35=XLQ)
```

### WebSocket

```
WS /ws/market-data    → Streams live price updates for subscribed symbols
WS /ws/fix-messages   → Streams raw FIX messages in real-time (both directions)
```

## FIX Messages Used (from spot-fix-md.xml)

| MsgType | Name | Direction | Purpose |
|---------|------|-----------|---------|
| A | Logon | Client → Server | Authenticate and start session |
| 0 | Heartbeat | Both | Keep connection alive |
| 1 | TestRequest | Both | Check if connection is alive |
| 5 | Logout | Both | End session |
| 3 | Reject | Server → Client | Message rejected (includes ErrorCode tag 25016) |
| B | News | Server → Client | Server maintenance warning (Headline tag 148) |
| x | InstrumentListRequest | Client → Server | Query available symbols |
| y | InstrumentList | Server → Client | Available symbols response (repeating group NoRelatedSym) |
| V | MarketDataRequest | Client → Server | Subscribe/unsubscribe to prices |
| W | MarketDataSnapshot | Server → Client | Full order book snapshot |
| X | MarketDataIncrementalRefresh | Server → Client | Live order book updates (may be fragmented) |
| Y | MarketDataRequestReject | Server → Client | Subscription rejected (includes ErrorCode tag 25016, Text tag 58) |
| XLQ | LimitQuery | Client → Server | Check rate limits |
| XLR | LimitResponse | Server → Client | Rate limit info (repeating group NoLimitIndicators) |

## Error Handling

- **MarketDataRequestReject (`35=Y`):** Display error from Text (58) and ErrorCode (25016) fields. Common: -1191 "Similar subscription already active"
- **Reject (`35=3`):** Parse SessionRejectReason (373) for cause. Display RefTagID (371) and RefMsgType (372) for debugging
- **Connection loss:** Show reconnecting status in UI, attempt automatic reconnection with backoff
- **News (`35=B`):** Display maintenance warning banner in UI, prepare for reconnect
- **Rate limit breach:** Track message count, warn user when approaching 2000/min limit

## Project Structure

```
fix-trading-platform/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── fix_client.py            # FIX session manager (wraps binance_fix_connector)
│   ├── fix_parser.py            # Parse raw FIX messages into structured data
│   ├── fix_dictionary.py        # Tag number → name/description lookup (from XML schema)
│   ├── websocket_manager.py     # Manage WebSocket connections to frontend
│   ├── routes/
│   │   ├── instruments.py       # Instrument search endpoints
│   │   └── market_data.py       # Subscribe/unsubscribe endpoints
│   ├── config.py                # Settings (API keys, endpoints, etc.)
│   ├── requirements.txt
│   ├── schemas/
│   │   └── spot-fix-md.xml      # Binance FIX data dictionary
│   └── tests/
│       ├── test_fix_parser.py   # Unit tests for FIX message parsing
│       ├── test_fix_dictionary.py # Unit tests for tag lookup
│       ├── test_routes.py       # API endpoint tests
│       └── conftest.py          # Shared fixtures (mock FIX messages, test client)
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── page.tsx         # Main market data page
│   │   ├── components/
│   │   │   ├── InstrumentSearch.tsx
│   │   │   ├── OrderBook.tsx
│   │   │   ├── Watchlist.tsx
│   │   │   ├── PriceDisplay.tsx
│   │   │   ├── FIXInspector.tsx
│   │   │   ├── ConnectionStatus.tsx
│   │   │   └── MaintenanceBanner.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useMarketData.ts
│   │   ├── lib/
│   │   │   ├── api.ts           # REST API client
│   │   │   └── fixDictionary.ts # Client-side tag lookup for inspector
│   │   └── __tests__/
│   │       ├── OrderBook.test.tsx
│   │       ├── FIXInspector.test.tsx
│   │       ├── Watchlist.test.tsx
│   │       └── useMarketData.test.ts
│   ├── package.json
│   └── tailwind.config.js
├── PROJECT_v1.md                # This file
└── README.md
```

## Unit Testing

### Backend (pytest)

- **fix_parser.py:** Test parsing raw FIX strings into structured tag/value dicts. Test with real example messages from Binance docs. Test handling of repeating groups (NoMDEntries, NoRelatedSym). Test malformed messages
- **fix_dictionary.py:** Test tag number → name resolution. Test value enum → description resolution (e.g. 269=0 → "BID"). Test unknown tag handling
- **routes:** Test REST endpoints return correct status codes. Test subscribe/unsubscribe validation. Mock the FIX client so tests don't need a real connection
- **websocket_manager.py:** Test client connect/disconnect handling. Test message broadcast to multiple clients

### Frontend (Jest + React Testing Library)

- **OrderBook:** Test rendering bid/ask levels. Test price update animations. Test empty state
- **FIXInspector:** Test message rendering with correct colour coding. Test filter toggling. Test tag expansion/collapse. Test rolling buffer (oldest messages dropped when exceeding 500)
- **Watchlist:** Test adding/removing symbols. Test localStorage persistence. Test click-to-select behaviour
- **useMarketData hook:** Test WebSocket message handling. Test reconnection logic. Test state updates on new data

## Build Order

1. **Backend: FIX connection manager** — Connect to testnet, handle logon, heartbeats, reconnect, News messages
2. **Backend: FIX message parser** — Parse messages into structured data, tag lookup from XML dictionary
3. **Backend: FastAPI routes + WebSocket relay** — REST endpoints and live streaming to frontend
4. **Backend: Unit tests** — Tests for parser, dictionary, routes
5. **Frontend: Layout + design system** — Dark theme, component library, connection status
6. **Frontend: FIX Inspector panel** — Raw message viewer with filtering (best portfolio piece, build first on frontend)
7. **Frontend: Instrument search** — Search and display available symbols
8. **Frontend: Live price display + order book** — Subscribe and show live data
9. **Frontend: Watchlist** — Multi-symbol tracking with persistence
10. **Frontend: Unit tests** — Tests for all components and hooks

## Constraints

- Testnet only (no real money)
- Single user (no multi-user auth needed beyond basic protection)
- Market data endpoint only (no order entry or drop copy in v1)
- Desktop browser only (no mobile optimisation in v1)
- Ed25519 keys only (Binance FIX requirement)
- FIX 4.4 protocol version
- Always use Context7 for library documentation (FastAPI, Next.js, simplefix, binance_fix_connector).

## Future (v2+)

- Order Entry page (place/cancel orders via fix-oe)
- Drop Copy page (trade history via fix-dc)
- Account balances and positions
- FIX message inspector as standalone page with advanced filtering
- AI/agentic layer for trade analysis
- Testnet → live toggle with environment switcher
- Deployment to VPS
- Rate limit dashboard (visualise usage against 2000/min limit)
- Trade stream display (real-time trades feed)
