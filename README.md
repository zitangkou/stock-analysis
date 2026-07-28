# 股票市场热度分发与舆情终端

实时抓取并分析主流财经论坛、社区及交易网站舆情，计算并可视化各行业板块与热门股票的实时热力值变化和历史演变。

View your app in AI Studio: https://ai.studio/apps/2e8f74be-9f96-4c67-a014-57da7b454c8a

## 项目结构

```
stock-analysis/
├── collector/             # 盘中热力：Postgres + 新浪快照/题材
├── quant-data-factory/    # 盘后量化仓：BaoStock→Parquet（云 cron）
├── quant_lab/             # 本机：rsync + DuckDB/Polars/Vectorbt
├── server.ts / server/    # 热力终端 API
├── src/                   # React 七模块终端
├── docs/                  # ER、数据字典、题材字典
└── package.json
```

## 量化：云采数 + 本机分析

盘后日频工厂与热力图解耦。详见：

- [`quant-data-factory/README.md`](quant-data-factory/README.md)
- [`quant_lab/README.md`](quant_lab/README.md)
- [`docs/quant_data_dictionary.md`](docs/quant_data_dictionary.md)

```bash
# 云
cd quant-data-factory && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp config.example.env .env
python run_daily.py daily --limit 30 --force --with-index

# 本机
cd quant_lab && ./sync.sh && python examples/duckdb_smoke.py
```

## 技术框架

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Lucide |
| 终端 API | Express（七模块：总览/热力/热榜/雷达/轮动/AI/预警） |
| 盘中底座 | Python collector + PostgreSQL（~2000 优质股） |
| 盘后量化仓 | BaoStock 日 K → Parquet；本机 DuckDB / Vectorbt |
| 热力 | `compute-heat` 落库；资金/涨停为代理指标（`data_quality=proxy`） |
| AI | Google Gemini（可选；吃落库热力摘要） |
## 开发路线（当前）

1. ~~云上 Postgres + 股池 + 快照 + 日线~~
2. ~~题材映射（`apply-themes` / 本地行业）~~
3. ~~Phase-1 七模块终端 + 落库热力~~
4. ~~盘后 Parquet 工厂 + 数据中心~~
5. **V1.5** 板别涨停池 / 资金代理落库 / 概念 CSV — 见 [`docs/roadmap_v15_v2.md`](docs/roadmap_v15_v2.md)
6. **V2** 5 分钟 K（snapshot 聚合）+ 舆情表占位；真资金/L2/全量舆情仍不做

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
