// src/components/charts/tests/CandleChart.test.jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CandleChart from "../CandleChart";

describe("CandleChart", () => {
  it("renders waiting message when no candles", () => {
    render(<CandleChart candles={[]} />);
    expect(screen.getByText(/Waiting for ticks/i)).toBeInTheDocument();
  });

  it("renders an svg when candles exist", () => {
    const candles = [
      { t: 1, o: 10, h: 12, l: 9, c: 11 },
      { t: 2, o: 11, h: 13, l: 10, c: 12 },
    ];

    const { container } = render(<CandleChart candles={candles} height={220} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders up/down bodies with correct opacity", () => {
    const candles = [
      { t: 1, o: 10, h: 12, l: 9, c: 11 }, // up => 0.85
      { t: 2, o: 11, h: 12, l: 10, c: 10 }, // down => 0.35
    ];

    const { container } = render(<CandleChart candles={candles} />);

    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(2);
    expect(rects[0].getAttribute("opacity")).toBe("0.85");
    expect(rects[1].getAttribute("opacity")).toBe("0.35");
  });

  it("filters invalid candles safely", () => {
    const candles = [
      { t: 1, o: 10, h: 12, l: 9, c: 11 },
      { t: 2, o: "bad", h: 12, l: 10, c: 10 }, // invalid
      null,
      undefined,
    ];

    const { container } = render(<CandleChart candles={candles} />);
    const groups = container.querySelectorAll('[data-testid="candle"]');
    expect(groups.length).toBe(1);
  });
});
