# 量化数据工厂（云）+ 本机实验室

整合方案实现：盘后 BaoStock 日 K → Parquet；本机 rsync + DuckDB / Polars / Vectorbt。

详细字段见 [`docs/quant_data_dictionary.md`](../docs/quant_data_dictionary.md)。

## 本地冒烟（确认能拉数）

```bash
cd quant-data-factory
chmod +x scripts/smoke_local.sh
./scripts/smoke_local.sh 2024-06-03
# 或：
python run_daily.py bootstrap --date 2024-06-03 --limit 15 --force -v
python run_daily.py status
```

## 云上全量部署

先在本机 `git push`，云上：

```bash
chmod +x quant-data-factory/deploy/cloud_bootstrap.sh
sudo bash quant-data-factory/deploy/cloud_bootstrap.sh /opt/stock-analysis
# 看日志
tail -f /var/log/quant-factory-daily.log
python run_daily.py status
```

全量单日（去掉 limit）较慢；历史用：

```bash
python run_daily.py backfill --start 2024-01-01 --end 2024-12-31
```

## 数据中心 UI

`npm run dev` 后打开 **数据中心** Tab：绿勾=已拉取，右侧可点行情预览日K。
需 `DATABASE_URL` 才能看 Postgres quotes/bars；Parquet 状态读 `PARQUET_ROOT` 或默认 `quant-data-factory/storage/parquet`。

### Cron

```bash
chmod +x deploy/cron_daily.sh
crontab -e
# 交易日 15:40（脚本内还会用 BaoStock 日历二次确认）
40 15 * * 1-5 /opt/stock-analysis/quant-data-factory/deploy/cron_daily.sh >> /var/log/quant-daily.log 2>&1
```

### 可选写入现有 Postgres

在 `.env`：

```bash
WRITE_POSTGRES=1
DATABASE_URL=postgresql://stock:PASSWORD@127.0.0.1:5432/stock_market
```

会 upsert `bars_1d`。需已 `collector` init-db。

## 本机实验室

```bash
cd quant_lab
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
chmod +x sync.sh

export QUANT_CLOUD=root@你的云IP
export QUANT_REMOTE_PARQUET=/opt/stock-analysis/quant-data-factory/storage/parquet
./sync.sh

python examples/duckdb_smoke.py
python factors/momentum_amount.py
python backtest/sample_ma_cross.py --max-symbols 30
```

## 纪律摘要

- 云上**不要**把东财实时板块/资金流当主路径
- 日 K 成功 + extras 失败 = partial OK
- 回测统一后复权；财务用报告期防未来函数
- 实盘前再考虑 Tushare / 券商 QMT 替换免费源
