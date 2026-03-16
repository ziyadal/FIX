import { render, screen, fireEvent } from "@testing-library/react";
import Watchlist from "@/components/Watchlist";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Watchlist", () => {
  beforeEach(() => localStorageMock.clear());

  it("renders empty state", () => {
    render(<Watchlist orderBooks={{}} activeSymbol={null} onSelect={() => {}} />);
    expect(screen.getByText(/Search and select/)).toBeInTheDocument();
  });

  it("renders symbols from localStorage", () => {
    localStorageMock.setItem("fix-watchlist", '["BTCUSDT","ETHUSDT"]');
    render(<Watchlist orderBooks={{}} activeSymbol={null} onSelect={() => {}} />);
    expect(screen.getByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
  });

  it("calls onSelect when symbol clicked", () => {
    localStorageMock.setItem("fix-watchlist", '["BTCUSDT"]');
    const onSelect = jest.fn();
    render(<Watchlist orderBooks={{}} activeSymbol={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("BTCUSDT");
  });
});
