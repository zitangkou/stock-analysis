import { useEffect, useState } from "react";

type RadarItem = {
  id: string;
  name: string;
  heat: number;
  momentum: number;
  acceleration: number;
  change: number;
  zone: "core" | "warm" | "outer" | "cold";
  dataQuality: string;
};

const ZONE_LABEL: Record<RadarItem["zone"], string> = {
  core: "高热核心",
  warm: "升温区",
  outer: "外围观察",
  cold: "冷门区",
};

export default function RadarPanel() {
  const [items, setItems] = useState<RadarItem[]>([]);

  useEffect(() => {
    fetch("/api/terminal/radar")
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 min-h-[320px] relative overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-100 mb-4">热力雷达</h3>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[80, 60, 40, 20].map((r) => (
            <div
              key={r}
              className="absolute rounded-full border border-slate-700/60"
              style={{ width: `${r * 2.2}px`, height: `${r * 2.2}px` }}
            />
          ))}
        </div>
        <div className="relative h-[280px]">
          {items.map((item, idx) => {
            const angle = (idx / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
            const radius = ((100 - item.heat) / 100) * 110 + 20;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            return (
              <div
                key={item.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
              >
                <div
                  className={`px-2 py-1 rounded-full text-[10px] border whitespace-nowrap ${
                    item.zone === "core"
                      ? "bg-red-500/20 border-red-500/40 text-red-200"
                      : item.zone === "warm"
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
                        : item.zone === "outer"
                          ? "bg-sky-500/10 border-sky-500/20 text-sky-200"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                  }`}
                >
                  {item.name.replace(/与.*/, "")} {item.heat}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">分区动态</h3>
        <div className="space-y-2 max-h-[340px] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-xs border-b border-slate-800/60 pb-2"
            >
              <div>
                <div className="text-slate-200">{item.name}</div>
                <div className="text-[10px] text-slate-500">
                  {ZONE_LABEL[item.zone]} · 动量 {item.momentum >= 0 ? "+" : ""}
                  {item.momentum} · 加速度 {item.acceleration}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-red-300">{item.heat}</div>
                <div
                  className={
                    item.change >= 0 ? "text-red-400/80" : "text-emerald-400/80"
                  }
                >
                  {item.change >= 0 ? "+" : ""}
                  {item.change}%
                </div>
              </div>
            </div>
          ))}
          {!items.length && (
            <p className="text-slate-500 text-xs">暂无雷达数据，请运行 compute-heat</p>
          )}
        </div>
      </div>
    </div>
  );
}
