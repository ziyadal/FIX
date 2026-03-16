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
