from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _parquet_dates(dir_root: Path) -> list[str]:
    if not dir_root.exists():
        return []
    dates: list[str] = []
    for p in dir_root.rglob("*.parquet"):
        stem = p.stem  # YYYY-MM-DD
        if len(stem) == 10 and stem[4] == "-" and stem[7] == "-":
            dates.append(stem)
    return sorted(set(dates))


def _count_rows_fast(path: Path) -> int | None:
    try:
        import pyarrow.parquet as pq

        return int(pq.ParquetFile(path).metadata.num_rows)
    except Exception:
        try:
            import pandas as pd

            return len(pd.read_parquet(path, columns=[]))
        except Exception:
            return None


def build_inventory(parquet_root: Path, database_url: str | None = None) -> dict[str, Any]:
    """Scan factory Parquet + optional Postgres for a UI-friendly status payload."""
    kline_dates = _parquet_dates(parquet_root / "kline_daily")
    hfq_dates = _parquet_dates(parquet_root / "adjust_hfq")
    index_dates = _parquet_dates(parquet_root / "index_daily")
    north_dates = _parquet_dates(parquet_root / "meta" / "northbound")
    lhb_dates = _parquet_dates(parquet_root / "meta" / "dragon_tiger")
    fund_files = list((parquet_root / "meta" / "fundamentals").glob("*.parquet")) if (parquet_root / "meta" / "fundamentals").exists() else []
    industry_map = parquet_root / "meta" / "industry_map.json"
    calendar = parquet_root / "meta" / "trading_calendar.parquet"
    stock_basic = parquet_root / "meta" / "stock_basic.parquet"

    latest_kline_rows = None
    if kline_dates:
        latest = kline_dates[-1]
        year = latest[:4]
        p = parquet_root / "kline_daily" / year / f"{latest}.parquet"
        if p.exists():
            latest_kline_rows = _count_rows_fast(p)

    datasets = [
        {
            "id": "kline_daily",
            "name": "A股日K（未复权）",
            "source": "BaoStock",
            "status": "ok" if kline_dates else "missing",
            "file_days": len(kline_dates),
            "min_date": kline_dates[0] if kline_dates else None,
            "max_date": kline_dates[-1] if kline_dates else None,
            "latest_rows": latest_kline_rows,
            "note": "主数据；本机回测底座",
        },
        {
            "id": "adjust_hfq",
            "name": "后复权因子/收盘",
            "source": "BaoStock",
            "status": "ok" if hfq_dates else "missing",
            "file_days": len(hfq_dates),
            "min_date": hfq_dates[0] if hfq_dates else None,
            "max_date": hfq_dates[-1] if hfq_dates else None,
            "note": "分析默认用后复权",
        },
        {
            "id": "index_daily",
            "name": "指数日K",
            "source": "BaoStock",
            "status": "ok" if index_dates else "missing",
            "file_days": len(index_dates),
            "min_date": index_dates[0] if index_dates else None,
            "max_date": index_dates[-1] if index_dates else None,
            "note": "上证/沪深300/中证500",
        },
        {
            "id": "trading_calendar",
            "name": "交易日历",
            "source": "BaoStock",
            "status": "ok" if calendar.exists() else "missing",
            "path": str(calendar) if calendar.exists() else None,
        },
        {
            "id": "stock_basic",
            "name": "股票基础信息",
            "source": "BaoStock",
            "status": "ok" if stock_basic.exists() else "missing",
            "path": str(stock_basic) if stock_basic.exists() else None,
            "rows": _count_rows_fast(stock_basic) if stock_basic.exists() else None,
        },
        {
            "id": "northbound",
            "name": "北向资金",
            "source": "AKShare",
            "status": "ok" if north_dates else "missing",
            "file_days": len(north_dates),
            "max_date": north_dates[-1] if north_dates else None,
        },
        {
            "id": "dragon_tiger",
            "name": "龙虎榜",
            "source": "AKShare",
            "status": "ok" if lhb_dates else "missing",
            "file_days": len(lhb_dates),
            "max_date": lhb_dates[-1] if lhb_dates else None,
        },
        {
            "id": "fundamentals_yjbb",
            "name": "业绩报表快照",
            "source": "AKShare",
            "status": "ok" if fund_files else "missing",
            "files": len(fund_files),
        },
        {
            "id": "industry_map",
            "name": "行业映射",
            "source": "yjbb→JSON",
            "status": "ok" if industry_map.exists() else "missing",
            "path": str(industry_map) if industry_map.exists() else None,
        },
    ]

    postgres: dict[str, Any] | None = None
    if database_url:
        postgres = _postgres_counts(database_url)

    ok = sum(1 for d in datasets if d["status"] == "ok")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "parquet_root": str(parquet_root),
        "summary": {
            "datasets_ok": ok,
            "datasets_total": len(datasets),
            "kline_days": len(kline_dates),
            "ready_for_backtest": bool(kline_dates) and len(kline_dates) >= 5,
        },
        "datasets": datasets,
        "postgres": postgres,
        "not_in_v1": [
            "分钟K线",
            "主力资金流（真源）",
            "正式涨停池",
            "新闻/股吧舆情",
            "五档盘口/L2",
        ],
    }
    return payload


def write_inventory(parquet_root: Path, database_url: str | None = None) -> Path:
    payload = build_inventory(parquet_root, database_url)
    out = parquet_root / "meta" / "inventory.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("inventory written %s ok=%s/%s", out, payload["summary"]["datasets_ok"], payload["summary"]["datasets_total"])
    return out


def _postgres_counts(database_url: str) -> dict[str, Any]:
    try:
        import psycopg

        with psycopg.connect(database_url) as conn:
            def q(sql: str) -> Any:
                row = conn.execute(sql).fetchone()
                return row[0] if row else None

            return {
                "connected": True,
                "instruments": q("SELECT COUNT(*) FROM instruments"),
                "universe": q("SELECT COUNT(*) FROM universe_members WHERE effective_to IS NULL"),
                "quotes_latest": q("SELECT COUNT(*) FROM quotes_latest"),
                "bars_1d": q("SELECT COUNT(*) FROM bars_1d"),
                "bars_min": str(q("SELECT MIN(trade_date) FROM bars_1d")),
                "bars_max": str(q("SELECT MAX(trade_date) FROM bars_1d")),
                "fundamentals": q("SELECT COUNT(*) FROM fundamentals_period"),
                "with_theme": q("SELECT COUNT(*) FROM instruments WHERE theme_id IS NOT NULL"),
                "heat_stock": q(
                    """
                    SELECT COUNT(*) FROM heat_score_stock_latest
                    """
                )
                if _table_exists(conn, "heat_score_stock_latest")
                else None,
            }
    except Exception as exc:
        return {"connected": False, "error": str(exc)}


def _table_exists(conn: Any, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
        (name,),
    ).fetchone()
    return bool(row)
