#!/usr/bin/env bash
# Weekly universe refresh — install with:
#   crontab -e
#   30 18 * * 5 cd /opt/stock-analysis/collector && ./deploy/cron_weekly.sh >> /var/log/stock-weekly.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
source .venv/bin/activate
python -m src.cli sync-instruments
python -m src.cli sync-fundamentals
python -m src.cli ingest-bars --days 30
python -m src.cli rebuild-universe
