import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type Time,
  createChart,
} from "lightweight-charts";
import { boll, kdj, macd, sma } from "../lib/indicators";

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
  showBoll?: boolean;
  showMacd?: boolean;
  showKdj?: boolean;
};

function toTime(label: string, index: number): Time {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label as Time;
  const ms = Date.parse(label);
  if (Number.isFinite(ms)) return Math.floor(ms / 1000) as Time;
  return (index + 1) as Time;
}

function lineData(
  times: Time[],
  values: (number | null)[]
): { time: Time; value: number }[] {
  const out: { time: Time; value: number }[] = [];
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    out.push({ time: times[i], value: v });
  }
  return out;
}

function syncRange(a: IChartApi, b: IChartApi) {
  a.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range) b.timeScale().setVisibleLogicalRange(range);
  });
  b.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (range) a.timeScale().setVisibleLogicalRange(range);
  });
}

/**
 * Interactive chart: crosshair + scroll/zoom (lightweight-charts).
 * Main: candles + MA + BOLL + volume. Subs: MACD and/or KDJ.
 */
export default function CandleChart({
  candles,
  height = 420,
  showMa = true,
  showBoll = true,
  showMacd = true,
  showKdj = false,
}: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const kdjRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState("");

  useEffect(() => {
    if (!mainRef.current || candles.length < 1) return;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const times = candles.map((c, i) => toTime(c.label, i));
    const ma5 = sma(closes, 5);
    const ma10 = sma(closes, 10);
    const ma20 = sma(closes, 20);
    const bb = boll(closes, 20, 2);
    const macdPts = macd(closes);
    const kdjPts = kdj(highs, lows, closes);

    const subCount = (showMacd ? 1 : 0) + (showKdj ? 1 : 0);
    const mainH =
      subCount === 0 ? height : subCount === 1 ? Math.round(height * 0.65) : Math.round(height * 0.5);
    const subH = subCount === 0 ? 0 : Math.floor((height - mainH - 8) / subCount);

    const common = {
      layout: {
        background: { type: ColorType.Solid, color: "#0b1220" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    };

    const main = createChart(mainRef.current, {
      ...common,
      width: mainRef.current.clientWidth,
      height: mainH,
    });

    const candlesSeries = main.addCandlestickSeries({
      upColor: "#f87171",
      downColor: "#34d399",
      borderUpColor: "#f87171",
      borderDownColor: "#34d399",
      wickUpColor: "#f87171",
      wickDownColor: "#34d399",
    });
    candlesSeries.setData(
      candles.map((c, i) => ({
        time: times[i],
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const vol = main.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    main.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    vol.setData(
      candles.map((c, i) => ({
        time: times[i],
        value: c.volume,
        color:
          c.close >= c.open ? "rgba(248,113,113,0.35)" : "rgba(52,211,153,0.35)",
      }))
    );

    if (showMa) {
      for (const [arr, color] of [
        [ma5, "#fbbf24"],
        [ma10, "#38bdf8"],
        [ma20, "#a78bfa"],
      ] as const) {
        const s = main.addLineSeries({
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s.setData(lineData(times, arr));
      }
    }
    if (showBoll) {
      for (const [key, color, style] of [
        ["upper", "#64748b", LineStyle.Dashed],
        ["mid", "#94a3b8", LineStyle.Solid],
        ["lower", "#64748b", LineStyle.Dashed],
      ] as const) {
        const s = main.addLineSeries({
          color,
          lineWidth: 1,
          lineStyle: style,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s.setData(lineData(times, bb.map((b) => b[key])));
      }
    }

    const subs: IChartApi[] = [];
    if (showMacd && macdRef.current) {
      const chart = createChart(macdRef.current, {
        ...common,
        width: macdRef.current.clientWidth,
        height: Math.max(subH, 90),
      });
      const hist = chart.addHistogramSeries({
        priceFormat: { type: "price", precision: 3, minMove: 0.001 },
      });
      hist.setData(
        macdPts
          .map((p, i) =>
            p.hist == null
              ? null
              : {
                  time: times[i],
                  value: p.hist,
                  color:
                    p.hist >= 0 ? "rgba(248,113,113,0.7)" : "rgba(52,211,153,0.7)",
                }
          )
          .filter(Boolean) as { time: Time; value: number; color: string }[]
      );
      chart
        .addLineSeries({ color: "#fbbf24", lineWidth: 1 })
        .setData(lineData(times, macdPts.map((p) => p.dif)));
      chart
        .addLineSeries({ color: "#38bdf8", lineWidth: 1 })
        .setData(lineData(times, macdPts.map((p) => p.dea)));
      syncRange(main, chart);
      subs.push(chart);
    }

    if (showKdj && kdjRef.current) {
      const chart = createChart(kdjRef.current, {
        ...common,
        width: kdjRef.current.clientWidth,
        height: Math.max(subH, 90),
      });
      chart
        .addLineSeries({ color: "#fbbf24", lineWidth: 1 })
        .setData(lineData(times, kdjPts.map((p) => p.k)));
      chart
        .addLineSeries({ color: "#38bdf8", lineWidth: 1 })
        .setData(lineData(times, kdjPts.map((p) => p.d)));
      chart
        .addLineSeries({ color: "#f472b6", lineWidth: 1 })
        .setData(lineData(times, kdjPts.map((p) => p.j)));
      syncRange(main, chart);
      subs.push(chart);
    }

    main.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHover("");
        return;
      }
      const c = param.seriesData.get(candlesSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!c) {
        setHover("");
        return;
      }
      const idx = times.findIndex((t) => t === param.time);
      const parts = [
        `O ${c.open.toFixed(2)}`,
        `H ${c.high.toFixed(2)}`,
        `L ${c.low.toFixed(2)}`,
        `C ${c.close.toFixed(2)}`,
      ];
      if (idx >= 0 && ma5[idx] != null) parts.push(`MA5 ${ma5[idx]!.toFixed(2)}`);
      if (showMacd && idx >= 0 && macdPts[idx]?.dif != null) {
        parts.push(`DIF ${macdPts[idx].dif!.toFixed(3)}`);
      }
      if (showKdj && idx >= 0 && kdjPts[idx]?.k != null) {
        parts.push(`K ${kdjPts[idx].k!.toFixed(1)} D ${kdjPts[idx].d!.toFixed(1)}`);
      }
      setHover(parts.join("  "));
    });

    main.timeScale().fitContent();

    const onResize = () => {
      if (mainRef.current) main.applyOptions({ width: mainRef.current.clientWidth });
      if (showMacd && macdRef.current && subs[0]) {
        subs[0].applyOptions({ width: macdRef.current.clientWidth });
      }
      if (showKdj && kdjRef.current) {
        const c = showMacd ? subs[1] : subs[0];
        c?.applyOptions({ width: kdjRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      main.remove();
      subs.forEach((s) => s.remove());
    };
  }, [candles, height, showMa, showBoll, showMacd, showKdj]);

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

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-500 px-0.5">
        <span className="text-amber-400">MA5/10/20</span>
        <span className="text-slate-400">BOLL</span>
        {showMacd && <span>MACD</span>}
        {showKdj && <span className="text-pink-400">KDJ</span>}
        <span className="text-slate-600">滚轮缩放 · 拖拽平移 · 十字光标</span>
      </div>
      {hover && (
        <div className="text-[10px] font-mono text-slate-300 px-0.5 truncate">{hover}</div>
      )}
      <div ref={mainRef} className="w-full rounded border border-slate-800 overflow-hidden" />
      {showMacd && (
        <div
          ref={macdRef}
          className="w-full rounded border border-slate-800 overflow-hidden"
          title="MACD"
        />
      )}
      {showKdj && (
        <div
          ref={kdjRef}
          className="w-full rounded border border-slate-800 overflow-hidden"
          title="KDJ"
        />
      )}
    </div>
  );
}
