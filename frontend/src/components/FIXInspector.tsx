"use client";

import { useState, useRef, useEffect } from "react";
import type { FIXMessage, FIXMessagePair } from "@/lib/types";
import { getTagName, getMsgTypeName, describeTagValue } from "@/lib/fixDictionary";

interface FIXInspectorProps {
  messages: FIXMessage[];
}

type FilterDirection = "all" | "client" | "server";
type FilterCategory = "all" | "admin" | "market_data";

const ADMIN_TYPES = new Set(["0", "1", "3", "5", "A", "B"]);

export default function FIXInspector({ messages }: FIXInspectorProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [hideHeartbeats, setHideHeartbeats] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<FilterDirection>("all");
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const filtered = messages.filter((m) => {
    if (hideHeartbeats && (m.msg_type === "0" || m.msg_type === "1")) return false;
    if (directionFilter !== "all" && m.direction !== directionFilter) return false;
    if (categoryFilter === "admin" && !ADMIN_TYPES.has(m.msg_type)) return false;
    if (categoryFilter === "market_data" && ADMIN_TYPES.has(m.msg_type)) return false;
    if (searchTerm && !m.raw.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  return (
    <div className="flex flex-col h-full bg-terminal-panel border border-terminal-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-terminal-border">
        <h2 className="text-sm font-semibold text-terminal-text">FIX Message Inspector</h2>
        <span className="text-xs text-terminal-muted">{filtered.length} messages</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-terminal-border">
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as FilterDirection)}
          className="text-xs bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text"
        >
          <option value="all">All Directions</option>
          <option value="client">Client &rarr; Server</option>
          <option value="server">Server &rarr; Client</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as FilterCategory)}
          className="text-xs bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text"
        >
          <option value="all">All Types</option>
          <option value="admin">Admin</option>
          <option value="market_data">Market Data</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-terminal-muted cursor-pointer">
          <input
            type="checkbox"
            checked={hideHeartbeats}
            onChange={(e) => setHideHeartbeats(e.target.checked)}
            className="rounded border-terminal-border"
          />
          Hide heartbeats
        </label>
        <input
          type="text"
          placeholder="Search tags..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="text-xs bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text placeholder-terminal-muted flex-1 min-w-[120px]"
        />
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-terminal-muted">
            Waiting for FIX messages...
          </div>
        ) : (
          filtered.map((msg, i) => (
            <MessageRow
              key={i}
              message={msg}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MessageRow({ message, expanded, onToggle }: { message: FIXMessage; expanded: boolean; onToggle: () => void }) {
  const dirColor = message.direction === "server" ? "text-terminal-bid" : "text-terminal-accent";
  const dirLabel = message.direction === "server" ? "\u2190" : "\u2192";
  const msgName = getMsgTypeName(message.msg_type);

  return (
    <div className="border-b border-terminal-border/50">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-1.5 hover:bg-terminal-bg/50 transition-colors flex items-center gap-2"
      >
        <span className={`${dirColor} w-3 shrink-0`}>{dirLabel}</span>
        <span className="text-terminal-muted shrink-0 w-20">
          {message.timestamp ? message.timestamp.split("-").pop()?.split(".")[0] || "" : ""}
        </span>
        <span className="text-terminal-warning font-medium shrink-0 w-6">{message.msg_type}</span>
        <span className="text-terminal-text shrink-0">{msgName}</span>
        <span className="text-terminal-muted truncate ml-auto">{message.raw.slice(0, 80)}</span>
      </button>
      {expanded && (
        <div className="px-8 py-2 bg-terminal-bg/30">
          <table className="w-full">
            <thead>
              <tr className="text-terminal-muted">
                <th className="text-left pr-3 py-0.5 font-normal">Tag</th>
                <th className="text-left pr-3 py-0.5 font-normal">Name</th>
                <th className="text-left pr-3 py-0.5 font-normal">Value</th>
                <th className="text-left py-0.5 font-normal">Description</th>
              </tr>
            </thead>
            <tbody>
              {message.parsed.map((pair, j) => (
                <tr key={j} className="hover:bg-terminal-border/20">
                  <td className="pr-3 py-0.5 text-terminal-muted">{pair.tag}</td>
                  <td className="pr-3 py-0.5 text-terminal-accent">{getTagName(pair.tag)}</td>
                  <td className="pr-3 py-0.5 text-terminal-text">{pair.value}</td>
                  <td className="py-0.5 text-terminal-muted">{describeTagValue(pair.tag, pair.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
