/** Pure OHLC indicator helpers — computed from candles, no vendor feed. */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export type MacdPoint = {
  dif: number | null;
  dea: number | null;
  hist: number | null;
};

/** Classic MACD(12,26,9) on close prices. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): MacdPoint[] {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif: (number | null)[] = closes.map((_, i) => {
    if (emaFast[i] == null || emaSlow[i] == null) return null;
    return (emaFast[i] as number) - (emaSlow[i] as number);
  });

  const dea: (number | null)[] = Array(closes.length).fill(null);
  const k = 2 / (signal + 1);
  let prev: number | null = null;
  let buf: number[] = [];
  for (let i = 0; i < dif.length; i++) {
    const d = dif[i];
    if (d == null) continue;
    if (prev == null) {
      buf.push(d);
      if (buf.length === signal) {
        prev = buf.reduce((a, b) => a + b, 0) / signal;
        dea[i] = prev;
      }
    } else {
      prev = d * k + prev * (1 - k);
      dea[i] = prev;
    }
  }

  return dif.map((d, i) => ({
    dif: d,
    dea: dea[i],
    hist: d != null && dea[i] != null ? d - (dea[i] as number) : null,
  }));
}
