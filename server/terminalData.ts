import type { Stock } from "../src/types.js";
import { query } from "./db.js";
import { themeName, THEME_SECTORS } from "./sectorThemes.js";

export type RotationCell = {
  tradeDate: string;
  slot30m: number;
  slotLabel: string;
  themeId: string;
  themeName: string;
  rank: number;
  heat: number;
  changePct: number;
  momentum: number;
};

export type AlertRuleRow = {
  id: number;
  name: string;
  ruleType: string;
  enabled: boolean;
  params: Record<string, unknown>;
  description: string | null;
};

export type AlertRecordRow = {
  id: number;
  ts: string;
  alertType: string;
  target: string;
  targetName: string | null;
  message: string;
  triggerValue: number | null;
  threshold: number | null;
  priority: string;
};

export type TerminalOverview = {
  marketHeat: number;
  upCount: number;
  downCount: number;
  stockCount: number;
  limitUpApprox: number;
  topSectors: Array<{
    id: string;
    name: string;
    heat: number;
    change: number;
    netInflowProxy: number | null;
    dataQuality: string;
  }>;
  topInflowProxy: Array<{
    id: string;
    name: string;
    netInflowProxy: number;
    dataQuality: string;
  }>;
  dataQualityNote: string;
};

function slotLabel(slot: number): string {
  const base = 9 * 60 + 30 + slot * 30;
  const h = Math.floor(base / 60);
  const m = base % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getTerminalOverview(): Promise<TerminalOverview> {
  const sectors = await query<{
    theme_id: string;
    heat: number | string;
    change_pct: number | string | null;
    net_inflow_proxy: number | string | null;
    data_quality: string;
    up_count: number;
    down_count: number;
    stock_count: number;
  }>(
    `
    SELECT theme_id, heat, change_pct, net_inflow_proxy, data_quality,
           up_count, down_count, stock_count
    FROM heat_score_sector_latest
    ORDER BY heat DESC
    `
  );

  const limitRows = await query<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c
    FROM heat_score_stock_latest
    WHERE is_limit_up_approx = TRUE
    `
  );

  const up = sectors.reduce((s, r) => s + num(r.up_count), 0);
  const down = sectors.reduce((s, r) => s + num(r.down_count), 0);
  const stockCount = sectors.reduce((s, r) => s + num(r.stock_count), 0);
  const marketHeat = sectors.length
    ? Math.round(
        sectors.reduce((s, r) => s + num(r.heat), 0) / sectors.length
      )
    : 50;

  const topSectors = sectors.slice(0, 6).map((r) => ({
    id: r.theme_id,
    name: themeName(r.theme_id),
    heat: Math.round(num(r.heat)),
    change: Math.round(num(r.change_pct) * 100) / 100,
    netInflowProxy:
      r.net_inflow_proxy == null ? null : Math.round(num(r.net_inflow_proxy)),
    dataQuality: r.data_quality || "proxy",
  }));

  const topInflowProxy = [...sectors]
    .sort((a, b) => num(b.net_inflow_proxy) - num(a.net_inflow_proxy))
    .slice(0, 5)
    .map((r) => ({
      id: r.theme_id,
      name: themeName(r.theme_id),
      netInflowProxy: Math.round(num(r.net_inflow_proxy)),
      dataQuality: r.data_quality || "proxy",
    }));

  return {
    marketHeat,
    upCount: up,
    downCount: down,
    stockCount,
    limitUpApprox: Number(limitRows[0]?.c || 0),
    topSectors,
    topInflowProxy,
    dataQualityNote:
      "资金净流入为成交额×涨跌幅代理指标（data_quality=proxy），非正式主力资金；近似涨停=涨幅≥9.5%。",
  };
}

export async function getRotationMatrix(days = 1): Promise<{
  cells: RotationCell[];
  path: string[];
  tradeDate: string | null;
}> {
  const rows = await query<{
    trade_date: Date | string;
    slot_30m: number;
    theme_id: string;
    rank: number;
    heat: number | string;
    change_pct: number | string | null;
    momentum: number | string | null;
  }>(
    `
    SELECT trade_date, slot_30m, theme_id, rank, heat, change_pct, momentum
    FROM rotation_matrix
    WHERE trade_date >= CURRENT_DATE - ($1::int - 1)
    ORDER BY trade_date ASC, slot_30m ASC, rank ASC
    `,
    [days]
  );

  const cells: RotationCell[] = rows.map((r) => {
    const d =
      r.trade_date instanceof Date
        ? r.trade_date.toISOString().slice(0, 10)
        : String(r.trade_date).slice(0, 10);
    return {
      tradeDate: d,
      slot30m: num(r.slot_30m),
      slotLabel: slotLabel(num(r.slot_30m)),
      themeId: r.theme_id,
      themeName: themeName(r.theme_id),
      rank: num(r.rank),
      heat: Math.round(num(r.heat) * 10) / 10,
      changePct: Math.round(num(r.change_pct) * 100) / 100,
      momentum: Math.round(num(r.momentum) * 10) / 10,
    };
  });

  // Path = top-1 theme per slot for latest trade date
  const latestDate = cells.length ? cells[cells.length - 1].tradeDate : null;
  const path: string[] = [];
  if (latestDate) {
    const bySlot = new Map<number, RotationCell>();
    for (const c of cells) {
      if (c.tradeDate !== latestDate) continue;
      if (c.rank !== 1) continue;
      bySlot.set(c.slot30m, c);
    }
    for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
      const cell = bySlot.get(slot);
      if (cell) path.push(cell.themeName);
    }
  }

  return { cells, path, tradeDate: latestDate };
}

export async function getAlertRules(): Promise<AlertRuleRow[]> {
  const rows = await query<{
    id: number;
    name: string;
    rule_type: string;
    enabled: boolean;
    params: Record<string, unknown> | string;
    description: string | null;
  }>(`SELECT id, name, rule_type, enabled, params, description FROM alert_rule ORDER BY id`);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ruleType: r.rule_type,
    enabled: r.enabled,
    params:
      typeof r.params === "string" ? JSON.parse(r.params) : r.params || {},
    description: r.description,
  }));
}

export async function getAlertRecords(limit = 50): Promise<AlertRecordRow[]> {
  const rows = await query<{
    id: number;
    ts: Date | string;
    alert_type: string;
    target: string;
    target_name: string | null;
    message: string;
    trigger_value: number | string | null;
    threshold: number | string | null;
    priority: string;
  }>(
    `
    SELECT id, ts, alert_type, target, target_name, message,
           trigger_value, threshold, priority
    FROM alert_record
    ORDER BY ts DESC
    LIMIT $1
    `,
    [limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    ts:
      r.ts instanceof Date
        ? r.ts.toISOString()
        : new Date(r.ts).toISOString(),
    alertType: r.alert_type,
    target: r.target,
    targetName: r.target_name,
    message: r.message,
    triggerValue: r.trigger_value == null ? null : num(r.trigger_value),
    threshold: r.threshold == null ? null : num(r.threshold),
    priority: r.priority,
  }));
}

export async function getGlobalHotStocks(limit = 30): Promise<Stock[]> {
  const rows = await query<{
    code: string;
    name: string;
    theme_id: string | null;
    heat: number | string;
    change_pct: number | string | null;
    price: number | string | null;
    net_inflow_proxy: number | string | null;
    is_limit_up_approx: boolean;
    data_quality: string;
    momentum: number | string | null;
  }>(
    `
    SELECT
      h.code,
      i.name,
      h.theme_id,
      h.heat,
      h.change_pct,
      q.price,
      h.net_inflow_proxy,
      h.is_limit_up_approx,
      h.data_quality,
      h.momentum
    FROM heat_score_stock_latest h
    JOIN instruments i ON i.code = h.code
    LEFT JOIN quotes_latest q ON q.code = h.code
    ORDER BY h.heat DESC
    LIMIT $1
    `,
    [limit]
  );

  return rows.map((r, idx) => ({
    code: r.code,
    name: r.name,
    heat: Math.round(num(r.heat)),
    change: Math.round(num(r.change_pct) * 100) / 100,
    price: num(r.price),
    sentiment:
      num(r.change_pct) >= 1
        ? "positive"
        : num(r.change_pct) <= -1
          ? "negative"
          : "neutral",
    discussionCount: Math.round(num(r.heat) * 8),
    rank: idx + 1,
    themeId: r.theme_id || undefined,
    themeName: r.theme_id ? themeName(r.theme_id) : undefined,
    momentum: Math.round(num(r.momentum) * 10) / 10,
    netInflowProxy:
      r.net_inflow_proxy == null ? undefined : Math.round(num(r.net_inflow_proxy)),
    isLimitUpApprox: !!r.is_limit_up_approx,
    dataQuality: (r.data_quality as Stock["dataQuality"]) || "proxy",
  }));
}

export async function getRadarSectors(): Promise<
  Array<{
    id: string;
    name: string;
    heat: number;
    momentum: number;
    acceleration: number;
    change: number;
    zone: "core" | "warm" | "outer" | "cold";
    dataQuality: string;
  }>
> {
  const rows = await query<{
    theme_id: string;
    heat: number | string;
    momentum: number | string;
    acceleration: number | string;
    change_pct: number | string | null;
    data_quality: string;
  }>(`SELECT * FROM heat_score_sector_latest`);

  const byId = new Map(rows.map((r) => [r.theme_id, r]));
  return THEME_SECTORS.map((meta) => {
    const r = byId.get(meta.id);
    const heat = r ? Math.round(num(r.heat)) : 20;
    const momentum = r ? Math.round(num(r.momentum) * 10) / 10 : 0;
    const acceleration = r ? Math.round(num(r.acceleration) * 10) / 10 : 0;
    let zone: "core" | "warm" | "outer" | "cold" = "cold";
    if (heat >= 80) zone = "core";
    else if (heat >= 60) zone = "warm";
    else if (heat >= 40) zone = "outer";
    return {
      id: meta.id,
      name: meta.name,
      heat,
      momentum,
      acceleration,
      change: r ? Math.round(num(r.change_pct) * 100) / 100 : 0,
      zone,
      dataQuality: r?.data_quality || "proxy",
    };
  }).sort((a, b) => b.heat - a.heat);
}

/** Build AI prompt context from persisted heat + rotation. */
export async function getAiContextSummary(): Promise<string> {
  const [overview, rotation, hot, radar] = await Promise.all([
    getTerminalOverview(),
    getRotationMatrix(1),
    getGlobalHotStocks(10),
    getRadarSectors(),
  ]);
  return JSON.stringify(
    {
      overview: {
        marketHeat: overview.marketHeat,
        breadth: `${overview.upCount}/${overview.downCount}`,
        limitUpApprox: overview.limitUpApprox,
        topSectors: overview.topSectors,
        note: overview.dataQualityNote,
      },
      rotationPath: rotation.path,
      hotStocks: hot.map((s) => ({
        code: s.code,
        name: s.name,
        heat: s.heat,
        change: s.change,
        theme: s.themeName,
      })),
      radar: radar.slice(0, 6),
    },
    null,
    2
  );
}
