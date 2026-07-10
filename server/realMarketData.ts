import type { MarketDataPoint, MarketState, ScrapeLog, Sector, Stock } from "../src/types.js";
import { query } from "./db.js";
import {
  resolveThemeSector,
  THEME_SECTORS,
  themeName,
} from "./sectorThemes.js";

type QuoteRow = {
  code: string;
  name: string;
  board: string;
  industry: string | null;
  theme_id: string | null;
  sw_l1: string | null;
  sw_l2: string | null;
  sw_l3: string | null;
  price: number | string | null;
  change_pct: number | string | null;
  amount: number | string | null;
  volume: number | string | null;
  turnover_rate: number | string | null;
  ts: Date | string | null;
};

type HeatStockRow = {
  code: string;
  name: string;
  theme_id: string | null;
  heat: number | string;
  momentum: number | string | null;
  acceleration: number | string | null;
  change_pct: number | string | null;
  amount: number | string | null;
  net_inflow_proxy: number | string | null;
  is_limit_up_approx: boolean;
  data_quality: string;
  price: number | string | null;
  ts: Date | string | null;
};

type HeatSectorRow = {
  theme_id: string;
  heat: number | string;
  momentum: number | string | null;
  acceleration: number | string | null;
  change_pct: number | string | null;
  amount_sum: number | string | null;
  up_count: number;
  down_count: number;
  stock_count: number;
  net_inflow_proxy: number | string | null;
  data_quality: string;
  ts: Date | string | null;
};

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Fallback when heat tables empty: map change% + amount rank into 0-100 heat. */
function stockHeat(changePct: number, amountRank: number): number {
  const changeScore = Math.max(0, Math.min(70, ((changePct + 10) / 20) * 70));
  const amountScore = Math.max(0, Math.min(30, amountRank * 30));
  return Math.round(Math.max(5, Math.min(100, changeScore + amountScore)));
}

function sentimentFromChange(changePct: number): Stock["sentiment"] {
  if (changePct >= 1) return "positive";
  if (changePct <= -1) return "negative";
  return "neutral";
}

function sectorHeat(stocks: Stock[]): number {
  if (!stocks.length) return 40;
  const top = stocks.slice(0, 15);
  const avg = top.reduce((s, x) => s + x.heat, 0) / top.length;
  return Math.round(Math.max(10, Math.min(100, avg)));
}

function sectorChange(stocks: Stock[]): number {
  if (!stocks.length) return 0;
  const top = stocks.slice(0, 15);
  const avg = top.reduce((s, x) => s + x.change, 0) / top.length;
  return Math.round(avg * 100) / 100;
}

