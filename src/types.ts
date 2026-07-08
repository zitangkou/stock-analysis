export interface Stock {
  code: string;
  name: string;
  heat: number;        // 热度值 (0 - 100)
  change: number;      // 涨跌幅 %
  price: number;       // 当前价格
  sentiment: 'positive' | 'neutral' | 'negative'; // 舆情倾向
  discussionCount: number; // 讨论次数
  rank: number;        // 板块内热度排名
}

export interface Sector {
  id: string;
  name: string;
  heat: number;        // 行业板块热度 (0 - 100)
  change: number;      // 板块平均涨跌幅 %
  sentimentScore: number; // 舆情指数 (0 - 100)
  hotStocks: Stock[];  // 热度前十的股票
  description: string; // 板块热点简述 (例如：受到英伟达大涨或国家大基金三期扶持等舆情刺激)
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
}

export interface ScrapeLog {
  time: string;
  source: string;
  title: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  weight: number;
}
