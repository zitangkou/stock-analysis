from __future__ import annotations

import logging
import time

import pandas as pd

from ..codes import board_of, normalize_code
from ..db import fetch_all, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)


def run(sleep: float = 1.0, limit: int | None = None) -> int:
    """
    Sync Shenwan L3 industry constituents → instrument_sw + instruments.theme_id.
    Falls back to Eastmoney industry boards if SW APIs fail.
    """
    job_id = start_job("sync_sw_industry")
    try:
        _ensure_schema()
        try:
            n = _sync_shenwan(sleep=sleep, limit=limit)
            source = "sw"
        except Exception as exc:
            logger.warning("Shenwan sync failed (%s), falling back to Eastmoney industry", exc)
            n = _sync_eastmoney_industry(sleep=sleep, limit=limit)
            source = "em"

        mapped = _apply_theme_ids()
        finish_job(
            job_id,
            "success",
            rows_affected=n,
            message=f"source={source}, members={n}, theme_mapped={mapped}",
        )
        logger.info("industry sync done source=%s members=%s themes=%s", source, n, mapped)
        return n
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def _ensure_schema() -> None:
    with get_conn() as conn:
        conn.execute("ALTER TABLE instruments ADD COLUMN IF NOT EXISTS industry TEXT")
        conn.execute("ALTER TABLE instruments ADD COLUMN IF NOT EXISTS theme_id TEXT")
        conn.execute("ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sw_l1 TEXT")
        conn.execute("ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sw_l2 TEXT")
        conn.execute("ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sw_l3 TEXT")


def _sync_shenwan(sleep: float, limit: int | None) -> int:
    import akshare as ak

    info = ak.sw_index_third_info()
    logger.info("sw third industries: %s cols=%s", len(info), list(info.columns))

    # Normalize columns across akshare versions
    code_col = _pick_col(info, ["行业代码", "code", "指数代码"])
    name_col = _pick_col(info, ["行业名称", "name", "指数名称"])
    l1_col = _pick_col(info, ["一级行业名称", "一级行业", "l1_name"], required=False)
    l2_col = _pick_col(info, ["二级行业名称", "二级行业", "l2_name"], required=False)

    known = {
        r["code"]
        for r in fetch_all(
            "SELECT code FROM instruments WHERE board IN ('SH_MAIN','SZ_MAIN','CHINEXT')"
        )
    }
    if not known:
        raise RuntimeError("No instruments; run sync-instruments first")

    rows_written = 0
    if limit:
        info = info.head(limit)

    with get_conn() as conn:
        for i, (_, row) in enumerate(info.iterrows(), 1):
            sw_code = str(row[code_col]).strip()
            sw_name = str(row[name_col]).strip()
            l1 = str(row[l1_col]).strip() if l1_col and pd.notna(row.get(l1_col)) else None
            l2 = str(row[l2_col]).strip() if l2_col and pd.notna(row.get(l2_col)) else None
            l3 = sw_name

            conn.execute(
                """
                INSERT INTO sw_industries (code, name, level, l1_name, l2_name, l3_name, updated_at)
                VALUES (%s, %s, 3, %s, %s, %s, NOW())
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    l1_name = EXCLUDED.l1_name,
                    l2_name = EXCLUDED.l2_name,
                    l3_name = EXCLUDED.l3_name,
                    updated_at = NOW()
                """,
                (sw_code, sw_name, l1, l2, l3),
            )

            try:
                cons = ak.sw_index_third_cons(symbol=sw_code)
            except Exception as exc:
                logger.warning("cons failed for %s (%s): %s", sw_code, sw_name, exc)
                time.sleep(sleep)
                continue

            code_c = _pick_col(cons, ["股票代码", "code", "品种代码"])
            for _, cr in cons.iterrows():
                raw = str(cr[code_c])
                code = normalize_code(raw.split(".")[0])
                if board_of(code) is None or code not in known:
                    continue
                c_l1 = _cell(cr, ["申万1级", "一级行业", "sw_l1"]) or l1
                c_l2 = _cell(cr, ["申万2级", "二级行业", "sw_l2"]) or l2
                c_l3 = _cell(cr, ["申万3级", "三级行业", "sw_l3"]) or l3
                conn.execute(
                    """
                    INSERT INTO instrument_sw (code, sw_code, sw_l1, sw_l2, sw_l3, source, updated_at)
                    VALUES (%s, %s, %s, %s, %s, 'sw', NOW())
                    ON CONFLICT (code) DO UPDATE SET
                        sw_code = EXCLUDED.sw_code,
                        sw_l1 = EXCLUDED.sw_l1,
                        sw_l2 = EXCLUDED.sw_l2,
                        sw_l3 = EXCLUDED.sw_l3,
                        source = EXCLUDED.source,
                        updated_at = NOW()
                    """,
                    (code, sw_code, c_l1, c_l2, c_l3),
                )
                conn.execute(
                    """
                    UPDATE instruments SET
                        sw_l1 = %s, sw_l2 = %s, sw_l3 = %s,
                        industry = COALESCE(%s, industry),
                        updated_at = NOW()
                    WHERE code = %s
                    """,
                    (c_l1, c_l2, c_l3, c_l2 or c_l1 or c_l3, code),
                )
                rows_written += 1

            if i % 10 == 0:
                logger.info("sw progress %s/%s, written=%s", i, len(info), rows_written)
            time.sleep(sleep)

    return rows_written


