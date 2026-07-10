from __future__ import annotations

import logging
import time
from datetime import timedelta

from ..calendar_util import today_cn
from ..codes import normalize_code
from ..db import finish_job, get_conn, start_job
from ..sources import fetch_hist_bars_akshare
from .ingest_quotes import active_universe_codes

logger = logging.getLogger(__name__)


def run(days: int = 30, sleep: float = 0.25) -> int:
    """
    Backfill / refresh daily bars for active universe.
    Keep days modest on first run; use Mac for multi-year backfill.
    """
    job_id = start_job("ingest_bars_1d")
    try:
        codes = active_universe_codes()
        if not codes:
            raise RuntimeError("No universe codes. Rebuild universe first (or sync instruments).")

        end = today_cn()
        start = end - timedelta(days=days)
        start_s = start.strftime("%Y%m%d")
        end_s = end.strftime("%Y%m%d")
        total = 0
        errors = 0

        with get_conn() as conn:
            for i, code in enumerate(codes, 1):
                try:
                    df = fetch_hist_bars_akshare(normalize_code(code), start_s, end_s)
                    for _, r in df.iterrows():
                        conn.execute(
                            """
                            INSERT INTO bars_1d (
                                trade_date, code, open, high, low, close,
                                volume, amount, turnover_rate, change_pct, source
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'akshare'
                            )
                            ON CONFLICT (trade_date, code) DO UPDATE SET
                                open = EXCLUDED.open,
                                high = EXCLUDED.high,
                                low = EXCLUDED.low,
                                close = EXCLUDED.close,
                                volume = EXCLUDED.volume,
                                amount = EXCLUDED.amount,
                                turnover_rate = EXCLUDED.turnover_rate,
                                change_pct = EXCLUDED.change_pct,
                                source = EXCLUDED.source
                            """,
                            (
                                r["trade_date"],
                                normalize_code(code),
                                _n(r.get("open")),
                                _n(r.get("high")),
                                _n(r.get("low")),
                                _n(r.get("close")),
                                _n(r.get("volume")),
                                _n(r.get("amount")),
                                _n(r.get("turnover_rate")),
                                _n(r.get("change_pct")),
                            ),
                        )
                        total += 1
                except Exception as exc:
                    errors += 1
                    logger.warning("bars failed for %s: %s", code, exc)
                if i % 50 == 0:
                    logger.info("bars progress %s/%s, rows=%s, errors=%s", i, len(codes), total, errors)
                time.sleep(sleep)

        status = "success" if errors == 0 else "partial"
        finish_job(
            job_id,
            status,
            rows_affected=total,
            message=f"codes={len(codes)}, errors={errors}, range={start_s}-{end_s}",
        )
        return total
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def _n(v):
    if v is None:
        return None
    try:
        import math

        x = float(v)
        if math.isnan(x):
            return None
        return x
    except Exception:
        return None
