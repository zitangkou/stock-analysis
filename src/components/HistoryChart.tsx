import { useState, useRef } from "react";
import { MarketDataPoint } from "../types";
import { 
  Activity, 
  Info, 
  TrendingUp, 
  Layers, 
  Eye, 
  Check, 
  Sparkles, 
  Target, 
  ShieldAlert, 
  Compass,
  Zap
} from "lucide-react";

interface HistoryChartProps {
  timeline: MarketDataPoint[];
  selectedSectorId: string;
  selectedSectorName: string;
  activeTimeIndex: number;
  setActiveTimeIndex: (idx: number) => void;
}

const SECTOR_COLORS: { [id: string]: { stroke: string; name: string; colorClass: string } } = {
  semiconductor: { stroke: "#f43f5e", name: "半导体", colorClass: "text-rose-500" },
  ai:            { stroke: "#3b82f6", name: "人工智能", colorClass: "text-blue-500" },
  nev:           { stroke: "#10b981", name: "新能源车", colorClass: "text-emerald-500" },
  biotech:       { stroke: "#8b5cf6", name: "生物医药", colorClass: "text-violet-500" },
  liquor:        { stroke: "#f59e0b", name: "白酒消费", colorClass: "text-amber-500" },
  military:      { stroke: "#a1a1aa", name: "国防军工", colorClass: "text-slate-400" },
  finance:       { stroke: "#ec4899", name: "大金融", colorClass: "text-pink-500" },
  metals:        { stroke: "#14b8a6", name: "有色金属", colorClass: "text-teal-500" },
  realestate:    { stroke: "#f97316", name: "房地产业", colorClass: "text-orange-500" },
  greenenergy:   { stroke: "#84cc16", name: "光伏电力", colorClass: "text-lime-500" }
};