async function tryPersistedHeat(): Promise<MarketState | null> {
  try {
    const sectorRows = await query<HeatSectorRow>(
      `SELECT * FROM heat_score_sector_latest`
    );
    if (!sectorRows.length) return null;

    const stockRows = await query<HeatStockRow>(
      `
      SELECT
        h.code, i.name, h.theme_id, h.heat, h.momentum, h.acceleration,
        h.change_pct, h.amount, h.net_inflow_proxy, h.is_limit_up_approx,
        h.data_quality, q.price, h.ts
      FROM heat_score_stock_latest h
      JOIN instruments i ON i.code = h.code
      LEFT JOIN quotes_latest q ON q.code = h.code
      `
    );

    const byTheme = new Map<string, Stock[]>();
    let latestTs: Date | null = null;
    for (const r of stockRows) {
      const themeId = r.theme_id;
      if (!themeId) continue;
      const change = num(r.change_pct);
      const stock: Stock = {
        code: r.code,
        name: r.name,
        heat: Math.round(num(r.heat)),
        change: Math.round(change * 100) / 100,
        price: num(r.price),
        sentiment: sentimentFromChange(change),
        discussionCount: Math.round(num(r.heat) * 8),
        rank: 0,
        themeId,
        themeName: themeName(themeId),
        momentum: Math.round(num(r.momentum) * 10) / 10,
        netInflowProxy:
          r.net_inflow_proxy == null
            ? undefined
            : Math.round(num(r.net_inflow_proxy)),
        isLimitUpApprox: !!r.is_limit_up_approx,
        dataQuality: (r.data_quality as Stock["dataQuality"]) || "proxy",
      };
      const list = byTheme.get(themeId) || [];
      list.push(stock);
      byTheme.set(themeId, list);
      if (r.ts) {
        const t = r.ts instanceof Date ? r.ts : new Date(r.ts);
        if (!latestTs || t > latestTs) latestTs = t;
      }
    }

    const sectorMeta = new Map(sectorRows.map((r) => [r.theme_id, r]));
    const currentSectors: Sector[] = THEME_SECTORS.map((meta) => {
      const stocks = (byTheme.get(meta.id) || [])
        .sort((a, b) => b.heat - a.heat)
        .map((s, idx) => ({ ...s, rank: idx + 1 }));
      const top = stocks.slice(0, 20);
      const sec = sectorMeta.get(meta.id);
      const heat = sec ? Math.round(num(sec.heat)) : sectorHeat(top);
      const change = sec
        ? Math.round(num(sec.change_pct) * 100) / 100
        : sectorChange(top);
      const leaders = top
        .slice(0, 3)
        .map((s) => s.name)
        .join("、");
      return {
        id: meta.id,
        name: meta.name,
        heat,
        change,
        sentimentScore: Math.max(0, Math.min(100, Math.round(50 + change * 8))),
        hotStocks: top,
        description: leaders
          ? `${meta.name}盘中活跃：${leaders}等（落库热力分）`
          : `${meta.name}暂无足够入池样本`,
        momentum: sec ? Math.round(num(sec.momentum) * 10) / 10 : undefined,
        acceleration: sec
          ? Math.round(num(sec.acceleration) * 10) / 10
          : undefined,
        netInflowProxy:
          sec?.net_inflow_proxy == null
            ? undefined
            : Math.round(num(sec.net_inflow_proxy)),
        upCount: sec ? num(sec.up_count) : undefined,
        downCount: sec ? num(sec.down_count) : undefined,
        stockCount: sec ? num(sec.stock_count) : top.length,
        dataQuality: (sec?.data_quality as Sector["dataQuality"]) || "proxy",
      };
    });

    const nonEmpty = currentSectors.filter((s) => s.hotStocks.length > 0);
    const sectorsOut = nonEmpty.length >= 3 ? nonEmpty : currentSectors;

    let timeline = await buildTimelineFromHeatHistory(sectorsOut);
    if (!timeline.length) {
      timeline = await buildTimelineFromSnapshots(sectorsOut);
    }
    if (!timeline.length) {
      timeline = [buildPointFromSectors(sectorsOut, latestTs)];
    }

    return {
      timeline,
      currentSectors: sectorsOut,
      lastUpdated: (latestTs || new Date()).toISOString(),
      isLiveScraping: false,
      statusMessage: `落库热力 · 题材 ${sectorRows.length} · 个股 ${stockRows.length} · 资金/涨停为代理指标`,
      heatSource: "persisted",
    };
  } catch {
    return null;
  }
}

