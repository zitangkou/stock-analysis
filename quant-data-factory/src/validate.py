from __future__ import annotations

import logging
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

REQUIRED_COLS = (
    "date",
    "code",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "amount",
)


def validate_daily_frame(df: pd.DataFrame, trade_date: str) -> dict[str, Any]:
    """
    Quality checks for one trading day's A-share daily bars.
    Returns a report dict; raises ValueError if fatal.
    """
    report: dict[str, Any] = {
        "trade_date": trade_date,
        "rows": 0,
        "ok": False,
        "warnings": [],
        "errors": [],
    }
    if df is None or df.empty:
        report["errors"].append("empty dataframe")
        raise ValueError(f"[{trade_date}] empty daily frame")

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        report["errors"].append(f"missing columns: {missing}")
        raise ValueError(f"[{trade_date}] missing columns {missing}")

    work = df.copy()
    report["rows"] = len(work)

    # Duplicates
    dup = work.duplicated(subset=["code", "date"], keep=False).sum()
    if dup:
        report["errors"].append(f"duplicate (code,date) rows={int(dup)}")
        work = work.drop_duplicates(subset=["code", "date"], keep="last")

    # Numeric coercion
    for col in ("open", "high", "low", "close", "volume", "amount"):
        work[col] = pd.to_numeric(work[col], errors="coerce")

    bad_px = work[
        (work["open"] <= 0)
        | (work["high"] <= 0)
        | (work["low"] <= 0)
        | (work["close"] <= 0)
        | work["open"].isna()
        | work["close"].isna()
    ]
    if len(bad_px):
        report["warnings"].append(f"non-positive/NaN price rows={len(bad_px)} (dropped)")
        work = work.drop(index=bad_px.index)

    # Suspended: volume==0 kept, flagged
    work["is_suspended"] = (work["volume"].fillna(0) <= 0).astype(bool)
    suspended = int(work["is_suspended"].sum())
    if suspended:
        report["warnings"].append(f"suspended_or_zero_volume={suspended}")

    # Soft floor: main boards usually >2000 names on a normal day
    if len(work) < 1500:
        report["warnings"].append(
            f"row_count_low={len(work)} (expected ~2000+ for 60/00/30)"
        )

    if work.empty:
        report["errors"].append("all rows dropped after validation")
        raise ValueError(f"[{trade_date}] no valid rows after validation")

    report["rows_valid"] = len(work)
    report["ok"] = not report["errors"]
    report["frame"] = work
    return report
