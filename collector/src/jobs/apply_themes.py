from __future__ import annotations

import logging

from ..db import fetch_all, finish_job, get_conn, start_job
from .sync_sw_industry import _apply_theme_ids, _apply_theme_ids_keyword_fallback, _ensure_schema

logger = logging.getLogger(__name__)


def run() -> int:
    """
    Assign instruments.theme_id using theme_industry_map + existing industry text.
    Does NOT call external industry board APIs — safe when Eastmoney/SW are blocked.
    """
    job_id = start_job("apply_themes")
    try:
        _ensure_schema()
        # Ensure map seeds exist (idempotent minimal insert if empty)
        _ensure_map_seeds()
        mapped = _apply_theme_ids()
        if mapped <= 0:
            mapped = _apply_theme_ids_keyword_fallback()
        finish_job(job_id, "success", rows_affected=mapped, message=f"theme_mapped={mapped}")
        logger.info("apply-themes done mapped=%s", mapped)
        return mapped
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def _ensure_map_seeds() -> None:
    count = fetch_all("SELECT COUNT(*)::int AS c FROM theme_industry_map")
    if count and int(count[0]["c"]) > 0:
        return
    seeds = [
        ("name", "半导体", "semiconductor", 5),
        ("name", "电子元件", "semiconductor", 10),
        ("name", "光学光电子", "semiconductor", 20),
        ("name", "软件开发", "ai", 5),
        ("name", "互联网服务", "ai", 10),
        ("name", "计算机设备", "ai", 12),
        ("name", "通信设备", "ai", 12),
        ("name", "游戏", "ai", 20),
        ("name", "汽车整车", "nev", 5),
        ("name", "汽车零部件", "nev", 8),
        ("name", "电池", "nev", 5),
        ("name", "化学制药", "biotech", 5),
        ("name", "中药", "biotech", 8),
        ("name", "生物制品", "biotech", 5),
        ("name", "医疗器械", "biotech", 8),
        ("name", "医疗服务", "biotech", 8),
        ("name", "白酒", "liquor", 1),
        ("name", "饮料乳品", "liquor", 8),
        ("name", "白色家电", "liquor", 15),
        ("name", "航天装备", "military", 1),
        ("name", "航空装备", "military", 1),
        ("name", "地面兵装", "military", 1),
        ("name", "航海装备", "military", 5),
        ("name", "证券", "finance", 1),
        ("name", "银行", "finance", 5),
        ("name", "保险", "finance", 5),
        ("name", "工业金属", "metals", 5),
        ("name", "贵金属", "metals", 5),
        ("name", "能源金属", "metals", 5),
        ("name", "钢铁", "metals", 20),
        ("name", "房地产开发", "realestate", 1),
        ("name", "光伏设备", "greenenergy", 1),
        ("name", "风电设备", "greenenergy", 5),
        ("name", "电网设备", "greenenergy", 8),
        ("name", "电力", "greenenergy", 10),
        ("l1", "电子", "semiconductor", 10),
        ("l1", "计算机", "ai", 10),
        ("l1", "通信", "ai", 15),
        ("l1", "汽车", "nev", 10),
        ("l1", "医药生物", "biotech", 10),
        ("l1", "食品饮料", "liquor", 10),
        ("l1", "家用电器", "liquor", 20),
        ("l1", "国防军工", "military", 5),
        ("l1", "银行", "finance", 5),
        ("l1", "非银金融", "finance", 5),
        ("l1", "有色金属", "metals", 5),
        ("l1", "房地产", "realestate", 5),
        ("l1", "电力设备", "greenenergy", 5),
        ("l1", "公用事业", "greenenergy", 15),
    ]
    with get_conn() as conn:
        for level, name, theme, pri in seeds:
            conn.execute(
                """
                INSERT INTO theme_industry_map (match_level, industry_name, theme_id, priority)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (match_level, industry_name) DO NOTHING
                """,
                (level, name, theme, pri),
            )
