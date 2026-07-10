# 股票市场热度分发与舆情终端

实时抓取并分析主流财经论坛、社区及交易网站舆情，计算并可视化各行业板块与热门股票的实时热力值变化和历史演变。

View your app in AI Studio: https://ai.studio/apps/2e8f74be-9f96-4c67-a014-57da7b454c8a

## 项目结构

```
stock-analysis/
├── collector/             # 行情数据底座（Python + PostgreSQL）
│   ├── src/               # 采集任务：日历/标的/基本面/股池/快照/日线
│   ├── sql/               # 数据库 schema
│   ├── deploy/            # systemd / cron
│   └── README.md          # 云服务器部署说明
├── server.ts              # Express 入口：API + 开发态挂载 Vite
├── server/
│   └── marketEngine.ts    # 市场热度引擎（当前为模拟数据，后续接 Postgres）
├── src/                   # React 热力图前端
├── package.json
└── .env.example
```

## 技术框架

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Lucide + Motion |
| 热力图 API | Express（`tsx` 跑 `server.ts`） |
| 行情底座 | Python collector + PostgreSQL（沪深主板+创业板，约 2000 优质股） |
| AI | Google Gemini（可选，轮动报告；无 Key 时本地 fallback） |

## 开发路线（当前）

1. **Phase 1**：云上 Postgres + 选股入池 + 快照 — 见 [`collector/README.md`](collector/README.md)
2. **Phase 2**：日线回填（可后台 `nohup`）
3. **Phase 3**：Express 热力图读真实库 — 配置 `DATABASE_URL` 后 `npm run dev`
4. **Phase 4**：申万/东财行业 → 题材映射（`sync-sw-industry`）+ 基础因子（`compute-factors`）

观察对象是 **半导体 / 军工 / 证券 / 电力** 等题材，不是沪深创业板。

### 热力图接真库

```bash
# 方式 A：本机通过 SSH 隧道连云上 Postgres
ssh -L 5432:127.0.0.1:5432 root@你的云服务器IP

# 另开终端
cp .env.example .env.local   # 填 DATABASE_URL=postgresql://stock:密码@127.0.0.1:5432/stock_market
npm run dev
# 打开 http://localhost:3000 ，/api/health 应显示 "mode":"postgres"
```

未配置 `DATABASE_URL` 时仍走原来的模拟 `marketEngine`。

## 本地启动（热力图 UI）

**前置要求：** Node.js

1. 安装依赖：`npm install`
2. `cp .env.example .env.local`，可选填入 `GEMINI_API_KEY`
3. `npm run dev` → http://localhost:3000

说明：当前 UI 仍使用模拟行情；真实数据管道在 `collector/`，需先在云服务器按 collector 文档初始化。

## 行情底座（云服务器）

详见 **[collector/README.md](collector/README.md)**。摘要：

```bash
cd collector
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp config.example.env .env   # 填写 DATABASE_URL
python -m src.cli bootstrap
python -m src.cli run-quotes # 或启用 systemd
```

## 生产构建（前端+Express）

```bash
npm run build
npm start
```

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 热力图开发服务，端口 3000 |
| `npm run build` / `npm start` | 前端生产构建与启动 |
| `python -m src.cli …` | 在 `collector/` 下，见 collector README |
