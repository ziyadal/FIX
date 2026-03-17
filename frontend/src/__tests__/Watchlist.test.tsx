import { render, screen, fireEvent } from "@testing-library/react";
import Watchlist from "@/components/Watchlist";

describe("Watchlist", () => {
  it("renders empty state", () => {
    render(<Watchlist symbols={[]} orderBooks={{}} activeSymbol={null} onSelect={() => {}} onRemove={() => {}} />);
    expect(screen.getByText(/Search and select/)).toBeInTheDocument();
  });

  it("renders provided symbols", () => {
    render(<Watchlist symbols={["BTCUSDT", "ETHUSDT"]} orderBooks={{}} activeSymbol={null} onSelect={() => {}} onRemove={() => {}} />);
    expect(screen.getByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
  });

  it("calls onSelect when symbol clicked", () => {
    const onSelect = jest.fn();
    render(<Watchlist symbols={["BTCUSDT"]} orderBooks={{}} activeSymbol={null} onSelect={onSelect} onRemove={() => {}} />);
    fireEvent.click(screen.getByText("BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("BTCUSDT");
  });

  it("calls onRemove when remove button clicked", () => {
    const onRemove = jest.fn();
    render(<Watchlist symbols={["BTCUSDT"]} orderBooks={{}} activeSymbol={null} onSelect={() => {}} onRemove={onRemove} />);
    fireEvent.click(screen.getByTitle("Remove from watchlist"));
    expect(onRemove).toHaveBeenCalledWith("BTCUSDT");
  });
});
