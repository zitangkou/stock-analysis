from __future__ import annotations

import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..db import finish_job, get_conn, start_job

logger = logging.getLogger(__name__)
CN = ZoneInfo("Asia/Shanghai")

INTERVALS = (5, 15, 30)


def _upsert_interval(cur, since: datetime, bucket_minutes: int) -> int:
    cur.execute(
        """
        INSERT INTO bars_intraday (
          bar_ts, code, interval_m, open, high, low, close,
          volume, amount, change_pct, n_ticks, source
        )
        SELECT
          date_trunc('hour', ts)
            + make_interval(mins => (EXTRACT(MINUTE FROM ts)::int / %s) * %s)
            AS bar_ts,
          code,
          %s AS interval_m,
          (array_agg(price ORDER BY ts))[1] AS open,
          MAX(price) AS high,
          MIN(price) AS low,
          (array_agg(price ORDER BY ts DESC))[1] AS close,
          GREATEST(MAX(volume) - MIN(volume), 0) AS volume,
          GREATEST(MAX(amount) - MIN(amount), 0) AS amount,
          (array_agg(change_pct ORDER BY ts DESC))[1] AS change_pct,
          COUNT(*)::int AS n_ticks,
          'quotes_snapshot'
        FROM quotes_snapshot
        WHERE ts >= %s
          AND price IS NOT NULL
        GROUP BY 1, code
        ON CONFLICT (bar_ts, code, interval_m) DO UPDATE SET
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
        (bucket_minutes, bucket_minutes, bucket_minutes, since),
    )
    return int(cur.rowcount or 0)


def run(lookback_hours: int = 24, bucket_minutes: int | None = None) -> int:
    """
    Aggregate quotes_snapshot → bars_intraday for 5/15/30m (or a single bucket).
    Also mirrors 5m into legacy bars_5m for older API callers.
    """
    job_id = start_job("aggregate_bars_intraday")
    try:
        since = datetime.now(CN) - timedelta(hours=lookback_hours)
        intervals = (bucket_minutes,) if bucket_minutes else INTERVALS
        total = 0
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Ensure table exists even if init-db not re-run yet
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS bars_intraday (
                        bar_ts TIMESTAMPTZ NOT NULL,
                        code CHAR(6) NOT NULL REFERENCES instruments(code),
                        interval_m SMALLINT NOT NULL,
                        open DOUBLE PRECISION,
                        high DOUBLE PRECISION,
                        low DOUBLE PRECISION,
                        close DOUBLE PRECISION,
                        volume DOUBLE PRECISION,
                        amount DOUBLE PRECISION,
                        change_pct DOUBLE PRECISION,
                        n_ticks INT NOT NULL DEFAULT 0,
                        source TEXT NOT NULL DEFAULT 'quotes_snapshot',
                        PRIMARY KEY (bar_ts, code, interval_m)
                    )
                    """
                )
                for iv in intervals:
                    if iv not in INTERVALS:
                        raise ValueError(f"unsupported interval_m={iv}")
                    n = _upsert_interval(cur, since, iv)
                    total += n
                    logger.info("bars_intraday interval=%sm upserted≈%s", iv, n)

                # Keep bars_5m in sync when 5m is built
                if 5 in intervals:
                    cur.execute(
                        """
                        INSERT INTO bars_5m (
                          bar_ts, code, open, high, low, close, volume, amount,
                          change_pct, n_ticks, source
                        )
                        SELECT bar_ts, code, open, high, low, close, volume, amount,
                               change_pct, n_ticks, source
                        FROM bars_intraday
                        WHERE interval_m = 5 AND bar_ts >= %s
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
                        (since,),
                    )

        logger.info(
            "aggregate-intraday total≈%s intervals=%s since=%s",
            total,
            intervals,
            since.isoformat(),
        )
        finish_job(
            job_id,
            "success",
            rows_affected=total,
            message=f"intervals={list(intervals)} since={since.isoformat()}",
        )
        return total
    except Exception as exc:
        logger.exception("aggregate-intraday failed")
        finish_job(job_id, "failed", message=str(exc))
        raise


# Backward-compatible alias used by CLI / weekly cron
def run_legacy(lookback_hours: int = 8, bucket_minutes: int = 5) -> int:
    return run(lookback_hours=lookback_hours, bucket_minutes=bucket_minutes)
