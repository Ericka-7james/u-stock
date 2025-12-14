import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import PriceChart from "../cards/PriceChart.jsx";

// ✅ Mock recharts so tests don't depend on layout/ResizeObserver
vi.mock("recharts", () => {
  const Mock = ({ children }) => <div data-testid="recharts">{children}</div>;

  return {
    ResponsiveContainer: ({ children }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
    LineChart: ({ children, data }) => (
      <div data-testid="line-chart" data-length={data?.length || 0}>
        {children}
      </div>
    ),
    Line: (props) => <div data-testid="line" data-key={props.dataKey} />,
    XAxis: (props) => <div data-testid="x-axis" data-key={props.dataKey} />,
    YAxis: () => <div data-testid="y-axis" />,
    Tooltip: () => <div data-testid="tooltip" />,
    CartesianGrid: () => <div data-testid="grid" />,
  };
});

describe("PriceChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows loading message when loading is true", () => {
    render(<PriceChart ticker="AAPL" data={[]} loading={true} pricesMeta={{}} />);

    expect(screen.getByText(/loading price history/i)).toBeInTheDocument();
  });

  test("shows no data message when ticker is missing", () => {
    render(<PriceChart ticker="" data={[]} loading={false} pricesMeta={{}} />);

    expect(screen.getByText(/no price history available/i)).toBeInTheDocument();
  });

  test("shows no data message when data is empty", () => {
    render(<PriceChart ticker="AAPL" data={[]} loading={false} pricesMeta={{}} />);

    expect(screen.getByText(/no price history available/i)).toBeInTheDocument();
  });

  test("renders chart wrapper + recharts primitives when data is present", () => {
    const mockData = [
      { dateLabel: "2024-01-01", close: 100 },
      { dateLabel: "2024-01-02", close: 101 },
    ];

    const { container } = render(
      <PriceChart
        ticker="AAPL"
        data={mockData}
        loading={false}
        pricesMeta={{ generatedAt: "2024-01-03T12:00:00Z" }}
      />
    );

    // wrapper exists
    expect(container.querySelector(".chart-wrapper")).toBeTruthy();

    // recharts mocked components are present
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    expect(screen.getByTestId("line-chart")).toBeInTheDocument();
    expect(screen.getByTestId("line")).toBeInTheDocument();
    expect(screen.getByTestId("x-axis")).toBeInTheDocument();
    expect(screen.getByTestId("y-axis")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip")).toBeInTheDocument();
    expect(screen.getByTestId("grid")).toBeInTheDocument();

    // sanity: data length makes it through
    expect(screen.getByTestId("line-chart").getAttribute("data-length")).toBe("2");
  });

  test("still shows no-data message if ticker exists but data is null/undefined", () => {
    render(<PriceChart ticker="AAPL" data={null} loading={false} pricesMeta={{}} />);
    expect(screen.getByText(/no price history available/i)).toBeInTheDocument();
  });
});
