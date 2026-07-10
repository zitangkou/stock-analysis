export interface Stock {
  code: string;
  name: string;
  heat: number;        // 热度值 (0 - 100)
  change: number;      // 涨跌幅 %
  price: number;       // 当前价格
  sentiment: 'positive' | 'neutral' | 'negative'; // 舆情倾向（代理）
  discussionCount: number; // 讨论次数（代理）
  rank: number;        // 板块内热度排名
  themeId?: string;
  themeName?: string;
  momentum?: number;
  netInflowProxy?: number;
  isLimitUpApprox?: boolean;
  dataQuality?: 'full' | 'proxy' | 'partial';
}

export interface Sector {
  id: string;
  name: string;
  heat: number;        // 行业板块热度 (0 - 100)
  change: number;      // 板块平均涨跌幅 %
  sentimentScore: number; // 舆情指数 (0 - 100) — 代理
  hotStocks: Stock[];  // 热度前十的股票
  description: string; // 板块热点简述
  momentum?: number;
  acceleration?: number;
  netInflowProxy?: number;
  upCount?: number;
  downCount?: number;
  stockCount?: number;
  dataQuality?: 'full' | 'proxy' | 'partial';
}

export interface MarketDataPoint {
  time: string;        // 时间点 (例如 "09:30", "09:40")
  sectors: {
    [sectorId: string]: {
      heat: number;
      change: number;
      sentimentScore: number;
      description?: string;
    };
  };
  // 每个时间点的前十股票快照，用于绘制单只股票的热度历史
  stocks: {
    [sectorId: string]: Array<{
      code: string;
      name: string;
      heat: number;
      change: number;
      sentiment?: 'positive' | 'neutral' | 'negative';
    }>;
  };
}

export interface MarketState {
  timeline: MarketDataPoint[];
  currentSectors: Sector[];
  lastUpdated: string;
  isLiveScraping: boolean;
  statusMessage: string;
  heatSource?: 'persisted' | 'computed' | 'mock';
}

export interface ScrapeLog {
  time: string;
  source: string;
  title: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  weight: number;
}

export type TerminalModule =
  | 'overview'
  | 'heatmap'
  | 'rank'
  | 'radar'
  | 'rotation'
  | 'ai'
  | 'alerts';
