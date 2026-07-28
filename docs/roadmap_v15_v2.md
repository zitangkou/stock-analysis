# 开发路线：V1 → V1.5 → V2

## V1（已落地）

- 盘中：`collector` Postgres + 新浪 quotes / bars / 热力七模块
- 盘后：`quant-data-factory` BaoStock 日 K → Parquet + 北向/龙虎榜/yjbb
- 数据中心：数据集清单 + 个股搜索 + 成交额/量

## V1.5（本批）

云上可稳定跑、**不依赖东财实时接口**：

| 能力 | 实现 |
|---|---|
| 板别涨停池 | `limit_up_pool`：主板 9.5% / 创业板 19.5% / ST 4.8%，来自 `quotes_latest` |
| 资金代理落库 | `money_flow_daily`：`amount × change_pct/100`，`data_quality=proxy` |
| 概念 CSV | `concept_members` + `import-concepts` 读 `data/concept_members.csv` |
| 热力涨停判定 | `compute_heat` 改用板别阈值 |
| UI | 数据中心右侧「涨停 / 资金」Tab；API `/api/v15/*` |

```bash
cd collector && source .venv/bin/activate
python -m src.cli init-db
python -m src.cli import-concepts
python -m src.cli ingest-quotes --force   # 内含 compute-heat → limit-up + money-flow
# 或单独：
python -m src.cli ingest-limit-up
python -m src.cli ingest-money-flow
```

## V2（分钟 K + 专业图）

| 能力 | 状态 |
|---|---|
| 5 / 15 / 30 分钟 K | `bars_intraday` + `aggregate-intraday` |
| 盘中快照 | 默认 **60s**（`QUOTE_INTERVAL_SEC`） |
| 图表 | lightweight-charts：蜡烛 / MA / BOLL / MACD / KDJ、十字光标、滚轮缩放 |
| 常驻 | `stock-quotes.service` + cron `*/5` 聚合 |
| 舆情表 | `sentiment_events` 占位 |
| L2 / 真主力 | 不做 |

```bash
# collector/.env
QUOTE_INTERVAL_SEC=60

python -m src.cli init-db
python -m src.cli aggregate-intraday --hours 48

# 常驻行情
sudo cp deploy/stock-quotes.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now stock-quotes

# 交易时段每 5 分钟聚合分钟 K
chmod +x deploy/cron_intraday.sh
crontab -e
# */5 9-15 * * 1-5 /opt/stock-analysis/collector/deploy/cron_intraday.sh >> /var/log/stock-intraday.log 2>&1
```

## 明确不做（长期）

- L2 / 逐笔
- 云上东财主力资金/涨停池官方页作为主路径
- 股吧/新闻全站爬取
