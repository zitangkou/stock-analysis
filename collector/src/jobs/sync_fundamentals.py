from __future__ import annotations

import logging
from datetime import datetime

import pandas as pd

from ..codes import board_of, normalize_code
from ..db import fetch_all, finish_job, get_conn, start_job
from ..sources import fetch_financial_indicator_akshare

logger = logging.getLogger(__name__)


def run() -> int:
    job_id = start_job("sync_fundamentals")
    try:
        known = {
            r["code"]
            for r in fetch_all(
                """
                SELECT code FROM instruments
                WHERE board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
                """
            )
        }
        if not known:
            raise RuntimeError("No instruments. Run sync-instruments first.")

        df = fetch_financial_indicator_akshare()
        rows = 0
        skipped = 0
        industry_updated = 0
        with get_conn() as conn:
            # Ensure industry column exists (idempotent)
            conn.execute(
                "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS industry TEXT"
            )
            for _, r in df.iterrows():
                code = normalize_code(r["code"])
                if board_of(code) is None:
                    continue
                if code not in known:
                    skipped += 1
                    continue
                report_date = _parse_date(r.get("report_date")) or _default_report_date()
                announce_date = _parse_date(r.get("announce_date"))
                industry = r.get("industry")
                if industry is not None and not (isinstance(industry, float) and pd.isna(industry)):
                    industry = str(industry).strip() or None
                else:
                    industry = None

                conn.execute(
                    """
                    INSERT INTO fundamentals_period (
                        code, report_date, announce_date,
                        roe, net_profit, net_profit_deducted, net_profit_yoy,
                        revenue, revenue_yoy, source, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, 'akshare', NOW()
                    )
                    ON CONFLICT (code, report_date) DO UPDATE SET
                        announce_date = COALESCE(EXCLUDED.announce_date, fundamentals_period.announce_date),
                        roe = COALESCE(EXCLUDED.roe, fundamentals_period.roe),
                        net_profit = COALESCE(EXCLUDED.net_profit, fundamentals_period.net_profit),
                        net_profit_deducted = COALESCE(EXCLUDED.net_profit_deducted, fundamentals_period.net_profit_deducted),
                        net_profit_yoy = COALESCE(EXCLUDED.net_profit_yoy, fundamentals_period.net_profit_yoy),
                        revenue = COALESCE(EXCLUDED.revenue, fundamentals_period.revenue),
                        revenue_yoy = COALESCE(EXCLUDED.revenue_yoy, fundamentals_period.revenue_yoy),
                        updated_at = NOW()
                    """,
                    (
                        code,
                        report_date,
                        announce_date,
                        _num(r.get("roe")),
                        _num(r.get("net_profit")),
                        _num(r.get("net_profit_deducted")),
                        _num(r.get("net_profit_yoy")),
                        _num(r.get("revenue")),
                        _num(r.get("revenue_yoy")),
                    ),
                )
                if industry:
                    conn.execute(
                        """
                        UPDATE instruments
                        SET industry = %s, updated_at = NOW()
                        WHERE code = %s
                        """,
                        (industry, code),
                    )
                    industry_updated += 1
                rows += 1
        finish_job(
            job_id,
            "success",
            rows_affected=rows,
            message=f"upserted {rows}, industry={industry_updated}, skipped_unknown={skipped}",
        )
        logger.info(
            "fundamentals upserted=%s industry=%s skipped=%s",
            rows,
            industry_updated,
            skipped,
        )
        return rows
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def _num(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return float(v)
    except Exception:
        return None


def _parse_date(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        return pd.to_datetime(v).date()
    except Exception:
        return None


def _default_report_date():
    y = datetime.now().year - 1
    return datetime(y, 12, 31).date()
