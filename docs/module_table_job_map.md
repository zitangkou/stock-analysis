# 模块 × 表 × Job 对照（Phase-1）

避免 ER 图 `t_*` 命名与实现漂移。本仓库**演进现有表名**，不重命名为 `t_*`。

## UI 七模块

| 模块 | 前端 | 主要 API | 读表 |
|---|---|---|---|
| 市场总览 | `OverviewPanel` | `/api/terminal/overview`, `/api/market-data` | `heat_score_sector_latest`, `heat_score_stock_latest` |
| 板块热力 | `HeatmapGrid` + `StockList` | `/api/market-data` | 同上 + `quotes_*` 兜底 |
| 个股热榜 | `RankPanel` | `/api/terminal/hot-stocks` | `heat_score_stock_latest` |
| 热力雷达 | `RadarPanel` | `/api/terminal/radar` | `heat_score_sector_latest` |
| 轮动追踪 | `RotationPanel` | `/api/terminal/rotation` | `rotation_matrix` |
| AI 分析 | App AI 区 | `/api/ai-rotation-report` | 热力/轮动/雷达摘要 |
| 预警中心 | `AlertsPanel` | `/api/terminal/alerts` | `alert_rule`, `alert_record` |

## 新增表（`collector/sql/004_heat_platform.sql`）

| 表 | 用途 |
|---|---|
| `heat_rules` | 热力权重配置 |
| `heat_score_stock` / `_latest` | 个股热力时序 / 最新 |
| `heat_score_sector` / `_latest` | 题材热力时序 / 最新 |
| `sector_quote_snapshot` | 题材聚合行情快照 |
| `rotation_matrix` | 30 分钟轮动槽位 |
| `alert_rule` / `alert_record` | 系统规则与触发日志 |

## Jobs

| CLI | 写入 | 触发 |
|---|---|---|
| `compute-heat` | heat_* / rotation / alerts | 手动；`ingest-quotes` 成功后自动；周 cron |
| `apply-themes` | `instruments.theme_id` | 周 cron（不打东财板） |
| `ingest-quotes` | `quotes_*` → 再 `compute-heat` | systemd 盘中 |

## 热力公式 V1

- 个股：`0.35*涨跌幅分位 + 0.25*成交额分位 + 0.20*换手分位 + 0.20*|涨跌|动量分位`
- 题材：成交额加权个股热力 + 上涨家数占比微调
- `net_inflow_proxy = amount * change_pct/100`（**代理**，`data_quality=proxy`）
- `is_limit_up_approx = change_pct >= 9.5`（非正式涨停池）

## 题材字典（10 theme）

见 [`docs/theme_dictionary.md`](theme_dictionary.md) 与 [`data/concept_members.csv`](../data/concept_members.csv)。

## 云上启用

```bash
cd /opt/stock-analysis && git pull
cd collector && source .venv/bin/activate
python -m src.cli init-db          # 应用 004
python -m src.cli apply-themes
python -m src.cli ingest-quotes --force
python -m src.cli compute-heat
```
