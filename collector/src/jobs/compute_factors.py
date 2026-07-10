from __future__ import annotations

import logging

from ..db import fetch_all, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)


def run(days: int = 60) -> int:
    """
    Write basic daily factors for universe stocks from bars_1d.
    Factors: ret_1d, amount, turnover_rate, volatility_20d (std of ret).
    """
    job_id = start_job("compute_factors")
    try:
        rows = fetch_all(
            """
            WITH uni AS (
              SELECT code FROM universe_members WHERE effective_to IS NULL
            ),
            bars AS (
              SELECT b.*,
                     LAG(b.close) OVER (PARTITION BY b.code ORDER BY b.trade_date) AS prev_close
              FROM bars_1d b
              JOIN uni u ON u.code = b.code
              WHERE b.trade_date >= CURRENT_DATE - (%s || ' days')::interval
            ),
            rets AS (
              SELECT code, trade_date, close, amount, turnover_rate,
                     CASE WHEN prev_close IS NULL OR prev_close = 0 THEN NULL
                          ELSE (close - prev_close) / prev_close END AS ret_1d
              FROM bars
            )
            SELECT * FROM rets
            ORDER BY code, trade_date
            """,
            (days,),
        )
        if not rows:
            finish_job(job_id, "partial", message="no bars for factors")
            return 0

        # volatility_20d in Python
        from collections import defaultdict

        by_code: dict[str, list] = defaultdict(list)
        for r in rows:
            by_code[r["code"]].append(r)

        written = 0
        with get_conn() as conn:
            for code, series in by_code.items():
                rets: list[float | None] = []
                for r in series:
                    ret = float(r["ret_1d"]) if r["ret_1d"] is not None else None
                    rets.append(ret)
                    trade_date = r["trade_date"]
                    factors = {
                        "ret_1d": ret,
                        "amount": float(r["amount"]) if r["amount"] is not None else None,
                        "turnover_rate": float(r["turnover_rate"])
                        if r["turnover_rate"] is not None
                        else None,
                    }
                    # rolling vol
                    window = [x for x in rets[-20:] if x is not None]
                    if len(window) >= 5:
                        mean = sum(window) / len(window)
                        var = sum((x - mean) ** 2 for x in window) / len(window)
                        factors["volatility_20d"] = var**0.5
                    else:
                        factors["volatility_20d"] = None

                    for name, value in factors.items():
                        if value is None:
                            continue
                        conn.execute(
                            """
                            INSERT INTO factors_daily (trade_date, code, factor_name, value)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (trade_date, code, factor_name) DO UPDATE SET
                              value = EXCLUDED.value
                            """,
                            (trade_date, code, name, value),
                        )
                        written += 1

        finish_job(job_id, "success", rows_affected=written, message=f"days={days}")
        logger.info("factors written=%s", written)
        return written
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise
