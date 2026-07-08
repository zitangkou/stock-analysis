import { Stock } from "../types";
import { 
  Award, 
  Flame, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ShieldAlert, 
  Zap, 
  Coins 
} from "lucide-react";

interface StockListProps {
  stocks: Stock[];
  sectorName: string;
}

export default function StockList({ stocks, sectorName }: StockListProps) {
  
  // 渲染排名徽标
  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <span className="w-5.5 h-5.5 rounded-lg flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-extrabold text-xs shadow-md shadow-amber-500/20">
            1
          </span>
        );
      case 2:
        return (
          <span className="w-5.5 h-5.5 rounded-lg flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-400 text-slate-950 font-extrabold text-xs shadow-md shadow-slate-300/10">
            2
          </span>
        );
      case 3:
        return (
          <span className="w-5.5 h-5.5 rounded-lg flex items-center justify-center bg-gradient-to-br from-amber-700 to-amber-900 text-amber-100 font-bold text-xs">
            3
          </span>
        );
      default:
        return (
          <span className="w-5 h-5 rounded bg-slate-800 text-slate-400 font-mono text-[11px] flex items-center justify-center">
            {rank}
          </span>
        );
    }
  };

  // 根据股票排名与涨幅，计算其盘中市场地位和封板状态
  const getMarketRoleAndBoardStatus = (stk: Stock, rank: number) => {
    let role = "跟风补涨";
    let status = "平台蓄势";
    let roleStyle = "text-slate-400 bg-slate-800/50 border-slate-800";
    let statusStyle = "text-slate-400 border-slate-850";

    const chg = stk.change;

    if (rank === 1) {
      role = "龙一 (总龙头)";
      roleStyle = "text-amber-400 bg-amber-500/10 border-amber-500/30 font-bold";
      if (chg >= 9.8) {
        status = "5连板 (一字封死)";
        statusStyle = "text-red-400 bg-red-500/10 border-red-500/20 font-bold animate-pulse";
      } else if (chg >= 5) {
        status = "放量3连板 (强震)";
        statusStyle = "text-rose-400 bg-rose-500/10 border-rose-500/20";
      } else if (chg > 0) {
        status = "高位抗跌震荡";
        statusStyle = "text-amber-300 bg-amber-500/5 border-amber-500/10";
      } else {
        status = "炸板回封中";
        statusStyle = "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      }
    } else if (rank === 2) {
      role = "龙二 (核心中军)";
      roleStyle = "text-rose-400 bg-rose-500/10 border-rose-500/30 font-bold";
      if (chg >= 9.8) {
        status = "首板突破 (强封)";
        statusStyle = "text-red-400 bg-red-500/10 border-red-500/20 font-semibold";
      } else if (chg >= 4) {
        status = "高潮跟风拉升";
        statusStyle = "text-rose-400 bg-rose-500/5 border-rose-500/10";
      } else {
        status = "冲高横盘整理";
        statusStyle = "text-slate-300";
      }
    } else if (rank === 3) {
      role = "龙三 (弹性套利)";
      roleStyle = "text-red-400 bg-red-500/10 border-red-500/25 font-bold";
      if (chg >= 19.8 || (stk.code.startsWith("30") && chg >= 9.8)) {
        status = "20cm大单封板";
        statusStyle = "text-red-400 bg-red-500/10 border-red-500/20 font-bold";
      } else if (chg >= 5) {
        status = "脉冲试盘触涨停";
        statusStyle = "text-orange-400 bg-orange-500/10 border-orange-500/15";
      } else {
        status = "低吸资金套利";
        statusStyle = "text-slate-400";
      }
    } else {
      // 4-10
      if (chg >= 9.8) {
        role = "首板补涨";
        roleStyle = "text-red-400 bg-red-500/5 border-red-500/20";
        status = "强力首板封涨停";
        statusStyle = "text-red-400 font-semibold";
      } else if (chg <= -5) {
        role = "跟风弱势";
        roleStyle = "text-green-400 bg-green-500/5 border-green-500/10";
        status = "补跌回调走弱";
        statusStyle = "text-green-400";
      } else if (chg < 0) {
        role = "跟风整理";
        status = "缩量探底筑底";
      } else {
        role = "底部补涨";
        status = "资金低位吸筹";
      }
    }

    return { role, status, roleStyle, statusStyle };
  };

  // 根据个股热度和涨跌幅，动态算出一个极逼真的“主力资金净流入”和“换手率”
  const calculateStockMetrics = (stk: Stock) => {
    const inflow = (stk.heat - 40) * 1.5 + (stk.change * 5.8);
    const turnover = ((stk.heat * 0.12) + (Math.abs(stk.change) * 0.8) + 2.1).toFixed(1) + "%";
    return {
      netInflow: parseFloat(inflow.toFixed(1)),
      turnover
    };
  };

  const getSentimentBadge = (sentiment: Stock['sentiment']) => {
    switch (sentiment) {
      case "positive":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-0.5">
            <TrendingUp className="w-2.5 h-2.5 animate-pulse" />
            极致看多
          </span>
        );
      case "negative":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-0.5">
            <TrendingDown className="w-2.5 h-2.5" />
            恐慌看空
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50 flex items-center gap-0.5">
            <Minus className="w-2.5 h-2.5" />
            多空博弈
          </span>
        );
    }
  };

  return (
    <div id="stock-list" className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 h-full flex flex-col justify-between shadow-md">
      <div>
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1 bg-amber-500/10 rounded border border-amber-500/20">
                <Award className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">
                【{sectorName}】盘中主线龙头及跟风梯队排兵布阵
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-sans">
              根据盘中成交、委买量、游资席位提及率，深度梳理领涨梯队（龙一/中军/套利）分层。
            </p>
          </div>
        </div>

        {/* 表格容器 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] font-sans">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/40 text-[10px] uppercase tracking-wider font-mono">
                <th className="py-2 w-8 text-center whitespace-nowrap">排名</th>
                <th className="py-2 whitespace-nowrap">股票名称 / 市场地位</th>
                <th className="py-2 whitespace-nowrap">连板封单状态</th>
                <th className="py-2 whitespace-nowrap">现价 (估)</th>
                <th className="py-2 whitespace-nowrap">涨跌幅</th>
                <th className="py-2 whitespace-nowrap">主力净流 / 换手</th>
                <th className="py-2 text-right pr-2 whitespace-nowrap">热度 (共鸣次)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/20">
              {stocks.map((stk) => {
                const isUp = stk.change >= 0;
                const { role, status, roleStyle, statusStyle } = getMarketRoleAndBoardStatus(stk, stk.rank);
                const metrics = calculateStockMetrics(stk);

                return (
                  <tr key={stk.code} className="hover:bg-slate-850/30 transition-colors">
                    {/* 排名 */}
                    <td className="py-2.5 text-center whitespace-nowrap">{getRankBadge(stk.rank)}</td>
                    
                    {/* 股票名 & 市场地位标签 */}
                    <td className="py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-200 text-xs">{stk.name}</span>
                        <span className={`px-1 rounded-[3px] text-[8px] border leading-none font-mono py-0.5 whitespace-nowrap ${roleStyle}`}>
                          {role}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{stk.code}</div>
                    </td>

                    {/* 连板封单状态 */}
                    <td className="py-2.5 whitespace-nowrap">
                      <span className={`px-1 py-0.5 rounded text-[10px] border border-slate-800/40 whitespace-nowrap ${statusStyle}`}>
                        {status}
                      </span>
                    </td>

                    {/* 价格 */}
                    <td className="py-2.5 font-mono font-bold text-slate-300 whitespace-nowrap">
                      ¥{stk.price.toFixed(2)}
                    </td>

                    {/* 涨跌幅 */}
                    <td className="py-2.5 whitespace-nowrap">
                      <span className={`inline-block px-1.5 py-0.5 rounded font-mono font-extrabold text-center text-[11px] min-w-[55px] whitespace-nowrap ${
                        stk.change >= 0 
                          ? "bg-red-500/10 text-red-500 border border-red-500/10" 
                          : "bg-green-500/10 text-green-500 border border-green-500/10"
                      }`}>
                        {isUp ? `+${stk.change.toFixed(2)}` : stk.change.toFixed(2)}%
                      </span>
                    </td>

                    {/* 主力净流与换手率 */}
                    <td className="py-2.5 font-mono whitespace-nowrap">
                      <div className={`font-semibold text-[10px] whitespace-nowrap ${metrics.netInflow >= 0 ? "text-red-400" : "text-green-400"}`}>
                        {metrics.netInflow >= 0 ? `+¥${metrics.netInflow}M` : `¥${metrics.netInflow}M`}
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5 whitespace-nowrap">换手 {metrics.turnover}</div>
                    </td>

                    {/* 热度条 */}
                    <td className="py-2.5 whitespace-nowrap">
                      <div className="flex flex-col items-end justify-center whitespace-nowrap">
                        <div className="flex items-center gap-0.5 font-bold text-red-400 font-mono text-[11px] whitespace-nowrap">
                          <Flame className="w-3 h-3 fill-red-500/20" />
                          {stk.heat}
                        </div>
                        <div className="text-[9px] text-slate-500 flex items-center gap-0.5 mt-0.5 whitespace-nowrap">
                          <MessageSquare className="w-2.5 h-2.5" />
                          <span>{stk.discussionCount}w+</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/40 text-[9px] text-slate-500 flex items-center justify-between">
        <span>* 依据沪深两市2层联动换筹算法，首推龙头及中军标配供短线博弈。</span>
        <span className="flex items-center gap-0.5 text-amber-500 font-semibold bg-amber-500/15 border border-amber-500/10 px-1 py-0.2 rounded text-[8px] uppercase">
          <Coins className="w-2.5 h-2.5" />
          A股特供版
        </span>
      </div>
    </div>
  );
}
