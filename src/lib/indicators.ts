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
  const buf: number[] = [];
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

export type BollPoint = {
  mid: number | null;
  upper: number | null;
  lower: number | null;
};

/** Bollinger Bands (period=20, k=2). */
export function boll(closes: number[], period = 20, mult = 2): BollPoint[] {
  const mid = sma(closes, period);
  return closes.map((_, i) => {
    if (mid[i] == null || i < period - 1) {
      return { mid: null, upper: null, lower: null };
    }
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - (mid[i] as number);
      sq += d * d;
    }
    const std = Math.sqrt(sq / period);
    const m = mid[i] as number;
    return { mid: m, upper: m + mult * std, lower: m - mult * std };
  });
}

export type KdjPoint = {
  k: number | null;
  d: number | null;
  j: number | null;
};

/** KDJ(9,3,3) — RSV → K/D/J. */
export function kdj(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 9,
  kSmooth = 3,
  dSmooth = 3
): KdjPoint[] {
  const n = closes.length;
  const rsv: (number | null)[] = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < period - 1) continue;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, highs[j]);
      ll = Math.min(ll, lows[j]);
    }
    const den = hh - ll;
    rsv[i] = den <= 1e-12 ? 50 : ((closes[i] - ll) / den) * 100;
  }

  const kArr: (number | null)[] = Array(n).fill(null);
  const dArr: (number | null)[] = Array(n).fill(null);
  let kPrev = 50;
  let dPrev = 50;
  for (let i = 0; i < n; i++) {
    const r = rsv[i];
    if (r == null) continue;
    kPrev = (r + (kSmooth - 1) * kPrev) / kSmooth;
    dPrev = (kPrev + (dSmooth - 1) * dPrev) / dSmooth;
    kArr[i] = kPrev;
    dArr[i] = dPrev;
  }

  return closes.map((_, i) => {
    const k = kArr[i];
    const d = dArr[i];
    return {
      k,
      d,
      j: k != null && d != null ? 3 * k - 2 * d : null,
    };
  });
}
