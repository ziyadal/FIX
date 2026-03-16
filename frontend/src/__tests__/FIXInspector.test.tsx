import { render, screen, fireEvent } from "@testing-library/react";
import FIXInspector from "@/components/FIXInspector";
import type { FIXMessage } from "@/lib/types";

const mockMessages: FIXMessage[] = [
  {
    direction: "server",
    raw: "8=FIX.4.4|35=W|55=BTCUSDT",
    parsed: [
      { tag: 8, value: "FIX.4.4" },
      { tag: 35, value: "W" },
      { tag: 55, value: "BTCUSDT" },
    ],
    msg_type: "W",
    timestamp: "20260316-12:00:00.000",
  },
  {
    direction: "client",
    raw: "8=FIX.4.4|35=V|55=BTCUSDT",
    parsed: [
      { tag: 8, value: "FIX.4.4" },
      { tag: 35, value: "V" },
    ],
    msg_type: "V",
    timestamp: "20260316-12:00:01.000",
  },
  {
    direction: "server",
    raw: "8=FIX.4.4|35=0",
    parsed: [{ tag: 8, value: "FIX.4.4" }, { tag: 35, value: "0" }],
    msg_type: "0",
    timestamp: "20260316-12:00:02.000",
  },
];

describe("FIXInspector", () => {
  it("renders the inspector header", () => {
    render(<FIXInspector messages={mockMessages} />);
    expect(screen.getByText("FIX Message Inspector")).toBeInTheDocument();
  });

  it("hides heartbeats by default", () => {
    render(<FIXInspector messages={mockMessages} />);
    expect(screen.getByText("2 messages")).toBeInTheDocument();
  });

  it("shows heartbeats when filter unchecked", () => {
    render(<FIXInspector messages={mockMessages} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("3 messages")).toBeInTheDocument();
  });
});