export async function getRealMarketState(): Promise<MarketState> {
  const persisted = await tryPersistedHeat();
  if (persisted) return persisted;

  let rows: QuoteRow[];
  try {
    rows = await query<QuoteRow>(
      `
      SELECT
        i.code, i.name, i.board,
        COALESCE(i.industry, '') AS industry,
        i.theme_id, i.sw_l1, i.sw_l2, i.sw_l3,
        q.price, q.change_pct, q.amount, q.volume, q.turnover_rate, q.ts
      FROM universe_members um
      JOIN instruments i ON i.code = um.code
      LEFT JOIN quotes_latest q ON q.code = um.code
      WHERE um.effective_to IS NULL
        AND i.board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
      `
    );
  } catch {
    rows = await query<QuoteRow>(
      `
      SELECT
        i.code, i.name, i.board,
        COALESCE(i.industry, '') AS industry,
        NULL::text AS theme_id,
        NULL::text AS sw_l1, NULL::text AS sw_l2, NULL::text AS sw_l3,
        q.price, q.change_pct, q.amount, q.volume, q.turnover_rate, q.ts
      FROM universe_members um
      JOIN instruments i ON i.code = um.code
      LEFT JOIN quotes_latest q ON q.code = um.code
      WHERE um.effective_to IS NULL
        AND i.board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
      `
    );
  }

  if (!rows.length) {
    throw new Error("股池为空或尚无行情，请先在云上完成 bootstrap / ingest-quotes");
  }

  const amounts = rows
    .map((r) => num(r.amount))
    .filter((a) => a > 0)
    .sort((a, b) => a - b);
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

  const byTheme = new Map<string, Stock[]>();
  let latestTs: Date | null = null;
  let mapped = 0;

  for (const r of rows) {
    const themeId = resolveThemeSector({
      code: r.code,
      themeId: r.theme_id,
      industry: r.industry || r.sw_l2 || r.sw_l1 || null,
    });
    if (!themeId) continue;
    mapped += 1;

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
      themeId,
      themeName: themeName(themeId),
      dataQuality: "proxy",
    };
    const list = byTheme.get(themeId) || [];
    list.push(stock);
    byTheme.set(themeId, list);

    if (r.ts) {
      const t = r.ts instanceof Date ? r.ts : new Date(r.ts);
      if (!latestTs || t > latestTs) latestTs = t;
    }
  }

  const currentSectors: Sector[] = THEME_SECTORS.map((meta) => {
    const stocks = (byTheme.get(meta.id) || [])
      .sort((a, b) => b.heat - a.heat)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));
    const top = stocks.slice(0, 20);
    const heat = sectorHeat(top.length ? top : stocks);
    const change = sectorChange(top.length ? top : stocks);
    const leaders = top
      .slice(0, 3)
      .map((s) => s.name)
      .join("、");
    return {
      id: meta.id,
      name: meta.name,
      heat,
      change,
      sentimentScore: Math.max(0, Math.min(100, Math.round(50 + change * 8))),
      hotStocks: top,
      description: leaders
        ? `${meta.name}盘中活跃：${leaders}等（即时计算，尚未落库）`
        : `${meta.name}暂无足够入池样本，待行业字段补全后自动扩容`,
      stockCount: top.length,
      dataQuality: "proxy",
    };
  });

  const nonEmpty = currentSectors.filter((s) => s.hotStocks.length > 0);
  const sectorsOut = nonEmpty.length >= 3 ? nonEmpty : currentSectors;

  let timeline = await buildTimelineFromSnapshots(sectorsOut);
  if (!timeline.length) {
    timeline = [buildPointFromSectors(sectorsOut, latestTs)];
  }

  const quoteCount = rows.filter((r) => r.price != null).length;
  const themedInDb = rows.filter((r) => r.theme_id).length;
  return {
    timeline,
    currentSectors: sectorsOut,
    lastUpdated: (latestTs || new Date()).toISOString(),
    isLiveScraping: false,
    statusMessage: `即时热力 · 题材映射 ${mapped}/${rows.length}（库内theme ${themedInDb}）· 报价 ${quoteCount} · 请运行 compute-heat 落库`,
    heatSource: "computed",
  };
}

