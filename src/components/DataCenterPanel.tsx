import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Database, LineChart } from "lucide-react";

type Dataset = {
  id: string;
  name: string;
  source: string;
  status: string;
  detail?: string;
  minDate?: string | null;
  maxDate?: string | null;
  rows?: number | null;
  fileDays?: number | null;
};

type StatusPayload = {
  generatedAt: string;
  parquetRoot: string;
  inventoryFile: string | null;
  datasets: Dataset[];
  postgres: Record<string, unknown> | null;
  quotesPreview: Array<{
    code: string;
    name: string;
    price: number;
    changePct: number;
    amount: number;
  }>;
  barCoverage: { min: string | null; max: string | null; rows: number; codes: number } | null;
  notInV1: string[];
};

type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePct: number;
};

export default function DataCenterPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);

  const load = () => {
    fetch("/api/data-status")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (!selected && d.quotesPreview?.[0]?.code) {
          setSelected(d.quotesPreview[0].code);
        }
      })
      .catch((e) => setErr(String(e)));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/data-bars/${selected}?limit=90`)
      .then((r) => r.json())
      .then((d) => setBars(Array.isArray(d) ? d : []))
      .catch(() => setBars([]));
  }, [selected]);

  const okCount = useMemo(
    () => (data?.datasets || []).filter((d) => d.status === "ok").length,
    [data]
  );

  const spark = useMemo(() => {
    if (bars.length < 2) return "";
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const w = 280;
    const h = 80;
    const pts = closes
      .map((c, i) => {
        const x = (i / (closes.length - 1)) * w;
        const y = h - ((c - min) / Math.max(max - min, 1e-6)) * (h - 8) - 4;
        return `${x},${y}`;
      })
      .join(" ");
    return pts;
  }, [bars]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-sky-400" />
          <div>
            <div className="text-sm font-semibold text-slate-100">数据中心 · 采集验收</div>
            <div className="text-[11px] text-slate-500 font-mono">
              {data?.generatedAt
                ? new Date(data.generatedAt).toLocaleString("zh-CN", { hour12: false })
                : "加载中…"}
              {" · "}
              数据集 OK {okCount}/{data?.datasets?.length ?? 0}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-300 cursor-pointer"
        >
          刷新状态
        </button>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="grid lg:grid-cols-[1.1fr_1.2fr_0.9fr] gap-3 min-h-[480px]">
        {/* Dataset checklist — like THS left nav */}
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-400">
            数据集清单
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {(data?.datasets || []).map((d) => (
              <div
                key={d.id}
                className="px-3 py-2.5 border-b border-slate-800/70 text-xs flex gap-2"
              >
                {d.status === "ok" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <CircleAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-slate-200 truncate">{d.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {d.source}
                    {d.maxDate ? ` · 至 ${d.maxDate}` : ""}
                    {d.rows != null ? ` · ${d.rows} 行` : ""}
                    {d.fileDays != null ? ` · ${d.fileDays} 日` : ""}
                  </div>
                  {d.detail && (
                    <div className="text-[10px] text-slate-600 mt-0.5 truncate">{d.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quote board + kline peek */}
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 text-xs text-slate-400">
            <LineChart className="w-3.5 h-3.5" />
            行情预览（Postgres quotes / bars）
          </div>
          <div className="grid grid-cols-[1fr_1fr] flex-1 min-h-0">
            <div className="border-r border-slate-800 overflow-y-auto max-h-[480px]">
              <table className="w-full text-[11px]">
                <thead className="text-slate-500 sticky top-0 bg-[#0b1220]">
                  <tr>
                    <th className="text-left px-2 py-1.5">名称</th>
                    <th className="text-right px-2 py-1.5">最新</th>
                    <th className="text-right px-2 py-1.5">涨跌%</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.quotesPreview || []).map((q) => (
                    <tr
                      key={q.code}
                      onClick={() => setSelected(q.code)}
                      className={`border-t border-slate-800/60 cursor-pointer ${
                        selected === q.code ? "bg-sky-500/10" : "hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="px-2 py-1.5">
                        <div className="text-slate-200">{q.name}</div>
                        <div className="font-mono text-[10px] text-slate-500">{q.code}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-200">
                        {q.price.toFixed(2)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-mono ${
                          q.changePct >= 0 ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {q.changePct >= 0 ? "+" : ""}
                        {q.changePct.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {!data?.quotesPreview?.length && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                        无 quotes_latest（配置 DATABASE_URL 或先 ingest-quotes）
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 flex flex-col">
              <div className="text-xs text-slate-300 mb-2 font-mono">{selected || "—"}</div>
              {spark ? (
                <svg viewBox="0 0 280 80" className="w-full h-24 text-red-400">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    points={spark}
                  />
                </svg>
              ) : (
                <div className="h-24 flex items-center justify-center text-[11px] text-slate-500">
                  无日K序列
                </div>
              )}
              <div className="mt-2 overflow-y-auto max-h-[300px] text-[10px] font-mono">
                {[...bars].reverse().slice(0, 15).map((b) => (
                  <div
                    key={b.date}
                    className="flex justify-between border-b border-slate-800/50 py-1 text-slate-400"
                  >
                    <span>{b.date}</span>
                    <span className={b.changePct >= 0 ? "text-red-400" : "text-emerald-400"}>
                      {b.close.toFixed(2)} ({b.changePct >= 0 ? "+" : ""}
                      {b.changePct.toFixed(2)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Coverage summary */}
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3 space-y-3 text-xs">
          <div className="text-slate-400">覆盖摘要</div>
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-1">
            <div className="text-slate-500">Postgres 日K</div>
            <div className="font-mono text-slate-200">
              {data?.barCoverage
                ? `${data.barCoverage.min} → ${data.barCoverage.max}`
                : "—"}
            </div>
            <div className="text-slate-500">
              {data?.barCoverage
                ? `${data.barCoverage.codes} 只 · ${data.barCoverage.rows} 行`
                : ""}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-1">
            <div className="text-slate-500">Parquet 根目录</div>
            <div className="font-mono text-[10px] text-slate-400 break-all">
              {data?.parquetRoot || "—"}
            </div>
            <div className="text-slate-500 mt-1">
              inventory: {data?.inventoryFile ? "已生成" : "未生成"}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-slate-500 mb-1">V1 明确不做</div>
            <ul className="text-[10px] text-slate-400 space-y-0.5 list-disc list-inside">
              {(data?.notInV1 || []).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed">
            云上更新：
            <code className="text-amber-500/90"> python run_daily.py bootstrap --limit 0 </code>
            全量日更；本机看本页验收绿勾。
          </div>
        </div>
      </div>
    </div>
  );
}
