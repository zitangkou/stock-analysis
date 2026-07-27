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

echo "== sync-meta =="
python run_daily.py sync-meta -v

echo "== daily full market (long) =="
# Prefer last trading day; force rewrite today's file if re-run
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
