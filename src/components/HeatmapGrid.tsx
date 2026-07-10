import React, { useState, useRef, useEffect } from "react";
import { Sector, MarketDataPoint } from "../types";
import { 
  Flame, 
  BarChart2, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap, 
  Sparkles, 
  Trophy, 
  DollarSign,
  LineChart,
  BadgeAlert,
  ArrowRight,
  RefreshCw
} from "lucide-react";

interface HeatmapGridProps {
  sectors: Sector[];
  selectedSectorId: string;
  setSelectedSectorId: (id: string) => void;
  timeline: MarketDataPoint[];
  onSwipeRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function HeatmapGrid({
  sectors,
  selectedSectorId,
  setSelectedSectorId,
  timeline,
  onSwipeRefresh,
  isRefreshing
}: HeatmapGridProps) {

  // 划动/拖拽刷新控制状态
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sliderWidth = 240; // 最大拖拽像素范围

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRefreshing) return;
    setIsDragging(true);
    const startX = e.clientX - dragX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      let nextX = moveEvent.clientX - startX;
      if (nextX < 0) nextX = 0;
      if (nextX > sliderWidth) nextX = sliderWidth;
      setDragX(nextX);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      
      const finalX = upEvent.clientX - startX;
      onRelease(finalX < 0 ? 0 : finalX > sliderWidth ? sliderWidth : finalX);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRefreshing) return;
    setIsDragging(true);
    const touch = e.touches[0];
    const startX = touch.clientX - dragX;

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touchMove = moveEvent.touches[0];
      let nextX = touchMove.clientX - startX;
      if (nextX < 0) nextX = 0;
      if (nextX > sliderWidth) nextX = sliderWidth;
      setDragX(nextX);
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      setIsDragging(false);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      
      const finalTouch = endEvent.changedTouches[0] || endEvent.touches[0];
      if (finalTouch) {
        const finalX = finalTouch.clientX - startX;
        onRelease(finalX < 0 ? 0 : finalX > sliderWidth ? sliderWidth : finalX);
      } else {
        onRelease(dragX);
      }
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
  };

  const onRelease = (finalX: number) => {
    if (finalX >= sliderWidth - 15) {
      if (onSwipeRefresh) {
        onSwipeRefresh();
      }
    }
    // 缓动弹回至原点
    let currentX = finalX;
    const interval = setInterval(() => {
      currentX -= 25;
      if (currentX <= 0) {
        currentX = 0;
        clearInterval(interval);
      }
      setDragX(currentX);
    }, 16);
  };

  // 获取最近 6 个时间节点的热度变化，用作 Sparkline 渲染
  const getSectorHeatHistory = (secId: string): number[] => {
    if (timeline.length === 0) return [50];
    const subset = timeline.slice(-6); // 只取最近 6 个点
    return subset.map(pt => pt.sectors[secId]?.heat ?? 50);
  };

  // 渲染极简 Sparkline
  const renderSparkline = (heats: number[]) => {
    if (heats.length < 2) return null;
    const w = 70;
    const h = 20;
    const max = Math.max(...heats, 100);
    const min = Math.min(...heats, 0);
    const range = max - min || 1;
    
    const points = heats.map((val, idx) => {
      const x = (idx / (heats.length - 1)) * w;
      const y = h - ((val - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");

    const isUp = heats[heats.length - 1] >= heats[heats.length - 2];
    const strokeColor = isUp ? "#ef4444" : "#22c55e";

    return (
      <svg width={w} height={h} className="overflow-visible opacity-85">
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <circle
          cx={w}
          cy={h - ((heats[heats.length - 1] - min) / range) * h}
          r="2.5"
          fill={strokeColor}
          className="animate-pulse"
        />
      </svg>
    );
  };

  // 计算斜率与动能
  const getMomentumMetrics = (secId: string) => {
    const history = getSectorHeatHistory(secId);
    if (history.length < 2) return { delta: 0, accel: 0, trend: "flat" as const };
    
    const now = history[history.length - 1];
    const prev = history[history.length - 2];
    const delta = now - prev; // 10分钟前到现在的变化

    let prevDelta = 0;
    if (history.length >= 3) {
      prevDelta = history[history.length - 2] - history[history.length - 3];
    }
    const accel = delta - prevDelta; // 变化速度的变化

    let trend: "up" | "down" | "flat" = "flat";
    if (delta > 1) trend = "up";
    else if (delta < -1) trend = "down";

    return { delta, accel, trend };
  };

  // 根据当前热度和变化率给板块做雷达评级
  const getRadarStatus = (heat: number, delta: number) => {
    if (heat >= 75 && delta >= 4) {
      return {
        label: "爆发突破",
        stars: "★★★★★",
        style: "bg-red-500/15 text-red-400 border-red-500/30",
        color: "text-red-400",
        bgGlow: "shadow-[0_0_20px_rgba(239,68,68,0.2)]",
        predict: "🔮 20m内：资金强封板，有望连阳"
      };
    } else if (heat >= 58 && delta >= 2) {
      return {
        label: "强劲启动",
        stars: "★★★★☆",
        style: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        color: "text-amber-400",
        bgGlow: "shadow-[0_0_15px_rgba(245,158,11,0.15)]",
        predict: "🔮 20m内：题材扩散，关注跟风补涨"
      };
    } else if (heat >= 50 && delta >= -1) {
      return {
        label: "主流发酵",
        stars: "★★★☆☆",
        style: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        color: "text-rose-400",
        bgGlow: "shadow-[0_0_10px_rgba(244,63,94,0.08)]",
        predict: "🔮 20m内：分歧整固，筹码高位换手"
      };
    } else if (delta < -2) {
      return {
        label: "失血退潮",
        stars: "★★☆☆☆",
        style: "bg-green-500/15 text-green-400 border-green-500/20",
        color: "text-green-400",
        bgGlow: "shadow-none",
        predict: "🔮 20m内：获利盘退散，防冲高回落"
      };
    } else {
      return {
        label: "低位潜伏",
        stars: "★☆☆☆☆",
        style: "bg-slate-800 text-slate-400 border-slate-700/50",
        color: "text-slate-400",
        bgGlow: "shadow-none",
        predict: "🔮 20m内：静量筑底，磨合筹码结构"
      };
    }
  };

  // Prefer persisted proxy inflow; otherwise show "暂无" rather than inventing fake flow.
  const calculateCapitalFlow = (sec: Sector, _delta: number) => {
    if (sec.netInflowProxy != null) {
      return {
        netInflow: Math.round(sec.netInflowProxy / 1e6), // 百万
        turnover:
          sec.stockCount && sec.change != null
            ? ((sec.heat * 0.16) + 1.2).toFixed(1)
            : "—",
        isProxy: true as const,
        available: true as const,
      };
    }
    return {
      netInflow: 0,
      turnover: "—",
      isProxy: true as const,
      available: false as const,
    };
  };

  // 标记处前 3 名热度最高的板块，作为最高视觉层级
  const sortedSectorsByHeat = [...sectors].sort((a, b) => b.heat - a.heat);
  const top1Id = sortedSectorsByHeat[0]?.id;
  const top2Id = sortedSectorsByHeat[1]?.id;
  const top3Id = sortedSectorsByHeat[2]?.id;

  const isTop3 = (id: string) => {
    if (id === top1Id) return { rank: 1, text: "龙一主线", glow: "border-amber-500 ring-2 ring-amber-500/45 bg-gradient-to-br from-amber-950/30 to-slate-900/90" };
    if (id === top2Id) return { rank: 2, text: "龙二核心", glow: "border-rose-500 ring-2 ring-rose-500/35 bg-gradient-to-br from-rose-950/20 to-slate-900/90" };
    if (id === top3Id) return { rank: 3, text: "主流高标", glow: "border-red-500 ring-1 ring-red-500/25 bg-gradient-to-br from-red-950/25 to-slate-900/90" };
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 头部标题 & 图例说明 */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-1.5 font-sans">
              <BarChart2 className="w-4.5 h-4.5 text-rose-500" />
              盘中题材雷达热能矩阵（落库热力 · 资金为代理）
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            联动最新2分钟分时舆情动能，黄金排位首推 **今日领涨主线**。突出展示前三高能级阵营。
          </p>
        </div>
        
        {/* 盘中雷达评分等级图例 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            <span>爆发 (★5)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>启动 (★4)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>发酵 (★3)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            <span>退潮 (★2)</span>
          </span>
        </div>
      </div>

      {/* 划动刷新联动滑块 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/40 border border-slate-950/60 p-3.5 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRefreshing ? 'bg-amber-400' : 'bg-red-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isRefreshing ? 'bg-amber-500' : 'bg-red-500'}`}></span>
          </span>
          <div className="text-xs">
            <span className="font-bold text-slate-300 block">题材舆情监控雷达</span>
            <span className="text-[10px] text-slate-500">按热度智能排名，展示前 10 个核心题材</span>
          </div>
        </div>

        {/* 触控拖拽式解锁刷新轨 */}
        <div className="relative w-full sm:w-[286px] h-10 bg-slate-950/90 border border-slate-800/85 rounded-full flex items-center justify-start overflow-hidden select-none">
          {/* 滑动提示字 */}
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-500 font-sans tracking-wide pointer-events-none">
            {isRefreshing ? (
              <span className="flex items-center gap-1.5 text-amber-400 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                正在全网研判中...
              </span>
            ) : dragX > 210 ? (
              <span className="text-red-400 animate-pulse">▲ 释放立即重新爬网！</span>
            ) : (
              <span className="flex items-center gap-1">
                右滑雷达 一键刷新题材 &gt;&gt;&gt;
              </span>
            )}
          </div>

          {/* 进度充盈背景色 */}
          <div 
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-red-600/10 via-red-500/15 to-red-500/35 rounded-l-full border-r border-red-500/30 transition-all duration-75"
            style={{ width: `${Math.max(40, dragX + 18)}px` }}
          />

          {/* 拖拽圆钮 */}
          <div
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{ transform: `translateX(${dragX}px)` }}
            className={`absolute left-0.5 w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg shadow-red-500/20 hover:scale-105 active:scale-95 transition-transform duration-75 z-10`}
          >
            {isRefreshing ? (
              <RefreshCw className="w-4 h-4 text-white animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4 text-white" />
            )}
          </div>
        </div>
      </div>

      {/* 行业卡片动态自适应网格 */}
      <div id="heatmap-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {sectors.map((sec) => {
          const isSelected = sec.id === selectedSectorId;
          const heatHistory = getSectorHeatHistory(sec.id);
          const { delta, accel, trend } = getMomentumMetrics(sec.id);
          const radar = getRadarStatus(sec.heat, delta);
          const cap = calculateCapitalFlow(sec, delta);
          const topRank = isTop3(sec.id);

          // 综合决定卡片边框、背景及高亮效果
          let cardStyle = "border-slate-800 bg-slate-900/60 hover:bg-slate-900/90";
          let shadowStyle = radar.bgGlow;
          let bannerBadge = null;

          if (topRank) {
            cardStyle = topRank.glow;
            if (topRank.rank === 1) {
              bannerBadge = (
                <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[9px] font-extrabold px-1.5 py-0.5 rounded-bl rounded-tr-lg flex items-center gap-0.5 uppercase tracking-wider">
                  <Trophy className="w-2.5 h-2.5 fill-current" />
                  <span>{topRank.text}</span>
                </div>
              );
            } else if (topRank.rank === 2) {
              bannerBadge = (
                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-bl rounded-tr-lg flex items-center gap-0.5 uppercase tracking-wider">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>{topRank.text}</span>
                </div>
              );
            } else {
              bannerBadge = (
                <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-bl rounded-tr-lg flex items-center gap-0.5 uppercase tracking-wider">
                  <Zap className="w-2.5 h-2.5" />
                  <span>{topRank.text}</span>
                </div>
              );
            }
          }

          if (isSelected) {
            cardStyle += " ring-2 ring-red-500/80 border-red-500 scale-[1.01]";
          }

          return (
            <div
              key={sec.id}
              onClick={() => setSelectedSectorId(sec.id)}
              className={`group relative flex flex-col justify-between p-4 rounded-xl border ${cardStyle} ${shadowStyle} cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 active:scale-95`}
            >
              {/* 头条冠冕角标 */}
              {bannerBadge}

              {/* 第一行：名字与实时热度分 */}
              <div>
                <div className="flex justify-between items-start gap-1 pr-14">
                  <span className={`font-bold text-sm tracking-tight ${isSelected ? "text-white" : "text-slate-200 group-hover:text-white"} transition-colors`}>
                    {sec.name}
                  </span>
                </div>

                {/* 第二行：雷达评级徽章与星级 */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${radar.style}`}>
                    {radar.label}
                  </span>
                  <span className="text-[10px] text-amber-500 font-mono tracking-tighter">
                    {radar.stars}
                  </span>
                </div>

                {/* 核心涨跌与 Sparkline 微趋势图叠加 */}
                <div className="flex items-center justify-between mt-3 bg-slate-950/40 p-1.5 rounded-lg border border-slate-800/40">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">均幅变动</span>
                    <span className={`text-base font-extrabold font-mono tracking-tight leading-none mt-1 ${sec.change >= 0 ? "text-red-500" : "text-green-500"}`}>
                      {sec.change >= 0 ? `+${sec.change}%` : `${sec.change}%`}
                    </span>
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider mb-0.5">30m趋势线</span>
                    {renderSparkline(heatHistory)}
                  </div>
                </div>

                {/* 资金确认面 (成交额 & 净流入代理) */}
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <div className="bg-slate-950/20 border border-slate-800/30 p-1.5 rounded flex flex-col">
                    <span className="text-[8px] text-slate-500">净流入代理</span>
                    <span className={`text-[11px] font-bold font-mono mt-0.5 ${
                      !cap.available
                        ? "text-slate-500"
                        : cap.netInflow >= 0
                          ? "text-red-400"
                          : "text-green-400"
                    }`}>
                      {!cap.available
                        ? "暂无"
                        : cap.netInflow >= 0
                          ? `+¥${cap.netInflow}M`
                          : `¥${cap.netInflow}M`}
                    </span>
                  </div>
                  <div className="bg-slate-950/20 border border-slate-800/30 p-1.5 rounded flex flex-col">
                    <span className="text-[8px] text-slate-500">估算成交额</span>
                    <span className="text-[11px] font-bold font-mono text-slate-300 mt-0.5">
                      {cap.turnover === "—" ? "暂无" : `¥${cap.turnover}亿`}
                    </span>
                  </div>
                </div>

                {/* 核心速率/加速度指示 */}
                <div className="flex justify-between items-center mt-2.5 text-[10px] text-slate-500 border-b border-slate-800/30 pb-2">
                  <span className="flex items-center gap-0.5">
                    <span>10m温差:</span>
                    <span className={`font-mono font-bold ${delta >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                    </span>
                  </span>
                  
                  <span className="flex items-center gap-0.5 font-mono">
                    <span>加速度:</span>
                    <span className={`font-semibold ${accel >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {accel >= 0 ? `+${accel.toFixed(1)}` : accel.toFixed(1)}
                    </span>
                  </span>
                </div>
              </div>

              {/* 舆情诊断与预测 */}
              <div className="mt-2 flex flex-col gap-1">
                {/* 看多指数进度条 */}
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span>多头共鸣度</span>
                  <span className={`font-mono font-bold ${sec.sentimentScore > 50 ? 'text-red-400' : 'text-green-400'}`}>
                    {sec.sentimentScore}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${sec.sentimentScore > 50 ? 'from-amber-500 to-red-500' : 'from-green-500 to-emerald-400'}`}
                    style={{ width: `${sec.sentimentScore}%` }}
                  />
                </div>

                {/* 驱动原因简写 + 预测性展望 */}
                <p className="text-[10px] text-slate-400 leading-snug line-clamp-1 mt-2 font-sans italic text-left">
                  📢 {sec.description}
                </p>
                <div className="text-[9px] text-slate-500 bg-slate-950/60 p-1.5 rounded border border-slate-900/60 mt-1 font-mono text-left truncate">
                  {radar.predict}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
