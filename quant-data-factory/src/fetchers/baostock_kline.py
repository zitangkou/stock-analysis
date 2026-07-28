from __future__ import annotations

import logging
import time
from datetime import date
from typing import Iterable

import pandas as pd

from ..codes import exchange_of, is_target_a_share, to_plain_code

logger = logging.getLogger(__name__)

KLINE_FIELDS = (
    "date,code,open,high,low,close,volume,amount,turn,pctChg,preclose,tradestatus,isST"
)


def login() -> None:
    import baostock as bs

    lg = bs.login()
    if lg.error_code != "0":
        raise RuntimeError(f"baostock login failed: {lg.error_msg}")


def logout() -> None:
    import baostock as bs

    bs.logout()


def list_a_shares_on_day(day: date, include_star: bool = False) -> list[str]:
    """Return BaoStock codes listed/active on day."""
    import baostock as bs

    rs = bs.query_all_stock(day=day.isoformat())
    if rs.error_code != "0":
        raise RuntimeError(f"query_all_stock failed: {rs.error_msg}")
    codes: list[str] = []
    while rs.next():
        row = rs.get_row_data()
        # code, tradeStatus, code_name
        code = row[0]
        if is_target_a_share(code, include_star=include_star):
            codes.append(code)
    return codes


def fetch_daily_bars(
    codes: Iterable[str],
    start: date,
    end: date,
    sleep: float = 0.05,
    adjustflag: str = "3",
) -> pd.DataFrame:
    """
    Fetch daily bars.
    adjustflag: 1=后复权 2=前复权 3=不复权 — we store 不复权 + optional factor separately.
    """
    import baostock as bs

    rows: list[list[str]] = []
    fields: list[str] | None = None
    n = 0
    for code in codes:
        n += 1
        rs = bs.query_history_k_data_plus(
            code,
            KLINE_FIELDS,
            start_date=start.isoformat(),
            end_date=end.isoformat(),
            frequency="d",
            adjustflag=adjustflag,
        )
        if rs.error_code != "0":
            logger.debug("kline skip %s: %s", code, rs.error_msg)
            time.sleep(sleep)
            continue
        if fields is None:
            fields = rs.fields
        while rs.next():
            rows.append(rs.get_row_data())
        if sleep > 0:
            time.sleep(sleep)
        if n % 200 == 0:
            logger.info("baostock progress %s symbols...", n)

    if not rows or not fields:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=fields)
    # Normalize column names
    rename = {
        "pctChg": "pct_chg",
        "preclose": "pre_close",
        "tradestatus": "trade_status",
        "isST": "is_st",
        "turn": "turnover",
    }
    df = df.rename(columns=rename)
    df["plain_code"] = df["code"].map(to_plain_code)
    df["exchange"] = df["code"].map(exchange_of)
    for col in (
        "open",
        "high",
        "low",
        "close",
        "volume",
        "amount",
        "turnover",
        "pct_chg",
        "pre_close",
    ):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def fetch_adjust_factor(
    codes: Iterable[str],
    start: date,
    end: date,
    sleep: float = 0.05,
) -> pd.DataFrame:
    """Dividend/adjust factor via BaoStock query_dividend_data is event-based;
    for daily factor we compare adjustflag=1 vs 3 closes when needed.
    Here we store后复权 close alongside for hfq reconstruction convenience.
    """
    import baostock as bs

    rows: list[dict] = []
    n = 0
    for code in codes:
        n += 1
        rs = bs.query_history_k_data_plus(
            code,
            "date,code,close",
            start_date=start.isoformat(),
            end_date=end.isoformat(),
            frequency="d",
            adjustflag="1",  # 后复权
        )
        if rs.error_code != "0":
            time.sleep(sleep)
            continue
        while rs.next():
            d, c, close = rs.get_row_data()[:3]
            rows.append(
                {
                    "date": d,
                    "code": c,
                    "plain_code": to_plain_code(c),
                    "close_hfq": float(close) if close not in ("", None) else None,
                }
            )
        if sleep > 0:
            time.sleep(sleep)
        if n % 200 == 0:
            logger.info("hfq factor progress %s symbols...", n)
    return pd.DataFrame(rows)
