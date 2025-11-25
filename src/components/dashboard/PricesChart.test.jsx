// src/components/dashboard/PricesChart.test.jsx
import { render } from "@testing-library/react";
import PriceChart from "./PriceChart";

describe("PriceChart", () => {
  it("renders without crashing", () => {
    render(<PriceChart ticker="AAPL" data={[]} loading={false} />);
  });
});
