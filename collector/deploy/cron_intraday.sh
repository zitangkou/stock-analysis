#!/usr/bin/env bash
# Session intraday aggregation — install with:
#   */5 9-15 * * 1-5 /opt/stock-analysis/collector/deploy/cron_intraday.sh >> /var/log/stock-intraday.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source .venv/bin/activate
export TZ="${TZ:-Asia/Shanghai}"
python -m src.cli aggregate-intraday --hours 12
