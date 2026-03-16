"use client";

import { useState, useEffect, useCallback } from "react";
import type { Instrument } from "@/lib/types";
import { api } from "@/lib/api";

interface InstrumentSearchProps {
  onSelect: (symbol: string) => void;
}

export default function InstrumentSearch({ onSelect }: InstrumentSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = q ? await api.searchInstruments(q) : await api.getInstruments();
      setResults(data.instruments);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="flex flex-col bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-terminal-border">
        <input
          type="text"
          placeholder="Search instruments... (e.g. BTC)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full text-sm bg-terminal-bg border border-terminal-border rounded-md px-3 py-2 text-terminal-text placeholder-terminal-muted focus:outline-none focus:border-terminal-accent"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 border-2 border-terminal-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-8 text-sm text-terminal-muted">
            {query ? "No instruments found" : "Type to search instruments"}
          </div>
        ) : (
          results.map((inst) => (
            <button
              key={inst.symbol}
              onClick={() => onSelect(inst.symbol)}
              className="w-full text-left px-4 py-2 hover:bg-terminal-bg/50 transition-colors border-b border-terminal-border/30 flex items-center justify-between"
            >
              <div>
                <span className="text-sm font-medium text-terminal-text">{inst.symbol}</span>
                {inst.base_currency && inst.currency && (
                  <span className="text-xs text-terminal-muted ml-2">{inst.base_currency}/{inst.currency}</span>
                )}
              </div>
              {inst.tick_size && <span className="text-xs text-terminal-muted">tick: {inst.tick_size}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
