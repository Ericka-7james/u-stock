import { render, screen } from "@testing-library/react";
import RedditMentionsChart from "./RedditMentionsChart";

describe("RedditMentionsChart", () => {
  it("renders the loading state when loading is true", () => {
    render(<RedditMentionsChart loading={true} rawData={[]} />);

    // Matches: "Loading Reddit mentions…"
    expect(
      screen.getByText(/loading reddit mentions/i)
    ).toBeInTheDocument();
  });

  it("renders the empty state message when not loading and no data", () => {
    render(<RedditMentionsChart loading={false} rawData={[]} />);

    expect(
      screen.getByText(/no ticker mentions were found in the latest snapshot/i)
    ).toBeInTheDocument();
  });

  it("does not show loading or empty message when data is present", () => {
    const mockData = [
      { ticker: "AAPL", count: 10 },
      { ticker: "TSLA", count: 5 },
    ];

    const { queryByText } = render(
      <RedditMentionsChart loading={false} rawData={mockData} />
    );

    // When we have data, we should *not* see the loading or empty states
    expect(
      queryByText(/loading reddit mentions/i)
    ).not.toBeInTheDocument();

    expect(
      queryByText(/no ticker mentions were found in the latest snapshot/i)
    ).not.toBeInTheDocument();
  });
});
