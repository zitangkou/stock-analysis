# 量化数据字典（V1 Parquet 工厂）

Schema 约定：云端 `quant-data-factory/storage/parquet`，本机 rsync 后路径相同相对结构。

## 目录树

```text
parquet/
  kline_daily/YYYY/YYYY-MM-DD.parquet     # 未复权日 K（主表）
  adjust_hfq/YYYY/YYYY-MM-DD.parquet      # 后复权 close + adj_factor_hfq
  index_daily/YYYY/YYYY-MM-DD.parquet     # 指数日 K
  meta/
    quality/YYYY-MM-DD.json               # 当日质量报告
    northbound/YYYY-MM-DD.parquet         # 北向（AKShare，schema 随版本变）
    dragon_tiger/YYYY-MM-DD.parquet       # 龙虎榜
    fundamentals/yjbb_YYYY-MM-DD.parquet  # 业绩报表快照
    industry_map.json                     # plain_code → 所处行业
```

## `kline_daily` 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| date | str/date | 交易日 YYYY-MM-DD |
| code | str | BaoStock 代码，如 `sh.600000` |
| plain_code | str | 6 位代码 |
| exchange | str | SH / SZ |
| open/high/low/close | float | **未复权** |
| volume | float | 成交量 |
| amount | float | 成交额 |
| turnover | float | 换手率（%） |
| pct_chg | float | 涨跌幅（%） |
| pre_close | float | 昨收 |
| trade_status | str | 交易状态 |
| is_st | str | 是否 ST |
| is_suspended | bool | volume<=0 标记 |

**复权：** 分析默认用 `adjust_hfq`：`close_hfq` 或 `close * adj_factor_hfq`。回测禁止混用未复权与后复权收益。

## 覆盖范围（V1）

- 包含：沪主板 `60`、深主板 `00`、创业板 `30`
- 默认不含：科创 `688`（`INCLUDE_STAR=1` 可开）、北交所

## 源与质量

| 数据集 | 源 | 失败策略 |
|---|---|---|
| 日 K / 指数 | BaoStock | 主任务失败则当日失败 |
| 后复权因子文件 | BaoStock adjustflag=1 | 可 `--no-hfq` 跳过 |
| 北向 / 龙虎榜 / 业绩报表 | AKShare | extras 失败不阻断日 K |
| 行业映射 | yjbb「所处行业」 | 静态 JSON，不打东财行业板 |

## 与 stock-analysis Postgres

可选 `WRITE_POSTGRES=1` + `DATABASE_URL`：日 K upsert 进现有 `bars_1d`（`source=baostock`）。热力图盘中链路仍走 collector 新浪快照，与本工厂解耦。
