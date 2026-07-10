from __future__ import annotations

import logging
import time

import pandas as pd

from ..codes import board_of, normalize_code
from ..db import fetch_all, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)


def run(sleep: float = 1.0, limit: int | None = None, prefer: str = "em") -> int:
    """
    Sync industry classification → instrument_sw + instruments.theme_id.

    prefer:
      - em: Eastmoney industry boards first (recommended; SW cons API often broken)
      - sw: try Shenwan first, fall back to EM if zero rows
    """
    job_id = start_job("sync_sw_industry")
    try:
        _ensure_schema()
        n = 0
        source = prefer

        if prefer == "sw":
            try:
                n = _sync_shenwan(sleep=sleep, limit=limit)
            except Exception as exc:
                logger.warning("Shenwan sync errored (%s)", exc)
                n = 0
            if n <= 0:
                logger.warning("Shenwan wrote 0 rows, falling back to Eastmoney industry")
                n = _sync_eastmoney_industry(sleep=sleep, limit=limit)
                source = "em"
        else:
            n = _sync_eastmoney_industry(sleep=sleep, limit=limit)
            source = "em"

        if n <= 0:
            raise RuntimeError("Industry sync wrote 0 rows from all sources")

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
        for stmt in [
            "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS industry TEXT",
            "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS theme_id TEXT",
            "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sw_l1 TEXT",
            "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sw_l2 TEXT",
            "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sw_l3 TEXT",
            """
            CREATE TABLE IF NOT EXISTS sw_industries (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                level INT NOT NULL DEFAULT 3,
                parent_code TEXT,
                l1_name TEXT,
                l2_name TEXT,
                l3_name TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS instrument_sw (
                code CHAR(6) PRIMARY KEY REFERENCES instruments(code),
                sw_code TEXT,
                sw_l1 TEXT,
                sw_l2 TEXT,
                sw_l3 TEXT,
                source TEXT NOT NULL DEFAULT 'em',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS theme_industry_map (
                id SERIAL PRIMARY KEY,
                match_level TEXT NOT NULL CHECK (match_level IN ('l1', 'l2', 'l3', 'name')),
                industry_name TEXT NOT NULL,
                theme_id TEXT NOT NULL,
                priority INT NOT NULL DEFAULT 100,
                UNIQUE (match_level, industry_name)
            )
            """,
        ]:
            conn.execute(stmt)