function buildPointFromSectors(
  sectors: Sector[],
  ts: Date | null
): MarketDataPoint {
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

async function buildTimelineFromHeatHistory(
  currentSectors: Sector[]
): Promise<MarketDataPoint[]> {
  try {
    const rows = await query<{
      bucket: Date;
      theme_id: string;
      avg_heat: number | string;
      avg_change: number | string | null;
    }>(
      `
      SELECT
        date_trunc('minute', ts) AS bucket,
        theme_id,
        AVG(heat) AS avg_heat,
        AVG(change_pct) AS avg_change
      FROM heat_score_sector
      WHERE ts > NOW() - INTERVAL '2 days'
      GROUP BY 1, 2
      ORDER BY 1 ASC
      `
    );
    if (!rows.length) return [];

    const byBucket = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = new Date(r.bucket).toISOString();
      const list = byBucket.get(key) || [];
      list.push(r);
      byBucket.set(key, list);
    }
    const keys = [...byBucket.keys()];
    const step = Math.max(1, Math.floor(keys.length / 48));
    const sampled = keys.filter((_, i) => i % step === 0);

    return sampled.map((key) => {
      const list = byBucket.get(key) || [];
      const byTheme = new Map(list.map((r) => [r.theme_id, r]));
      const ts = new Date(key);
      const sectors: MarketDataPoint["sectors"] = {};
      const stocks: MarketDataPoint["stocks"] = {};
      for (const sec of currentSectors) {
        const cur = byTheme.get(sec.id);
        const heat = cur ? Math.round(num(cur.avg_heat)) : sec.heat;
        const change = cur
          ? Math.round(num(cur.avg_change) * 100) / 100
          : sec.change;
        sectors[sec.id] = {
          heat,
          change,
          sentimentScore: Math.max(0, Math.min(100, Math.round(50 + change * 8))),
          description: sec.description,
        };
        stocks[sec.id] = sec.hotStocks.slice(0, 10).map((s) => ({
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

async function buildTimelineFromSnapshots(
  currentSectors: Sector[]
): Promise<MarketDataPoint[]> {
  try {
    const codeTheme = new Map<string, string>();
    for (const sec of currentSectors) {
      for (const s of sec.hotStocks) {
        codeTheme.set(s.code, sec.id);
      }
    }
    if (!codeTheme.size) return [];

    const codes = [...codeTheme.keys()];
    const aggs = await query<{
      bucket: Date;
      code: string;
      change_pct: number | string | null;
      amount: number | string | null;
    }>(
      `
      SELECT
        date_trunc('minute', qs.ts) AS bucket,
        qs.code,
        qs.change_pct,
        qs.amount
      FROM quotes_snapshot qs
      WHERE qs.ts > NOW() - INTERVAL '2 days'
        AND qs.code = ANY($1::char(6)[])
      ORDER BY 1 ASC
      `,
      [codes]
    );
    if (!aggs.length) return [];

    type BucketAcc = {
      [themeId: string]: { changes: number[]; heats: number[] };
    };
    const byBucket = new Map<string, BucketAcc>();

    for (const row of aggs) {
      const themeId = codeTheme.get(row.code);
      if (!themeId) continue;
      const key = new Date(row.bucket).toISOString();
      const acc = byBucket.get(key) || {};
      if (!acc[themeId]) acc[themeId] = { changes: [], heats: [] };
      const ch = num(row.change_pct);
      const heat = stockHeat(ch, 0.5);
      acc[themeId].changes.push(ch);
      acc[themeId].heats.push(heat);
      byBucket.set(key, acc);
    }

    const keys = [...byBucket.keys()];
    const step = Math.max(1, Math.floor(keys.length / 48));
    const sampled = keys.filter((_, i) => i % step === 0);

    return sampled.map((key) => {
      const acc = byBucket.get(key) || {};
      const ts = new Date(key);
      const sectors: MarketDataPoint["sectors"] = {};
      const stocks: MarketDataPoint["stocks"] = {};
      for (const sec of currentSectors) {
        const cur = acc[sec.id];
        const heat = cur?.heats.length
          ? Math.round(cur.heats.reduce((a, b) => a + b, 0) / cur.heats.length)
          : sec.heat;
        const change = cur?.changes.length
          ? Math.round(
              (cur.changes.reduce((a, b) => a + b, 0) / cur.changes.length) * 100
            ) / 100
          : sec.change;
        sectors[sec.id] = {
          heat,
          change,
          sentimentScore: Math.max(0, Math.min(100, Math.round(50 + change * 8))),
          description: sec.description,
        };
        stocks[sec.id] = sec.hotStocks.slice(0, 10).map((s) => ({
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
  const rows = await query<{ cnt: string; max_ts: Date | null }>(
    `
    SELECT COUNT(*)::text AS cnt, MAX(ts) AS max_ts
    FROM quotes_latest
    `
  );
  const heatRows = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM heat_score_stock_latest`
  );
  const cnt = rows[0]?.cnt || "0";
  const heatCnt = heatRows[0]?.cnt || "0";
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
      source: "heat_score",
      title: `落库热力个股 ${heatCnt} · 资金/涨停为代理指标（非完整源）`,
      sentiment: "positive",
      weight: 5,
    },
    {
      time: formatCnTime(new Date()),
      source: "theme_sectors",
      title: `观察对象：${THEME_SECTORS.map((s) => themeName(s.id).replace(/与.*/, "")).join("、")}等题材板块`,
      sentiment: "positive",
      weight: 5,
    },
  ];
}
