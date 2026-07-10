import { useEffect, useRef, useState } from "react";
import {
  Activity,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  FileText,
} from "lucide-react";
import type {
  MarketDataPoint,
  MarketState,
  ScrapeLog,
  Sector,
  TerminalModule,
} from "./types";
import ModuleNav from "./components/ModuleNav";
import OverviewPanel from "./components/OverviewPanel";
import HeatmapGrid from "./components/HeatmapGrid";
import StockList from "./components/StockList";
import HistoryChart from "./components/HistoryChart";
import RankPanel from "./components/RankPanel";
import RadarPanel from "./components/RadarPanel";
import RotationPanel from "./components/RotationPanel";
import AlertsPanel from "./components/AlertsPanel";
import ScrapeLogRail from "./components/ScrapeLogRail";

export default function App() {
  const [module, setModule] = useState<TerminalModule>("heatmap");
  const [timeline, setTimeline] = useState<MarketDataPoint[]>([]);
  const [currentSectors, setCurrentSectors] = useState<Sector[]>([]);
  const [scrapeLogs, setScrapeLogs] = useState<ScrapeLog[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [isLiveScraping, setIsLiveScraping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("正在连接终端...");
  const [heatSource, setHeatSource] = useState<string>("");

  const [aiReport, setAiReport] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [selectedSectorId, setSelectedSectorId] = useState("semiconductor");
  const [activeTimeIndex, setActiveTimeIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWithRetry = async (
    url: string,
    retries = 5,
    delay = 1000
  ): Promise<Response> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, delay));
        return fetchWithRetry(url, retries - 1, delay * 1.5);
      }
      throw err;
    }
  };

  const fetchMarketData = async (isFirstLoad = false) => {
    try {
      const res = await fetchWithRetry("/api/market-data", isFirstLoad ? 6 : 2, 800);
      const data: MarketState = await res.json();
      setTimeline(data.timeline);
      setCurrentSectors(data.currentSectors);
      setLastUpdated(data.lastUpdated);
      setIsLiveScraping(data.isLiveScraping);
      setHeatSource(data.heatSource || "");
      if (isFirstLoad || !data.isLiveScraping) {
        setStatusMessage(data.statusMessage);
      }
      if (isFirstLoad && data.timeline.length > 0) {
        setActiveTimeIndex(data.timeline.length - 1);
      }
    } catch {
      setStatusMessage("与服务器连接不稳定，正在重试...");
    }
  };

  const fetchScrapeLogs = async () => {
    try {
      const res = await fetchWithRetry("/api/scrape-logs", 2, 800);
      setScrapeLogs(await res.json());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchMarketData(true);
    fetchScrapeLogs();
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

  useEffect(() => {
    if (!isPlaying || timeline.length === 0) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }
    playTimerRef.current = setInterval(() => {
      setActiveTimeIndex((prev) => {
        if (prev >= timeline.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, timeline.length]);

  const handleTriggerScrape = async () => {
    setIsLiveScraping(true);
    setStatusMessage("正在刷新行情视图...");
    try {
      await fetch("/api/trigger-scrape", { method: "POST" });
      await fetchMarketData(false);
      await fetchScrapeLogs();
    } finally {
      setIsLiveScraping(false);
    }
  };

  const handleResetData = async () => {
    await fetch("/api/reset-data", { method: "POST" });
    await fetchMarketData(true);
  };

  const handleGenerateAiReport = async () => {
    setIsGeneratingReport(true);
    setModule("ai");
    try {
      const res = await fetch("/api/ai-rotation-report", { method: "POST" });
      const data = await res.json();
      setAiReport(data.report || "报告生成失败");
    } catch {
      setAiReport("报告生成失败，请稍后重试");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const displaySectors =
    activeTimeIndex >= 0 && timeline[activeTimeIndex]
      ? currentSectors.map((sec) => {
          const pt = timeline[activeTimeIndex].sectors[sec.id];
          const stocks = timeline[activeTimeIndex].stocks[sec.id] || [];
          if (!pt) return sec;
          return {
            ...sec,
            heat: pt.heat,
            change: pt.change,
            sentimentScore: pt.sentimentScore,
            description: pt.description || sec.description,
            hotStocks: stocks.length
              ? stocks.map((s, i) => ({
                  ...sec.hotStocks[i],
                  ...s,
                  price: sec.hotStocks.find((x) => x.code === s.code)?.price || 0,
                  discussionCount:
                    sec.hotStocks.find((x) => x.code === s.code)?.discussionCount ||
                    0,
                  rank: i + 1,
                }))
              : sec.hotStocks,
          };
        })
      : currentSectors;

  const visibleSectors = (() => {
    const sorted = [...displaySectors].sort((a, b) => b.heat - a.heat);
    const top6 = sorted.slice(0, 6);
    if (!top6.some((s) => s.id === selectedSectorId)) {
      const sel = displaySectors.find((s) => s.id === selectedSectorId);
      if (sel) top6[5] = sel;
    }
    return top6;
  })();

  const activeSector =
    displaySectors.find((s) => s.id === selectedSectorId) || displaySectors[0];

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-[13px] font-bold text-slate-100 mt-4 mb-2 border-l-2 border-red-500 pl-2">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <li key={idx} className="text-xs text-slate-300 ml-4 list-disc my-1">
            {line.slice(2)}
          </li>
        );
      }
      if (!line.trim()) return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed my-1">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased">
      <header className="border-b border-slate-900 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-xl border border-red-500/20">
              <Activity className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold tracking-tight">
                A股题材热力终端
              </h1>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    isLiveScraping ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
                <span className="font-mono truncate max-w-[520px]">{statusMessage}</span>
                {heatSource && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                    {heatSource}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-red-500"
              />
              自动刷新
            </label>
            <button
              type="button"
              onClick={handleResetData}
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-100 cursor-pointer"
              title="刷新"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleTriggerScrape}
              disabled={isLiveScraping}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg text-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLiveScraping ? "animate-spin" : ""}`} />
              刷新行情
            </button>
            <button
              type="button"
              onClick={handleGenerateAiReport}
              disabled={isGeneratingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-lg text-xs disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI 研判
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 md:px-6 py-4">
        <ModuleNav active={module} onChange={setModule} />

        {module === "overview" && (
          <OverviewPanel
            timeline={timeline}
            currentSectors={displaySectors}
            activeTimeIndex={
              activeTimeIndex < 0 ? timeline.length - 1 : activeTimeIndex
            }
            selectedSectorId={selectedSectorId}
            setActiveTimeIndex={(idx) => {
              setIsPlaying(false);
              setActiveTimeIndex(idx);
            }}
          />
        )}

        {module === "heatmap" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 rounded border border-slate-800 bg-slate-900 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(timeline.length - 1, 0)}
                value={activeTimeIndex < 0 ? Math.max(timeline.length - 1, 0) : activeTimeIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setActiveTimeIndex(Number(e.target.value));
                }}
                className="flex-1 accent-red-500"
              />
              <span className="font-mono text-[10px]">
                {lastUpdated
                  ? new Date(lastUpdated).toLocaleString("zh-CN", { hour12: false })
                  : "—"}
              </span>
            </div>
            <div className="grid lg:grid-cols-[1.4fr_0.9fr] gap-4">
              <HeatmapGrid
                sectors={visibleSectors}
                selectedSectorId={selectedSectorId}
                setSelectedSectorId={setSelectedSectorId}
                timeline={timeline}
                onSwipeRefresh={handleTriggerScrape}
                isRefreshing={isLiveScraping}
              />
              <StockList
                stocks={activeSector?.hotStocks || []}
                sectorName={activeSector?.name || ""}
              />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
              <HistoryChart
                timeline={timeline}
                selectedSectorId={selectedSectorId}
                selectedSectorName={activeSector?.name || ""}
                activeTimeIndex={
                  activeTimeIndex < 0 ? timeline.length - 1 : activeTimeIndex
                }
                setActiveTimeIndex={(idx) => {
                  setIsPlaying(false);
                  setActiveTimeIndex(idx);
                }}
              />
            </div>
          </div>
        )}

        {module === "rank" && <RankPanel />}
        {module === "radar" && <RadarPanel />}
        {module === "rotation" && <RotationPanel />}

        {module === "ai" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold">AI 题材轮动研判</h3>
              </div>
              <button
                type="button"
                onClick={handleGenerateAiReport}
                disabled={isGeneratingReport}
                className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 disabled:opacity-50 cursor-pointer"
              >
                {isGeneratingReport ? "生成中..." : "重新生成"}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              输入来自落库热力 / 轮动 / 雷达摘要；资金与涨停若标注 proxy 则为代理指标。
            </p>
            <div className="prose-invert max-w-none">
              {aiReport ? (
                renderMarkdown(aiReport)
              ) : (
                <p className="text-xs text-slate-500">点击「AI 研判」生成报告</p>
              )}
            </div>
          </div>
        )}

        {module === "alerts" && <AlertsPanel />}
      </main>

      <ScrapeLogRail logs={scrapeLogs} />
    </div>
  );
}
