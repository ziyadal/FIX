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
  const prevBid = useRef<string | undefined>(bestBid?.price);
  const prevAsk = useRef<string | undefined>(bestAsk?.price);

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

  const spread = bestBid && bestAsk
    ? (parseFloat(bestAsk.price) - parseFloat(bestBid.price)).toFixed(2)
    : "\u2014";

  const flashClass = (flash: "up" | "down" | null) =>
    flash === "up" ? "bg-terminal-bid/20 transition-colors"
    : flash === "down" ? "bg-terminal-ask/20 transition-colors"
    : "transition-colors";

  return (
    <div className="bg-terminal-panel border border-terminal-border rounded-lg p-4">
      <h2 className="text-lg font-semibold text-terminal-text mb-3">{symbol}</h2>
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-md p-3 ${flashClass(bidFlash)}`}>
          <div className="text-xs text-terminal-muted mb-1">Best Bid</div>
          <div className="text-xl font-mono font-bold text-terminal-bid">{bestBid?.price || "\u2014"}</div>
          <div className="text-xs font-mono text-terminal-muted mt-1">Qty: {bestBid?.qty || "\u2014"}</div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="text-xs text-terminal-muted mb-1">Spread</div>
          <div className="text-lg font-mono font-medium text-terminal-warning">{spread}</div>
        </div>
        <div className={`rounded-md p-3 ${flashClass(askFlash)}`}>
          <div className="text-xs text-terminal-muted mb-1">Best Ask</div>
          <div className="text-xl font-mono font-bold text-terminal-ask">{bestAsk?.price || "\u2014"}</div>
          <div className="text-xs font-mono text-terminal-muted mt-1">Qty: {bestAsk?.qty || "\u2014"}</div>
        </div>
      </div>
    </div>
  );
}
