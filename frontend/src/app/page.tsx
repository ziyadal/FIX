"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMarketData } from "@/hooks/useMarketData";
import { api } from "@/lib/api";
import ConnectionStatus from "@/components/ConnectionStatus";
import MaintenanceBanner from "@/components/MaintenanceBanner";
import InstrumentSearch from "@/components/InstrumentSearch";
import PriceDisplay from "@/components/PriceDisplay";
import OrderBook from "@/components/OrderBook";
import Watchlist from "@/components/Watchlist";
import FIXInspector from "@/components/FIXInspector";

const STORAGE_KEY = "fix-watchlist";
const QUICK_ADD_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

export default function Home() {
  const {
    orderBooks, fixMessages, error, maintenance, connected, fixConnected, fixConnectedRef, clearError, clearMaintenance,
  } = useMarketData();

  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setWatchlistSymbols(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist watchlist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlistSymbols));
  }, [watchlistSymbols]);

  // Auto-resubscribe when FIX reconnects after a disconnect
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

        <aside className="w-[480px] border-l border-terminal-border">
          <FIXInspector messages={fixMessages} />
        </aside>
      </div>
    </div>
  );
}
