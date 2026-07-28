from __future__ import annotations

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from ..db import fetch_all, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)
CN = ZoneInfo("Asia/Shanghai")


def run(trade_date: date | None = None) -> int:
    """
    Persist per-stock money_flow_daily proxy = amount * change_pct/100.
    data_quality=proxy until a real vendor is wired (V2+).
    """
    job_id = start_job("ingest_money_flow")
    try:
        day = trade_date or datetime.now(CN).date()
        rows = fetch_all(
            """
            SELECT q.code, q.amount, q.change_pct
            FROM quotes_latest q
            JOIN universe_members u ON u.code = q.code AND u.effective_to IS NULL
            WHERE q.amount IS NOT NULL AND q.change_pct IS NOT NULL
            """
        )
        with get_conn() as conn:
            with conn.cursor() as cur:
                for r in rows:
                    amt = float(r["amount"] or 0)
                    ch = float(r["change_pct"] or 0)
                    net = amt * (ch / 100.0)
                    cur.execute(
                        """
                        INSERT INTO money_flow_daily (
                          trade_date, code, net_inflow, amount, change_pct,
                          data_quality, source, updated_at
                        ) VALUES (%s,%s,%s,%s,%s,'proxy','amount_x_pct',NOW())
                        ON CONFLICT (trade_date, code) DO UPDATE SET
                          net_inflow = EXCLUDED.net_inflow,
                          amount = EXCLUDED.amount,
                          change_pct = EXCLUDED.change_pct,
                          updated_at = NOW()
                        """,
                        (day, r["code"], net, amt, ch),
                    )

        logger.info("ingest-money-flow day=%s rows=%s", day, len(rows))
        finish_job(
            job_id,
            "success",
            rows_affected=len(rows),
            message=f"trade_date={day}",
        )
        return len(rows)
    except Exception as exc:
        logger.exception("ingest-money-flow failed")
        finish_job(job_id, "failed", message=str(exc))
        raise
