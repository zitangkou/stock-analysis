import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Database, LineChart, Search } from "lucide-react";

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

type QuoteRow = {
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  amount: number;
  turnoverRate: number;
};

type StatusPayload = {
  generatedAt: string;
  parquetRoot: string;
  inventoryFile: string | null;
  datasets: Dataset[];
  postgres: Record<string, unknown> | null;
  quotesPreview: QuoteRow[];
  barCoverage: { min: string | null; max: string | null; rows: number; codes: number } | null;
  notInV1: string[];
};

type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePct: number;
  turnoverRate?: number;
};

function fmtAmt(n: number): string {
  if (!n || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toFixed(0);
}

function fmtVol(n: number): string {
  if (!n || !Number.isFinite(n)) return "—";
  // Sina volume often in 手 (100 shares); show as-is with 万手 when large
  const abs = Math.abs(n);
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toFixed(0);
}

export default function DataCenterPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<QuoteRow[] | null>(null);
  const [searching, setSearching] = useState(false);

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
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/data-search?q=${encodeURIComponent(q)}&limit=50`)
        .then((r) => r.json())
        .then((d) => setSearchHits(Array.isArray(d.results) ? d.results : []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/data-bars/${selected}?limit=90`)
      .then((r) => r.json())
      .then((d) => setBars(Array.isArray(d) ? d : []))
      .catch(() => setBars([]));
    fetch(`/api/data-quote/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQuote(d))
      .catch(() => setQuote(null));
  }, [selected]);

  const listRows = searchHits ?? data?.quotesPreview ?? [];

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
    return closes
      .map((c, i) => {
        const x = (i / (closes.length - 1)) * w;
        const y = h - ((c - min) / Math.max(max - min, 1e-6)) * (h - 8) - 4;
        return `${x},${y}`;
      })
      .join(" ");
  }, [bars]);

  const latestBar = bars.length ? bars[bars.length - 1] : null;

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

      <div className="grid lg:grid-cols-[1fr_1.4fr_0.85fr] gap-3 min-h-[480px]">
        <div className="rounded-xl border border-slate-800 bg-[#0b1220] overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-400">
            数据集清单
          </div>
          <div className="max-h-[560px] overflow-y-auto">
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

        <div className="rounded-xl border border-slate-800 bg-[#0b1220] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <LineChart className="w-3.5 h-3.5 shrink-0" />
            <span className="shrink-0">个股查询</span>
            <div className="flex-1 min-w-[160px] flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950 px-2 py-1">
              <Search className="w-3 h-3 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="代码或名称，如 600519 / 茅台"
                className="w-full bg-transparent outline-none text-slate-200 placeholder:text-slate-600 text-[11px]"
              />
              {query && (
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                  onClick={() => setQuery("")}
                >
                  清除
                </button>
              )}
            </div>
            <span className="text-[10px] text-slate-600 font-mono">
              {searching
                ? "搜索中…"
                : searchHits
                  ? `${searchHits.length} 条`
                  : `成交额 Top ${data?.quotesPreview?.length ?? 0}`}
            </span>
          </div>

          <div className="grid grid-cols-[1.05fr_0.95fr] flex-1 min-h-0">
            <div className="border-r border-slate-800 overflow-y-auto max-h-[520px]">
              <table className="w-full text-[11px]">
                <thead className="text-slate-500 sticky top-0 bg-[#0b1220]">
                  <tr>
                    <th className="text-left px-2 py-1.5">名称</th>
                    <th className="text-right px-2 py-1.5">最新</th>
                    <th className="text-right px-2 py-1.5">涨跌%</th>
                    <th className="text-right px-2 py-1.5">成交额</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((q) => (
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
                        {q.price ? q.price.toFixed(2) : "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-mono ${
                          q.changePct >= 0 ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {q.price
                          ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                        {fmtAmt(q.amount)}
                      </td>
                    </tr>
                  ))}
                  {!listRows.length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                        {query.trim()
                          ? "无匹配股票"
                          : "无 quotes_latest（配置 DATABASE_URL 或先 ingest-quotes）"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 flex flex-col min-h-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="text-xs text-slate-200">
                  {quote?.name || "—"}
                  <span className="ml-2 font-mono text-slate-500">{selected || ""}</span>
                </div>
                {quote && quote.price > 0 && (
                  <div
                    className={`font-mono text-sm ${
                      quote.changePct >= 0 ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {quote.price.toFixed(2)}{" "}
                    <span className="text-[11px]">
                      {quote.changePct >= 0 ? "+" : ""}
                      {quote.changePct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px]">
                <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5">
                  <div className="text-slate-500">成交额</div>
                  <div className="font-mono text-slate-200">
                    {fmtAmt(quote?.amount || latestBar?.amount || 0)}
                  </div>
                </div>
                <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5">
                  <div className="text-slate-500">成交量</div>
                  <div className="font-mono text-slate-200">
                    {fmtVol(quote?.volume || latestBar?.volume || 0)}
                  </div>
                </div>
                <div className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1.5">
                  <div className="text-slate-500">换手%</div>
                  <div className="font-mono text-slate-200">
                    {(quote?.turnoverRate || latestBar?.turnoverRate || 0) > 0
                      ? (quote?.turnoverRate || latestBar?.turnoverRate || 0).toFixed(2)
                      : "—"}
                  </div>
                </div>
              </div>

              {spark ? (
                <svg viewBox="0 0 280 80" className="w-full h-20 text-red-400 shrink-0">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    points={spark}
                  />
                </svg>
              ) : (
                <div className="h-20 flex items-center justify-center text-[11px] text-slate-500">
                  无日K（该股可能不在 universe / 未 ingest-bars）
                </div>
              )}

              <div className="mt-2 overflow-y-auto flex-1 min-h-0 text-[10px] font-mono">
                <div className="sticky top-0 bg-[#0b1220] text-slate-500 flex gap-2 pb-1 border-b border-slate-800">
                  <span className="w-[72px]">日期</span>
                  <span className="flex-1 text-right">收盘</span>
                  <span className="w-14 text-right">涨跌%</span>
                  <span className="w-14 text-right">额</span>
                  <span className="w-12 text-right">量</span>
                </div>
                {[...bars].reverse().slice(0, 20).map((b) => (
                  <div
                    key={b.date}
                    className="flex gap-2 border-b border-slate-800/50 py-1 text-slate-400"
                  >
                    <span className="w-[72px]">{b.date}</span>
                    <span className="flex-1 text-right text-slate-200">{b.close.toFixed(2)}</span>
                    <span
                      className={`w-14 text-right ${
                        b.changePct >= 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {b.changePct >= 0 ? "+" : ""}
                      {b.changePct.toFixed(2)}
                    </span>
                    <span className="w-14 text-right">{fmtAmt(b.amount)}</span>
                    <span className="w-12 text-right">{fmtVol(b.volume)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

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
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-[10px] text-slate-400 leading-relaxed space-y-1">
            <div className="text-slate-500 mb-1">说明</div>
            <p>默认列表按成交额 Top；搜索可查全部 instruments。</p>
            <p>成交额/量/换手来自盘中 quotes 与 bars_1d。</p>
            <p>真主力资金流、北向个股明细不在 V1；全市场北向/龙虎榜在左侧 Parquet 清单。</p>
          </div>
          <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
            <div className="text-slate-500 mb-1">V1 明确不做</div>
            <ul className="text-[10px] text-slate-400 space-y-0.5 list-disc list-inside">
              {(data?.notInV1 || []).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
