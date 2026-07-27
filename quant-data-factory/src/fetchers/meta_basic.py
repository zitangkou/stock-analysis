from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from ..storage import write_parquet

logger = logging.getLogger(__name__)


def sync_stock_basic(parquet_root: Path) -> Path:
    """Dump BaoStock stock basic list."""
    import baostock as bs

    lg = bs.login()
    if lg.error_code != "0":
        raise RuntimeError(lg.error_msg)
    try:
        rs = bs.query_stock_basic()
        if rs.error_code != "0":
            raise RuntimeError(rs.error_msg)
        rows = []
        while rs.next():
            rows.append(rs.get_row_data())
        df = pd.DataFrame(rows, columns=rs.fields)
        path = parquet_root / "meta" / "stock_basic.parquet"
        write_parquet(df, path)
        return path
    finally:
        bs.logout()


def sync_trading_calendar(
    parquet_root: Path, start: str = "2015-01-01", end: str | None = None
) -> Path:
    import baostock as bs
    from datetime import date

    if end is None:
        end = date.today().isoformat()
    lg = bs.login()
    if lg.error_code != "0":
        raise RuntimeError(lg.error_msg)
    try:
        rs = bs.query_trade_dates(start_date=start, end_date=end)
        if rs.error_code != "0":
            raise RuntimeError(rs.error_msg)
        rows = []
        while rs.next():
            rows.append(rs.get_row_data())
        df = pd.DataFrame(rows, columns=rs.fields)
        path = parquet_root / "meta" / "trading_calendar.parquet"
        write_parquet(df, path)
        return path
    finally:
        bs.logout()
