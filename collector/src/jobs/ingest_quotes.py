from __future__ import annotations

import logging
import time
from datetime import timezone

from ..calendar_util import is_trading_session, now_cn, retention_cutoff, session_label
from ..codes import board_of, normalize_code
from ..config import get_settings
from ..db import fetch_all, finish_job, get_conn, start_job
from ..sources import fetch_a_share_spot

logger = logging.getLogger(__name__)


def active_universe_codes() -> list[str]:
    rows = fetch_all(
        """
        SELECT code FROM universe_members
        WHERE effective_to IS NULL
        """
    )
    codes = [r["code"] for r in rows]
    if codes:
        return codes
    rows = fetch_all(
        """
        SELECT code FROM instruments
        WHERE board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
          AND COALESCE(is_st, FALSE) = FALSE
        """
    )
    return [r["code"] for r in rows]


def run(force: bool = False) -> int:
    settings = get_settings()
    label = session_label(settings.tz)
    if not force and not is_trading_session(settings.tz):
        logger.info("skip quotes ingest, session=%s", label)
        return 0

    job_id = start_job("ingest_quotes")
    try:
        universe = set(active_universe_codes())
        if not universe:
            raise RuntimeError("No universe/instruments to quote")

        df = fetch_a_share_spot()
        if df.empty:
            raise RuntimeError("Empty spot data from source")

        df = df[df["code"].isin(universe)].copy()
        ts = now_cn(settings.tz).astimezone(timezone.utc)
        rows = 0

        with get_conn() as conn:
            for _, r in df.iterrows():
                code = normalize_code(r["code"])
                if board_of(code) is None:
                    continue
                price = _n(r.get("price"))
                pre_close = _n(r.get("pre_close"))
                open_ = _n(r.get("open"))
                high = _n(r.get("high"))
                low = _n(r.get("low"))
                change_pct = _n(r.get("change_pct"))
                change_amt = _n(r.get("change_amt"))
                volume = _n(r.get("volume"))
                amount = _n(r.get("amount"))
                turnover_rate = _n(r.get("turnover_rate"))
                amplitude = _n(r.get("amplitude"))

                conn.execute(
                    """
                    INSERT INTO quotes_latest (
                        code, ts, price, pre_close, open, high, low,
                        change_pct, change_amt, volume, amount,
                        turnover_rate, amplitude, source, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                    )
                    ON CONFLICT (code) DO UPDATE SET
                        ts = EXCLUDED.ts,
                        price = EXCLUDED.price,
                        pre_close = EXCLUDED.pre_close,
                        open = EXCLUDED.open,
                        high = EXCLUDED.high,
                        low = EXCLUDED.low,
                        change_pct = EXCLUDED.change_pct,
                        change_amt = EXCLUDED.change_amt,
                        volume = EXCLUDED.volume,
                        amount = EXCLUDED.amount,
                        turnover_rate = EXCLUDED.turnover_rate,
                        amplitude = EXCLUDED.amplitude,
                        source = EXCLUDED.source,
                        updated_at = NOW()
                    """,
                    (
                        code,
                        ts,
                        price,
                        pre_close,
                        open_,
                        high,
                        low,
                        change_pct,
                        change_amt,
                        volume,
                        amount,
                        turnover_rate,
                        amplitude,
                        "eastmoney",
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO quotes_snapshot (
                        ts, code, price, pre_close, open, high, low,
                        change_pct, change_amt, volume, amount,
                        turnover_rate, amplitude, source
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (ts, code) DO NOTHING
                    """,
                    (
                        ts,
                        code,
                        price,
                        pre_close,
                        open_,
                        high,
                        low,
                        change_pct,
                        change_amt,
                        volume,
                        amount,
                        turnover_rate,
                        amplitude,
                        "eastmoney",
                    ),
                )
                rows += 1

            cutoff = retention_cutoff(settings.snapshot_retention_days, settings.tz)
            conn.execute("DELETE FROM quotes_snapshot WHERE ts < %s", (cutoff,))

        finish_job(
            job_id,
            "success",
            rows_affected=rows,
            message=f"session={label}, universe={len(universe)}, wrote={rows}",
        )
        logger.info("ingest quotes: wrote %s / universe %s", rows, len(universe))
        return rows
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def run_loop() -> None:
    settings = get_settings()
    logger.info("quote loop started, interval=%ss", settings.quote_interval_sec)
    while True:
        started = time.time()
        try:
            run(force=False)
        except Exception:
            logger.exception("quote ingest failed")
        elapsed = time.time() - started
        sleep_for = max(settings.quote_interval_sec - elapsed, 1)
        time.sleep(sleep_for)


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
