import { useState, useEffect, useRef } from "react";
import {
  Activity,
  RefreshCw,
  Play,
  Pause,
  SlidersHorizontal,
  TrendingUp,
  Sparkles,
  RotateCcw,
  Layers,
  Globe,
  ArrowRight,
  Clock,
  Settings,
  Flame,
  FileText,
  BadgeAlert,
  Sliders,
  ChevronDown,
  LineChart
} from "lucide-react";
import { MarketDataPoint, Sector, Stock, ScrapeLog, MarketState } from "./types";
import HistoryChart from "./components/HistoryChart";
import HeatmapGrid from "./components/HeatmapGrid";
import StockList from "./components/StockList";
import ScrapeLogRail from "./components/ScrapeLogRail";

// 每个行业板块的量化底层特征因子（决定了在调整不同权重时，各个板块的温度敏感度）
const SECTOR_BIASES: Record<string, { news: number; forum: number; volume: number; price: number }> = {
  semiconductor: { news: 0.25, forum: 0.35, volume: 0.20, price: 0.20 },
  ai:            { news: 0.20, forum: 0.45, volume: 0.15, price: 0.20 },
  nev:           { news: 0.25, forum: 0.25, volume: 0.35, price: 0.15 },
  biotech:       { news: 0.40, forum: 0.20, volume: 0.15, price: 0.25 },
  liquor:        { news: 0.15, forum: 0.30, volume: 0.40, price: 0.15 },
  military:      { news: 0.45, forum: 0.15, volume: 0.15, price: 0.25 },
  finance:       { news: 0.30, forum: 0.15, volume: 0.45, price: 0.10 },
  metals:        { news: 0.20, forum: 0.20, volume: 0.35, price: 0.25 },
  realestate:    { news: 0.35, forum: 0.25, volume: 0.25, price: 0.15 },
  greenenergy:   { news: 0.30, forum: 0.20, volume: 0.30, price: 0.20 }
};

