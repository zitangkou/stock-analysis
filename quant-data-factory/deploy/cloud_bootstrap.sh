#!/usr/bin/env bash
# Run ON the Tencent cloud host after git pull.
set -euo pipefail
ROOT="${1:-/opt/stock-analysis}"
cd "$ROOT"
git fetch origin
git checkout main
git pull --ff-only origin main

cd quant-data-factory
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
cp -n config.example.env .env

# Optional: bridge into existing Postgres
if [[ -f ../collector/.env ]]; then
  # shellcheck disable=SC1091
  set -a
  source ../collector/.env
  set +a
  if [[ -n "${DATABASE_URL:-}" ]]; then
    grep -q '^WRITE_POSTGRES=' .env 2>/dev/null || echo "WRITE_POSTGRES=1" >> .env
    grep -q '^DATABASE_URL=' .env 2>/dev/null || echo "DATABASE_URL=$DATABASE_URL" >> .env
  fi
fi

echo "== timezone check (must be Asia/Shanghai for cron 15:40) =="
date
date -u
if command -v timedatectl >/dev/null 2>&1; then
  timedatectl | sed -n '1,8p' || true
fi
# Ensure factory .env keeps explicit CN tz (Python ZoneInfo uses this)
grep -q '^TZ=' .env 2>/dev/null || echo "TZ=Asia/Shanghai" >> .env
# Soft warn if host localtime is not CST
HOST_OFFSET="$(date +%z)"
if [[ "$HOST_OFFSET" != "+0800" ]]; then
  echo "WARNING: host UTC offset is $HOST_OFFSET (want +0800)."
  echo "  Fix: timedatectl set-timezone Asia/Shanghai"
  echo "  Or put CRON_TZ=Asia/Shanghai above the cron line."
fi

echo "== sync-meta =="
python run_daily.py sync-meta -v

echo "== daily full market (long) =="
# Default date = last completed CN session (not today before ~16:00).
# Override: python run_daily.py daily --date YYYY-MM-DD --force ...
nohup python run_daily.py daily --force --with-index --with-extras --with-yjbb \
  > /var/log/quant-factory-daily.log 2>&1 &
echo "started pid=$! log=/var/log/quant-factory-daily.log"

echo "== also catch up collector bars (30d) =="
if [[ -d ../collector/.venv ]]; then
  cd ../collector
  # shellcheck disable=SC1091
  source .venv/bin/activate
  nohup python -m src.cli ingest-bars --days 30 --sleep 2 \
    > /var/log/stock-bars-catchup.log 2>&1 &
  echo "bars catchup pid=$!"
fi

chmod +x "$ROOT/quant-data-factory/deploy/cron_daily.sh"
echo "Add cron if missing:"
echo "  40 15 * * 1-5 $ROOT/quant-data-factory/deploy/cron_daily.sh >> /var/log/quant-daily.log 2>&1"
echo "Then: python run_daily.py status"
