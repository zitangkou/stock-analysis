#!/usr/bin/env bash
# Local smoke: small BaoStock pull + status (does not need Postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv 2>/dev/null || true
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt
cp -n config.example.env .env 2>/dev/null || true

# Use a known historical trading day
DAY="${1:-2024-06-03}"
echo "== bootstrap limit=15 date=$DAY =="
python run_daily.py bootstrap --date "$DAY" --limit 15 --force -v
echo "== status =="
python run_daily.py status
echo "OK. Parquet under storage/parquet ; open UI Data Center after npm run dev"
