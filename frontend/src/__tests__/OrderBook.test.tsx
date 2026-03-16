import { render, screen } from "@testing-library/react";
import OrderBook from "@/components/OrderBook";

describe("OrderBook", () => {
  const emptyBook = { bids: [], asks: [] };
  const sampleBook = {
    bids: [
      { side: "0", price: "50000.00", qty: "1.5" },
      { side: "0", price: "49999.00", qty: "2.0" },
    ],
    asks: [
      { side: "1", price: "50001.00", qty: "1.0" },
      { side: "1", price: "50002.00", qty: "3.0" },
    ],
  };

  it("renders empty state when no entries", () => {
    render(<OrderBook orderBook={emptyBook} />);
    expect(screen.getByText("No bids")).toBeInTheDocument();
    expect(screen.getByText("No asks")).toBeInTheDocument();
  });

  it("renders bid and ask entries", () => {
    render(<OrderBook orderBook={sampleBook} />);
    expect(screen.getByText("50000.00")).toBeInTheDocument();
    expect(screen.getByText("50001.00")).toBeInTheDocument();
  });
});
