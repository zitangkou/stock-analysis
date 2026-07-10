import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { marketEngine } from "./server/marketEngine.js";
import { isDbConfigured } from "./server/db.js";
import { getRealMarketState, getRealScrapeLogs } from "./server/realMarketData.js";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const useRealData = isDbConfigured();

  app.use(express.json());

  const aiClient = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      })
    : null;

  async function resolveMarketState() {
    if (useRealData) {
      return getRealMarketState();
    }
    return marketEngine.getMarketState();
  }

  app.get("/api/market-data", async (_req, res) => {
    try {
      const state = await resolveMarketState();
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch market data" });
    }
  });

  app.get("/api/scrape-logs", async (_req, res) => {
    try {
      if (useRealData) {
        res.json(await getRealScrapeLogs());
        return;
      }
      res.json(marketEngine.getScrapeLogs());
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to fetch scrape logs" });
    }
  });

  app.post("/api/trigger-scrape", async (_req, res) => {
    try {
      if (useRealData) {
        const state = await getRealMarketState();
        res.json({ success: true, state });
        return;
      }
      await marketEngine.runAIEnhancedScrape(true);
      res.json({ success: true, state: marketEngine.getMarketState() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Scrape trigger failed" });
    }
  });

  app.post("/api/reset-data", async (_req, res) => {
    try {
      if (useRealData) {
        const state = await getRealMarketState();
        res.json({
          success: true,
          state,
          message: "真实库模式不支持重置，已返回当前库内行情",
        });
        return;
      }
      marketEngine.resetTodayState();
      res.json({ success: true, state: marketEngine.getMarketState() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Reset failed" });
    }
  });

  app.post("/api/update-interval", (req, res) => {
    try {
      const { intervalMs } = req.body;
      if (typeof intervalMs === "number" && intervalMs > 0) {
        if (!useRealData) {
          marketEngine.setIntervalMs(intervalMs);
        }
        res.json({
          success: true,
          intervalMs,
          note: useRealData
            ? "真实库模式：采集间隔请改 collector/.env 的 QUOTE_INTERVAL_SEC"
            : undefined,
        });
      } else {
        res.status(400).json({ error: "Invalid intervalMs" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Update interval failed" });
    }
  });

  function generateFallbackReport(state: any, _logs: any[]): string {
    const intervalMinutes = useRealData ? 3 : marketEngine.getIntervalMs() / 60000;
    const sortedSectors = [...state.currentSectors].sort(
      (a: any, b: any) => b.heat - a.heat
    );
    const strongestSector = sortedSectors[0];
    const secondSector = sortedSectors[1];
    const weakestSector = sortedSectors[sortedSectors.length - 1];

    const activeStocks: any[] = [];
    sortedSectors.slice(0, 3).forEach((sec: any) => {
      if (sec.hotStocks && sec.hotStocks.length > 0) {
        activeStocks.push(sec.hotStocks[0]);
      }
    });

    const nowStr = new Date().toLocaleString("zh-CN", { hour12: false });

    return `### 💡 **大盘综合情绪面与风险偏好度**

自适应量化监测显示，当前市场处于**资金多空博弈与题材交织的敏感期**。两市成交量能温和变动，盘面呈现出极强的“题材轮动与高低切换”特征。

- **分歧转一致**：多空买盘力量在 **${strongestSector?.name || "领涨题材"}** 再次汇聚。
- **弱势磨底（${weakestSector?.name || "冷门题材"}）**：当前热度仅为 **${weakestSector?.heat || 35}**。

---

### 🔄 **题材主线交替与资金高低切复盘**

根据最近 ${intervalMinutes} 分钟粒度的时序热度变迁轨迹：

1. **绝对主线（${strongestSector?.name || "核心题材"}）**：热度 **${strongestSector?.heat || 85}**，涨跌幅 **${strongestSector?.change >= 0 ? "+" : ""}${strongestSector?.change}%**。
2. **跟风/辅助支线（${secondSector?.name || "辅助板块"}）**：热度 **${secondSector?.heat || 65}**。

---

### ⚡ **焦点异常个股与筹码博弈透视**

${activeStocks
  .slice(0, 2)
  .map(
    (stk: any) => `
- **${stk.name} (${stk.code})**：最新价 **¥${Number(stk.price).toFixed(2)}**，涨幅 **${stk.change >= 0 ? "+" : ""}${stk.change}%**。`
  )
  .join("")}

---

### 🔮 **下个交易时刻防守/进攻策略与胜率推演**

- **进攻**：聚焦 **${strongestSector?.name || "核心题材"}** 中换手充分的标的。
- **防守**：规避高位滞涨，保留部分仓位至 **${secondSector?.name || "辅助板块"}**。

*注：${useRealData ? "报告基于 PostgreSQL 真实行情聚合生成。" : "本地量化引擎生成。"}生成时间：${nowStr}*`;
  }

  app.post("/api/ai-rotation-report", async (_req, res) => {
    const state = await resolveMarketState();
    const logs = useRealData
      ? await getRealScrapeLogs()
      : marketEngine.getScrapeLogs();

    try {
      if (!aiClient || (!useRealData && marketEngine.isCooldownActive())) {
        return res.json({ report: generateFallbackReport(state, logs) });
      }

      const intervalMinutes = useRealData
        ? 3
        : marketEngine.getIntervalMs() / 60000;
      const intervalText =
        intervalMinutes < 1
          ? `${marketEngine.getIntervalMs() / 1000}秒`
          : `${intervalMinutes}分钟`;

      const simplifiedTimeline = state.timeline.map((pt) => {
        const sortedSectors = Object.entries(pt.sectors)
          .map(([id, data]) => {
            const mappedName =
              state.currentSectors.find((s) => s.id === id)?.name || id;
            return { name: mappedName, heat: data.heat, change: data.change };
          })
          .sort((a, b) => b.heat - a.heat);
        return {
          time: pt.time,
          topSectors: sortedSectors.slice(0, 3),
        };
      });

      const logsText = logs
        .slice(0, 10)
        .map((l) => `[${l.source}] ${l.title} (情感:${l.sentiment})`)
        .join("\n");

      const prompt = `你是一个顶级宏观策略与短线题材量化分析师。
根据今日 A股各核心板块的时序热度轮动数据，撰写【今日A股盘中题材轮动与资金博弈研判复盘报告】。

【全天${intervalText}粒度最热行业板块变迁轨迹】:
${JSON.stringify(simplifiedTimeline.slice(-8), null, 2)}

【数据源说明】:
${logsText}

报告必须包含：大盘情绪、题材主线、焦点个股、攻防策略。使用专业 Markdown。`;

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      res.json({ report: response.text });
    } catch (err: any) {
      console.warn(
        "[Server] Gemini AI 报告生成受阻，使用本地报告:",
        err.message || err
      );
      const errMsg = err?.message || String(err);
      if (
        !useRealData &&
        (errMsg.includes("429") ||
          errMsg.includes("quota") ||
          errMsg.includes("Quota") ||
          errMsg.includes("RESOURCE_EXHAUSTED"))
      ) {
        marketEngine.triggerCooldown(300000);
      }
      res.json({ report: generateFallbackReport(state, logs) });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "healthy",
      mode: useRealData ? "postgres" : "mock",
      timestamp: new Date().toISOString(),
    });
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] 启动开发环境: Vite 实时编译热装载启动");
    console.log(
      useRealData
        ? "[Server] 数据模式: PostgreSQL 真实行情"
        : "[Server] 数据模式: 模拟 marketEngine（未配置 DATABASE_URL）"
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] 启动生产环境: 托管编译后的 dist 目录");
    console.log(
      useRealData
        ? "[Server] 数据模式: PostgreSQL 真实行情"
        : "[Server] 数据模式: 模拟 marketEngine（未配置 DATABASE_URL）"
    );
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] 热力图终端服务已开启在 http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] 启动崩溃:", err);
});
