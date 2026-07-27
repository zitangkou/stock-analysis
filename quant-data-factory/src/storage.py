from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


def kline_path(root: Path, trade_date: date) -> Path:
    return root / "kline_daily" / f"{trade_date.year}" / f"{trade_date.isoformat()}.parquet"


def factor_path(root: Path, trade_date: date) -> Path:
    return root / "adjust_hfq" / f"{trade_date.year}" / f"{trade_date.isoformat()}.parquet"


def meta_path(root: Path, name: str) -> Path:
    return root / "meta" / name


def write_parquet(df: pd.DataFrame, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)
    logger.info("wrote %s rows=%s", path, len(df))
    return path


def write_report(root: Path, trade_date: date, report: dict[str, Any]) -> Path:
    path = meta_path(root, "quality") / f"{trade_date.isoformat()}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {k: v for k, v in report.items() if k != "frame"}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def upsert_postgres_bars(df: pd.DataFrame, database_url: str) -> int:
    """Optional bridge into stock-analysis bars_1d (plain 6-digit codes)."""
    import psycopg

    if df.empty:
        return 0
    work = df.copy()
    if "plain_code" not in work.columns:
        raise ValueError("plain_code required for postgres upsert")
    written = 0
    with psycopg.connect(database_url) as conn:
        for _, r in work.iterrows():
            conn.execute(
                """
                INSERT INTO bars_1d (
                  trade_date, code, open, high, low, close,
                  volume, amount, turnover_rate, change_pct, pre_close, source
                ) VALUES (
                  %s::date, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'baostock'
                )
                ON CONFLICT (trade_date, code) DO UPDATE SET
                  open = EXCLUDED.open,
                  high = EXCLUDED.high,
                  low = EXCLUDED.low,
                  close = EXCLUDED.close,
                  volume = EXCLUDED.volume,
                  amount = EXCLUDED.amount,
                  turnover_rate = EXCLUDED.turnover_rate,
                  change_pct = EXCLUDED.change_pct,
                  pre_close = EXCLUDED.pre_close,
                  source = EXCLUDED.source
                """,
                (
                    str(r["date"]),
                    str(r["plain_code"]),
                    float(r["open"]) if pd.notna(r["open"]) else None,
                    float(r["high"]) if pd.notna(r["high"]) else None,
                    float(r["low"]) if pd.notna(r["low"]) else None,
                    float(r["close"]) if pd.notna(r["close"]) else None,
                    float(r["volume"]) if pd.notna(r["volume"]) else None,
                    float(r["amount"]) if pd.notna(r["amount"]) else None,
                    float(r["turnover"]) if "turnover" in r and pd.notna(r["turnover"]) else None,
                    float(r["pct_chg"]) if "pct_chg" in r and pd.notna(r["pct_chg"]) else None,
                    float(r["pre_close"]) if "pre_close" in r and pd.notna(r["pre_close"]) else None,
                ),
            )
            written += 1
        conn.commit()
    return written
