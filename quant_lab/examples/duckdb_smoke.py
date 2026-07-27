#!/usr/bin/env python3
"""Smoke-read local Parquet with DuckDB (post-rsync)."""
from __future__ import annotations

import argparse
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GLOB = str(ROOT / "data" / "parquet" / "kline_daily" / "*" / "*.parquet")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--glob", default=DEFAULT_GLOB)
    p.add_argument("--limit", type=int, default=10)
    args = p.parse_args()

    con = duckdb.connect()
    q = f"""
    SELECT date, code, plain_code, open, high, low, close, volume, amount, pct_chg
    FROM read_parquet('{args.glob}')
    ORDER BY date DESC, amount DESC NULLS LAST
    LIMIT {args.limit}
    """
    print(con.execute(q).df())

    stats = con.execute(
        f"""
        SELECT
          COUNT(*) AS rows,
          COUNT(DISTINCT plain_code) AS symbols,
          MIN(date) AS min_date,
          MAX(date) AS max_date
        FROM read_parquet('{args.glob}')
        """
    ).df()
    print(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
