"use client";

import type { OrderBook } from "@/lib/types";

interface WatchlistProps {
  symbols: string[];
  orderBooks: Record<string, OrderBook>;
  activeSymbol: string | null;
  onSelect: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export default function Watchlist({ symbols, orderBooks, activeSymbol, onSelect, onRemove }: WatchlistProps) {
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
            const spread = bid && ask ? (parseFloat(ask.price) - parseFloat(bid.price)).toFixed(2) : "\u2014";
            return (
              <div
                key={symbol}
                onClick={() => onSelect(symbol)}
                className={`flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-terminal-bg/50 transition-colors ${activeSymbol === symbol ? "bg-terminal-bg/30" : ""}`}
              >
                <span className="text-sm font-medium text-terminal-text">{symbol}</span>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="text-terminal-bid">{bid?.price || "\u2014"}</span>
                  <span className="text-terminal-muted">{spread}</span>
                  <span className="text-terminal-ask">{ask?.price || "\u2014"}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}
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
