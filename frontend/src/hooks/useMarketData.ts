"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { api } from "@/lib/api";
import type { FIXMessage, MarketDataUpdate, OrderBook } from "@/lib/types";

const MAX_FIX_MESSAGES = 500;
const STATUS_POLL_INTERVAL = 5000;

export function useMarketData() {
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBook>>({});
  const [fixMessages, setFixMessages] = useState<FIXMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [fixConnected, setFixConnected] = useState(false);
  const fixConnectedRef = useRef(false);

  const handleMarketData = useCallback((data: MarketDataUpdate) => {
    if (data.type === "snapshot" && data.symbol) {
      setOrderBooks((prev) => ({
        ...prev,
        [data.symbol!]: { bids: data.bids || [], asks: data.asks || [] },
      }));
    } else if (data.type === "update" && data.symbol && data.updates) {
      setOrderBooks((prev) => {
        const book = prev[data.symbol!] || { bids: [], asks: [] };
        const newBook = { bids: [...book.bids], asks: [...book.asks] };
        for (const u of data.updates!) {
          const sideKey = u.side === "0" ? "bids" : "asks";
          if (u.action === "0") {
            newBook[sideKey].push({ side: u.side || "", price: u.price || "", qty: u.qty || "" });
          } else if (u.action === "1") {
            const idx = newBook[sideKey].findIndex((e) => e.price === u.price);
            if (idx >= 0) newBook[sideKey][idx] = { ...newBook[sideKey][idx], qty: u.qty || "0" };
          } else if (u.action === "2") {
            newBook[sideKey] = newBook[sideKey].filter((e) => e.price !== u.price);
          }
        }
        return { ...prev, [data.symbol!]: newBook };
      });
    } else if (data.type === "error") {
      setError(data.error || "Unknown error");
    } else if (data.type === "maintenance") {
      setMaintenance(true);
    }
  }, []);

  const handleFixMessage = useCallback((data: FIXMessage) => {
    setFixMessages((prev) => {
      const next = [...prev, data];
      return next.length > MAX_FIX_MESSAGES ? next.slice(-MAX_FIX_MESSAGES) : next;
    });
  }, []);

  const { connected: mdConnected } = useWebSocket<MarketDataUpdate>("/ws/market-data", handleMarketData);
  const { connected: fixWsConnected } = useWebSocket<FIXMessage>("/ws/fix-messages", handleFixMessage);

  // Poll /api/status to track actual FIX connection state
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const status = await api.getStatus();
        if (!mounted) return;
        const isConnected = status.state === "connected";
        setFixConnected(isConnected);
        fixConnectedRef.current = isConnected;
      } catch {
        if (!mounted) return;
        setFixConnected(false);
        fixConnectedRef.current = false;
      }
    };
    poll();
    const id = setInterval(poll, STATUS_POLL_INTERVAL);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearMaintenance = useCallback(() => setMaintenance(false), []);

  return { orderBooks, fixMessages, error, maintenance, connected: mdConnected && fixConnected, fixConnected, fixConnectedRef, clearError, clearMaintenance };
}
