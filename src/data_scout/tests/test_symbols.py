from pathlib import Path

import data_scout.symbols as symbols


def _write_sample_csv(path: Path) -> None:
    """
    Helper to write a minimal us_tickers.csv snapshot.

    Shape must match the real file:

        symbol
        A
        AA
        AAPL
        ...
    """
    path.write_text(
        "symbol\n"
        "A\n"
        " aa \n"
        "AAPL\n"
        "\n"
    )


def test_load_symbol_universe_reads_single_column_csv(tmp_path, monkeypatch):
    """
    load_symbol_universe() should:

    - skip the header row
    - strip whitespace
    - uppercase symbols
    - ignore blank lines
    """
    csv_file = tmp_path / "us_tickers.csv"
    _write_sample_csv(csv_file)

    # Point symbols.SYMBOLS_CSV at our temp file
    monkeypatch.setattr(symbols, "SYMBOLS_CSV", csv_file)

    # Clear the lru_cache so it rereads the file
    symbols.load_symbol_universe.cache_clear()

    universe = symbols.load_symbol_universe()

    # " aa " → "AA"
    assert universe == {"A", "AA", "AAPL"}


def test_is_valid_symbol_uses_universe(tmp_path, monkeypatch):
    """
    is_valid_symbol() should respect the loaded universe and handle case-insensitivity.
    """
    csv_file = tmp_path / "us_tickers.csv"
    csv_file.write_text(
        "symbol\n"
        "A\n"
        "AAPL\n"
    )

    monkeypatch.setattr(symbols, "SYMBOLS_CSV", csv_file)
    symbols.load_symbol_universe.cache_clear()

    assert symbols.is_valid_symbol("A")
    assert symbols.is_valid_symbol("aapl")
    assert not symbols.is_valid_symbol("MSFT")
    assert not symbols.is_valid_symbol("")  # empty string is invalid
    assert not symbols.is_valid_symbol(None)  # type: ignore[arg-type]


def test_filter_valid_symbols_with_explicit_universe():
    """
    filter_valid_symbols() should:

    - normalize case and whitespace
    - drop invalid symbols
    - return a sorted list
    """
    universe = {"AAPL", "MSFT"}

    candidates = ["aapl", " tsla ", "MSFT", "", "   ", None]  # type: ignore[list-item]
    result = symbols.filter_valid_symbols(candidates, universe=universe)

    assert result == ["AAPL", "MSFT"]


def test_filter_valid_symbols_uses_loaded_universe(tmp_path, monkeypatch):
    """
    When universe is None, filter_valid_symbols() should call load_symbol_universe().
    """
    csv_file = tmp_path / "us_tickers.csv"
    csv_file.write_text(
        "symbol\n"
        "AAPL\n"
        "MSFT\n"
    )

    monkeypatch.setattr(symbols, "SYMBOLS_CSV", csv_file)
    symbols.load_symbol_universe.cache_clear()

    result = symbols.filter_valid_symbols(["aapl", "MSFT", "TSLA", ""])

    # Should only keep ones in CSV, sorted
    assert result == ["AAPL", "MSFT"]
