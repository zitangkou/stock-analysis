import type { MarketDataPoint, MarketState, ScrapeLog, Sector, Stock } from "../src/types.js";
import { query } from "./db.js";

type QuoteRow = {
  code: string;
  name: string;
  board: string;
  price: number | string | null;
  change_pct: number | string | null;
  amount: number | string | null;
  volume: number | string | null;
  turnover_rate: number | string | null;
  ts: Date | string | null;
};

type SnapshotAgg = {
  bucket: Date;
  board: string;
  avg_change: number | string | null;
  avg_heat: number | string | null;
  sample_n: number | string | null;
};

const BOARD_META: Record<string, { id: string; name: string }> = {
  SH_MAIN: { id: "sh_main", name: "沪市主板" },
  SZ_MAIN: { id: "sz_main", name: "深市主板" },
  CHINEXT: { id: "chinext", name: "创业板" },
};

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Map change% + amount rank into 0-100 heat. */
function stockHeat(changePct: number, amountRank: number): number {
  // change: -10%..+10% → 0..70, amount rank 0..1 → 0..30
  const changeScore = Math.max(0, Math.min(70, ((changePct + 10) / 20) * 70));
  const amountScore = Math.max(0, Math.min(30, amountRank * 30));
  return Math.round(Math.max(5, Math.min(100, changeScore + amountScore)));
}

function sentimentFromChange(changePct: number): Stock["sentiment"] {
  if (changePct >= 1) return "positive";
  if (changePct <= -1) return "negative";
  return "neutral";
}

function boardHeat(stocks: Stock[]): number {
  if (!stocks.length) return 40;
  const avg =
    stocks.reduce((s, x) => s + x.heat, 0) / stocks.length;
  return Math.round(Math.max(10, Math.min(100, avg)));
}

function boardChange(stocks: Stock[]): number {
  if (!stocks.length) return 0;
  const avg =
    stocks.reduce((s, x) => s + x.change, 0) / stocks.length;
  return Math.round(avg * 100) / 100;
}

export async function getRealMarketState(): Promise<MarketState> {
  const rows = await query<QuoteRow>(
    `
    SELECT
      i.code,
      i.name,
      i.board,
      q.price,
      q.change_pct,
      q.amount,
      q.volume,
      q.turnover_rate,
      q.ts
    FROM universe_members um
    JOIN instruments i ON i.code = um.code
    LEFT JOIN quotes_latest q ON q.code = um.code
    WHERE um.effective_to IS NULL
      AND i.board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
    `
  );

  if (!rows.length) {
    throw new Error("股池为空或尚无行情，请先在云上完成 bootstrap / ingest-quotes");
  }

  const amounts = rows.map((r) => num(r.amount)).filter((a) => a > 0).sort((a, b) => a - b);
  const amountRank = (amount: number): number => {
    if (!amounts.length || amount <= 0) return 0;
    let lo = 0;
    let hi = amounts.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (amounts[mid] < amount) lo = mid + 1;
      else hi = mid;
    }
    return lo / Math.max(amounts.length - 1, 1);
  };

  const byBoard = new Map<string, Stock[]>();
  let latestTs: Date | null = null;

  for (const r of rows) {
    const meta = BOARD_META[r.board];
    if (!meta) continue;
    const change = num(r.change_pct);
    const price = num(r.price);
    const heat = stockHeat(change, amountRank(num(r.amount)));
    const stock: Stock = {
      code: r.code,
      name: r.name,
      heat,
      change,
      price,
      sentiment: sentimentFromChange(change),
      discussionCount: Math.round(heat * 8 + amountRank(num(r.amount)) * 200),
      rank: 0,
    };
    const list = byBoard.get(meta.id) || [];
    list.push(stock);
    byBoard.set(meta.id, list);

    if (r.ts) {
      const t = r.ts instanceof Date ? r.ts : new Date(r.ts);
      if (!latestTs || t > latestTs) latestTs = t;
    }
  }

  const currentSectors: Sector[] = Object.values(BOARD_META).map((meta) => {
    const stocks = (byBoard.get(meta.id) || [])
      .sort((a, b) => b.heat - a.heat)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));
    const top = stocks.slice(0, 30);
    const heat = boardHeat(top.length ? top : stocks.slice(0, 50));
    const change = boardChange(top.length ? top : stocks.slice(0, 50));
    const leaders = top.slice(0, 3).map((s) => s.name).join("、");
    return {
      id: meta.id,
      name: meta.name,
      heat,
      change,
      sentimentScore: Math.round(50 + change * 8),
      hotStocks: top,
      description: leaders
        ? `${meta.name}热度靠前：${leaders}等（基于涨跌幅与成交额）`
        : `${meta.name}暂无足够行情样本`,
    };
  }).filter((s) => s.hotStocks.length > 0);

  // Prefer snapshot timeline; fall back to single latest point
  let timeline = await buildTimelineFromSnapshots(currentSectors);
  if (!timeline.length) {
    timeline = [buildPointFromSectors(currentSectors, latestTs)];
  }

  const quoteCount = rows.filter((r) => r.price != null).length;
  return {
    timeline,
    currentSectors,
    lastUpdated: (latestTs || new Date()).toISOString(),
    isLiveScraping: false,
    statusMessage: `真实行情 · 股池 ${rows.length} · 有报价 ${quoteCount} · 板块按交易所划分`,
  };
}

