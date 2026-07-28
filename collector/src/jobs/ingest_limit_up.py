from __future__ import annotations

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from ..boards import board_of, is_limit_up, limit_up_threshold
from ..db import fetch_all, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)
CN = ZoneInfo("Asia/Shanghai")


def run(trade_date: date | None = None) -> int:
    """
    Rebuild limit_up_pool for a trading day from quotes_latest (board-aware).
    """
    job_id = start_job("ingest_limit_up")
    try:
        day = trade_date or datetime.now(CN).date()
        rows = fetch_all(
            """
            SELECT i.code, i.name, i.theme_id,
                   q.price, q.change_pct, q.amount, q.volume, q.turnover_rate
            FROM quotes_latest q
            JOIN instruments i ON i.code = q.code
            WHERE q.change_pct IS NOT NULL
            """
        )
        pool: list[dict] = []
        for r in rows:
            code = r["code"]
            name = r.get("name")
            ch = float(r["change_pct"]) if r["change_pct"] is not None else None
            if not is_limit_up(code, ch, name):
                continue
            thr = limit_up_threshold(code, name)
            pool.append(
                {
                    "trade_date": day,
                    "code": code,
                    "name": name,
                    "board": "st" if thr < 6 else board_of(code),
                    "threshold_pct": thr,
                    "change_pct": ch,
                    "price": float(r["price"] or 0),
                    "amount": float(r["amount"] or 0),
                    "volume": float(r["volume"] or 0),
                    "turnover_rate": float(r["turnover_rate"] or 0),
                    "theme_id": r.get("theme_id"),
                }
            )

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM limit_up_pool WHERE trade_date = %s", (day,))
                for s in pool:
                    cur.execute(
                        """
                        INSERT INTO limit_up_pool (
                          trade_date, code, name, board, threshold_pct,
                          change_pct, price, amount, volume, turnover_rate,
                          theme_id, is_limit_up, source, updated_at
                        ) VALUES (
                          %(trade_date)s, %(code)s, %(name)s, %(board)s, %(threshold_pct)s,
                          %(change_pct)s, %(price)s, %(amount)s, %(volume)s, %(turnover_rate)s,
                          %(theme_id)s, TRUE, 'quotes_derived', NOW()
                        )
                        """,
                        s,
                    )

        logger.info("ingest-limit-up day=%s count=%s", day, len(pool))
        finish_job(
            job_id,
            "success",
            rows_affected=len(pool),
            message=f"trade_date={day}",
        )
        return len(pool)
    except Exception as exc:
        logger.exception("ingest-limit-up failed")
        finish_job(job_id, "failed", message=str(exc))
        raise
