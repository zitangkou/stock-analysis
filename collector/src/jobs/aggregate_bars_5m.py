from __future__ import annotations

"""Backward-compatible wrapper — prefer aggregate_bars_intraday. """

from .aggregate_bars_intraday import run as run_intraday


def run(lookback_hours: int = 8, bucket_minutes: int | None = 5) -> int:
    return run_intraday(lookback_hours=lookback_hours, bucket_minutes=bucket_minutes)