export default function App() {
  // 数据与状态
  const [timeline, setTimeline] = useState<MarketDataPoint[]>([]);
  const [currentSectors, setCurrentSectors] = useState<Sector[]>([]);
  const [scrapeLogs, setScrapeLogs] = useState<ScrapeLog[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isLiveScraping, setIsLiveScraping] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("正在连接终端控制台...");

  // 量化核心权重配比 (新闻、社区论坛、资金成交额、价格热度)
  const [weights, setWeights] = useState({
    news: 30,
    forum: 25,
    volume: 25,
    price: 20
  });

  // AI 题材轮动报告状态
  const [aiReport, setAiReport] = useState<string>("");
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);

  // 用户交互控制
  const [selectedSectorId, setSelectedSectorId] = useState<string>("semiconductor");
  const [activeTimeIndex, setActiveTimeIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [scrapeInterval, setScrapeInterval] = useState<number>(300000); // 默认 5分钟 (300000 毫秒)
  const [countdown, setCountdown] = useState<number>(300); // 倒计时秒数

  // 定时器引用
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. 带重试机制的高鲁棒性网络拉取器（防止服务端在启动/重启时，前端瞬间并发请求导致 Failed to fetch）
  const fetchWithRetry = async (url: string, retries = 5, delay = 1000): Promise<Response> => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP 异常！状态码: ${res.status}`);
      }
      return res;
    } catch (err) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchWithRetry(url, retries - 1, delay * 1.5);
      }
      throw err;
    }
  };

  // 1.2. 初始化与拉取数据
  const fetchMarketData = async (isFirstLoad: boolean = false) => {
    try {
      const res = await fetchWithRetry("/api/market-data", isFirstLoad ? 6 : 2, 800);
      const data: MarketState = await res.json();
      
      setTimeline(data.timeline);
      setCurrentSectors(data.currentSectors);
      setLastUpdated(data.lastUpdated);
      setIsLiveScraping(data.isLiveScraping);
      if (isFirstLoad || !data.isLiveScraping) {
        setStatusMessage(data.statusMessage);
      }

      // 首次加载或在“现在”状态时，自动对齐到最新一个点
      if (isFirstLoad && data.timeline.length > 0) {
        setActiveTimeIndex(data.timeline.length - 1);
      }
    } catch (err) {
      console.error("拉取数据失败:", err);
      setStatusMessage("与服务器连接不稳定，正在尝试重新连接...");
    }
  };

  const fetchScrapeLogs = async () => {
    try {
      const res = await fetchWithRetry("/api/scrape-logs", 2, 800);
      const logs = await res.json();
      setScrapeLogs(logs);
    } catch (err) {
      console.error("拉取日志失败:", err);
    }
  };

  // 触发全面同步
  const syncAll = async (isFirstLoad: boolean = false) => {
    await fetchMarketData(isFirstLoad);
    await fetchScrapeLogs();
  };

  // 2. 定时轮询 (8秒/次) 自动追加
  useEffect(() => {
    syncAll(true);

    pollingTimerRef.current = setInterval(() => {
      if (autoRefresh && !isLiveScraping && !isPlaying) {
        fetchMarketData(false);
        fetchScrapeLogs();
      }
    }, 8000);

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [autoRefresh, isLiveScraping, isPlaying]);

  // 3. 历史播放器控制器：按顺序展现今天一整天的热度推演
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setActiveTimeIndex((prevIdx) => {
          if (prevIdx >= timeline.length - 1) {
            setIsPlaying(false);
            return prevIdx;
          }
          return prevIdx + 1;
        });
      }, 1500);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, timeline.length]);

  // 4. 触发全面爬网及 AI 模型研判
  const handleTriggerScrape = async () => {
    if (isLiveScraping) return;
    setIsLiveScraping(true);
    setStatusMessage("启动分布式舆情蜘蛛爬虫...");
    
    const intervalMins = scrapeInterval >= 60000 ? `${scrapeInterval / 60000}分钟` : `${scrapeInterval / 1000}秒`;
    const steps = [
      `抓取雪球、淘股吧最新${intervalMins}贴群讨论特征...`,
      "整合东方财富主力大单流向和提及频率...",
      "检索全网宏观财经资讯与突发公告...",
      "调遣 Gemini 研判全网题材概念热力强度...",
      "核对加权数据库，合并时序新节点中..."
    ];

    let currentStep = 0;
    const stepInterval = setInterval(() => {
      if (currentStep < steps.length) {
        setStatusMessage(steps[currentStep]);
        currentStep++;
      } else {
        clearInterval(stepInterval);
      }
    }, 1200);

    try {
      const res = await fetch("/api/trigger-scrape", { method: "POST" });
      const data = await res.json();
      
      clearInterval(stepInterval);

      if (data.success) {
        setTimeline(data.state.timeline);
        setCurrentSectors(data.state.currentSectors);
        setLastUpdated(data.state.lastUpdated);
        setStatusMessage(data.state.statusMessage);
        setActiveTimeIndex(data.state.timeline.length - 1);
        await fetchScrapeLogs();
      } else {
        setStatusMessage("研判计算遭遇短暂阻塞，已启用高精密量化算法备份归集。");
      }
    } catch (err) {
      console.error("触发抓取错误:", err);
      setStatusMessage("连接抓取中心失败。");
    } finally {
      setIsLiveScraping(false);
    }
  };

  // 4.1. 定时自动爬网倒计时与自适应触发
  useEffect(() => {
    // 每次时间间隔改变，或者抓取结束时，重新校准倒计时
    setCountdown(scrapeInterval / 1000);
  }, [scrapeInterval, isLiveScraping]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (autoRefresh && !isLiveScraping && !isPlaying) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            handleTriggerScrape();
            return scrapeInterval / 1000;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [autoRefresh, scrapeInterval, isLiveScraping, isPlaying]);

  // 当用户调整定时爬网时间间隔时，同步更新后端的全局自适应计算频率变量
  useEffect(() => {
    const updateBackendInterval = async () => {
      try {
        await fetch("/api/update-interval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intervalMs: scrapeInterval })
        });
      } catch (err) {
        console.error("同步更新自适应频率至后端失败:", err);
      }
    };
    updateBackendInterval();
  }, [scrapeInterval]);

  // 5. 重置演练数据
  const handleResetData = async () => {
    if (!window.confirm("确定要重置今日的所有舆情抓取记录和模拟时序点吗？")) return;
    setStatusMessage("正在复位时序热度引擎...");
    setAiReport("");
    try {
      const res = await fetch("/api/reset-data", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTimeline(data.state.timeline);
        setCurrentSectors(data.state.currentSectors);
        setLastUpdated(data.state.lastUpdated);
        setStatusMessage("时序热度引擎复位完成！");
        setActiveTimeIndex(data.state.timeline.length - 1);
        await fetchScrapeLogs();
      }
    } catch (err) {
      console.error("重置失败:", err);
      setStatusMessage("复位失败。");
    }
  };

  // 6. 智能生成盘中题材轮动大模型研判报告
  const handleGenerateAIReport = async () => {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
    setAiReport("");
    try {
      const res = await fetch("/api/ai-rotation-report", { method: "POST" });
      const data = await res.json();
      if (data.report) {
        setAiReport(data.report);
      } else {
        setAiReport("未能成功获取研判报告，请确认服务端配置。");
      }
    } catch (err) {
      console.error("生成报告失败:", err);
      setAiReport("连接研判算力节点超时，请确认 API Key 是否在 Secrets 中就位。");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // 7. 一键加载预设的量化权重配比
  const applyPresetWeights = (preset: "retail" | "institutional" | "policy" | "balanced") => {
    switch (preset) {
      case "retail":
        setWeights({ news: 10, forum: 60, volume: 15, price: 15 });
        break;
      case "institutional":
        setWeights({ news: 15, forum: 10, volume: 50, price: 25 });
        break;
      case "policy":
        setWeights({ news: 60, forum: 10, volume: 15, price: 15 });
        break;
      case "balanced":
        setWeights({ news: 30, forum: 25, volume: 25, price: 20 });
        break;
    }
  };

  // ================== 核心量化加权算法（实时动态洗牌驱动） ==================
  const getWeightedHeatValue = (secId: string, baseHeat: number) => {
    const bias = SECTOR_BIASES[secId] || { news: 0.25, forum: 0.25, volume: 0.25, price: 0.25 };
    const sumW = weights.news + weights.forum + weights.volume + weights.price || 1;
    
    const wn = weights.news / sumW;
    const wf = weights.forum / sumW;
    const wv = weights.volume / sumW;
    const wp = weights.price / sumW;

    // 特征与权重的余弦敏感度映射乘数
    const sensitivity = (bias.news * wn + bias.forum * wf + bias.volume * wv + bias.price * wp) * 4;
    const weighted = Math.round(baseHeat * sensitivity);
    return Math.max(10, Math.min(100, weighted)); // 强制约束在合理美观区间
  };

  // 根据用户定义的权重，实时重构整条时间线上的热度（实现同屏全板块对比图的动态变化）
  const weightedTimeline = timeline.map(point => {
    const updatedSectors = { ...point.sectors };
    Object.keys(updatedSectors).forEach(secId => {
      updatedSectors[secId] = {
        ...updatedSectors[secId],
        heat: getWeightedHeatValue(secId, updatedSectors[secId].heat)
      };
    });
    return {
      ...point,
      sectors: updatedSectors
    };
  });

  const isViewingHistory = activeTimeIndex !== -1 && activeTimeIndex !== timeline.length - 1;
  const activePointSnapshot = weightedTimeline[activeTimeIndex];

  // 渲染展示用的 sectors 树，同步响应权重
  let displaySectors: Sector[] = currentSectors.map(sec => {
    const weightedHeat = getWeightedHeatValue(sec.id, sec.heat);
    return { ...sec, heat: weightedHeat };
  });

  if (isViewingHistory && activePointSnapshot) {
    displaySectors = currentSectors.map((sec) => {
      const histSec = activePointSnapshot.sectors[sec.id] || { heat: 50, change: 0, sentimentScore: 50, description: "" };
      const histStocksData = activePointSnapshot.stocks[sec.id] || [];

      // 重构历史股票细节，同步让个股热度受板块权重变化洗牌重新排序
      const histStocks: Stock[] = histStocksData.map((s, idx) => {
        const defaultPrice = currentSectors.find(cs => cs.id === sec.id)?.hotStocks.find(csstk => csstk.code === s.code)?.price || 10;
        // 个股基础热度乘以板块权重调节系数
        const adjustedStockHeat = Math.max(10, Math.min(100, Math.round(s.heat * (getWeightedHeatValue(sec.id, 50) / 50))));
        return {
          code: s.code,
          name: s.name,
          heat: adjustedStockHeat,
          change: s.change,
          price: defaultPrice,
          sentiment: s.sentiment || 'neutral',
          discussionCount: Math.floor(adjustedStockHeat * 5.4 + Math.random() * 20),
          rank: idx + 1
        };
      });

      return {
        ...sec,
        heat: histSec.heat, // 已经应用加权
        change: histSec.change,
        sentimentScore: histSec.sentimentScore,
        hotStocks: histStocks.sort((a, b) => b.heat - a.heat), // 根据加权热度重新排序！
        description: histSec.description || sec.description
      };
    });
  } else {
    // 即使是非历史浏览，个股也保持动态权重洗牌排序
    displaySectors = displaySectors.map(sec => {
      const sortedStocks = [...sec.hotStocks].map(s => {
        const adjustedStockHeat = Math.max(10, Math.min(100, Math.round(s.heat * (getWeightedHeatValue(sec.id, 50) / 50))));
        return {
          ...s,
          heat: adjustedStockHeat,
          discussionCount: Math.floor(adjustedStockHeat * 5.4)
        };
      }).sort((a, b) => b.heat - a.heat);
      
      return {
        ...sec,
        hotStocks: sortedStocks
      };
    });
  }

  // 获取当前选中板块
  const activeSector = displaySectors.find((s) => s.id === selectedSectorId) || displaySectors[0];

  // 筛选出当前可视的板块：默认只显示最热的 6 个板块（始终保留并包含选中板块，防止在左侧消失）
  const getVisibleSectors = () => {
    // 按热度降序，取前 6 个
    const sortedByHeat = [...displaySectors].sort((a, b) => b.heat - a.heat);
    const top6 = sortedByHeat.slice(0, 6);
    const isSelectedIncluded = top6.some(s => s.id === selectedSectorId);
    
    if (!isSelectedIncluded) {
      const selectedSec = displaySectors.find(s => s.id === selectedSectorId);
      if (selectedSec) {
        // 替换最后一个，确保选中的在列表内
        top6[5] = selectedSec;
      }
    }
    return top6;
  };
  const visibleSectors = getVisibleSectors();

  // 今日热度飙升动量计算 (选取当前时刻与3个节点前的热度差)
  const getSectorsMomentum = () => {
    if (weightedTimeline.length < 3) return [];
    const currentPoint = weightedTimeline[weightedTimeline.length - 1];
    const pastPoint = weightedTimeline[weightedTimeline.length - 3];
    
    return Object.keys(currentPoint.sectors).map(id => {
      const curH = currentPoint.sectors[id]?.heat || 50;
      const pastH = pastPoint.sectors[id]?.heat || 50;
      const diff = curH - pastH;
      const secName = currentSectors.find(s => s.id === id)?.name || id;
      return { id, name: secName, diff, currentHeat: curH };
    });
  };

  const sectorMomentum = getSectorsMomentum();
  const topGainers = [...sectorMomentum].sort((a, b) => b.diff - a.diff).slice(0, 3);
  const topLosers = [...sectorMomentum].sort((a, b) => a.diff - b.diff).slice(0, 3);

  // 格式化倒计时（秒）为 MM:SS 格式
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Markdown 简易富文本渲染函数
  const renderBoldText = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="text-amber-400 font-bold">{part}</strong>;
      }
      return part;
    });
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-[13px] font-bold text-slate-100 mt-5 mb-2.5 border-l-2 border-red-500 pl-2 flex items-center gap-1.5 font-sans">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-red-400 mt-6 mb-3 flex items-center gap-2 border-b border-slate-900 pb-1.5 font-sans">
            {line.replace("## ", "")}
          </h3>
        );
      }
      if (line.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-base font-extrabold text-slate-100 mt-7 mb-4 bg-slate-900/60 p-2.5 rounded border border-slate-800/50 font-sans">
            {line.replace("# ", "")}
          </h2>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const cleanLine = line.substring(2);
        return (
          <ul key={idx} className="list-disc list-inside ml-2.5 text-xs text-slate-300 leading-relaxed my-1.5 font-sans">
            <li>{renderBoldText(cleanLine)}</li>
          </ul>
        );
      }
      const numMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        return (
          <div key={idx} className="ml-1 text-xs text-slate-300 leading-relaxed my-2 pl-3 border-l border-slate-800 font-sans">
            <span className="font-mono font-bold text-amber-500 mr-1">{numMatch[1]}. </span>
            {renderBoldText(numMatch[2])}
          </div>
        );
      }
      if (line.trim() === "") {
        return <div key={idx} className="h-2"></div>;
      }
      return <p key={idx} className="text-xs text-slate-300 leading-relaxed my-1.5 font-sans">{renderBoldText(line)}</p>;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* 顶部导航条 / 状态面板 */}
      <header className="border-b border-slate-900 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
              <Activity className="w-6 h-6 text-red-500 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-100">
                  股票市场多维热度分发与舆情轮动监控终端
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red-500/15 text-red-400 border border-red-500/10">
                  A股社交舆情量化版
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLiveScraping ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isLiveScraping ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                </span>
                <span className="text-slate-400 font-mono">
                  {statusMessage}
                </span>
              </div>
            </div>
          </div>

          {/* 控制选项与按钮组 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 自动量化爬网与可调时间间隔 */}
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-xs select-none">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-red-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-300 font-medium font-sans">定时自动爬网</span>
              </label>
              
              <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>
              
              <select
                value={scrapeInterval}
                onChange={(e) => setScrapeInterval(Number(e.target.value))}
                disabled={!autoRefresh}
                className="bg-transparent text-amber-400 font-medium border-none focus:ring-0 py-0 pl-1 pr-1 text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed outline-none font-sans"
              >
                <option value={15000} className="bg-slate-950 text-slate-300">15秒 (调试)</option>
                <option value={60000} className="bg-slate-950 text-slate-300">1分钟</option>
                <option value={180000} className="bg-slate-950 text-slate-300">3分钟</option>
                <option value={300000} className="bg-slate-950 text-slate-300">5分钟</option>
                <option value={600000} className="bg-slate-950 text-slate-300">10分钟</option>
                <option value={900000} className="bg-slate-950 text-slate-300">15分钟</option>
              </select>

              {autoRefresh && (
                <>
                  <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    下一轮自启: <strong className="text-red-400 font-bold font-mono">{formatCountdown(countdown)}</strong>
                  </span>
                </>
              )}
            </div>

            {/* 重置引擎 */}
            <button
              onClick={handleResetData}
              disabled={isLiveScraping}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 disabled:opacity-50 text-slate-400 hover:text-slate-100 rounded-lg text-xs transition-colors cursor-pointer"
              title="重置今日时间线及爬虫数据"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* 核心爬网AI分析按钮 */}
            <button
              onClick={handleTriggerScrape}
              disabled={isLiveScraping}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-md transition-all ${
                isLiveScraping
                  ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-600 active:scale-95 text-white shadow-red-500/10 cursor-pointer"
              }`}
            >
              <Sparkles className={`w-4 h-4 ${isLiveScraping ? 'animate-spin' : ''}`} />
              <span>{isLiveScraping ? "全网抓取分析中..." : "立即爬网并AI研判"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 主界面网格布局 */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 lg:p-6 space-y-6">
        {/* 历史视图锁定提示栏 */}
        {isViewingHistory && activePointSnapshot && (
          <div className="bg-amber-950/40 border border-amber-900/60 rounded-xl px-4 py-3 text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 animate-fade-in">
            <div className="flex items-center gap-2 text-amber-300">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                正在回溯查看今日 <strong>{activePointSnapshot.time}</strong> 的历史快照。全行业热力矩阵、全板块对比折线、个股热度榜均已联动重算复原。
              </span>
            </div>
            <button
              onClick={() => setActiveTimeIndex(timeline.length - 1)}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 border border-amber-800 bg-amber-950/60 hover:bg-amber-900/40 px-2.5 py-1 rounded transition-all shrink-0 cursor-pointer"
            >
              <span>返回最新时刻</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 1. 时序折线图（大屏满宽呈现）与 2分钟分时推演控制器 (移至最顶部，一眼即看) */}
        <div className="space-y-4">
          <section id="chart-section" className="w-full">
            <HistoryChart
              timeline={weightedTimeline} // 传入实时重新计算好的时间线，达到拖拽滑块，折线图完美实时变幻！
              selectedSectorId={selectedSectorId}
              selectedSectorName={activeSector?.name || "行业"}
              activeTimeIndex={activeTimeIndex}
              setActiveTimeIndex={setActiveTimeIndex}
            />
          </section>

          {/* 播放控制区 + 拖动滑块 */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={timeline.length <= 1}
                className={`p-2.5 rounded-full border transition-all cursor-pointer ${
                  isPlaying
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-100"
                }`}
                title={isPlaying ? "暂停演练" : "自动演示一天的热度推演"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
              <div className="text-xs">
                <span className="text-slate-400 block font-medium">全天演练推演</span>
                <span className="text-[10px] text-slate-500">步进速度: 2m/1.5s</span>
              </div>
            </div>

            {/* 滑动条 */}
            <div className="flex-1 w-full flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500 shrink-0">
                {timeline[0]?.time || "09:30"}
              </span>
              
              <div className="flex-1 relative flex items-center">
                <input
                  type="range"
                  min="0"
                  max={timeline.length > 0 ? timeline.length - 1 : 0}
                  value={activeTimeIndex !== -1 ? activeTimeIndex : 0}
                  disabled={timeline.length <= 1}
                  onChange={(e) => {
                    setIsPlaying(false); // 手动拖拽时暂停自动播放
                    setActiveTimeIndex(parseInt(e.target.value, 10));
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none"
                />
              </div>

              <span className="font-mono text-xs text-amber-400 font-semibold shrink-0">
                {activePointSnapshot?.time || "15:00"}
              </span>
            </div>
          </div>
        </div>

        {/* 2. 题材板块矩阵（2行10个 + 划动刷新）与个股热度榜并排布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：行业板块热度矩阵区 (HeatmapGrid) */}
          <div className="lg:col-span-7">
            <section id="sector-heatmap-section">
              <HeatmapGrid
                sectors={visibleSectors}
                selectedSectorId={selectedSectorId}
                setSelectedSectorId={setSelectedSectorId}
                timeline={weightedTimeline}
                onSwipeRefresh={handleTriggerScrape}
                isRefreshing={isLiveScraping}
              />
            </section>
          </div>

          {/* 右侧：个股热度榜 TOP 10 (对齐左边题材板块) */}
          <div className="lg:col-span-5">
            <section id="stocks-section" className="h-full">
              <StockList
                stocks={(activeSector?.hotStocks || []).slice(0, 10)}
                sectorName={activeSector?.name || ""}
              />
            </section>
          </div>
        </div>

        {/* 3. 权重配置与题材动量异动仪 (移至最下方) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：量化算分权重调节面板 */}
          <div className="lg:col-span-8 bg-slate-900/80 border border-slate-900 p-5 rounded-xl flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4 border-b border-slate-800/40 pb-2">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Sliders className="w-4 h-4 text-rose-500" />
                热度计算引擎 · 因子权重自定义分配
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">复合重算: 实时响应驱动</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3.5">
                {/* 新闻 */}
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 hover:border-slate-800/80 transition-colors">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>📰</span> 新闻公告因子
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 shadow-sm transition-all">
                      {weights.news}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={weights.news}
                    onChange={(e) => setWeights({ ...weights, news: parseInt(e.target.value, 10) })}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none border border-slate-700/40 transition-all"
                    style={{
                      background: `linear-gradient(to right, #f43f5e 0%, #f43f5e ${weights.news}%, #1e293b ${weights.news}%, #1e293b 100%)`
                    }}
                  />
                </div>

                {/* 论坛 */}
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 hover:border-slate-800/80 transition-colors">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>💬</span> 社区讨论热度
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 shadow-sm transition-all">
                      {weights.forum}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={weights.forum}
                    onChange={(e) => setWeights({ ...weights, forum: parseInt(e.target.value, 10) })}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none border border-slate-700/40 transition-all"
                    style={{
                      background: `linear-gradient(to right, #f43f5e 0%, #f43f5e ${weights.forum}%, #1e293b ${weights.forum}%, #1e293b 100%)`
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3.5">
                {/* 资金 */}
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 hover:border-slate-800/80 transition-colors">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>💰</span> 主力资金流向
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 shadow-sm transition-all">
                      {weights.volume}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={weights.volume}
                    onChange={(e) => setWeights({ ...weights, volume: parseInt(e.target.value, 10) })}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none border border-slate-700/40 transition-all"
                    style={{
                      background: `linear-gradient(to right, #f43f5e 0%, #f43f5e ${weights.volume}%, #1e293b ${weights.volume}%, #1e293b 100%)`
                    }}
                  />
                </div>

                {/* 价格 */}
                <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-900/60 hover:border-slate-800/80 transition-colors">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>📈</span> 价格活跃因子
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/20 shadow-sm transition-all">
                      {weights.price}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={weights.price}
                    onChange={(e) => setWeights({ ...weights, price: parseInt(e.target.value, 10) })}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none border border-slate-700/40 transition-all"
                    style={{
                      background: `linear-gradient(to right, #f43f5e 0%, #f43f5e ${weights.price}%, #1e293b ${weights.price}%, #1e293b 100%)`
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 算分预设配置器 */}
            <div className="mt-4 pt-3 border-t border-slate-800/40 flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-[11px] text-slate-500">一键量化模式预设：</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => applyPresetWeights("balanced")}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded text-[11px] text-slate-300 cursor-pointer transition-colors"
                >
                  ⚖️ 均衡量化
                </button>
                <button
                  onClick={() => applyPresetWeights("retail")}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded text-[11px] text-amber-400 cursor-pointer transition-colors"
                >
                  🔥 游资散户偏好
                </button>
                <button
                  onClick={() => applyPresetWeights("institutional")}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded text-[11px] text-blue-400 cursor-pointer transition-colors"
                >
                  🏛️ 机构主力大单
                </button>
                <button
                  onClick={() => applyPresetWeights("policy")}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded text-[11px] text-purple-400 cursor-pointer transition-colors"
                >
                  📰 政策宏观主导
                </button>
              </div>
            </div>
          </div>

          {/* 右侧：题材动量/温度计排行榜 (极佳的板块轮动特征抓取) */}
          <div className="lg:col-span-4 bg-slate-900/80 border border-slate-900 p-5 rounded-xl flex flex-col justify-between">
            <div className="flex justify-between items-center mb-2.5 border-b border-slate-800/40 pb-2">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Flame className="w-4 h-4 text-amber-500" />
                今日题材动量异动仪
              </h3>
              <span className="text-[10px] text-amber-400 font-mono">LATEST ROTATION</span>
            </div>

            {sectorMomentum.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-6">
                需累积 3 个时序点（约30分钟）以输出题材攀升/退潮斜率
              </div>
            ) : (
              <div className="space-y-3">
                {/* 飙升最快 */}
                <div>
                  <div className="text-[10px] text-red-400 font-bold mb-1 flex items-center gap-1">
                    <span>▲ 今日快速吸筹/热度爬升 TOP 2:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {topGainers.slice(0, 2).map((g, idx) => (
                      <div
                        key={g.id}
                        onClick={() => setSelectedSectorId(g.id)}
                        className="p-1.5 bg-slate-950/80 rounded border border-red-950/40 text-left cursor-pointer hover:border-red-500/30 transition-colors"
                      >
                        <div className="text-[11px] font-bold text-slate-200 truncate">{g.name}</div>
                        <div className="text-[10px] font-mono text-red-400 mt-0.5">斜率: +{g.diff}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 退潮最快 */}
                <div>
                  <div className="text-[10px] text-green-400 font-bold mb-1 flex items-center gap-1">
                    <span>▼ 今日失血回调/热度退散 TOP 2:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {topLosers.slice(0, 2).map((l, idx) => (
                      <div
                        key={l.id}
                        onClick={() => setSelectedSectorId(l.id)}
                        className="p-1.5 bg-slate-950/80 rounded border border-green-950/40 text-left cursor-pointer hover:border-green-500/30 transition-colors"
                      >
                        <div className="text-[11px] font-bold text-slate-200 truncate">{l.name}</div>
                        <div className="text-[10px] font-mono text-green-400 mt-0.5">斜率: {l.diff}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. 新增高阶：大模型题材轮动量化复盘智囊端 (Gemini Rotation Copilot) */}
        <section id="ai-report-copilot" className="bg-slate-900 border border-slate-900 rounded-xl p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/60 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <FileText className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Gemini 3.5 AI 题材舆情轮动智能研判报告
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  自动梳理今日 {scrapeInterval >= 60000 ? `${scrapeInterval / 60000}分钟` : `${scrapeInterval / 1000}秒`} 舆情轨迹，联动 Google Search 实时研判突发主线，输出机构级推演策略。
                </p>
              </div>
            </div>

            <button
              onClick={handleGenerateAIReport}
              disabled={isGeneratingReport || timeline.length === 0}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer ${
                isGeneratingReport
                  ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 to-red-500 hover:from-amber-600 hover:to-red-600 text-white font-bold active:scale-95"
              }`}
            >
              {isGeneratingReport ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>大模型思考撰写中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>智能诊断今日轮动主线</span>
                </>
              )}
            </button>
          </div>

          {aiReport ? (
            <div className="bg-slate-950/70 border border-slate-900/80 rounded-xl p-5 max-h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 text-slate-300 leading-relaxed text-xs">
              {renderMarkdown(aiReport)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
              <Sparkles className="w-6 h-6 mb-2 text-slate-600 animate-pulse" />
              <p>暂无今日诊断报告。点击上方按钮可召唤大模型融合全天分时轨迹进行盘中深度研判。</p>
            </div>
          )}
        </section>

        {/* 4. 底部蛛网采集流 */}
        <section id="logs-section">
          <ScrapeLogRail logs={scrapeLogs} />
        </section>
      </main>

      {/* 底部版权与免责声明 */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-700" />
            <span>数据源自动关联分析：雪球股吧 · 淘股吧 · 东方财富论坛 · 新浪财经社区</span>
          </div>
          <div>
            <span>免责声明：本终端所有热力数值和舆情倾向为大模型抓取推演生成，不构成任何投资依据，入市需谨慎。</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
