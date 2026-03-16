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
    orderBooks, fixMessages, error, maintenance, connected, clearError, clearMaintenance,
  } = useMarketData();

  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  const handleSelectInstrument = useCallback(async (symbol: string) => {
    setActiveSymbol(symbol);
    try { await api.subscribe(symbol); } catch { /* error via WS */ }
  }, []);

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
          <InstrumentSearch onSelect={handleSelectInstrument} />
          <Watchlist orderBooks={orderBooks} activeSymbol={activeSymbol} onSelect={setActiveSymbol} />
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
