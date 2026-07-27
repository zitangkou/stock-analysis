#!/usr/bin/env python3
"""
Post-close A-share daily pipeline:
  calendar check → BaoStock kline → validate → Parquet
  optional: hfq close factor file, AKShare extras, Postgres bridge
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.calendar_util import is_trading_day_baostock, last_completed_trade_date
from src.config import get_settings
from src.fetchers import akshare_extras, baostock_kline
from src.storage import (
    factor_path,
    kline_path,
    upsert_postgres_bars,
    write_parquet,
    write_report,
)
from src.validate import validate_daily_frame

logger = logging.getLogger(__name__)


def parse_day(s: str | None) -> date:
    """Explicit --date, or last completed CN session (not 'today' before close)."""
    if not s:
        day = last_completed_trade_date(get_settings().tz)
        logger.info("default trade_date=%s (last completed session)", day)
        return day
    return date.fromisoformat(s)


def run_kline_day(
    trade_date: date,
    *,
    limit: int | None = None,
    with_hfq: bool = True,
    force: bool = False,
) -> int:
    settings = get_settings()
    out = kline_path(settings.parquet_root, trade_date)
    if out.exists() and not force:
        logger.info("skip existing %s (use --force to overwrite)", out)
        return 0

    cal = is_trading_day_baostock(trade_date)
    if cal is False and not force:
        logger.info("%s is not a trading day, exit 0", trade_date)
        return 0
    if cal is None:
        logger.warning("calendar check inconclusive; continuing")

    baostock_kline.login()
    try:
        codes = baostock_kline.list_a_shares_on_day(
            trade_date, include_star=settings.include_star
        )
        if limit:
            codes = codes[:limit]
        logger.info("symbols=%s day=%s", len(codes), trade_date)
        if not codes:
            raise RuntimeError(
                f"no A-share symbols for {trade_date} "
                "(pre-open / holiday / BaoStock list empty). "
                "Omit --date to use last completed session, or pass an explicit trading day."
            )

        df = baostock_kline.fetch_daily_bars(
            codes,
            start=trade_date,
            end=trade_date,
            sleep=settings.baostock_sleep,
            adjustflag="3",
        )
        report = validate_daily_frame(df, trade_date.isoformat())
        frame = report.pop("frame")
        write_parquet(frame, out)
        write_report(settings.parquet_root, trade_date, report)

        if with_hfq:
            hfq = baostock_kline.fetch_adjust_factor(
                codes,
                start=trade_date,
                end=trade_date,
                sleep=settings.baostock_sleep,
            )
            if not hfq.empty:
                # merge factor = close_hfq / close when close>0
                merged = frame.merge(
                    hfq[["date", "code", "close_hfq"]],
                    on=["date", "code"],
                    how="left",
                )
                merged["adj_factor_hfq"] = merged["close_hfq"] / merged["close"]
                write_parquet(
                    merged[["date", "code", "plain_code", "close", "close_hfq", "adj_factor_hfq"]],
                    factor_path(settings.parquet_root, trade_date),
                )

        if settings.write_postgres and settings.database_url:
            n = upsert_postgres_bars(frame, settings.database_url)
            logger.info("postgres bars upserted=%s", n)

        logger.info(
            "done day=%s valid_rows=%s warnings=%s",
            trade_date,
            report.get("rows_valid"),
            report.get("warnings"),
        )
        return int(report.get("rows_valid") or 0)
    finally:
        baostock_kline.logout()


def run_backfill(
    start: date,
    end: date,
    *,
    limit: int | None = None,
    with_hfq: bool = False,
) -> None:
    d = start
    while d <= end:
        try:
            run_kline_day(d, limit=limit, with_hfq=with_hfq, force=False)
        except Exception:
            logger.exception("backfill failed for %s", d)
        d += timedelta(days=1)


def run_index_day(trade_date: date) -> int:
    """Fetch a few benchmark indices via BaoStock."""
    settings = get_settings()
    indices = {
        "sh.000001": "上证综指",
        "sh.000300": "沪深300",
        "sh.000905": "中证500",
    }
    baostock_kline.login()
    try:
        df = baostock_kline.fetch_daily_bars(
            list(indices.keys()),
            start=trade_date,
            end=trade_date,
            sleep=settings.baostock_sleep,
            adjustflag="3",
        )
        if df.empty:
            return 0
        df["name"] = df["code"].map(indices)
        path = (
            settings.parquet_root
            / "index_daily"
            / f"{trade_date.year}"
            / f"{trade_date.isoformat()}.parquet"
        )
        write_parquet(df, path)
        return len(df)
    finally:
        baostock_kline.logout()


def run_extras(trade_date: date, *, yjbb: bool = False) -> dict:
    settings = get_settings()
    return akshare_extras.save_extras(
        settings.parquet_root,
        trade_date,
        north=True,
        lhb=True,
        yjbb=yjbb,
        sleep=settings.akshare_sleep,
    )


def run_sync_meta() -> None:
    from src.fetchers import meta_basic
    from src.inventory import write_inventory

    settings = get_settings()
    meta_basic.sync_trading_calendar(settings.parquet_root)
    meta_basic.sync_stock_basic(settings.parquet_root)
    write_inventory(settings.parquet_root, settings.database_url)


def run_status() -> int:
    from src.inventory import build_inventory, write_inventory

    settings = get_settings()
    payload = build_inventory(settings.parquet_root, settings.database_url)
    write_inventory(settings.parquet_root, settings.database_url)
    s = payload["summary"]
    print(
        f"datasets_ok={s['datasets_ok']}/{s['datasets_total']} "
        f"kline_days={s['kline_days']} ready_for_backtest={s['ready_for_backtest']}"
    )
    for d in payload["datasets"]:
        flag = "OK " if d["status"] == "ok" else "MISS"
        extra = d.get("max_date") or d.get("rows") or d.get("files") or ""
        print(f"  [{flag}] {d['id']:20} {d['name']}  {extra}")
    if payload.get("postgres"):
        print("postgres:", payload["postgres"])
    return 0 if s["datasets_ok"] > 0 else 1


def main(argv: list[str] | None = None) -> int:
    parent = argparse.ArgumentParser(add_help=False)
    parent.add_argument("-v", "--verbose", action="store_true", help="debug logging")

    parser = argparse.ArgumentParser(
        description="A-share post-close data factory",
        parents=[parent],
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_day = sub.add_parser("daily", parents=[parent], help="Fetch one trading day kline → Parquet")
    p_day.add_argument("--date", default=None, help="YYYY-MM-DD (default: today CN)")
    p_day.add_argument("--limit", type=int, default=None, help="Debug: first N symbols")
    p_day.add_argument("--force", action="store_true")
    p_day.add_argument("--no-hfq", action="store_true", help="Skip hfq factor file")
    p_day.add_argument("--with-index", action="store_true", help="Also fetch benchmarks")
    p_day.add_argument("--with-extras", action="store_true", help="AKShare north/lhb")
    p_day.add_argument("--with-yjbb", action="store_true", help="Also dump yjbb snapshot")

    p_bf = sub.add_parser("backfill", parents=[parent], help="Backfill date range (skips existing)")
    p_bf.add_argument("--start", required=True, help="YYYY-MM-DD")
    p_bf.add_argument("--end", required=True, help="YYYY-MM-DD")
    p_bf.add_argument("--limit", type=int, default=None)
    p_bf.add_argument("--with-hfq", action="store_true")

    p_ex = sub.add_parser("extras", parents=[parent], help="Only AKShare extras for a day")
    p_ex.add_argument("--date", default=None)
    p_ex.add_argument("--with-yjbb", action="store_true")

    sub.add_parser("sync-meta", parents=[parent], help="Sync calendar + stock_basic + inventory.json")
    sub.add_parser("status", parents=[parent], help="Print / refresh data inventory")
    p_boot = sub.add_parser(
        "bootstrap",
        parents=[parent],
        help="sync-meta + sample daily(limit) for local smoke, or full day without --limit",
    )
    p_boot.add_argument("--date", default=None)
    p_boot.add_argument("--limit", type=int, default=30, help="0 = full market")
    p_boot.add_argument("--force", action="store_true")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if getattr(args, "verbose", False) else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.cmd == "daily":
        day = parse_day(args.date)
        run_kline_day(
            day,
            limit=args.limit,
            with_hfq=not args.no_hfq,
            force=args.force,
        )
        if args.with_index:
            run_index_day(day)
        if args.with_extras or args.with_yjbb:
            run_extras(day, yjbb=args.with_yjbb)
        from src.inventory import write_inventory

        settings = get_settings()
        write_inventory(settings.parquet_root, settings.database_url)
        return 0

    if args.cmd == "backfill":
        run_backfill(
            date.fromisoformat(args.start),
            date.fromisoformat(args.end),
            limit=args.limit,
            with_hfq=args.with_hfq,
        )
        from src.inventory import write_inventory

        settings = get_settings()
        write_inventory(settings.parquet_root, settings.database_url)
        return 0

    if args.cmd == "extras":
        day = parse_day(args.date)
        counts = run_extras(day, yjbb=args.with_yjbb)
        logger.info("extras done %s", counts)
        from src.inventory import write_inventory

        settings = get_settings()
        write_inventory(settings.parquet_root, settings.database_url)
        return 0

    if args.cmd == "sync-meta":
        run_sync_meta()
        return 0

    if args.cmd == "status":
        return run_status()

    if args.cmd == "bootstrap":
        run_sync_meta()
        day = parse_day(args.date)
        lim = None if args.limit == 0 else args.limit
        settings = get_settings()
        run_kline_day(day, limit=lim, with_hfq=True, force=args.force)
        run_index_day(day)
        try:
            run_extras(day, yjbb=True)
            fund_dir = settings.parquet_root / "meta" / "fundamentals"
            yjbb_files = sorted(fund_dir.glob("yjbb_*.parquet")) if fund_dir.exists() else []
            if yjbb_files:
                import subprocess

                subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "scripts" / "build_industry_map.py"),
                        "--yjbb",
                        str(yjbb_files[-1]),
                        "--out",
                        str(settings.parquet_root / "meta" / "industry_map.json"),
                    ],
                    check=False,
                )
        except Exception:
            logger.exception("extras failed (non-fatal)")
        from src.inventory import write_inventory

        write_inventory(settings.parquet_root, settings.database_url)
        return run_status()

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
