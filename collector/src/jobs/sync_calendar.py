from __future__ import annotations

import logging

from ..db import finish_job, get_conn, start_job
from ..sources import fetch_trade_calendar_akshare

logger = logging.getLogger(__name__)


def run() -> int:
    job_id = start_job("sync_calendar")
    try:
        rows_data = fetch_trade_calendar_akshare()
        with get_conn() as conn:
            for item in rows_data:
                conn.execute(
                    """
                    INSERT INTO trading_calendar (trade_date, is_open)
                    VALUES (%s, %s)
                    ON CONFLICT (trade_date) DO UPDATE SET is_open = EXCLUDED.is_open
                    """,
                    (item["trade_date"], item["is_open"]),
                )
        n = len(rows_data)
        finish_job(job_id, "success", rows_affected=n, message=f"synced {n} trade dates")
        logger.info("synced trading calendar: %s days", n)
        return n
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise
