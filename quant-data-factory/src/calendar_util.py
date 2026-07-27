from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)


def today_cn(tz: str = "Asia/Shanghai") -> date:
    return datetime.now(ZoneInfo(tz)).date()


def last_completed_trade_date(
    tz: str = "Asia/Shanghai",
    *,
    after_close_hour: int = 16,
) -> date:
    """
    Default target for post-close jobs.

    Before ``after_close_hour`` (CN), today's session is not finished / BaoStock
    often returns an empty ``query_all_stock`` list — use the previous session.
    """
    now = datetime.now(ZoneInfo(tz))
    d = now.date()
    if now.hour < after_close_hour:
        d -= timedelta(days=1)
    for _ in range(20):
        cal = is_trading_day_baostock(d)
        if cal is True:
            return d
        if cal is False:
            d -= timedelta(days=1)
            continue
        # API inconclusive: prefer weekdays
        if d.weekday() < 5:
            return d
        d -= timedelta(days=1)
    return d


def is_trading_day_baostock(day: date) -> bool | None:
    """
    Return True/False if BaoStock calendar knows the day; None on API failure.
    """
    try:
        import baostock as bs

        lg = bs.login()
        if lg.error_code != "0":
            logger.warning("baostock login failed: %s", lg.error_msg)
            return None
        try:
            rs = bs.query_trade_dates(
                start_date=day.isoformat(), end_date=day.isoformat()
            )
            if rs.error_code != "0":
                return None
            while rs.next():
                row = rs.get_row_data()
                # fields: calendar_date, is_trading_day
                if len(row) >= 2:
                    return row[1] == "1"
            return False
        finally:
            bs.logout()
    except Exception as exc:
        logger.warning("trade calendar check failed: %s", exc)
        return None


def recent_weekdays(n: int, tz: str = "Asia/Shanghai") -> list[date]:
    d = today_cn(tz)
    out: list[date] = []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d -= timedelta(days=1)
    return list(reversed(out))
