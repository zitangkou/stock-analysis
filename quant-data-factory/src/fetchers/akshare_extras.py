from __future__ import annotations

import logging
import time
from datetime import date
from pathlib import Path

import pandas as pd

from ..storage import meta_path, write_parquet

logger = logging.getLogger(__name__)


def fetch_northbound(trade_date: date | None = None, sleep: float = 0.4) -> pd.DataFrame:
    """Daily northbound summary (best-effort; schema varies by akshare version)."""
    import akshare as ak

    time.sleep(sleep)
    try:
        df = ak.stock_hsgt_hist_em(symbol="北向资金")
    except Exception:
        try:
            df = ak.stock_hsgt_north_net_flow_in_em(symbol="北向")
        except Exception as exc:
            logger.warning("northbound fetch failed: %s", exc)
            return pd.DataFrame()
    if trade_date is not None and not df.empty:
        # try filter if date column exists
        for col in ("日期", "date", "交易日"):
            if col in df.columns:
                s = pd.to_datetime(df[col], errors="coerce").dt.date
                df = df[s == trade_date]
                break
    return df


def fetch_dragon_tiger(trade_date: date, sleep: float = 0.4) -> pd.DataFrame:
    import akshare as ak

    time.sleep(sleep)
    day = trade_date.strftime("%Y%m%d")
    try:
        df = ak.stock_lhb_detail_em(start_date=day, end_date=day)
        return df
    except Exception as exc:
        logger.warning("dragon tiger fetch failed: %s", exc)
        return pd.DataFrame()


def fetch_yjbb_snapshot(sleep: float = 0.4) -> pd.DataFrame:
    """Latest业绩报表 batch (industry text useful for sector map)."""
    import akshare as ak

    time.sleep(sleep)
    try:
        # date like 20240331 — try recent report period guesses left to caller;
        # stock_yjbb_em often needs a date argument in newer akshare
        df = ak.stock_yjbb_em(date="20241231")
        return df
    except TypeError:
        try:
            df = ak.stock_yjbb_em()
            return df
        except Exception as exc:
            logger.warning("yjbb fetch failed: %s", exc)
            return pd.DataFrame()
    except Exception as exc:
        logger.warning("yjbb fetch failed: %s", exc)
        return pd.DataFrame()


def save_extras(
    root: Path,
    trade_date: date,
    *,
    north: bool = True,
    lhb: bool = True,
    yjbb: bool = False,
    sleep: float = 0.4,
) -> dict[str, int]:
    counts: dict[str, int] = {}
    day = trade_date.isoformat()
    if north:
        df = fetch_northbound(trade_date, sleep=sleep)
        if not df.empty:
            path = meta_path(root, "northbound") / f"{day}.parquet"
            write_parquet(df, path)
            counts["northbound"] = len(df)
        else:
            counts["northbound"] = 0
    if lhb:
        df = fetch_dragon_tiger(trade_date, sleep=sleep)
        if not df.empty:
            path = meta_path(root, "dragon_tiger") / f"{day}.parquet"
            write_parquet(df, path)
            counts["dragon_tiger"] = len(df)
        else:
            counts["dragon_tiger"] = 0
    if yjbb:
        df = fetch_yjbb_snapshot(sleep=sleep)
        if not df.empty:
            path = meta_path(root, "fundamentals") / f"yjbb_{day}.parquet"
            write_parquet(df, path)
            counts["yjbb"] = len(df)
        else:
            counts["yjbb"] = 0
    return counts
