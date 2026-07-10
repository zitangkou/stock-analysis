import { INITIAL_SECTORS, INITIAL_STOCKS } from "./marketEngine.js";

export type ThemeSectorMeta = { id: string; name: string };

/** Same 10 theme sectors as the original heatmap UI. */
export const THEME_SECTORS: ThemeSectorMeta[] = INITIAL_SECTORS.map((s) => ({
  id: s.id,
  name: s.name,
}));

/** Curated code → theme sector (from original demo lists). */
export const CODE_TO_THEME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [sectorId, stocks] of Object.entries(INITIAL_STOCKS)) {
    for (const s of stocks) {
      map[s.code] = sectorId;
    }
  }
  return map;
})();

/**
 * Map Eastmoney/akshare 「所处行业」 names onto the 10 theme sectors.
 * First matching keyword wins — order matters (more specific first).
 */
const INDUSTRY_RULES: Array<{ sectorId: string; keywords: string[] }> = [
  {
    sectorId: "semiconductor",
    keywords: ["半导体", "集成电路", "芯片", "电子元件", "元件", "印制电路板", "PCB"],
  },
  {
    sectorId: "ai",
    keywords: [
      "软件开发",
      "软件服务",
      "IT服务",
      "互联网服务",
      "计算机设备",
      "计算机应用",
      "通信设备",
      "通信服务",
      "游戏",
      "人工智能",
    ],
  },
  {
    sectorId: "nev",
    keywords: [
      "汽车整车",
      "汽车零部件",
      "新能源汽车",
      "电池",
      "锂电",
      "储能",
      "电机",
      "充电桩",
    ],
  },
  {
    sectorId: "biotech",
    keywords: [
      "化学制药",
      "中药",
      "生物制品",
      "医药商业",
      "医疗器械",
      "医疗服务",
      "医药",
      "生物",
    ],
  },
  {
    sectorId: "liquor",
    keywords: [
      "白酒",
      "啤酒",
      "饮料制造",
      "食品加工",
      "食品饮料",
      "白色家电",
      "家电",
      "调味发酵品",
      "乳品",
    ],
  },
  {
    sectorId: "military",
    keywords: ["航天", "航空", "军工", "船舶", "航海", "地面兵装", "国防"],
  },
  {
    sectorId: "finance",
    keywords: [
      "证券",
      "银行",
      "保险",
      "多元金融",
      "金融",
      "信托",
      "期货",
      "租赁",
    ],
  },
  {
    sectorId: "metals",
    keywords: [
      "有色",
      "黄金",
      "铜",
      "铝",
      "锌",
      "铅",
      "稀土",
      "钢铁",
      "采掘",
      "能源金属",
      "贵金属",
      "工业金属",
    ],
  },
  {
    sectorId: "realestate",
    keywords: ["房地产开发", "房地产", "装修装饰", "水泥", "建筑装饰", "基建", "工程咨询"],
  },
  {
    sectorId: "greenenergy",
    keywords: [
      "光伏",
      "风电",
      "电力",
      "电网",
      "火电",
      "水电",
      "新能源发电",
      "电气设备",
      "电源设备",
      "输变电",
    ],
  },
];

export function themeFromIndustry(industry: string | null | undefined): string | null {
  if (!industry) return null;
  for (const rule of INDUSTRY_RULES) {
    if (rule.keywords.some((k) => industry.includes(k))) {
      return rule.sectorId;
    }
  }
  return null;
}

export function resolveThemeSector(opts: {
  code: string;
  themeId?: string | null;
  industry?: string | null;
}): string | null {
  if (opts.themeId && THEME_SECTORS.some((s) => s.id === opts.themeId)) {
    return opts.themeId;
  }
  const byCode = CODE_TO_THEME[opts.code];
  if (byCode) return byCode;
  return themeFromIndustry(opts.industry);
}

export function themeName(id: string): string {
  return THEME_SECTORS.find((s) => s.id === id)?.name || id;
}
