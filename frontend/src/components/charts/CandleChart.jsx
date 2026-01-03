export default function CandleChart({ candles = [], height = 220 }) {
  const data = candles.slice(-60); // last 60 candles
  if (!data.length) return <div style={{ opacity: 0.7 }}>Waiting for ticks…</div>;

  const w = 900;
  const h = height;
  const pad = 12;

  const highs = data.map((d) => d.h);
  const lows = data.map((d) => d.l);
  const maxY = Math.max(...highs);
  const minY = Math.min(...lows);

  const xStep = (w - pad * 2) / Math.max(1, data.length);
  const yScale = (val) => {
    if (maxY === minY) return h / 2;
    return pad + ((maxY - val) / (maxY - minY)) * (h - pad * 2);
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }}>
      {/* axis line */}
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke="currentColor" opacity="0.15" />

      {data.map((c, i) => {
        const x = pad + i * xStep + xStep * 0.5;
        const yH = yScale(c.h);
        const yL = yScale(c.l);
        const yO = yScale(c.o);
        const yC = yScale(c.c);

        const up = c.c >= c.o;
        const bodyTop = Math.min(yO, yC);
        const bodyBot = Math.max(yO, yC);
        const bodyH = Math.max(2, bodyBot - bodyTop);
        const bodyW = Math.max(3, xStep * 0.55);

        return (
          <g key={c.t}>
            {/* wick */}
            <line x1={x} y1={yH} x2={x} y2={yL} stroke="currentColor" opacity="0.55" />
            {/* body */}
            <rect
              x={x - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              rx="2"
              fill="currentColor"
              opacity={up ? 0.85 : 0.35}
            />
          </g>
        );
      })}
    </svg>
  );
}
