import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

type Cell = {
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

export default function RotationPanel() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [path, setPath] = useState<string[]>([]);
  const [tradeDate, setTradeDate] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/terminal/rotation")
      .then((r) => r.json())
      .then((data) => {
        setCells(Array.isArray(data.cells) ? data.cells : []);
        setPath(Array.isArray(data.path) ? data.path : []);
        setTradeDate(data.tradeDate || null);
      })
      .catch(() => {
        setCells([]);
        setPath([]);
      });
  }, []);

  const { slots, themes, matrix } = useMemo(() => {
    const slotSet = new Set<number>();
    const themeSet = new Set<string>();
    const map = new Map<string, Cell>();
    for (const c of cells) {
      if (tradeDate && c.tradeDate !== tradeDate) continue;
      slotSet.add(c.slot30m);
      themeSet.add(c.themeId);
      map.set(`${c.slot30m}:${c.themeId}`, c);
    }
    return {
      slots: [...slotSet].sort((a, b) => a - b),
      themes: [...themeSet],
      matrix: map,
    };
  }, [cells, tradeDate]);

  const themeNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cells) m.set(c.themeId, c.themeName);
    return m;
  }, [cells]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100">30 分钟轮动矩阵</h3>
          <span className="text-[10px] text-slate-500">{tradeDate || "暂无交易日数据"}</span>
        </div>
        {!slots.length ? (
          <p className="text-xs text-slate-500 py-8 text-center">
            暂无轮动槽位。盘中运行 ingest-quotes（会触发 compute-heat）后生成。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-2 pr-2">题材</th>
                  {slots.map((s) => {
                    const sample = [...matrix.values()].find((c) => c.slot30m === s);
                    return (
                      <th key={s} className="px-1 py-2 font-mono">
                        {sample?.slotLabel || s}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {themes.map((tid) => (
                  <tr key={tid} className="border-t border-slate-800/50">
                    <td className="py-1.5 pr-2 text-slate-300 whitespace-nowrap">
                      {(themeNames.get(tid) || tid).replace(/与.*/, "")}
                    </td>
                    {slots.map((slot) => {
                      const cell = matrix.get(`${slot}:${tid}`);
                      const heat = cell?.heat ?? 0;
                      const alpha = Math.min(0.85, heat / 100);
                      return (
                        <td key={slot} className="px-1 py-1 text-center">
                          <div
                            className="rounded px-1 py-1 font-mono text-slate-100"
                            style={{
                              backgroundColor: `rgba(239, 68, 68, ${alpha * 0.55})`,
                            }}
                            title={
                              cell
                                ? `rank ${cell.rank} · heat ${cell.heat}`
                                : undefined
                            }
                          >
                            {cell ? cell.rank : "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">轮动路径（各时段 TOP1）</h3>
        {path.length ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {path.map((name, i) => (
              <div key={`${name}-${i}`} className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  {name.replace(/与.*/, "")}
                </span>
                {i < path.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">暂无路径</p>
        )}
      </div>
    </div>
  );
}
