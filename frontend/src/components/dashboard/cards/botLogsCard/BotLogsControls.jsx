/**
 * Controls row for filtering and refreshing logs.
 *
 * @param {Object} props Component props.
 * @param {string} props.botId Current bot id.
 * @param {(value: string) => void} props.setBotId Setter for bot id.
 * @param {string} props.selectedDay Selected day.
 * @param {(value: string) => void} props.setSelectedDay Setter for selected day.
 * @param {string[]} props.availableDays Available day filters.
 * @param {string} props.status Current status filter.
 * @param {(value: string) => void} props.setStatus Setter for status.
 * @param {string} props.q Search query.
 * @param {(value: string) => void} props.setQ Setter for query.
 * @param {number} props.limit Current fetch limit.
 * @param {(value: number) => void} props.setLimit Setter for limit.
 * @param {boolean} props.busy Busy flag.
 * @param {() => void} props.onRefresh Refresh callback.
 * @param {() => void} props.onViewAll Open modal callback.
 * @param {boolean} props.canViewAll Whether the modal button should be enabled.
 * @returns {JSX.Element} Rendered controls.
 */
export default function BotLogsControls({
  botId,
  setBotId,
  selectedDay,
  setSelectedDay,
  availableDays,
  status,
  setStatus,
  q,
  setQ,
  limit,
  setLimit,
  busy,
  onRefresh,
  onViewAll,
  canViewAll,
}) {
  return (
    <div className="blog-controls">
      <label className="blog-field">
        <span className="blog-label">Bot</span>
        <select
          value={botId}
          onChange={(event) => {
            setBotId(event.target.value);
            setSelectedDay("");
          }}
          className="blog-input"
          disabled={busy}
        >
          <option value="ema_trend">ema_trend</option>
        </select>
      </label>

      <label className="blog-field">
        <span className="blog-label">Day</span>
        <select
          value={selectedDay || ""}
          onChange={(event) => setSelectedDay(event.target.value)}
          className="blog-input"
          disabled={busy}
        >
          {availableDays.length ? (
            availableDays.map((day) => (
              <option key={day} value={day}>
                • {day}
              </option>
            ))
          ) : (
            <option value="">{busy ? "Loading…" : "No days yet"}</option>
          )}
        </select>
      </label>

      <label className="blog-field">
        <span className="blog-label">Outcome</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="blog-input"
        >
          <option value="all">All</option>
          <option value="good">Normal</option>
          <option value="issues">Issues</option>
        </select>
      </label>

      <label className="blog-field blog-field-search">
        <span className="blog-label">Search</span>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search events, actions, runner details…"
          className="blog-input"
          disabled={busy}
        />
      </label>

      <label className="blog-field">
        <span className="blog-label">Limit</span>
        <select
          value={String(limit)}
          onChange={(event) => setLimit(Number(event.target.value))}
          className="blog-input"
          disabled={busy}
        >
          <option value="120">120</option>
          <option value="240">240</option>
          <option value="480">480</option>
        </select>
      </label>

      <div className="blog-controlActions">
        <button
          type="button"
          className="mBtn mBtnPrimary"
          onClick={onRefresh}
          disabled={busy}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </button>

        <button
          type="button"
          className="mBtn"
          onClick={onViewAll}
          disabled={busy || !canViewAll}
        >
          View all
        </button>
      </div>
    </div>
  );
}