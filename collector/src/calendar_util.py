from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .db import fetch_one


def now_cn(tz_name: str = "Asia/Shanghai") -> datetime:
    return datetime.now(ZoneInfo(tz_name))


def today_cn(tz_name: str = "Asia/Shanghai") -> date:
    return now_cn(tz_name).date()


def is_trading_day(d: date | None = None) -> bool:
    d = d or today_cn()
    row = fetch_one(
        "SELECT is_open FROM trading_calendar WHERE trade_date = %s",
        (d,),
    )
    if row is not None:
        return bool(row["is_open"])
    # Fallback: weekdays only until calendar is synced
    return d.weekday() < 5


def is_trading_session(tz_name: str = "Asia/Shanghai") -> bool:
    """Continuous auction windows: 09:30-11:30, 13:00-15:00."""
    if not is_trading_day():
        return False
    n = now_cn(tz_name)
    t = n.time()
    morning = time(9, 30) <= t <= time(11, 30)
    afternoon = time(13, 0) <= t <= time(15, 0)
    return morning or afternoon


def session_label(tz_name: str = "Asia/Shanghai") -> str:
    if not is_trading_day():
        return "closed"
    n = now_cn(tz_name)
    t = n.time()
    if time(9, 15) <= t < time(9, 30):
        return "auction"
    if time(9, 30) <= t <= time(11, 30):
        return "morning"
    if time(11, 30) < t < time(13, 0):
        return "lunch"
    if time(13, 0) <= t <= time(15, 0):
        return "afternoon"
    return "closed"


def retention_cutoff(days: int, tz_name: str = "Asia/Shanghai") -> datetime:
    return now_cn(tz_name) - timedelta(days=days)
