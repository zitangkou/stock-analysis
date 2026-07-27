# 量化数据工厂（云）+ 本机实验室

整合方案实现：盘后 BaoStock 日 K → Parquet；本机 rsync + DuckDB / Polars / Vectorbt。

详细字段见 [`docs/quant_data_dictionary.md`](../docs/quant_data_dictionary.md)。

## 云服务器部署

```bash
# 建议路径
sudo mkdir -p /opt/quant-data-factory
sudo rsync -a quant-data-factory/ /opt/quant-data-factory/
# 或在本仓库内：
cd /opt/stock-analysis/quant-data-factory

python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
cp config.example.env .env

# 冒烟：限制 N 只，强制跑一天
python run_daily.py daily --date 2024-07-01 --limit 20 --force -v

# 正式：当日（cron 用）
python run_daily.py daily --with-index --with-extras

# 历史回填（示例）
python run_daily.py backfill --start 2024-01-01 --end 2024-01-31

# 行业映射（先 --with-yjbb 产出 parquet）
python run_daily.py extras --with-yjbb
python scripts/build_industry_map.py --yjbb storage/parquet/meta/fundamentals/yjbb_YYYY-MM-DD.parquet
```

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
