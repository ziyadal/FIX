"use client";

interface MaintenanceBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function MaintenanceBanner({ visible, onDismiss }: MaintenanceBannerProps) {
  if (!visible) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-terminal-warning/10 border border-terminal-warning/30 rounded-md">
      <span className="text-terminal-warning text-sm font-medium">
        Server maintenance scheduled — connection may be interrupted
      </span>
      <button onClick={onDismiss} className="text-terminal-muted hover:text-terminal-text text-xs px-2 py-1">
        Dismiss
      </button>
    </div>
  );
}
