type Candle = {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Props = {
  candles: Candle[];
  height?: number;
};

/** Lightweight SVG candlestick + volume (no chart library). */
export default function CandleChart({ candles, height = 160 }: Props) {
  if (candles.length < 1) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-slate-500 border border-slate-800 rounded bg-slate-950/40"
        style={{ height }}
      >
        暂无该周期 K 线（需盘中 quotes_snapshot + aggregate-intraday）
      </div>
    );
  }

  const w = 320;
  const chartH = Math.round(height * 0.72);
  const volH = height - chartH - 4;
  const pad = 4;
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = Math.max(max - min, 1e-6);
  const vols = candles.map((c) => c.volume);
  const vmax = Math.max(...vols, 1);
  const n = candles.length;
  const slot = (w - pad * 2) / n;
  const bodyW = Math.max(1.5, slot * 0.55);

  const y = (price: number) =>
    pad + ((max - price) / span) * (chartH - pad * 2);

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      {candles.map((c, i) => {
        const x = pad + i * slot + slot / 2;
        const up = c.close >= c.open;
        const color = up ? "#f87171" : "#34d399";
        const yO = y(c.open);
        const yC = y(c.close);
        const yH = y(c.high);
        const yL = y(c.low);
        const top = Math.min(yO, yC);
        const body = Math.max(Math.abs(yC - yO), 1);
        const vh = (c.volume / vmax) * (volH - 2);
        return (
          <g key={`${c.label}-${i}`}>
            <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={1} />
            <rect
              x={x - bodyW / 2}
              y={top}
              width={bodyW}
              height={body}
              fill={color}
              opacity={0.9}
            />
            <rect
              x={x - bodyW / 2}
              y={chartH + 4 + (volH - vh)}
              width={bodyW}
              height={Math.max(vh, 0.5)}
              fill={color}
              opacity={0.35}
            />
          </g>
        );
      })}
      <text x={pad} y={10} className="fill-slate-500" style={{ fontSize: 8 }}>
        {max.toFixed(2)}
      </text>
      <text x={pad} y={chartH - 2} className="fill-slate-500" style={{ fontSize: 8 }}>
        {min.toFixed(2)}
      </text>
    </svg>
  );
}
