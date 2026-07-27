#!/usr/bin/env bash
# Install (CN wall clock — require CRON_TZ or system TZ = Asia/Shanghai):
#   CRON_TZ=Asia/Shanghai
#   40 15 * * 1-5 /opt/stock-analysis/quant-data-factory/deploy/cron_daily.sh >> /var/log/quant-daily.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
# Force A-share calendar semantics even if host TZ drifts to UTC.
export TZ="${TZ:-Asia/Shanghai}"
export PYTHONUNBUFFERED=1
if [[ -f .venv/bin/activate ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi
# Load factory .env (TZ / DATABASE_URL / WRITE_POSTGRES)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  export TZ="${TZ:-Asia/Shanghai}"
fi
python run_daily.py daily --with-index --with-extras
python run_daily.py status || true
