#!/usr/bin/env bash
# Install:
#   40 15 * * 1-5 /opt/quant-data-factory/deploy/cron_daily.sh >> /var/log/quant-daily.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
export PYTHONUNBUFFERED=1
python run_daily.py daily --with-index --with-extras
