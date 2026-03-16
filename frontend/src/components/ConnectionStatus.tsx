"use client";

interface ConnectionStatusProps {
  connected: boolean;
}

export default function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-terminal-panel border border-terminal-border">
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          connected
            ? "bg-terminal-bid shadow-[0_0_6px_rgba(34,197,94,0.5)]"
            : "bg-terminal-ask shadow-[0_0_6px_rgba(239,68,68,0.5)]"
        }`}
      />
      <span className="text-xs font-medium text-terminal-muted">
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}
