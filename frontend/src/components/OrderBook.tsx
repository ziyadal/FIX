"use client";

import type { OrderBook as OrderBookType, OrderBookEntry } from "@/lib/types";

interface OrderBookProps {
  orderBook: OrderBookType;
  maxRows?: number;
}

export default function OrderBook({ orderBook, maxRows = 15 }: OrderBookProps) {
  const bids = orderBook.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, maxRows);
  const asks = orderBook.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, maxRows);
  const maxBidQty = Math.max(...bids.map((b) => parseFloat(b.qty) || 0), 1);
  const maxAskQty = Math.max(...asks.map((a) => parseFloat(a.qty) || 0), 1);

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-terminal-border">
        <h2 className="text-sm font-semibold text-terminal-text">Order Book</h2>
      </div>
      <div className="grid grid-cols-2 divide-x divide-terminal-border">
        <div>
          <div className="grid grid-cols-2 px-4 py-1.5 text-xs text-terminal-muted border-b border-terminal-border/50">
            <span>Price</span><span className="text-right">Quantity</span>
          </div>
          {bids.length === 0 ? (
            <div className="py-8 text-center text-xs text-terminal-muted">No bids</div>
          ) : bids.map((entry, i) => <BookRow key={i} entry={entry} maxQty={maxBidQty} side="bid" />)}
        </div>
        <div>
          <div className="grid grid-cols-2 px-4 py-1.5 text-xs text-terminal-muted border-b border-terminal-border/50">
            <span>Price</span><span className="text-right">Quantity</span>
          </div>
          {asks.length === 0 ? (
            <div className="py-8 text-center text-xs text-terminal-muted">No asks</div>
          ) : asks.map((entry, i) => <BookRow key={i} entry={entry} maxQty={maxAskQty} side="ask" />)}
        </div>
      </div>
    </div>
  );
}

function BookRow({ entry, maxQty, side }: { entry: OrderBookEntry; maxQty: number; side: "bid" | "ask" }) {
  const pct = (parseFloat(entry.qty) / maxQty) * 100;
  const bgColor = side === "bid" ? "bg-terminal-bid/10" : "bg-terminal-ask/10";
  const textColor = side === "bid" ? "text-terminal-bid" : "text-terminal-ask";

  return (
    <div className="relative grid grid-cols-2 px-4 py-0.5 font-mono text-xs">
      <div className={`absolute inset-0 ${bgColor}`} style={{ width: `${pct}%`, [side === "bid" ? "right" : "left"]: 0 }} />
      <span className={`relative ${textColor}`}>{parseFloat(entry.price).toFixed(2)}</span>
      <span className="relative text-right text-terminal-text">{parseFloat(entry.qty).toFixed(4)}</span>
    </div>
  );
}
