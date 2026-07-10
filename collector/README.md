# 行情数据底座（Collector + PostgreSQL）

面向个人使用的 A 股数据管道：沪深主板 + 创业板，约 2000 只可替换优质股池，60 秒盘中快照，为热力图与后续量化打底。

## 架构

```
腾讯云轻量（4C4G）                本地 Mac
─────────────────                ────────
PostgreSQL                       开发 / 多年日线回填 / 回测
Python collector（常驻）
（后续）Node 热力图 API 读库
```

## 云服务器初始化（Ubuntu）

```bash
# 1. 系统更新
sudo apt update && sudo apt upgrade -y

# 2. 安装 PostgreSQL + Python
sudo apt install -y postgresql postgresql-contrib python3-pip python3-venv git

# 3. 建库建用户（把密码换成自己的）
sudo -u postgres psql <<'SQL'
CREATE USER stock WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE stock_market OWNER stock;
GRANT ALL PRIVILEGES ON DATABASE stock_market TO stock;
SQL

# Postgres 15+ 还需要在库内授权 schema
sudo -u postgres psql -d stock_market -c "GRANT ALL ON SCHEMA public TO stock;"

# 4. 拉代码（按你的仓库地址）
cd /opt
sudo git clone git clone https://github.com/zitangkou/stock-analysis.git
sudo chown -R $USER:$USER /opt/stock-analysis

# 5. Python 环境
cd /opt/stock-analysis/collector
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

# 6. 配置
cp config.example.env .env
# 编辑 .env：DATABASE_URL=postgresql://stock:CHANGE_ME@127.0.0.1:5432/stock_market

# 7. 初始化并引导数据
python -m src.cli init-db
python -m src.cli bootstrap
# 建议再补近 30 日线，便于流动性过滤更准
python -m src.cli ingest-bars --days 30
python -m src.cli rebuild-universe
```

防火墙：只开放 `22`（建议限制你的办公/家庭 IP）。Postgres 默认只听 `127.0.0.1`。若 Mac 远程连库，再单独开安全组并改 `pg_hba.conf`（务必限 IP + 强密码）。

## 常用命令

在 `collector/` 目录、已 `source .venv/bin/activate`：

| 命令 | 说明 |
|---|---|
| `python -m src.cli init-db` | 建表 |
| `python -m src.cli sync-calendar` | 交易日历 |
| `python -m src.cli sync-instruments` | 同步 60/00/30 标的 |
| `python -m src.cli sync-fundamentals` | 同步基本面（ROE/净利等） |
| `python -m src.cli rebuild-universe` | 按可配权重重筛约 2000 只 |
| `python -m src.cli ingest-quotes --force` | 立即拉一轮快照 |
| `python -m src.cli run-quotes` | 交易时段循环（默认 60s） |
| `python -m src.cli ingest-bars --days 30` | 日线回填 |

## 限流建议（防封）

默认已偏保守：
- 盘中快照间隔 **180 秒**（`QUOTE_INTERVAL_SEC`）
- 行情优先走 **新浪批量**（只打股池约 2000 只，约 20 次请求/轮），不再每轮狂翻东财全市场分页
- 日线默认每只间隔 **2 秒**（`BARS_SLEEP_SEC`）

被断开后先停 10–30 分钟再试，不要连续重跑 `ingest-bars` / `ingest-quotes`。

## 申万行业 → 题材映射

```bash
python -m src.cli init-db
# 建议后台跑（全量较久）
nohup python -m src.cli sync-sw-industry --sleep 1.0 > /var/log/stock-sw-industry.log 2>&1 &
tail -f /var/log/stock-sw-industry.log
```

成功后 `instruments.theme_id` 会写入 `semiconductor` / `military` / `finance` 等，热力图按题材聚合。

基础因子（可选）：

```bash
python -m src.cli compute-factors --days 60
```

强制纳入/剔除：

```sql
INSERT INTO universe_overrides (code, action, note)
VALUES ('600519', 'force_in', '长期持有')
ON CONFLICT (code) DO UPDATE SET action = EXCLUDED.action, note = EXCLUDED.note, updated_at = NOW();
-- 然后: python -m src.cli rebuild-universe
```

## systemd 常驻行情采集

```bash
sudo cp /opt/stock-analysis/collector/deploy/stock-quotes.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stock-quotes.service
sudo systemctl status stock-quotes.service
```

## 建议的日常节奏

| 频率 | 任务 |
|---|---|
| 交易时段 | `run-quotes`（systemd） |
| 每个交易日盘后 | `ingest-bars --days 5` |
| 每周 | `sync-fundamentals` → `rebuild-universe` |
| 按需 | Mac 上跑多年 `ingest-bars` 写入同一数据库 |

## 内存注意（4G）

- Postgres：`shared_buffers≈512MB` 即可，不必默认拉满
- 不要同机再跑 Hermes / 宝塔全家桶 / 重型 Docker 堆
- 快照默认保留约 40 天（`SNAPSHOT_RETENTION_DAYS`）
