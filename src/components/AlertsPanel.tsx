import { useEffect, useState } from "react";
import { BadgeAlert, ShieldAlert } from "lucide-react";

type Rule = {
  id: number;
  name: string;
  ruleType: string;
  enabled: boolean;
  params: Record<string, unknown>;
  description: string | null;
};

type RecordRow = {
  id: number;
  ts: string;
  alertType: string;
  target: string;
  targetName: string | null;
  message: string;
  triggerValue: number | null;
  threshold: number | null;
  priority: string;
};

export default function AlertsPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);

  useEffect(() => {
    fetch("/api/terminal/alerts")
      .then((r) => r.json())
      .then((data) => {
        setRules(Array.isArray(data.rules) ? data.rules : []);
        setRecords(Array.isArray(data.records) ? data.records : []);
      })
      .catch(() => {
        setRules([]);
        setRecords([]);
      });
  }, []);

  const counts = {
    high: records.filter((r) => r.priority === "high").length,
    medium: records.filter((r) => r.priority === "medium").length,
    low: records.filter((r) => r.priority === "low").length,
    total: records.length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CountCard label="触发总数" value={counts.total} />
        <CountCard label="高优先级" value={counts.high} tone="high" />
        <CountCard label="中优先级" value={counts.medium} tone="medium" />
        <CountCard label="启用规则" value={rules.filter((r) => r.enabled).length} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-100">系统规则（只读）</h3>
        </div>
        <div className="space-y-2">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 text-xs border-b border-slate-800/60 pb-2"
            >
              <div>
                <div className="text-slate-200">{r.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {r.description || r.ruleType}
                </div>
              </div>
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] ${
                  r.enabled
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {r.enabled ? "启用" : "停用"}
              </span>
            </div>
          ))}
          {!rules.length && (
            <p className="text-xs text-slate-500">
              暂无规则。请 init-db 应用 004_heat_platform.sql
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <BadgeAlert className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-100">触发日志</h3>
        </div>
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="text-slate-500 bg-slate-950/60 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">时间</th>
                <th className="text-left px-3 py-2">类型</th>
                <th className="text-left px-3 py-2">说明</th>
                <th className="text-left px-3 py-2">标的</th>
                <th className="text-right px-3 py-2">触发值</th>
                <th className="text-center px-3 py-2">优先级</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t border-slate-800/70">
                  <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(r.ts).toLocaleString("zh-CN", { hour12: false })}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{r.alertType}</td>
                  <td className="px-3 py-2 text-slate-200 max-w-[360px]">{r.message}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">
                    {r.targetName || r.target}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-amber-300">
                    {r.triggerValue ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        r.priority === "high"
                          ? "bg-red-500/15 text-red-300"
                          : r.priority === "low"
                            ? "bg-slate-800 text-slate-400"
                            : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {r.priority}
                    </span>
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    暂无触发记录。compute-heat 评估规则后写入。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CountCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "high" | "medium";
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div
        className={`text-xl font-semibold font-mono ${
          tone === "high"
            ? "text-red-300"
            : tone === "medium"
              ? "text-amber-300"
              : "text-slate-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
