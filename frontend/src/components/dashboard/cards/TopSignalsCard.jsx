import HelpTooltip from "../../common/HelpTooltip";
import "../../../css/dashboard/cards/TopSignalsCard.css";

export default function TopSignalsCard({
  signals,
  signalsMeta,
  currentTicker,
  onSelectTicker,
  loading,
}) {
  const topFiveSignals = signals?.slice(0, 5) ?? [];

  return (
    <div className="panel filters-card filters-card--index">
      <div className="filters-card-header">
        <h3 className="panel-title">Top signals</h3>

        {/* Help icon attached to the card */}
        <HelpTooltip title="How are top signals ranked?">
          <p>
            These signals come from your processed datasets. They combine daily,
            intraday, and multiday indicators to score each ticker.
          </p>

          <ul>
            <li><strong>Score:</strong> Combined signal strength.</li>
            <li><strong>1d:</strong> Daily return factor.</li>
            <li><strong>Intraday:</strong> Short-term momentum.</li>
            <li><strong>5d:</strong> Multiday trend strength.</li>
          </ul>

          <p className="muted">
            Scores are recalculated each time your data pipeline runs.
          </p>
        </HelpTooltip>
      </div>

      {loading ? (
        <p className="muted">Loading signals…</p>
      ) : topFiveSignals.length === 0 ? (
        <p className="muted">
          No signals available. Run your fetchers + indicator scripts.
        </p>
      ) : (
        <>
          <table className="mini-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Score</th>
                <th>1d</th>
                <th>Intraday</th>
                <th>5d</th>
              </tr>
            </thead>
            <tbody>
              {topFiveSignals.map((row) => {
                const daily = row.components?.daily ?? {};
                const intraday = row.components?.intraday ?? {};
                const multiday = row.components?.multiday ?? {};

                return (
                  <tr
                    key={row.ticker}
                    className={
                      row.ticker === currentTicker
                        ? "mini-table-row--active"
                        : ""
                    }
                    onClick={() => onSelectTicker(row.ticker)}
                  >
                    <td>{row.ticker}</td>
                    <td>{row.score?.toFixed(2) ?? "—"}</td>
                    <td>
                      {daily.close_return_1d != null
                        ? (daily.close_return_1d * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td>
                      {intraday.intraday_return != null
                        ? (intraday.intraday_return * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                    <td>
                      {multiday.return_5d != null
                        ? (multiday.return_5d * 100).toFixed(1) + "%"
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {signalsMeta?.rankingDescription && (
            <p className="mini-table-caption muted">
              {signalsMeta.rankingDescription}
            </p>
          )}
        </>
      )}
    </div>
  );
}
