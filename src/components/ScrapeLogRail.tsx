import { ScrapeLog } from "../types.js";
import { Terminal, RefreshCw, MessageSquare } from "lucide-react";

interface ScrapeLogRailProps {
  logs: ScrapeLog[];
}

export default function ScrapeLogRail({ logs }: ScrapeLogRailProps) {
  
  const getSourceStyle = (source: string) => {
    switch (source) {
      case "东财股吧":
      case "东方财富网":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "雪球社区":
        return "bg-sky-500/10 text-sky-400 border-sky-500/20";
      case "淘股吧":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "上海证券报":
      case "每日经济新闻":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "华尔街见闻":
      case "新浪财经":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      default:
        return "bg-slate-800 text-slate-400 border-slate-700/50";
    }
  };

  return (
    <div id="scrape-log-rail" className="bg-slate-950 border border-slate-900 rounded-xl p-5 text-slate-100 flex flex-col h-full shadow-lg">
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-900/60">
        <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          舆情采集蛛网：实时社交发帖与新闻流 (30条快照)
        </h3>
        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>SPIDER ONLINE</span>
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <RefreshCw className="w-6 h-6 mb-2 animate-spin text-slate-600" />
          <p className="text-xs">等待抓取引擎启动推送...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 max-h-[360px] pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {logs.map((log, index) => {
            return (
              <div
                key={index}
                className="p-2.5 rounded-lg bg-slate-900/40 hover:bg-slate-900/80 border border-slate-900/60 flex items-start gap-2.5 transition-colors"
              >
                {/* 时间与来源 */}
                <div className="flex flex-col items-start gap-1 min-w-[75px] shrink-0">
                  <span className="font-mono text-[10px] text-slate-500">{log.time}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${getSourceStyle(log.source)}`}>
                    {log.source}
                  </span>
                </div>

                {/* 舆情标题 */}
                <div className="flex-1 text-[11px] text-slate-300 leading-relaxed break-all font-sans">
                  {log.title}
                </div>

                {/* 情感权重 */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    log.sentiment === 'positive' 
                      ? "bg-red-500/10 text-red-400" 
                      : (log.sentiment === 'negative' ? "bg-green-500/10 text-green-400" : "bg-slate-800 text-slate-400")
                  }`}>
                    {log.sentiment === 'positive' ? '偏多' : (log.sentiment === 'negative' ? '偏空' : '中性')}
                  </span>
                  <span className="text-[9px] text-slate-600 font-mono">权重:{log.weight}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-slate-900/60 text-[10px] text-slate-600 flex items-center gap-1">
        <MessageSquare className="w-3.5 h-3.5" />
        <span>系统每十分钟会自动追加抓取结果并重新进行板块概念的加权情感评分计算。</span>
      </div>
    </div>
  );
}