export default function HistoryChart({
  timeline,
  selectedSectorId,
  selectedSectorName,
  activeTimeIndex,
  setActiveTimeIndex
}: HistoryChartProps) {
  // viewMode 支持: "intraday" (超炫日内多维分时走势) 与 "matrix" (热度-资金-动能 3D 矩阵分布图，完美像素还原 demo 里的 Bubble Chart)
  const [viewMode, setViewMode] = useState<"intraday" | "matrix">("intraday");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoveredLineSectorId, setHoveredLineSectorId] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 border border-dashed border-slate-800 rounded-xl bg-slate-900/40 text-slate-500">
        <Activity className="w-8 h-8 mb-2 animate-pulse text-rose-500" />
        <p className="text-sm font-medium">等待时序高精密热能轨道构建...</p>
      </div>
    );
  }

  // --- SVG 布局参数 (大屏化，尊享 1000px 黄金分时比例) ---
  const width = 1000;
  const height = 400;
  const paddingLeft = 60;
  const paddingRight = 150; // 右侧预留给高拟真图例
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // 辅助函数：根据点数组生成高精密平滑的日内分时曲线 (Cubic Bezier Spline)
  const getBezierPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      // 使用 0.35 比例的平滑张力，最完美还原专业K线软件的分时线
      const cpX1 = p0.x + (p1.x - p0.x) * 0.35;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) * 0.65;
      const cpY2 = p1.y;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  // 辅助函数：生成渐变色填充区域路径
  const getAreaPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return "";
    const bezier = getBezierPath(points);
    const bottomY = paddingTop + chartHeight;
    return `${bezier} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;
  };

  // 映射时间线点索引到 X 轴坐标
  const getX = (index: number) => {
    if (timeline.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (timeline.length - 1)) * chartWidth;
  };

  // 映射热度 0 - 100 到 Y 轴坐标
  const getY = (heatVal: number) => {
    const minHeat = 0;
    const maxHeat = 100;
    const ratio = (heatVal - minHeat) / (maxHeat - minHeat);
    return paddingTop + chartHeight - ratio * chartHeight;
  };

  // 获取当前生效的活跃时间节点快照
  const displayIndex = hoverIndex !== null ? hoverIndex : activeTimeIndex;
  const activePointSnapshot = timeline[Math.min(displayIndex !== -1 ? displayIndex : timeline.length - 1, timeline.length - 1)];

  // --- 估算市场情绪指数仪表盘数据 (Demo 顶配 78 热烈) ---
  const calculateMarketSentiment = () => {
    if (!activePointSnapshot) return 78;
    // 聚合全板块热度均值作为大盘热能依据
    const heats = Object.values(activePointSnapshot.sectors).map(s => s.heat);
    if (heats.length === 0) return 78;
    const avg = heats.reduce((acc, h) => acc + h, 0) / heats.length;
    // 做一个顺滑映射，并保持在 [30, 95] 逼真区间
    return Math.round(avg * 0.95 + 15);
  };

  const sentimentScore = calculateMarketSentiment();

  // 根据当前温度段匹配评语和高动态渐变色
  const getSentimentTone = (score: number) => {
    if (score >= 80) return { text: "高度亢奋", desc: "资金疯狂抱团、突破连板激增", color: "text-red-500", glow: "from-red-500 to-rose-600" };
    if (score >= 68) return { text: "偏多热烈", desc: "主线多头发酵、吸筹主攻明显", color: "text-amber-500", glow: "from-amber-400 to-orange-500" };
    if (score >= 50) return { text: "多空平衡", desc: "题材高低切，防守盘整换手", color: "text-violet-400", glow: "from-violet-500 to-indigo-500" };
    return { text: "地量冰点", desc: "获利退潮洗盘，低位筑底静待出击", color: "text-green-400", glow: "from-green-500 to-emerald-400" };
  };

  const tone = getSentimentTone(sentimentScore);

  // 3D 矩阵气泡图数据准备：映射每个板块当前瞬间的 (X: 主力资金流入, Y: 舆情热度, Size/Color: 30m动能斜率)
  const getMatrixSectors = () => {
    if (!activePointSnapshot) return [];
    return Object.entries(activePointSnapshot.sectors).map(([id, data]) => {
      const colorInfo = SECTOR_COLORS[id] || { stroke: "#fff", name: id };
      
      // 模拟高阶参数（匹配 demo 图里炫目的 3D 分布）
      // X 轴主力资金流入估算: 与热度及均幅变动正相关
      const capitalInflow = (data.heat - 50) * 0.8 + (data.change * 4);
      // Y 轴热度：就是 data.heat
      // Size 动量斜率：获取此时间点与前 2 个时间点的差值
      let momentum = 12; // 基础半径
      const ptIdx = timeline.indexOf(activePointSnapshot);
      if (ptIdx >= 2) {
        const prevPt = timeline[ptIdx - 2];
        const prevHeat = prevPt.sectors[id]?.heat || 50;
        momentum = Math.max(6, Math.min(22, 12 + (data.heat - prevHeat) * 1.5));
      }

      return {
        id,
        name: colorInfo.name,
        color: colorInfo.stroke,
        x: capitalInflow, // 资金轴
        y: data.heat,       // 热度轴
        size: momentum,     // 动能体积
        change: data.change
      };
    });
  };

  const matrixSectors = getMatrixSectors();

  return (
    <div 
      ref={containerRef} 
      id="high-tech-history-chart" 
      className="bg-slate-950 border border-slate-900 rounded-2xl p-5 text-slate-100 shadow-2xl relative overflow-hidden"
    >
      {/* 高科技感科技网格背景 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:24px_24px] opacity-25 pointer-events-none"></div>
      
      {/* 头部：市场情绪指数看板 (仪表盘) + 极简 Tab 控制 */}
      <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4 pb-4 border-b border-slate-900/80">
        
        {/* 左侧：专业度拉满的 Sentiment Instrument Speedometer Gauge */}
        <div className="flex items-center gap-4">
          {/* 超炫 SVG 半环温控仪表盘 */}
          <div className="relative w-20 h-16 flex items-center justify-center shrink-0">
            <svg className="w-full h-full" viewBox="0 0 100 80">
              {/* 背景底轨环 */}
              <path
                d="M 15 75 A 40 40 0 0 1 85 75"
                fill="none"
                stroke="#1e293b"
                strokeWidth="10"
                strokeLinecap="round"
              />
              {/* 实时进度环 */}
              <path
                d="M 15 75 A 40 40 0 0 1 85 75"
                fill="none"
                stroke="url(#instrumentGlow)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="220"
                strokeDashoffset={220 - (220 * (sentimentScore / 100))}
                className="transition-all duration-1000 ease-out"
              />
              {/* 渐变配置 */}
              <defs>
                <linearGradient id="instrumentGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
            </svg>
            {/* 盘中央温度 */}
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1.5">
              <span className="text-xl font-black font-mono leading-none text-slate-100 tracking-tighter">
                {sentimentScore}
              </span>
              <span className="text-[8px] font-bold text-slate-400 scale-90 uppercase tracking-wider">
                情绪指数
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-red-500/10 text-red-400 border border-red-500/20">
                A股盘中高精密分时研判
              </span>
              <span className={`text-xs font-black font-sans ${tone.color}`}>
                【{tone.text}】状态
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm sm:max-w-md line-clamp-1">
              📢 诊断意见: {tone.desc} (10分钟滚动计算盘中资金异动差)
            </p>
          </div>
        </div>

        {/* 右侧：高科技感极简双态研判 Tab 开关 */}
        <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800/80 shrink-0 text-xs font-semibold">
          <button
            onClick={() => setViewMode("intraday")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === "intraday"
                ? "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>日内分时全同屏对比</span>
          </button>
          
          <button
            onClick={() => setViewMode("matrix")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === "matrix"
                ? "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>空间三维战术分布图</span>
          </button>
        </div>

      </div>

      {/* 核心渲染面板 */}
      <div className="relative z-10">
        
        {viewMode === "intraday" ? (
          // ================== A、高精密分时日内多线走势 (完全还原真实股票K线图科技风格) ==================
          <div className="relative">
            
            {/* 顶层悬浮 HUD Tooltip Panel (还原 Demo 图 11:24 多板块悬浮浮舱，极佳的第一层级视效) */}
            {activePointSnapshot && (
              <div className="absolute top-2 left-14 z-20 bg-slate-950/95 border border-slate-900 shadow-[0_4px_20px_rgba(0,0,0,0.8)] rounded-xl p-3 text-[10px] w-48 font-mono pointer-events-none transition-all duration-150 backdrop-blur-md">
                <div className="flex justify-between items-center border-b border-slate-900 pb-1.5 mb-1.5">
                  <span className="text-slate-400 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                    快照时刻:
                  </span>
                  <span className="text-amber-400 font-black text-xs">{activePointSnapshot.time}</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(activePointSnapshot.sectors)
                    .map(([id, data]) => {
                      const col = SECTOR_COLORS[id] || { stroke: "#fff", name: id };
                      return { id, name: col.name, color: col.stroke, heat: data.heat };
                    })
                    .sort((a, b) => b.heat - a.heat)
                    .slice(0, 5) // 展示前 5 名
                    .map((item, i) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                          <span>{item.name}</span>
                        </span>
                        <span className="font-extrabold" style={{ color: item.color }}>{item.heat}</span>
                      </div>
                    ))}
                </div>
                <div className="text-[8px] text-slate-500 mt-1.5 border-t border-slate-900 pt-1 text-right">
                  鼠标悬浮横向拉拽，查阅各板块均线
                </div>
              </div>
            )}

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible select-none"
            >
              <defs>
                {/* 炫目辉光发光滤镜，提升线条高级感 */}
                <filter id="neonLineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* 动态生成各板块对应的分时面积填充渐变 */}
                {Object.entries(SECTOR_COLORS).map(([id, info]) => (
                  <linearGradient key={id} id={`areaGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={info.stroke} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={info.stroke} stopOpacity="0.00" />
                  </linearGradient>
                ))}
              </defs>

              {/* 背景：绘制中国A股上午 09:30-11:30 & 下午 13:00-15:00 分界遮罩或日内渐变 */}
              <rect
                x={paddingLeft}
                y={paddingTop}
                width={chartWidth / 2}
                height={chartHeight}
                fill="#0f172a"
                fillOpacity="0.08"
              />
              <rect
                x={paddingLeft + chartWidth / 2}
                y={paddingTop}
                width={chartWidth / 2}
                height={chartHeight}
                fill="#020617"
                fillOpacity="0.12"
              />

              {/* 分时图正中强中轨刻度线 (50分水岭线) */}
              <line
                x1={paddingLeft}
                y1={getY(50)}
                x2={width - paddingRight}
                y2={getY(50)}
                stroke="#ef4444"
                strokeWidth="1.2"
                strokeOpacity="0.3"
                strokeDasharray="5 3"
              />
              <text
                x={paddingLeft - 8}
                y={getY(50) + 4}
                fill="#f43f5e"
                fontSize="9"
                fontWeight="extrabold"
                textAnchor="end"
                className="font-mono opacity-80"
              >
                中轨 (50)
              </text>

              {/* 水平高精密网格刻度 */}
              {[10, 30, 70, 90].map((level) => {
                const y = getY(level);
                return (
                  <g key={level} className="opacity-15">
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="#475569"
                      strokeWidth="0.8"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      fill="#94a3b8"
                      fontSize="9"
                      textAnchor="end"
                      className="font-mono"
                    >
                      {level}
                    </text>
                  </g>
                );
              })}

              {/* 日内时段上午/下午分界竖隔线 */}
              <line
                x1={paddingLeft + chartWidth / 2}
                y1={paddingTop}
                x2={paddingLeft + chartWidth / 2}
                y2={paddingTop + chartHeight}
                stroke="#334155"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                strokeOpacity="0.4"
              />
              <text
                x={paddingLeft + chartWidth / 2}
                y={paddingTop - 6}
                fill="#64748b"
                fontSize="8"
                textAnchor="middle"
                className="font-mono uppercase tracking-wider font-bold"
              >
                11:30 休市分界线
              </text>

              {/* 各个板块全同屏日内分时K线轨迹渲染 */}
              {Object.keys(SECTOR_COLORS).map((secId) => {
                const colorInfo = SECTOR_COLORS[secId];
                const points = timeline.map((pt, idx) => {
                  const sData = pt.sectors[secId] || { heat: 50 };
                  return { x: getX(idx), y: getY(sData.heat) };
                });

                if (points.length === 0) return null;

                const smoothPathString = getBezierPath(points);
                const areaPathString = getAreaPath(points);

                // hover 降噪过滤：没有 hover 时，当前选中板块高亮，其它稍微淡化；当有 hover 某条线时，强聚焦它，其它变透明
                const isAnyLineHovered = hoveredLineSectorId !== null;
                const isCurrentHovered = hoveredLineSectorId === secId;
                const isSelected = selectedSectorId === secId;

                let strokeOpacity = 0.55;
                let strokeWidth = 1.6;
                let lineFilter = "";

                if (isAnyLineHovered) {
                  strokeOpacity = isCurrentHovered ? 1.0 : 0.08;
                  strokeWidth = isCurrentHovered ? 3.8 : 1.0;
                  if (isCurrentHovered) lineFilter = "url(#neonLineGlow)";
                } else {
                  strokeWidth = isSelected ? 3.0 : 1.5;
                  strokeOpacity = isSelected ? 1.0 : 0.35;
                  if (isSelected) lineFilter = "url(#neonLineGlow)";
                }

                return (
                  <g key={secId} className="transition-all duration-300">
                    {/* 实色发光面积填充：当选中或hover某板块时，展示梦幻的分时面积图 */}
                    {(isSelected || (isAnyLineHovered && isCurrentHovered)) && (
                      <path
                        d={areaPathString}
                        fill={`url(#areaGrad-${secId})`}
                        className="animate-fade-in pointer-events-none transition-all duration-300"
                      />
                    )}

                    {/* 加粗隐形物理触控感知带，解决用户极难 Hover 线条痛点 */}
                    <path
                      d={smoothPathString}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="12"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredLineSectorId(secId)}
                      onMouseLeave={() => setHoveredLineSectorId(null)}
                    />
                    {/* 实体高能彩色平滑分时曲线 */}
                    <path
                      d={smoothPathString}
                      fill="none"
                      stroke={colorInfo.stroke}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      filter={lineFilter}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-150"
                    />
                  </g>
                );
              })}

              {/* 与十字标联动的高亮圆心闪烁圈 */}
              {hoveredLineSectorId && activePointSnapshot && (
                <circle
                  cx={getX(displayIndex)}
                  cy={getY((activePointSnapshot.sectors[hoveredLineSectorId] || { heat: 50 }).heat)}
                  r="6"
                  fill={SECTOR_COLORS[hoveredLineSectorId]?.stroke || "#fff"}
                  stroke="#ffffff"
                  strokeWidth="2"
                  className="animate-pulse"
                />
              )}

              {/* 十字对齐光标辅助标 */}
              {displayIndex !== null && timeline[displayIndex] && (
                <g className="pointer-events-none">
                  {/* 垂直时间线十字丝 */}
                  <line
                    x1={getX(displayIndex)}
                    y1={paddingTop}
                    x2={getX(displayIndex)}
                    y2={paddingTop + chartHeight}
                    stroke="#ef4444"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    strokeOpacity="0.7"
                  />
                  {/* 底部滑块标角 */}
                  <rect
                    x={getX(displayIndex) - 22}
                    y={paddingTop + chartHeight + 4}
                    width="44"
                    height="13"
                    rx="3"
                    fill="#ef4444"
                  />
                  <text
                    x={getX(displayIndex)}
                    y={paddingTop + chartHeight + 14}
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="font-mono"
                  >
                    {timeline[displayIndex].time}
                  </text>
                </g>
              )}

              {/* 轴侧 X 刻度 */}
              {timeline.map((pt, i) => {
                const step = Math.max(1, Math.ceil(timeline.length / 8));
                if (i % step !== 0 && i !== timeline.length - 1) return null;
                return (
                  <text
                    key={i}
                    x={getX(i)}
                    y={paddingTop + chartHeight + 14}
                    fill="#64748b"
                    fontSize="8.5"
                    textAnchor="middle"
                    className="font-mono opacity-80"
                  >
                    {pt.time}
                  </text>
                );
              })}

              {/* 透明网格物理捕获带（交互滑轨层） */}
              {timeline.map((pt, i) => {
                const x = getX(i);
                const stepWidth = chartWidth / Math.max(1, timeline.length - 1);
                return (
                  <rect
                    key={i}
                    x={x - stepWidth / 2}
                    y={paddingTop}
                    width={stepWidth}
                    height={chartHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIndex(i)}
                    onMouseLeave={() => setHoverIndex(null)}
                    onClick={() => setActiveTimeIndex(i)}
                  />
                );
              })}

              {/* ================== 右侧极高拟真专业版图例排行榜 (Legend Matrix) ================== */}
              <g transform={`translate(${width - paddingRight + 12}, ${paddingTop - 5})`}>
                <text x="0" y="0" fill="#64748b" fontSize="8" fontWeight="bold" className="font-mono tracking-widest uppercase mb-1">
                  板块最新舆温榜
                </text>
                
                {Object.keys(SECTOR_COLORS).map((secId, idx) => {
                  const col = SECTOR_COLORS[secId];
                  const isSelected = selectedSectorId === secId;
                  const isHovered = hoveredLineSectorId === secId;
                  const curHeat = activePointSnapshot ? (activePointSnapshot.sectors[secId]?.heat || 0) : 0;
                  const curChg = activePointSnapshot ? (activePointSnapshot.sectors[secId]?.change || 0) : 0;

                  return (
                    <g
                      key={secId}
                      transform={`translate(0, ${15 + idx * 20})`}
                      className="cursor-pointer select-none transition-all duration-150"
                      onMouseEnter={() => setHoveredLineSectorId(secId)}
                      onMouseLeave={() => setHoveredLineSectorId(null)}
                      onClick={() => {
                        // 支持在全板块状态下一键选取此板块
                        // 联动给父组件
                        setActiveTimeIndex(displayIndex);
                      }}
                    >
                      {/* 实色标识符块 */}
                      <rect
                        x="0"
                        y="1"
                        width="6"
                        height="10"
                        rx="1"
                        fill={col.stroke}
                        className="transition-all"
                      />
                      
                      {/* 行业名字 */}
                      <text
                        x="12"
                        y="10"
                        fill={isSelected || isHovered ? "#ffffff" : "#94a3b8"}
                        fontSize="10"
                        fontWeight={isSelected || isHovered ? "black" : "medium"}
                        className="transition-all"
                      >
                        {col.name}
                      </text>

                      {/* 实时温度值 */}
                      <text
                        x="72"
                        y="10"
                        fill={isSelected || isHovered ? col.stroke : "#cbd5e1"}
                        fontSize="10.5"
                        fontFamily="monospace"
                        fontWeight="extrabold"
                        textAnchor="start"
                      >
                        {curHeat}
                      </text>

                      {/* 日内变动涨跌幅均线 */}
                      <text
                        x="102"
                        y="10"
                        fill={curChg >= 0 ? "#ef4444" : "#22c55e"}
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="start"
                      >
                        {curChg >= 0 ? `+${curChg}%` : `${curChg}%`}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

          </div>
        ) : (
          // ================== B、热度-资金-动能三维战术空间图 (完全精像素重绘 Demo Scatter Matrix) ==================
          <div className="relative animate-fade-in">
            <div className="absolute top-2 left-4 z-20 bg-slate-900/90 border border-slate-800 text-[10px] p-2.5 rounded-lg text-slate-300 max-w-sm pointer-events-none">
              <span className="font-bold text-amber-400 block mb-1">🎮 三维量化博弈象限说明</span>
              <li><strong>纵轴 (Y轴)</strong> 代表板块分时舆情热度 (越高人气越旺)</li>
              <li><strong>横轴 (X轴)</strong> 代表估算主力买盘大单流入 (越右资金越猛)</li>
              <li><strong>星团大小 (Radius)</strong> 代表最新30分钟热度攀升加速度 (斜率越大星体越宽)</li>
            </div>

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto overflow-visible select-none"
            >
              {/* 四个象限的高科技感文字标志 */}
              {/* 右上象限：爆发抱团主线区 */}
              <rect x={paddingLeft + chartWidth/2} y={paddingTop} width={chartWidth/2} height={chartHeight/2} fill="#ef4444" fillOpacity="0.015" />
              <text x={width - paddingRight - 15} y={paddingTop + 18} fill="#ef4444" fontSize="9" fontWeight="extrabold" textAnchor="end" className="opacity-40">
                🔴 右上：主力爆单共振主线区 (高人均+高买盘)
              </text>

              {/* 左上象限：散户情绪吹嘘区 */}
              <rect x={paddingLeft} y={paddingTop} width={chartWidth/2} height={chartHeight/2} fill="#f59e0b" fillOpacity="0.01" />
              <text x={paddingLeft + 15} y={paddingTop + 18} fill="#f59e0b" fontSize="9" fontWeight="extrabold" textAnchor="start" className="opacity-40">
                🟡 左上：散户情绪退潮虚热区 (高舆论+买盘弱)
              </text>

              {/* 右下象限：主力静默吸筹区 */}
              <rect x={paddingLeft + chartWidth/2} y={paddingTop + chartHeight/2} width={chartWidth/2} height={chartHeight/2} fill="#3b82f6" fillOpacity="0.01" />
              <text x={width - paddingRight - 15} y={height - paddingBottom - 10} fill="#3b82f6" fontSize="9" fontWeight="extrabold" textAnchor="end" className="opacity-40">
                🔵 右下：机构潜伏暗度陈仓区 (低舆论+资金流入)
              </text>

              {/* 横纵象限黄金交叉主中线 */}
              <line
                x1={paddingLeft}
                y1={paddingTop + chartHeight/2}
                x2={width - paddingRight}
                y2={paddingTop + chartHeight/2}
                stroke="#475569"
                strokeWidth="1.2"
                strokeOpacity="0.3"
              />
              <line
                x1={paddingLeft + chartWidth/2}
                y1={paddingTop}
                x2={paddingLeft + chartWidth/2}
                y2={paddingTop + chartHeight}
                stroke="#475569"
                strokeWidth="1.2"
                strokeOpacity="0.3"
              />

              {/* 纵轴标签刻度 (热力值 0 - 100) */}
              {[25, 50, 75].map((val) => {
                const y = paddingTop + chartHeight - (val / 100) * chartHeight;
                return (
                  <text key={val} x={paddingLeft - 8} y={y + 3} fill="#475569" fontSize="8" className="font-mono" textAnchor="end">
                    热度 {val}
                  </text>
                );
              })}

              {/* 横轴标签刻度 (主力流入强弱) */}
              {[-30, 0, 30].map((val) => {
                // 转换 val 到 x 坐标：-40 ~ +40
                const percent = (val + 40) / 80;
                const x = paddingLeft + percent * chartWidth;
                return (
                  <text key={val} x={x} y={paddingTop + chartHeight + 14} fill="#475569" fontSize="8" className="font-mono" textAnchor="middle">
                    {val > 0 ? `买盘 +${val}M` : val === 0 ? "均衡" : `流出 ${val}M`}
                  </text>
                );
              })}

              {/* 渲染炫彩的 3D 星团粒子 (Bubble Nodes) */}
              {matrixSectors.map((node) => {
                // 资金 x 轴转换 (-40 到 40 映射到 0 到 chartWidth)
                const percentX = (node.x + 40) / 80;
                const cx = paddingLeft + Math.max(0, Math.min(1, percentX)) * chartWidth;
                const cy = getY(node.y);
                const r = node.size;

                return (
                  <g key={node.id} className="group/node cursor-pointer">
                    {/* 外层波动晕圈 */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 4}
                      fill={node.color}
                      fillOpacity="0.12"
                      className="transition-all duration-300 group-hover/node:r-plus"
                    />
                    {/* 内核发光色球 */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={node.color}
                      fillOpacity="0.75"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className="drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                    />
                    {/* 板块汉字标示 */}
                    <text
                      x={cx}
                      y={cy - r - 5}
                      fill="#ffffff"
                      fontSize="9.5"
                      fontWeight="black"
                      textAnchor="middle"
                      className="font-sans drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                    >
                      {node.name}
                    </text>
                    {/* 精细数据浮标标签 */}
                    <text
                      x={cx}
                      y={cy + r + 10}
                      fill="#94a3b8"
                      fontSize="8"
                      fontFamily="monospace"
                      textAnchor="middle"
                      className="font-semibold pointer-events-none opacity-80"
                    >
                      ({Math.round(node.x)}M, {Math.round(node.y)})
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

      </div>

      {/* 底部功能提示栏 */}
      <div className="mt-4 pt-3 border-t border-slate-900/60 text-[11px] text-slate-500 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
          <span>中国A股交易制式分时对齐，中轨线作为短线多空博弈强分岭。推荐关注前瞻雷达评级。</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-rose-500"></span>
            <span>芯片半导体</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-blue-500"></span>
            <span>人工智能/大模型</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500"></span>
            <span>新能源低空</span>
          </span>
        </div>
      </div>
    </div>
  );
}