def _sync_eastmoney_industry(sleep: float, limit: int | None) -> int:
    import akshare as ak

    boards = ak.stock_board_industry_name_em()
    name_col = _pick_col(boards, ["板块名称", "name"])
    known = {
        r["code"]
        for r in fetch_all(
            "SELECT code FROM instruments WHERE board IN ('SH_MAIN','SZ_MAIN','CHINEXT')"
        )
    }
    names = boards[name_col].astype(str).tolist()
    if limit:
        names = names[:limit]

    rows_written = 0
    with get_conn() as conn:
        for i, name in enumerate(names, 1):
            try:
                cons = ak.stock_board_industry_cons_em(symbol=name)
            except Exception as exc:
                logger.warning("em industry %s failed: %s", name, exc)
                time.sleep(sleep)
                continue
            code_c = _pick_col(cons, ["代码", "code"])
            for _, cr in cons.iterrows():
                code = normalize_code(cr[code_c])
                if board_of(code) is None or code not in known:
                    continue
                conn.execute(
                    """
                    INSERT INTO instrument_sw (code, sw_code, sw_l1, sw_l2, sw_l3, source, updated_at)
                    VALUES (%s, NULL, %s, %s, NULL, 'em', NOW())
                    ON CONFLICT (code) DO UPDATE SET
                        sw_l1 = EXCLUDED.sw_l1,
                        sw_l2 = EXCLUDED.sw_l2,
                        source = EXCLUDED.source,
                        updated_at = NOW()
                    """,
                    (code, name, name),
                )
                conn.execute(
                    """
                    UPDATE instruments SET
                        industry = %s, sw_l1 = %s, sw_l2 = %s, updated_at = NOW()
                    WHERE code = %s
                    """,
                    (name, name, name, code),
                )
                rows_written += 1
            if i % 10 == 0:
                logger.info("em progress %s/%s, written=%s", i, len(names), rows_written)
            time.sleep(sleep)
    return rows_written


def _apply_theme_ids() -> int:
    """Assign instruments.theme_id from theme_industry_map using l3>l2>l1 priority."""
    maps = fetch_all(
        """
        SELECT match_level, industry_name, theme_id, priority
        FROM theme_industry_map
        ORDER BY priority ASC, id ASC
        """
    )
    if not maps:
        logger.warning("theme_industry_map empty; run init-db to seed")
        return 0

    # Build lookup: level -> {name: theme_id} first priority wins
    by_level: dict[str, dict[str, str]] = {"l1": {}, "l2": {}, "l3": {}, "name": {}}
    for m in maps:
        level = m["match_level"]
        name = m["industry_name"]
        if name not in by_level[level]:
            by_level[level][name] = m["theme_id"]

    rows = fetch_all(
        """
        SELECT code, sw_l1, sw_l2, sw_l3, industry
        FROM instruments
        WHERE board IN ('SH_MAIN','SZ_MAIN','CHINEXT')
        """
    )
    updated = 0
    with get_conn() as conn:
        for r in rows:
            theme = None
            for level, field in (("l3", "sw_l3"), ("l2", "sw_l2"), ("l1", "sw_l1")):
                val = r.get(field)
                if val and val in by_level[level]:
                    theme = by_level[level][val]
                    break
            if not theme and r.get("industry"):
                ind = r["industry"]
                for level in ("l3", "l2", "l1", "name"):
                    if ind in by_level[level]:
                        theme = by_level[level][ind]
                        break
                if not theme:
                    # substring keyword fallback against map names
                    for level in ("l3", "l2", "l1", "name"):
                        for name, tid in by_level[level].items():
                            if name and name in ind:
                                theme = tid
                                break
                        if theme:
                            break
            if theme:
                conn.execute(
                    "UPDATE instruments SET theme_id = %s, updated_at = NOW() WHERE code = %s",
                    (theme, r["code"]),
                )
                updated += 1
    return updated


def _pick_col(df: pd.DataFrame, candidates: list[str], required: bool = True) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    # fuzzy
    for col in df.columns:
        for c in candidates:
            if c in str(col):
                return col
    if required:
        raise RuntimeError(f"Cannot find columns {candidates} in {list(df.columns)}")
    return None


def _cell(row, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in row.index:
            v = row[c]
            if v is None or (isinstance(v, float) and pd.isna(v)):
                continue
            s = str(v).strip()
            if s and s.lower() != "nan":
                return s
    return None
