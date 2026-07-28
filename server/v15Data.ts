import { query, isDbConfigured } from "./db.js";

export async function getLimitUpPool(limit = 80) {
  if (!isDbConfigured()) return { tradeDate: null, rows: [] as any[] };
  const rows = await query<{
    trade_date: Date | string;
    code: string;
    name: string | null;
    board: string;
    threshold_pct: number | string;
    change_pct: number | string | null;
    price: number | string | null;
    amount: number | string | null;
    volume: number | string | null;
    turnover_rate: number | string | null;
    theme_id: string | null;
  }>(
    `
    SELECT trade_date, code, name, board, threshold_pct, change_pct,
           price, amount, volume, turnover_rate, theme_id
    FROM limit_up_pool
    WHERE trade_date = (SELECT MAX(trade_date) FROM limit_up_pool)
    ORDER BY amount DESC NULLS LAST
    LIMIT $1
    `,
    [limit]
  );
  return {
    tradeDate: rows[0] ? String(rows[0].trade_date).slice(0, 10) : null,
    rows: rows.map((r) => ({
      code: r.code,
      name: r.name || r.code,
      board: r.board,
      thresholdPct: Number(r.threshold_pct) || 0,
      changePct: Number(r.change_pct) || 0,
      price: Number(r.price) || 0,
      amount: Number(r.amount) || 0,
      volume: Number(r.volume) || 0,
      turnoverRate: Number(r.turnover_rate) || 0,
      themeId: r.theme_id,
    })),
  };
}

export async function getMoneyFlowTop(limit = 40) {
  if (!isDbConfigured()) return { tradeDate: null, rows: [] as any[] };
  const rows = await query<{
    trade_date: Date | string;
    code: string;
    name: string | null;
    net_inflow: number | string | null;
    amount: number | string | null;
    change_pct: number | string | null;
    data_quality: string;
  }>(
    `
    SELECT m.trade_date, m.code, i.name, m.net_inflow, m.amount, m.change_pct, m.data_quality
    FROM money_flow_daily m
    JOIN instruments i ON i.code = m.code
    WHERE m.trade_date = (SELECT MAX(trade_date) FROM money_flow_daily)
    ORDER BY m.net_inflow DESC NULLS LAST
    LIMIT $1
    `,
    [limit]
  );
  return {
    tradeDate: rows[0] ? String(rows[0].trade_date).slice(0, 10) : null,
    dataQuality: rows[0]?.data_quality || "proxy",
    rows: rows.map((r) => ({
      code: r.code,
      name: r.name || r.code,
      netInflow: Number(r.net_inflow) || 0,
      amount: Number(r.amount) || 0,
      changePct: Number(r.change_pct) || 0,
    })),
  };
}

export async function getConcepts(q?: string) {
  if (!isDbConfigured()) return [];
  const like = q?.trim() ? `%${q.trim()}%` : null;
  const rows = like
    ? await query<{
        concept_code: string;
        concept_name: string;
        stock_code: string;
        name: string | null;
        theme_id: string | null;
      }>(
        `
        SELECT c.concept_code, c.concept_name, c.stock_code, i.name, c.theme_id
        FROM concept_members c
        JOIN instruments i ON i.code = c.stock_code
        WHERE c.concept_code ILIKE $1 OR c.concept_name ILIKE $1 OR c.stock_code ILIKE $1 OR i.name ILIKE $1
        ORDER BY c.concept_code, c.stock_code
        LIMIT 200
        `,
        [like]
      )
    : await query<{
        concept_code: string;
        concept_name: string;
        stock_code: string;
        name: string | null;
        theme_id: string | null;
      }>(
        `
        SELECT c.concept_code, c.concept_name, c.stock_code, i.name, c.theme_id
        FROM concept_members c
        JOIN instruments i ON i.code = c.stock_code
        ORDER BY c.concept_code, c.stock_code
        LIMIT 200
        `
      );
  return rows.map((r) => ({
    conceptCode: r.concept_code,
    conceptName: r.concept_name,
    code: r.stock_code,
    name: r.name || r.stock_code,
    themeId: r.theme_id,
  }));
}

export async function getBars5m(code: string, limit = 96) {
  return getBarsIntraday(code, 5, limit);
}

/** Intraday OHLC: interval 5 | 15 | 30 (minutes). */
export async function getBarsIntraday(
  code: string,
  intervalM: number = 5,
  limit = 96
) {
  if (!isDbConfigured()) return [];
  const iv = [5, 15, 30].includes(intervalM) ? intervalM : 5;
  const lim = Math.min(Math.max(limit, 1), 400);

  // Prefer bars_intraday; fall back to bars_5m for interval=5
  try {
    const rows = await query<{
      bar_ts: Date | string;
      open: number | string | null;
      high: number | string | null;
      low: number | string | null;
      close: number | string | null;
      volume: number | string | null;
      amount: number | string | null;
      change_pct: number | string | null;
      n_ticks: number | string | null;
    }>(
      `
      SELECT bar_ts, open, high, low, close, volume, amount, change_pct, n_ticks
      FROM bars_intraday
      WHERE code = $1 AND interval_m = $2
      ORDER BY bar_ts DESC
      LIMIT $3
      `,
      [code, iv, lim]
    );
    if (rows.length) {
      return rows
        .map((r) => ({
          ts: new Date(r.bar_ts).toISOString(),
          intervalM: iv,
          open: Number(r.open) || 0,
          high: Number(r.high) || 0,
          low: Number(r.low) || 0,
          close: Number(r.close) || 0,
          volume: Number(r.volume) || 0,
          amount: Number(r.amount) || 0,
          changePct: Number(r.change_pct) || 0,
          nTicks: Number(r.n_ticks) || 0,
        }))
        .reverse();
    }
  } catch {
    // table may not exist yet
  }

  if (iv !== 5) return [];

  const rows = await query<{
    bar_ts: Date | string;
    open: number | string | null;
    high: number | string | null;
    low: number | string | null;
    close: number | string | null;
    volume: number | string | null;
    amount: number | string | null;
    change_pct: number | string | null;
    n_ticks: number | string | null;
  }>(
    `
    SELECT bar_ts, open, high, low, close, volume, amount, change_pct, n_ticks
    FROM bars_5m
    WHERE code = $1
    ORDER BY bar_ts DESC
    LIMIT $2
    `,
    [code, lim]
  );
  return rows
    .map((r) => ({
      ts: new Date(r.bar_ts).toISOString(),
      intervalM: 5,
      open: Number(r.open) || 0,
      high: Number(r.high) || 0,
      low: Number(r.low) || 0,
      close: Number(r.close) || 0,
      volume: Number(r.volume) || 0,
      amount: Number(r.amount) || 0,
      changePct: Number(r.change_pct) || 0,
      nTicks: Number(r.n_ticks) || 0,
    }))
    .reverse();
}
