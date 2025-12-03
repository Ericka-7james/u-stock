// src/components/dashboard/cards/__tests__/PriceChart.test.jsx
import { render, screen } from "@testing-library/react";
import PriceChart from "../PriceChart.jsx";

describe("PriceChart", () => {
  it("shows loading message when loading is true", () => {
    render(
      <PriceChart
        ticker="AAPL"
        data={[]}
        loading={true}
        pricesMeta={{}}
      />
    );

    expect(
      screen.getByText(/loading price history/i)
    ).toBeInTheDocument();
  });

  it("shows no data message when ticker is missing", () => {
    render(
      <PriceChart
        ticker=""
        data={[]}
        loading={false}
        pricesMeta={{}}
      />
    );

    expect(
      screen.getByText(/no price history available/i)
    ).toBeInTheDocument();
  });

  it("shows no data message when data is empty", () => {
    render(
      <PriceChart
        ticker="AAPL"
        data={[]}
        loading={false}
        pricesMeta={{}}
      />
    );

    expect(
      screen.getByText(/no price history available/i)
    ).toBeInTheDocument();
  });

  it("renders chart wrapper when data is present", () => {
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

    // Just confirm the wrapper div exists
    const wrapper = container.querySelector(".chart-wrapper");
    expect(wrapper).not.toBeNull();
  });
});
