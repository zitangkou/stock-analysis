#!/usr/bin/env python3
"""Example Polars factor: 20d momentum + amount rank (research sketch)."""
from __future__ import annotations

import argparse
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--glob",
        default=str(ROOT / "data" / "parquet" / "kline_daily" / "*" / "*.parquet"),
    )
    args = p.parse_args()

    df = pl.scan_parquet(args.glob).select(
        "date", "plain_code", "close", "amount", "pct_chg"
    )
    out = (
        df.sort(["plain_code", "date"])
        .with_columns(
            (
                pl.col("close") / pl.col("close").shift(20).over("plain_code") - 1.0
            ).alias("mom_20d"),
            pl.col("amount").rank().over("date").alias("amount_rank"),
        )
        .filter(pl.col("mom_20d").is_not_null())
        .collect()
    )
    print(out.sort("date", descending=True).head(20))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
