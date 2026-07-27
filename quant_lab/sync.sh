#!/usr/bin/env bash
# Sync cloud Parquet factory → local lab data dir.
# Usage:
#   export QUANT_CLOUD=root@124.223.178.64
#   export QUANT_REMOTE_PARQUET=/opt/quant-data-factory/storage/parquet
#   ./sync.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOCAL="${QUANT_LOCAL_PARQUET:-$ROOT/data/parquet}"
REMOTE_HOST="${QUANT_CLOUD:?Set QUANT_CLOUD=user@host}"
REMOTE_PATH="${QUANT_REMOTE_PARQUET:-/opt/quant-data-factory/storage/parquet}"

mkdir -p "$LOCAL"
echo "rsync $REMOTE_HOST:$REMOTE_PATH/ → $LOCAL/"
rsync -avz --progress -e ssh "${REMOTE_HOST}:${REMOTE_PATH}/" "$LOCAL/"
echo "done."