def _sync_shenwan(sleep: float, limit: int | None) -> int:
    import akshare as ak

    info = ak.sw_index_third_info()
    logger.info("sw third industries: %s cols=%s", len(info), list(info.columns))

    code_col = _pick_col(info, ["行业代码", "code", "指数代码"])
    name_col = _pick_col(info, ["行业名称", "name", "指数名称"])
    parent_col = _pick_col(info, ["上级行业", "一级行业名称", "l1_name"], required=False)

    known = {
        r["code"]
        for r in fetch_all(
            "SELECT code FROM instruments WHERE board IN ('SH_MAIN','SZ_MAIN','CHINEXT')"
        )
    }
    if not known:
        raise RuntimeError("No instruments; run sync-instruments first")

    rows_written = 0
    failures = 0
    if limit:
        info = info.head(limit)

    with get_conn() as conn:
        for i, (_, row) in enumerate(info.iterrows(), 1):
            sw_code = str(row[code_col]).strip()
            sw_name = str(row[name_col]).strip()
            parent = (
                str(row[parent_col]).strip()
                if parent_col and pd.notna(row.get(parent_col))
                else None
            )

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
                (sw_code, sw_name, parent, parent, sw_name),
            )

            try:
                cons = ak.sw_index_third_cons(symbol=sw_code)
                if cons is None or cons.empty:
                    raise RuntimeError("empty cons")
            except Exception as exc:
                failures += 1
                logger.warning("cons failed for %s (%s): %s", sw_code, sw_name, exc)
                # If early failures dominate, abort SW quickly so EM can take over
                if i >= 15 and rows_written == 0 and failures >= 10:
                    raise RuntimeError(
                        f"Shenwan cons API unusable ({failures} failures, 0 rows)"
                    )
                time.sleep(sleep)
                continue

            code_c = _pick_col(cons, ["股票代码", "code", "品种代码"])
            for _, cr in cons.iterrows():
                raw = str(cr[code_c])
                code = normalize_code(raw.split(".")[0])
                if board_of(code) is None or code not in known:
                    continue
                c_l1 = _cell(cr, ["申万1级", "一级行业", "sw_l1"]) or parent
                c_l2 = _cell(cr, ["申万2级", "二级行业", "sw_l2"]) or parent
                c_l3 = _cell(cr, ["申万3级", "三级行业", "sw_l3"]) or sw_name
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
                logger.info(
                    "sw progress %s/%s, written=%s, failures=%s",
                    i,
                    len(info),
                    rows_written,
                    failures,
                )
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

    logger.info("eastmoney industry boards: %s", len(names))
    rows_written = 0
    with get_conn() as conn:
        for i, name in enumerate(names, 1):
            try:
                cons = ak.stock_board_industry_cons_em(symbol=name)
                if cons is None or cons.empty:
                    raise RuntimeError("empty")
            except Exception as exc:
                logger.warning("em industry %s failed: %s", name, exc)
                time.sleep(max(sleep, 1.5))
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
            if i % 5 == 0:
                logger.info("em progress %s/%s, written=%s", i, len(names), rows_written)
            time.sleep(sleep)
    return rows_written


def _apply_theme_ids() -> int:
    maps = fetch_all(
        """
        SELECT match_level, industry_name, theme_id, priority
        FROM theme_industry_map
        ORDER BY priority ASC, id ASC
        """
    )
    if not maps:
        logger.warning("theme_industry_map empty; seeding minimal name rules in-memory")
        return _apply_theme_ids_keyword_fallback()

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
                for level in ("name", "l3", "l2", "l1"):
                    if ind in by_level[level]:
                        theme = by_level[level][ind]
                        break
                if not theme:
                    for level in ("name", "l3", "l2", "l1"):
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


def _apply_theme_ids_keyword_fallback() -> int:
    """When map table missing, use simple keyword rules on industry text."""
    rules = [
        ("semiconductor", ["半导体", "集成电路", "电子元件"]),
        ("ai", ["软件", "计算机", "互联网", "通信设备", "游戏"]),
        ("nev", ["汽车", "电池", "锂电"]),
        ("biotech", ["制药", "中药", "生物", "医疗"]),
        ("liquor", ["白酒", "饮料", "乳品", "家电"]),
        ("military", ["航天", "航空", "军工", "兵装", "航海"]),
        ("finance", ["证券", "银行", "保险", "金融"]),
        ("metals", ["有色", "金属", "黄金", "钢铁"]),
        ("realestate", ["房地产", "装修", "建筑"]),
        ("greenenergy", ["光伏", "风电", "电力", "电网"]),
    ]
    rows = fetch_all(
        "SELECT code, industry, sw_l1, sw_l2 FROM instruments WHERE board IN ('SH_MAIN','SZ_MAIN','CHINEXT')"
    )
    updated = 0
    with get_conn() as conn:
        for r in rows:
            text = " ".join(
                x for x in [r.get("industry"), r.get("sw_l1"), r.get("sw_l2")] if x
            )
            theme = None
            for tid, kws in rules:
                if any(k in text for k in kws):
                    theme = tid
                    break
            if theme:
                conn.execute(
                    "UPDATE instruments SET theme_id = %s WHERE code = %s",
                    (theme, r["code"]),
                )
                updated += 1
    return updated


def _pick_col(df: pd.DataFrame, candidates: list[str], required: bool = True) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
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
