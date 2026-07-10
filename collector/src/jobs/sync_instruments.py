from __future__ import annotations

import logging

from ..codes import board_of, exchange_of, is_st_name, normalize_code
from ..db import finish_job, get_conn, start_job
from ..sources import fetch_a_share_spot, fetch_instruments_akshare

logger = logging.getLogger(__name__)


def run() -> int:
    job_id = start_job("sync_instruments")
    try:
        try:
            df = fetch_a_share_spot()
            if df.empty:
                raise RuntimeError("empty spot list")
            logger.info("instruments from eastmoney spot: %s", len(df))
        except Exception as exc:
            logger.warning("eastmoney spot failed (%s), fallback akshare", exc)
            df = fetch_instruments_akshare()
            logger.info("instruments from akshare: %s", len(df))

        rows = 0
        with get_conn() as conn:
            for _, r in df.iterrows():
                code = normalize_code(r["code"])
                board = board_of(code)
                if board is None:
                    continue
                name = str(r.get("name") or code)
                is_st = bool(r.get("is_st")) if "is_st" in r else is_st_name(name)
                status = "st" if is_st else "active"
                conn.execute(
                    """
                    INSERT INTO instruments (code, name, exchange, board, status, is_st, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (code) DO UPDATE SET
                        name = EXCLUDED.name,
                        exchange = EXCLUDED.exchange,
                        board = EXCLUDED.board,
                        status = EXCLUDED.status,
                        is_st = EXCLUDED.is_st,
                        updated_at = NOW()
                    """,
                    (code, name, exchange_of(code), board, status, is_st),
                )
                rows += 1

        finish_job(job_id, "success", rows_affected=rows, message=f"upserted {rows} instruments")
        return rows
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise
