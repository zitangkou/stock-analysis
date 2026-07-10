import type { TerminalModule } from "../types";

const MODULES: Array<{ id: TerminalModule; label: string }> = [
  { id: "overview", label: "市场总览" },
  { id: "heatmap", label: "板块热力" },
  { id: "rank", label: "个股热榜" },
  { id: "radar", label: "热力雷达" },
  { id: "rotation", label: "轮动追踪" },
  { id: "ai", label: "AI 分析" },
  { id: "alerts", label: "预警中心" },
];

export default function ModuleNav({
  active,
  onChange,
}: {
  active: TerminalModule;
  onChange: (m: TerminalModule) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-3 mb-4">
      {MODULES.map((m) => {
        const on = active === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              on
                ? "bg-red-500/15 text-red-300 border border-red-500/30"
                : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </nav>
  );
}
