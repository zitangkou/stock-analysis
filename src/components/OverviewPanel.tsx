import { useEffect, useState, type ReactNode } from "react";
import { Flame, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import HistoryChart from "./HistoryChart";
import type { MarketDataPoint, Sector } from "../types";

type Overview = {
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

export default function OverviewPanel({
  timeline,
  currentSectors,
  activeTimeIndex,
  selectedSectorId,
  setActiveTimeIndex,
}: {
  timeline: MarketDataPoint[];
  currentSectors: Sector[];
  activeTimeIndex: number;
  selectedSectorId: string;
  setActiveTimeIndex: (idx: number) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    fetch("/api/terminal/overview")
      .then((r) => r.json())
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [currentSectors]);

  const heat = overview?.marketHeat ?? 50;
  const label =
    heat >= 75 ? "偏热" : heat >= 55 ? "活跃" : heat >= 40 ? "中性" : "偏冷";
  const selectedName =
    currentSectors.find((s) => s.id === selectedSectorId)?.name || selectedSectorId;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          title="市场热力"
          value={`${heat}`}
          sub={label}
          icon={<Flame className="w-4 h-4 text-red-400" />}
        />
        <Stat
          title="上涨 / 下跌"
          value={`${overview?.upCount ?? "—"} / ${overview?.downCount ?? "—"}`}
          sub={`池内 ${overview?.stockCount ?? 0} 只`}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
        />
        <Stat
          title="近似涨停"
          value={`${overview?.limitUpApprox ?? 0}`}
          sub="涨幅≥9.5% 代理"
          icon={<ArrowUpRight className="w-4 h-4 text-amber-400" />}
        />
        <Stat
          title="题材数"
          value={`${overview?.topSectors?.length ?? currentSectors.length}`}
          sub="观察单元"
          icon={<ArrowDownRight className="w-4 h-4 text-sky-400" />}
        />
      </div>

      <p className="text-[11px] text-slate-500 leading-relaxed">
        {overview?.dataQualityNote ||
          "资金净流入为代理指标；非正式主力资金。"}
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">题材热力 TOP</h3>
          <div className="space-y-2">
            {(overview?.topSectors || []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-200">{s.name}</span>
                <span className="font-mono text-red-300">{s.heat}</span>
              </div>
            ))}
            {!overview?.topSectors?.length && (
              <p className="text-slate-500 text-xs">暂无落库热力，请运行 compute-heat</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">
            净流入代理 TOP
            <span className="ml-2 text-[10px] text-amber-500/80">proxy</span>
          </h3>
          <div className="space-y-2">
            {(overview?.topInflowProxy || []).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-slate-200">{s.name}</span>
                <span className="font-mono text-emerald-300">
                  {(s.netInflowProxy / 1e8).toFixed(2)} 亿
                </span>
              </div>
            ))}
            {!overview?.topInflowProxy?.length && (
              <p className="text-slate-500 text-xs">暂无代理资金数据</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-2">
        <HistoryChart
          timeline={timeline}
          selectedSectorId={selectedSectorId}
          selectedSectorName={selectedName}
          activeTimeIndex={activeTimeIndex}
          setActiveTimeIndex={setActiveTimeIndex}
        />
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: string;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
        {icon}
        {title}
      </div>
      <div className="text-xl font-semibold text-slate-100 font-mono">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
