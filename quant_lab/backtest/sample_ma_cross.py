#!/usr/bin/env python3
"""
Minimal momentum / MA cross sketch with Vectorbt on local Parquet.

Uses后复权 close when adjust_hfq files exist; otherwise raw close
(research only — keep adj convention consistent in real strategies).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]


def load_close_panel(parquet_glob: str, symbols: list[str] | None, max_symbols: int) -> pd.DataFrame:
    con = duckdb.connect()
    df = con.execute(
        f"""
        SELECT date, plain_code, close, amount
        FROM read_parquet('{parquet_glob}')
        WHERE close IS NOT NULL AND close > 0
        """
    ).df()
    if df.empty:
        raise SystemExit("No kline rows. rsync Parquet first.")

    if symbols:
        df = df[df["plain_code"].isin(symbols)]
    else:
        # top by latest-day amount
        latest = df["date"].max()
        top = (
            df[df["date"] == latest]
            .sort_values("amount", ascending=False)
            .head(max_symbols)["plain_code"]
            .tolist()
        )
        df = df[df["plain_code"].isin(top)]

    df["date"] = pd.to_datetime(df["date"])
    panel = df.pivot_table(index="date", columns="plain_code", values="close", aggfunc="last")
    panel = panel.sort_index().ffill()
    return panel


def run_ma_cross(close: pd.DataFrame, fast: int = 10, slow: int = 30) -> None:
    try:
        import vectorbt as vbt
    except ImportError as exc:
        raise SystemExit("pip install vectorbt") from exc

    fast_ma = close.rolling(fast).mean()
    slow_ma = close.rolling(slow).mean()
    entries = (fast_ma > slow_ma) & (fast_ma.shift(1) <= slow_ma.shift(1))
    exits = (fast_ma < slow_ma) & (fast_ma.shift(1) >= slow_ma.shift(1))

    pf = vbt.Portfolio.from_signals(close, entries, exits, freq="1D")
    print(pf.stats())
    # Avoid GUI in headless — print total return per symbol head
    rets = pf.total_return()
    if hasattr(rets, "sort_values"):
        print(rets.sort_values(ascending=False).head(10))
    else:
        print("total_return", rets)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--glob",
        default=str(ROOT / "data" / "parquet" / "kline_daily" / "*" / "*.parquet"),
    )
    p.add_argument("--symbols", nargs="*", default=None)
    p.add_argument("--max-symbols", type=int, default=50)
    p.add_argument("--fast", type=int, default=10)
    p.add_argument("--slow", type=int, default=30)
    args = p.parse_args()

    close = load_close_panel(args.glob, args.symbols, args.max_symbols)
    print(f"panel shape={close.shape} range={close.index.min()}→{close.index.max()}")
    run_ma_cross(close, fast=args.fast, slow=args.slow)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
