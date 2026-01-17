import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import SearchableTickerDropdown from "../SearchableTickerDropdown";

describe("SearchableTickerDropdown", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
  });

  function openMenu() {
    fireEvent.click(screen.getByRole("button")); // only button in this component
    return {
      input: screen.getByPlaceholderText(/type to filter/i),
      list: screen.getByRole("list"),
    };
  }

  test('shows "Select…" when no currentTicker', () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "MSFT"]}
        currentTicker={null}
        onChange={onChange}
      />
    );

    expect(screen.getByText(/select…/i)).toBeInTheDocument();
  });

  test("shows currentTicker as the label", () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "MSFT"]}
        currentTicker="MSFT"
        onChange={onChange}
      />
    );

    const btn = screen.getByRole("button");
    expect(within(btn).getByText("MSFT")).toBeInTheDocument();
  });

  test("opens menu on button click and shows input + options", () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "MSFT"]}
        currentTicker="AAPL"
        onChange={onChange}
      />
    );

    const { input, list } = openMenu();

    expect(input).toBeInTheDocument();
    expect(within(list).getByText("AAPL")).toBeInTheDocument();
    expect(within(list).getByText("MSFT")).toBeInTheDocument();
  });

  test("filters tickers by prefix (case-insensitive)", () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "AMZN", "MSFT"]}
        currentTicker="AAPL"
        onChange={onChange}
      />
    );

    const { input, list } = openMenu();

    fireEvent.change(input, { target: { value: "a" } });

    expect(within(list).getByText("AAPL")).toBeInTheDocument();
    expect(within(list).getByText("AMZN")).toBeInTheDocument();
    expect(within(list).queryByText("MSFT")).not.toBeInTheDocument();
  });

  test('shows "No matches" when filter has none', () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "MSFT"]}
        currentTicker="AAPL"
        onChange={onChange}
      />
    );

    const { input, list } = openMenu();

    fireEvent.change(input, { target: { value: "ZZZ" } });

    expect(within(list).getByText(/no matches/i)).toBeInTheDocument();

    const btn = screen.getByRole("button");
    expect(within(btn).getByText("AAPL")).toBeInTheDocument();
  });

  test("selecting an option calls onChange and closes menu + resets filter", () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "AMZN", "MSFT"]}
        currentTicker="AAPL"
        onChange={onChange}
      />
    );

    let { input, list } = openMenu();
    fireEvent.change(input, { target: { value: "AM" } });

    fireEvent.click(within(list).getByText("AMZN"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("AMZN");

    expect(screen.queryByPlaceholderText(/type to filter/i)).not.toBeInTheDocument();

    ({ list } = openMenu());
    expect(within(list).getByText("AAPL")).toBeInTheDocument();
    expect(within(list).getByText("AMZN")).toBeInTheDocument();
    expect(within(list).getByText("MSFT")).toBeInTheDocument();
  });

  test("clicking outside closes the menu", () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "MSFT"]}
        currentTicker="AAPL"
        onChange={onChange}
      />
    );

    openMenu();
    expect(screen.getByPlaceholderText(/type to filter/i)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByPlaceholderText(/type to filter/i)).not.toBeInTheDocument();
  });

  test("renders at most 300 options", () => {
    const bigList = Array.from({ length: 500 }, (_, i) => `T${i}`);

    render(
      <SearchableTickerDropdown
        allTickers={bigList}
        currentTicker="T0"
        onChange={onChange}
      />
    );

    const { list } = openMenu();

    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(300);
  });

  test("Escape closes the menu", () => {
    render(
      <SearchableTickerDropdown
        allTickers={["AAPL", "MSFT"]}
        currentTicker="AAPL"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByPlaceholderText(/type to filter/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/type to filter/i)).not.toBeInTheDocument();
  });
});
