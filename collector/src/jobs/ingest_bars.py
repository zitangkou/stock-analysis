from __future__ import annotations

import logging
import time
from datetime import timedelta

from tenacity import retry, stop_after_attempt, wait_exponential

from ..calendar_util import today_cn
from ..codes import normalize_code
from ..db import fetch_all, finish_job, get_conn, start_job
from ..sources import fetch_hist_bars

logger = logging.getLogger(__name__)


def _universe_codes_only() -> list[str]:
    rows = fetch_all(
        """
        SELECT code FROM universe_members
        WHERE effective_to IS NULL
        """
    )
    return [r["code"] for r in rows]


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1.5, min=2, max=15), reraise=True)
def _fetch_bars(code: str, start_s: str, end_s: str):
    return fetch_hist_bars(code, start_s, end_s)


def run(days: int = 30, sleep: float = 2.0, limit: int | None = None) -> int:
    """
    Backfill / refresh daily bars for active universe only.
    Uses Sina K-line by default (Eastmoney often blocks cloud IPs).
    """
    job_id = start_job("ingest_bars_1d")
    try:
        codes = _universe_codes_only()
        if not codes:
            raise RuntimeError(
                "No universe yet. Run: sync-fundamentals → ingest-quotes --force → rebuild-universe"
            )
        if limit:
            codes = codes[:limit]

        end = today_cn()
        start = end - timedelta(days=days)
        start_s = start.strftime("%Y%m%d")
        end_s = end.strftime("%Y%m%d")
        total = 0
        errors = 0
        consecutive_fail = 0

        with get_conn() as conn:
            for i, code in enumerate(codes, 1):
                try:
                    df = _fetch_bars(normalize_code(code), start_s, end_s)
                    for _, r in df.iterrows():
                        conn.execute(
                            """
                            INSERT INTO bars_1d (
                                trade_date, code, open, high, low, close,
                                volume, amount, turnover_rate, change_pct, source
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'sina'
                            )
                            ON CONFLICT (trade_date, code) DO UPDATE SET
                                open = EXCLUDED.open,
                                high = EXCLUDED.high,
                                low = EXCLUDED.low,
                                close = EXCLUDED.close,
                                volume = EXCLUDED.volume,
                                amount = COALESCE(EXCLUDED.amount, bars_1d.amount),
                                turnover_rate = COALESCE(EXCLUDED.turnover_rate, bars_1d.turnover_rate),
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
                    consecutive_fail = 0
                except Exception as exc:
                    errors += 1
                    consecutive_fail += 1
                    logger.warning("bars failed for %s: %s", code, exc)
                    if consecutive_fail >= 15:
                        logger.error("too many consecutive failures, aborting bars job")
                        break
                    time.sleep(min(8.0, sleep * consecutive_fail))
                if i % 20 == 0:
                    logger.info(
                        "bars progress %s/%s, rows=%s, errors=%s",
                        i,
                        len(codes),
                        total,
                        errors,
                    )
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
