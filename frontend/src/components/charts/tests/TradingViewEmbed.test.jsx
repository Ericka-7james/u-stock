import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import TradingViewEmbed, { __resetTvLoaderForTests } from "../TradingViewEmbed";

describe("TradingViewEmbed", () => {
  beforeEach(() => {
    __resetTvLoaderForTests?.();
    delete window.TradingView;

    // prevent any real script injection
    vi.spyOn(document.head, "appendChild").mockImplementation(() => {});
  });

  it("renders a host container", () => {
    const { container } = render(<TradingViewEmbed symbol="NASDAQ:AAPL" />);
    expect(container.firstChild).toBeTruthy();
  });

  it("clamps height to at least 120", () => {
    const { container } = render(<TradingViewEmbed height={1} />);
    expect(container.firstChild.style.height).toBe("120px");
  });
});
