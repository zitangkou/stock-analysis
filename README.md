# 股票市场热度分发与舆情终端

实时抓取并分析主流财经论坛、社区及交易网站舆情，计算并可视化各行业板块与热门股票的实时热力值变化和历史演变。

View your app in AI Studio: https://ai.studio/apps/2e8f74be-9f96-4c67-a014-57da7b454c8a

## 项目结构

```
stock-analysis/
├── collector/             # 行情数据底座（Python + PostgreSQL）
│   ├── src/               # 采集：日历/标的/基本面/股池/快照/日线/热力
│   ├── sql/               # schema（含 004 热力平台）
│   ├── deploy/            # systemd / cron
│   └── README.md
├── server.ts              # Express：七模块 API + Vite
├── server/                # realMarketData / terminalData / sectorThemes
├── src/                   # React 七模块终端
├── docs/                  # 模块×表×Job、题材字典
├── data/concept_members.csv
└── package.json
```

## 技术框架

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Lucide |
| 终端 API | Express（七模块：总览/热力/热榜/雷达/轮动/AI/预警） |
| 行情底座 | Python collector + PostgreSQL（~2000 优质股） |
| 热力 | `compute-heat` 落库；资金/涨停为代理指标（`data_quality=proxy`） |
| AI | Google Gemini（可选；吃落库热力摘要） |

## 开发路线（当前）

1. ~~云上 Postgres + 股池 + 快照 + 日线~~
2. ~~题材映射（`apply-themes` / 本地行业）~~
3. **Phase-1 七模块终端 + 落库热力** — 见 [`docs/module_table_job_map.md`](docs/module_table_job_map.md)
4. 后续：真实资金/涨停源验证、概念 CSV 导入、舆情

观察对象是 **半导体 / 军工 / 证券 / 电力** 等题材，不是沪深创业板。

### 热力图接真库 + 热力落库

```bash
# SSH 隧道或云上直接
cd collector && source .venv/bin/activate
python -m src.cli init-db
python -m src.cli apply-themes
python -m src.cli ingest-quotes --force   # 成功后自动 compute-heat
# 或：python -m src.cli compute-heat

cd .. && npm run dev
# /api/health → mode:postgres，themeStats 含 heat_stocks / heat_sectors
```

未配置 `DATABASE_URL` 时仍走模拟 `marketEngine`。
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
