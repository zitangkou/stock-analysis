from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..db import finish_job, get_conn, start_job

logger = logging.getLogger(__name__)
CN = ZoneInfo("Asia/Shanghai")


def run(lookback_hours: int = 8, bucket_minutes: int = 5) -> int:
    """
    Aggregate quotes_snapshot into bars_5m for recent hours.
    Cloud-safe: no new vendor — uses existing snapshot stream.
    """
    job_id = start_job("aggregate_bars_5m")
    try:
        since = datetime.now(CN) - timedelta(hours=lookback_hours)
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO bars_5m (
                      bar_ts, code, open, high, low, close, volume, amount, change_pct, n_ticks, source
                    )
                    SELECT
                      date_trunc('hour', ts)
                        + make_interval(mins => (EXTRACT(MINUTE FROM ts)::int / %s) * %s)
                        AS bar_ts,
                      code,
                      (array_agg(price ORDER BY ts))[1] AS open,
                      MAX(price) AS high,
                      MIN(price) AS low,
                      (array_agg(price ORDER BY ts DESC))[1] AS close,
                      MAX(volume) - MIN(volume) AS volume,
                      MAX(amount) - MIN(amount) AS amount,
                      (array_agg(change_pct ORDER BY ts DESC))[1] AS change_pct,
                      COUNT(*)::int AS n_ticks,
                      'quotes_snapshot'
                    FROM quotes_snapshot
                    WHERE ts >= %s
                      AND price IS NOT NULL
                    GROUP BY 1, code
                    ON CONFLICT (bar_ts, code) DO UPDATE SET
                      open = EXCLUDED.open,
                      high = EXCLUDED.high,
                      low = EXCLUDED.low,
                      close = EXCLUDED.close,
                      volume = EXCLUDED.volume,
                      amount = EXCLUDED.amount,
                      change_pct = EXCLUDED.change_pct,
                      n_ticks = EXCLUDED.n_ticks,
                      source = EXCLUDED.source
                    """,
                    (bucket_minutes, bucket_minutes, since),
                )
                n = cur.rowcount

        logger.info("aggregate-bars-5m upserted≈%s since=%s", n, since.isoformat())
        finish_job(
            job_id,
            "success",
            rows_affected=int(n or 0),
            message=f"since={since.isoformat()}",
        )
        return int(n or 0)
    except Exception as exc:
        logger.exception("aggregate-bars-5m failed")
        finish_job(job_id, "failed", message=str(exc))
        raise
