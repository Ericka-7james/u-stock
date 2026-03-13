// frontend/src/components/dashboard/cards/botControlCard/BotTile.jsx

/**
 * Small presentational tile for bot status metrics.
 *
 * @param {{
 *   label: string,
 *   value: string,
 *   full?: boolean,
 *   subtext?: string | null
 * }} props
 * @returns {JSX.Element}
 */
export default function BotTile({
  label,
  value,
  full = false,
  subtext = null,
}) {
  return (
    <div className={`botTile ${full ? "botTileFull" : ""}`}>
      <div className="botTileLabel">{label}</div>
      <div className="botTileValue">{value}</div>
      {subtext ? <div className="botPausedLine">{subtext}</div> : null}
    </div>
  );
}