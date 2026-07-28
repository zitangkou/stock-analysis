import { useMemo } from "react";
import { macd, sma } from "../lib/indicators";

export type Candle = {
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
  showMa?: boolean;
  showMacd?: boolean;
};

function poly(
  xs: number[],
  ys: (number | null)[],
  yScale: (v: number) => number
): string {
  const parts: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i];
    if (v == null || !Number.isFinite(v)) continue;
    parts.push(`${parts.length ? "L" : "M"}${xs[i]},${yScale(v)}`);
  }
  return parts.join(" ");
}

/**
 * Tonghuashun-style lightweight chart: candles + MA + volume + MACD.
 * Indicators are derived from OHLC — no extra market data.
 */
export default function CandleChart({
  candles,
  height = 260,
  showMa = true,
  showMacd = true,
}: Props) {
  const layout = useMemo(() => {
    const w = 360;
    const macdH = showMacd ? Math.round(height * 0.22) : 0;
    const volH = Math.round(height * 0.16);
    const chartH = height - volH - macdH - 8;
    return { w, chartH, volH, macdH };
  }, [height, showMacd]);

  const series = useMemo(() => {
    const closes = candles.map((c) => c.close);
    return {
      ma5: sma(closes, 5),
      ma10: sma(closes, 10),
      ma20: sma(closes, 20),
      macd: macd(closes),
    };
  }, [candles]);

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

  const { w, chartH, volH, macdH } = layout;
  const pad = 6;
  const n = candles.length;
  const slot = (w - pad * 2) / n;
  const bodyW = Math.max(1.5, slot * 0.55);
  const xs = candles.map((_, i) => pad + i * slot + slot / 2);

  const maVals = [...series.ma5, ...series.ma10, ...series.ma20].filter(
    (v): v is number => v != null
  );
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const min = Math.min(...lows, ...(showMa && maVals.length ? maVals : lows));
  const max = Math.max(...highs, ...(showMa && maVals.length ? maVals : highs));
  const span = Math.max(max - min, 1e-6);
  const yPrice = (price: number) =>
    pad + ((max - price) / span) * (chartH - pad * 2);

  const vols = candles.map((c) => c.volume);
  const vmax = Math.max(...vols, 1);
  const volTop = chartH + 4;

  const macdTop = volTop + volH + 4;
  const macdPts = series.macd;
  const macdNums = macdPts
    .flatMap((p) => [p.dif, p.dea, p.hist])
    .filter((v): v is number => v != null);
  const mMax = Math.max(...macdNums.map(Math.abs), 1e-6);

  const yMacd = (v: number) =>
    macdTop + macdH / 2 - (v / mMax) * ((macdH - 4) / 2);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 text-[10px] font-mono px-0.5">
        <span className="text-amber-400">MA5</span>
        <span className="text-sky-400">MA10</span>
        <span className="text-violet-400">MA20</span>
        {showMacd && <span className="text-slate-500">MACD(12,26,9)</span>}
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
        {/* price candles */}
        {candles.map((c, i) => {
          const x = xs[i];
          const up = c.close >= c.open;
          const color = up ? "#f87171" : "#34d399";
          const yO = yPrice(c.open);
          const yC = yPrice(c.close);
          const top = Math.min(yO, yC);
          const body = Math.max(Math.abs(yC - yO), 1);
          return (
            <g key={`c-${c.label}-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={yPrice(c.high)}
                y2={yPrice(c.low)}
                stroke={color}
                strokeWidth={1}
              />
              <rect
                x={x - bodyW / 2}
                y={top}
                width={bodyW}
                height={body}
                fill={color}
              />
            </g>
          );
        })}

        {showMa && (
          <>
            <path
              d={poly(xs, series.ma5, yPrice)}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1}
            />
            <path
              d={poly(xs, series.ma10, yPrice)}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1}
            />
            <path
              d={poly(xs, series.ma20, yPrice)}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={1}
            />
          </>
        )}

        <text x={pad} y={10} fill="#64748b" style={{ fontSize: 8 }}>
          {max.toFixed(2)}
        </text>
        <text x={pad} y={chartH - 2} fill="#64748b" style={{ fontSize: 8 }}>
          {min.toFixed(2)}
        </text>

        {/* volume */}
        {candles.map((c, i) => {
          const x = xs[i];
          const up = c.close >= c.open;
          const vh = (c.volume / vmax) * (volH - 2);
          return (
            <rect
              key={`v-${i}`}
              x={x - bodyW / 2}
              y={volTop + (volH - vh)}
              width={bodyW}
              height={Math.max(vh, 0.5)}
              fill={up ? "#f87171" : "#34d399"}
              opacity={0.4}
            />
          );
        })}
        <text x={pad} y={volTop + 8} fill="#64748b" style={{ fontSize: 8 }}>
          VOL
        </text>

        {/* MACD */}
        {showMacd && macdH > 0 && (
          <>
            <line
              x1={pad}
              x2={w - pad}
              y1={macdTop + macdH / 2}
              y2={macdTop + macdH / 2}
              stroke="#334155"
              strokeWidth={1}
            />
            {macdPts.map((p, i) => {
              if (p.hist == null) return null;
              const x = xs[i];
              const y0 = macdTop + macdH / 2;
              const y1 = yMacd(p.hist);
              const top = Math.min(y0, y1);
              const h = Math.max(Math.abs(y1 - y0), 0.5);
              return (
                <rect
                  key={`h-${i}`}
                  x={x - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={h}
                  fill={p.hist >= 0 ? "#f87171" : "#34d399"}
                  opacity={0.7}
                />
              );
            })}
            <path
              d={poly(
                xs,
                macdPts.map((p) => p.dif),
                yMacd
              )}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1}
            />
            <path
              d={poly(
                xs,
                macdPts.map((p) => p.dea),
                yMacd
              )}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1}
            />
            <text x={pad} y={macdTop + 8} fill="#64748b" style={{ fontSize: 8 }}>
              MACD
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
