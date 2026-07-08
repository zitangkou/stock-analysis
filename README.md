# 股票市场热度分发与舆情终端

实时抓取并分析主流财经论坛、社区及交易网站舆情，计算并可视化各行业板块与热门股票的实时热力值变化和历史演变。

View your app in AI Studio: https://ai.studio/apps/2e8f74be-9f96-4c67-a014-57da7b454c8a

## 项目结构

```
stock-analysis/
├── server.ts              # Express 入口：API + 开发态挂载 Vite
├── server/
│   └── marketEngine.ts    # 市场热度引擎（板块/个股、爬取模拟、AI 研判）
├── src/
│   ├── App.tsx            # 主界面（热力图、权重、报告等）
│   ├── main.tsx           # React 入口
│   ├── index.css          # 全局样式
│   ├── types.ts           # 共享类型定义
│   └── components/        # HistoryChart / HeatmapGrid / StockList / ScrapeLogRail
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example           # 环境变量模板
└── metadata.json          # AI Studio 应用元数据
```

## 技术框架

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Lucide + Motion |
| 后端 | Express（`tsx` 直接跑 `server.ts`） |
| AI | Google Gemini（`@google/genai`），用于舆情研判与轮动报告 |
| 架构 | 单体：开发时 Express 以 middleware 模式挂 Vite；生产先 `vite build` 再托管 `dist` |

核心能力：10 大行业板块热力、个股列表、舆情日志、定时/手动抓取、权重调节、AI 题材轮动报告（无 Key 或 429 时走本地 fallback）。

## 本地启动

**前置要求：** Node.js

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入 `GEMINI_API_KEY`（可选但建议配置）。

3. 启动开发服务：

```bash
npm run dev
```

浏览器打开：**http://localhost:3000**

说明：
- 不配置 `GEMINI_API_KEY` 也能跑，市场数据和本地 fallback 报告可用；AI 增强抓取 / Gemini 报告会降级。
- `APP_URL` 一般本地可不填，AI Studio / Cloud Run 部署时会自动注入。

## 生产构建

```bash
npm run build
npm start
```

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式（Express + Vite HMR），端口 3000 |
| `npm run build` | 构建前端到 `dist/`，并打包服务端为 `dist/server.cjs` |
| `npm start` | 生产模式启动 |
| `npm run lint` | TypeScript 类型检查 |
| `npm run clean` | 清理构建产物 |