function buildPointFromSectors(sectors: Sector[], ts: Date | null): MarketDataPoint {
  const time = formatCnTime(ts || new Date());
  const sectorsMap: MarketDataPoint["sectors"] = {};
  const stocksMap: MarketDataPoint["stocks"] = {};
  for (const sec of sectors) {
    sectorsMap[sec.id] = {
      heat: sec.heat,
      change: sec.change,
      sentimentScore: sec.sentimentScore,
      description: sec.description,
    };
    stocksMap[sec.id] = sec.hotStocks.slice(0, 10).map((s) => ({
      code: s.code,
      name: s.name,
      heat: s.heat,
      change: s.change,
      sentiment: s.sentiment,
    }));
  }
  return { time, sectors: sectorsMap, stocks: stocksMap };
}

async function buildTimelineFromSnapshots(currentSectors: Sector[]): Promise<MarketDataPoint[]> {
  try {
    const aggs = await query<SnapshotAgg>(
      `
      SELECT
        date_trunc('minute', qs.ts) AS bucket,
        i.board,
        AVG(qs.change_pct) AS avg_change,
        AVG(
          GREATEST(5, LEAST(100,
            ((COALESCE(qs.change_pct, 0) + 10) / 20.0) * 70
            + LEAST(30, LN(GREATEST(COALESCE(qs.amount, 1), 1)) )
          ))
        ) AS avg_heat,
        COUNT(*) AS sample_n
      FROM quotes_snapshot qs
      JOIN instruments i ON i.code = qs.code
      JOIN universe_members um ON um.code = qs.code AND um.effective_to IS NULL
      WHERE qs.ts > NOW() - INTERVAL '2 days'
        AND i.board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
      GROUP BY 1, 2
      ORDER BY 1 ASC
      `
    );
    if (!aggs.length) return [];

    const byBucket = new Map<string, SnapshotAgg[]>();
    for (const row of aggs) {
      const key = new Date(row.bucket).toISOString();
      const list = byBucket.get(key) || [];
      list.push(row);
      byBucket.set(key, list);
    }

    // Keep at most ~48 points
    const keys = [...byBucket.keys()];
    const step = Math.max(1, Math.floor(keys.length / 48));
    const sampled = keys.filter((_, i) => i % step === 0);

    return sampled.map((key) => {
      const rows = byBucket.get(key) || [];
      const ts = new Date(key);
      const sectors: MarketDataPoint["sectors"] = {};
      const stocks: MarketDataPoint["stocks"] = {};
      for (const meta of Object.values(BOARD_META)) {
        const boardKey = Object.entries(BOARD_META).find(([, v]) => v.id === meta.id)?.[0];
        const hit = rows.find((r) => r.board === boardKey);
        const cur = currentSectors.find((s) => s.id === meta.id);
        const heat = hit ? Math.round(num(hit.avg_heat, cur?.heat || 50)) : cur?.heat || 50;
        const change = hit ? Math.round(num(hit.avg_change) * 100) / 100 : cur?.change || 0;
        sectors[meta.id] = {
          heat,
          change,
          sentimentScore: Math.round(50 + change * 8),
          description: cur?.description,
        };
        stocks[meta.id] = (cur?.hotStocks || []).slice(0, 10).map((s) => ({
          code: s.code,
          name: s.name,
          heat: s.heat,
          change: s.change,
          sentiment: s.sentiment,
        }));
      }
      return { time: formatCnTime(ts), sectors, stocks };
    });
  } catch {
    return [];
  }
}

function formatCnTime(d: Date): string {
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function getRealScrapeLogs(): Promise<ScrapeLog[]> {
  // Placeholder until news ingest exists — surface data freshness as logs
  const rows = await query<{ cnt: string; max_ts: Date | null }>(
    `
    SELECT COUNT(*)::text AS cnt, MAX(ts) AS max_ts
    FROM quotes_latest
    `
  );
  const cnt = rows[0]?.cnt || "0";
  const maxTs = rows[0]?.max_ts;
  return [
    {
      time: formatCnTime(maxTs ? new Date(maxTs) : new Date()),
      source: "quotes_latest",
      title: `真实行情快照已同步，覆盖 ${cnt} 只股票`,
      sentiment: "neutral",
      weight: 5,
    },
    {
      time: formatCnTime(new Date()),
      source: "universe",
      title: "板块按沪市主板 / 深市主板 / 创业板聚合，热度=涨跌幅+成交额",
      sentiment: "positive",
      weight: 4,
    },
  ];
}
