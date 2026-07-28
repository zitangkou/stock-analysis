import fs from "fs";
import path from "path";
import { query, isDbConfigured } from "./db.js";

export type DatasetStatus = {
  id: string;
  name: string;
  source: string;
  status: "ok" | "missing" | "partial" | "error";
  detail?: string;
  minDate?: string | null;
  maxDate?: string | null;
  rows?: number | null;
  fileDays?: number | null;
};

function parquetRoot(): string {
  return (
    process.env.PARQUET_ROOT ||
    path.join(process.cwd(), "quant-data-factory", "storage", "parquet")
  );
}

export async function getDataStatus(): Promise<{
  generatedAt: string;
  parquetRoot: string;
  inventoryFile: string | null;
  datasets: DatasetStatus[];
  postgres: Record<string, unknown> | null;
  quotesPreview: QuoteRow[];
  barCoverage: { min: string | null; max: string | null; rows: number; codes: number } | null;
  notInV1: string[];
}> {
  const root = parquetRoot();
  const invPath = path.join(root, "meta", "inventory.json");
  let inventory: any = null;
  if (fs.existsSync(invPath)) {
    try {
      inventory = JSON.parse(fs.readFileSync(invPath, "utf-8"));
    } catch {
      inventory = null;
    }
  }

  const datasets: DatasetStatus[] = inventory?.datasets
    ? inventory.datasets.map((d: any) => ({
        id: d.id,
        name: d.name,
        source: d.source,
        status: d.status === "ok" ? "ok" : "missing",
        detail: d.note || d.path || undefined,
        minDate: d.min_date ?? null,
        maxDate: d.max_date ?? null,
        rows: d.latest_rows ?? d.rows ?? null,
        fileDays: d.file_days ?? d.files ?? null,
      }))
    : [
        {
          id: "kline_daily",
          name: "A股日K（Parquet）",
          source: "BaoStock",
          status: "missing",
          detail: "尚未生成 inventory.json，请在云上运行: python run_daily.py status",
        },
      ];

  let postgres: Record<string, unknown> | null = inventory?.postgres ?? null;
  let quotesPreview: QuoteRow[] = [];
  let barCoverage: {
    min: string | null;
    max: string | null;
    rows: number;
    codes: number;
  } | null = null;

  if (isDbConfigured()) {
    try {
      const counts = await query<{
        instruments: string;
        universe: string;
        quotes: string;
        bars: string;
        fundamentals: string;
        themed: string;
      }>(
        `
        SELECT
          (SELECT COUNT(*)::text FROM instruments) AS instruments,
          (SELECT COUNT(*)::text FROM universe_members WHERE effective_to IS NULL) AS universe,
          (SELECT COUNT(*)::text FROM quotes_latest) AS quotes,
          (SELECT COUNT(*)::text FROM bars_1d) AS bars,
          (SELECT COUNT(*)::text FROM fundamentals_period) AS fundamentals,
          (SELECT COUNT(*)::text FROM instruments WHERE theme_id IS NOT NULL) AS themed
        `
      );
      const c0 = counts[0];
      postgres = {
        connected: true,
        ...(postgres || {}),
        ...c0,
      };

      const bars = await query<{
        min: Date | string | null;
        max: Date | string | null;
        rows: string;
        codes: string;
      }>(
        `
        SELECT MIN(trade_date) AS min, MAX(trade_date) AS max,
               COUNT(*)::text AS rows, COUNT(DISTINCT code)::text AS codes
        FROM bars_1d
        `
      );
      const b = bars[0];
      barCoverage = {
        min: b?.min ? String(b.min).slice(0, 10) : null,
        max: b?.max ? String(b.max).slice(0, 10) : null,
        rows: Number(b?.rows || 0),
        codes: Number(b?.codes || 0),
      };

      datasets.push(
        {
          id: "pg_quotes",
          name: "盘中行情 quotes_latest",
          source: "Sina/collector",
          status: Number(c0?.quotes || 0) > 0 ? "ok" : "missing",
          rows: Number(c0?.quotes || 0),
        },
        {
          id: "pg_bars",
          name: "日K bars_1d",
          source: "Sina/collector",
          status: Number(c0?.bars || 0) > 0 ? "ok" : "missing",
          rows: Number(c0?.bars || 0),
          minDate: barCoverage.min,
          maxDate: barCoverage.max,
          detail: `${barCoverage.codes} 只股票`,
        },
        {
          id: "pg_fundamentals",
          name: "基本面 fundamentals",
          source: "AKShare/collector",
          status: Number(c0?.fundamentals || 0) > 0 ? "ok" : "missing",
          rows: Number(c0?.fundamentals || 0),
        }
      );

      const preview = await query<{
        code: string;
        name: string;
        price: number | string | null;
        change_pct: number | string | null;
        volume: number | string | null;
        amount: number | string | null;
        turnover_rate: number | string | null;
      }>(
        `
        SELECT i.code, i.name, q.price, q.change_pct, q.volume, q.amount, q.turnover_rate
        FROM quotes_latest q
        JOIN instruments i ON i.code = q.code
        ORDER BY q.amount DESC NULLS LAST
        LIMIT 80
        `
      );
      quotesPreview = preview.map(mapQuoteRow);
    } catch (err: any) {
      postgres = { connected: false, error: err?.message || String(err) };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    parquetRoot: root,
    inventoryFile: fs.existsSync(invPath) ? invPath : null,
    datasets,
    postgres,
    quotesPreview,
    barCoverage,
    notInV1: inventory?.not_in_v1 || [
      "分钟K线",
      "主力资金流（真源）",
      "正式涨停池",
      "新闻/股吧舆情",
    ],
  };
}

export type QuoteRow = {
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  amount: number;
  turnoverRate: number;
};

function mapQuoteRow(r: {
  code: string;
  name: string;
  price: number | string | null;
  change_pct: number | string | null;
  volume: number | string | null;
  amount: number | string | null;
  turnover_rate: number | string | null;
}): QuoteRow {
  return {
    code: r.code,
    name: r.name || r.code,
    price: Number(r.price) || 0,
    changePct: Number(r.change_pct) || 0,
    volume: Number(r.volume) || 0,
    amount: Number(r.amount) || 0,
    turnoverRate: Number(r.turnover_rate) || 0,
  };
}

/** Search instruments by code or name (partial match). */
export async function searchQuotes(q: string, limit = 50): Promise<QuoteRow[]> {
  if (!isDbConfigured()) return [];
  const raw = q.trim();
  if (!raw) return [];
  const like = `%${raw}%`;
  const rows = await query<{
    code: string;
    name: string;
    price: number | string | null;
    change_pct: number | string | null;
    volume: number | string | null;
    amount: number | string | null;
    turnover_rate: number | string | null;
  }>(
    `
    SELECT i.code, i.name, q.price, q.change_pct, q.volume, q.amount, q.turnover_rate
    FROM instruments i
    LEFT JOIN quotes_latest q ON q.code = i.code
    WHERE i.code ILIKE $1 OR i.name ILIKE $1
    ORDER BY q.amount DESC NULLS LAST, i.code
    LIMIT $2
    `,
    [like, Math.min(Math.max(limit, 1), 100)]
  );
  return rows.map(mapQuoteRow);
}

export async function getQuoteDetail(code: string): Promise<QuoteRow | null> {
  if (!isDbConfigured()) return null;
  const rows = await query<{
    code: string;
    name: string;
    price: number | string | null;
    change_pct: number | string | null;
    volume: number | string | null;
    amount: number | string | null;
    turnover_rate: number | string | null;
  }>(
    `
    SELECT i.code, i.name, q.price, q.change_pct, q.volume, q.amount, q.turnover_rate
    FROM instruments i
    LEFT JOIN quotes_latest q ON q.code = i.code
    WHERE i.code = $1
    LIMIT 1
    `,
    [code]
  );
  return rows[0] ? mapQuoteRow(rows[0]) : null;
}

export async function getBarSeries(code: string, limit = 120) {
  if (!isDbConfigured()) {
    return [];
  }
  const rows = await query<{
    trade_date: Date | string;
    open: number | string | null;
    high: number | string | null;
    low: number | string | null;
    close: number | string | null;
    volume: number | string | null;
    amount: number | string | null;
    change_pct: number | string | null;
    turnover_rate: number | string | null;
  }>(
    `
    SELECT trade_date, open, high, low, close, volume, amount, change_pct, turnover_rate
    FROM bars_1d
    WHERE code = $1
    ORDER BY trade_date DESC
    LIMIT $2
    `,
    [code, limit]
  );
  return rows
    .map((r) => ({
      date: String(r.trade_date).slice(0, 10),
      open: Number(r.open) || 0,
      high: Number(r.high) || 0,
      low: Number(r.low) || 0,
      close: Number(r.close) || 0,
      volume: Number(r.volume) || 0,
      amount: Number(r.amount) || 0,
      changePct: Number(r.change_pct) || 0,
      turnoverRate: Number(r.turnover_rate) || 0,
    }))
    .reverse();
}
