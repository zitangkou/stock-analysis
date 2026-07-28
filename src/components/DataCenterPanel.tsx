import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Database, LineChart, Search } from "lucide-react";
import CandleChart from "./CandleChart";

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

type IntraBar = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  changePct: number;
};

type ChartInterval = "1d" | "5" | "15" | "30";

type LimitUpRow = {
  code: string;
  name: string;
  board: string;
  changePct: number;
  amount: number;
  thresholdPct: number;
};

type FlowRow = {
  code: string;
  name: string;
  netInflow: number;
  amount: number;
  changePct: number;
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
  const abs = Math.abs(n);
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toFixed(0);
}

export default function DataCenterPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [intraBars, setIntraBars] = useState<IntraBar[]>([]);
  const [chartIv, setChartIv] = useState<ChartInterval>("1d");
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<QuoteRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sideTab, setSideTab] = useState<"cover" | "limit" | "flow">("cover");
  const [limitUp, setLimitUp] = useState<{ tradeDate: string | null; rows: LimitUpRow[] } | null>(
    null
  );
  const [moneyFlow, setMoneyFlow] = useState<{
    tradeDate: string | null;
    dataQuality?: string;
    rows: FlowRow[];
  } | null>(null);

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
    fetch("/api/v15/limit-up")
      .then((r) => r.json())
      .then((d) => setLimitUp(d))
      .catch(() => setLimitUp(null));
    fetch("/api/v15/money-flow")
      .then((r) => r.json())
      .then((d) => setMoneyFlow(d))
      .catch(() => setMoneyFlow(null));
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
    fetch(`/api/data-bars/${selected}?limit=180`)
      .then((r) => r.json())
      .then((d) => setBars(Array.isArray(d) ? d : []))
      .catch(() => setBars([]));
    fetch(`/api/data-quote/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQuote(d))
      .catch(() => setQuote(null));
  }, [selected]);

  useEffect(() => {
    if (!selected || chartIv === "1d") {
      setIntraBars([]);
      return;
    }
    fetch(`/api/v15/bars-intraday/${selected}?interval=${chartIv}&limit=200`)
      .then((r) => r.json())
      .then((d) => setIntraBars(Array.isArray(d.bars) ? d.bars : []))
      .catch(() => setIntraBars([]));
  }, [selected, chartIv]);

  const listRows = searchHits ?? data?.quotesPreview ?? [];

  const okCount = useMemo(
    () => (data?.datasets || []).filter((d) => d.status === "ok").length,
    [data]
  );

  const candles = useMemo(() => {
    if (chartIv === "1d") {
      return bars.slice(-120).map((b) => ({
        label: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
    }
    return intraBars.map((b) => ({
      label: b.ts,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
  }, [chartIv, bars, intraBars]);

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
              {" · V1.5 涨停/资金"}
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

              <div className="flex gap-1 mb-1.5 text-[10px]">
                {(
                  [
                    ["1d", "日K"],
                    ["5", "5分"],
                    ["15", "15分"],
                    ["30", "30分"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChartIv(id)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${
                      chartIv === id
                        ? "border-sky-600/60 bg-sky-500/10 text-sky-300"
                        : "border-slate-800 text-slate-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-slate-600 font-mono self-center">
                  {candles.length} 根
                </span>
              </div>

              <CandleChart candles={candles} height={280} showMa showMacd />
              <div className="text-[10px] text-slate-600 leading-relaxed">
                MA/MACD 由 K 线收盘价计算，无需额外行情源。分钟线密度取决于盘中快照（约 3
                分钟/点）；要更接近同花顺可把 QUOTE_INTERVAL_SEC 调到 60。
              </div>
              <div className="mt-2 overflow-y-auto flex-1 min-h-0 text-[10px] font-mono">
                <div className="sticky top-0 bg-[#0b1220] text-slate-500 flex gap-2 pb-1 border-b border-slate-800">
                  <span className="w-[72px]">{chartIv === "1d" ? "日期" : "时间"}</span>
                  <span className="w-10 text-right">开</span>
                  <span className="w-10 text-right">高</span>
                  <span className="w-10 text-right">低</span>
                  <span className="flex-1 text-right">收</span>
                  <span className="w-12 text-right">量</span>
                </div>
                {chartIv === "1d"
                  ? [...bars].reverse().slice(0, 20).map((b) => (
                      <div
                        key={b.date}
                        className="flex gap-2 border-b border-slate-800/50 py-1 text-slate-400"
                      >
                        <span className="w-[72px]">{b.date}</span>
                        <span className="w-10 text-right">{b.open.toFixed(2)}</span>
                        <span className="w-10 text-right">{b.high.toFixed(2)}</span>
                        <span className="w-10 text-right">{b.low.toFixed(2)}</span>
                        <span
                          className={`flex-1 text-right ${
                            b.changePct >= 0 ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {b.close.toFixed(2)}
                        </span>
                        <span className="w-12 text-right">{fmtVol(b.volume)}</span>
                      </div>
                    ))
                  : [...intraBars].reverse().slice(0, 24).map((b) => (
                      <div
                        key={b.ts}
                        className="flex gap-2 border-b border-slate-800/50 py-1 text-slate-400"
                      >
                        <span className="w-[72px]">
                          {new Date(b.ts).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <span className="w-10 text-right">{b.open.toFixed(2)}</span>
                        <span className="w-10 text-right">{b.high.toFixed(2)}</span>
                        <span className="w-10 text-right">{b.low.toFixed(2)}</span>
                        <span
                          className={`flex-1 text-right ${
                            b.close >= b.open ? "text-red-400" : "text-emerald-400"
                          }`}
                        >
                          {b.close.toFixed(2)}
                        </span>
                        <span className="w-12 text-right">{fmtVol(b.volume)}</span>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3 space-y-3 text-xs flex flex-col min-h-0">
          <div className="flex gap-1 text-[10px]">
            {(
              [
                ["cover", "覆盖"],
                ["limit", `涨停(${limitUp?.rows?.length ?? 0})`],
                ["flow", "资金"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSideTab(id)}
                className={`px-2 py-1 rounded border cursor-pointer ${
                  sideTab === id
                    ? "border-sky-600/60 bg-sky-500/10 text-sky-300"
                    : "border-slate-800 text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sideTab === "cover" && (
            <div className="space-y-3 overflow-y-auto">
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
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 text-[10px] text-slate-400 leading-relaxed space-y-1">
                <p>搜索覆盖全部 instruments；列表默认成交额 Top。</p>
                <p>V1.5：板别涨停池、资金代理、概念 CSV。</p>
                <p>V2：5 分钟 K 由 quotes_snapshot 聚合；舆情表已占位。</p>
              </div>
              <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3">
                <div className="text-slate-500 mb-1">仍不做</div>
                <ul className="text-[10px] text-slate-400 space-y-0.5 list-disc list-inside">
                  <li>L2 / 逐笔</li>
                  <li>真主力资金商用源</li>
                  <li>股吧/新闻全量爬取</li>
                </ul>
              </div>
            </div>
          )}

          {sideTab === "limit" && (
            <div className="overflow-y-auto flex-1 min-h-0 space-y-1">
              <div className="text-[10px] text-slate-500 font-mono mb-1">
                {limitUp?.tradeDate || "无数据"} · 主板≥9.5% / 创业板≥19.5% / ST≥4.8%
              </div>
              {(limitUp?.rows || []).map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setSelected(r.code)}
                  className="w-full text-left px-2 py-1.5 rounded border border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-200">{r.name}</span>
                    <span className="font-mono text-red-400">+{r.changePct.toFixed(2)}%</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                    <span>
                      {r.code} · {r.board}
                    </span>
                    <span>{fmtAmt(r.amount)}</span>
                  </div>
                </button>
              ))}
              {!limitUp?.rows?.length && (
                <div className="text-slate-500 text-[11px] py-6 text-center">
                  暂无涨停池。跑 ingest-quotes / compute-heat 后生成。
                </div>
              )}
            </div>
          )}

          {sideTab === "flow" && (
            <div className="overflow-y-auto flex-1 min-h-0 space-y-1">
              <div className="text-[10px] text-slate-500 font-mono mb-1">
                {moneyFlow?.tradeDate || "无数据"} · quality=
                {moneyFlow?.dataQuality || "proxy"}（额×涨跌，非真主力）
              </div>
              {(moneyFlow?.rows || []).map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setSelected(r.code)}
                  className="w-full text-left px-2 py-1.5 rounded border border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-200">{r.name}</span>
                    <span
                      className={`font-mono ${
                        r.netInflow >= 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {fmtAmt(r.netInflow)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono flex justify-between">
                    <span>{r.code}</span>
                    <span>
                      {r.changePct >= 0 ? "+" : ""}
                      {r.changePct.toFixed(2)}% · 额 {fmtAmt(r.amount)}
                    </span>
                  </div>
                </button>
              ))}
              {!moneyFlow?.rows?.length && (
                <div className="text-slate-500 text-[11px] py-6 text-center">
                  暂无资金代理。跑 compute-heat 后写入 money_flow_daily。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
