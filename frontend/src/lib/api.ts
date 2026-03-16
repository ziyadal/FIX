const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getInstruments: () =>
    fetchJSON<{ instruments: import("./types").Instrument[] }>("/api/instruments"),

  searchInstruments: (q: string) =>
    fetchJSON<{ instruments: import("./types").Instrument[] }>(
      `/api/instruments/search?q=${encodeURIComponent(q)}`
    ),

  subscribe: (symbol: string, depth = 10) =>
    fetchJSON<{ status: string; symbol: string; req_id: string }>(
      "/api/subscribe",
      { method: "POST", body: JSON.stringify({ symbol, depth }) }
    ),

  unsubscribe: (symbol: string) =>
    fetchJSON<{ status: string; symbol: string }>(
      "/api/unsubscribe",
      { method: "POST", body: JSON.stringify({ symbol }) }
    ),

  getStatus: () =>
    fetchJSON<{ state: string; subscriptions: string[]; maintenance_warning: boolean }>(
      "/api/status"
    ),

  getLimits: () =>
    fetchJSON<{ status: string }>("/api/limits"),
};
