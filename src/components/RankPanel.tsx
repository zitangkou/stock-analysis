import { useEffect, useState } from "react";
import type { Stock } from "../types";

export default function RankPanel() {
  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    fetch("/api/terminal/hot-stocks?limit=40")
      .then((r) => r.json())
      .then((data) => setStocks(Array.isArray(data) ? data : []))
      .catch(() => setStocks([]));
  }, []);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">全市场个股热榜（池内）</h3>
        <span className="text-[10px] text-amber-500/80">资金净流入=代理 · 涨停=近似</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500 bg-slate-950/60">
            <tr>
              <th className="text-left px-3 py-2 font-medium">#</th>
              <th className="text-left px-3 py-2 font-medium">名称</th>
              <th className="text-left px-3 py-2 font-medium">题材</th>
              <th className="text-right px-3 py-2 font-medium">热力</th>
              <th className="text-right px-3 py-2 font-medium">动量</th>
              <th className="text-right px-3 py-2 font-medium">涨跌%</th>
              <th className="text-right px-3 py-2 font-medium">净流入代理</th>
              <th className="text-center px-3 py-2 font-medium">涨停</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (
              <tr key={s.code} className="border-t border-slate-800/80 hover:bg-slate-800/30">
                <td className="px-3 py-2 font-mono text-slate-500">{s.rank}</td>
                <td className="px-3 py-2">
                  <div className="text-slate-100">{s.name}</div>
                  <div className="font-mono text-[10px] text-slate-500">{s.code}</div>
                </td>
                <td className="px-3 py-2 text-slate-400">{s.themeName || "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-red-300">{s.heat}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {s.momentum != null ? (s.momentum >= 0 ? "+" : "") + s.momentum : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    s.change >= 0 ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {s.change >= 0 ? "+" : ""}
                  {s.change}%
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">
                  {s.netInflowProxy != null
                    ? `${(s.netInflowProxy / 1e8).toFixed(2)}亿`
                    : "暂无"}
                </td>
                <td className="px-3 py-2 text-center">
                  {s.isLimitUpApprox ? (
                    <span className="text-amber-400 text-[10px]">近似</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!stocks.length && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  暂无热榜数据。请先 apply-themes + ingest-quotes + compute-heat
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
