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

from src.calendar_util import is_trading_day_baostock, today_cn
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
    if not s:
        return today_cn(get_settings().tz)
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="A-share post-close data factory")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_day = sub.add_parser("daily", help="Fetch one trading day kline → Parquet")
    p_day.add_argument("--date", default=None, help="YYYY-MM-DD (default: today CN)")
    p_day.add_argument("--limit", type=int, default=None, help="Debug: first N symbols")
    p_day.add_argument("--force", action="store_true")
    p_day.add_argument("--no-hfq", action="store_true", help="Skip hfq factor file")
    p_day.add_argument("--with-index", action="store_true", help="Also fetch benchmarks")
    p_day.add_argument("--with-extras", action="store_true", help="AKShare north/lhb")
    p_day.add_argument("--with-yjbb", action="store_true", help="Also dump yjbb snapshot")

    p_bf = sub.add_parser("backfill", help="Backfill date range (skips existing)")
    p_bf.add_argument("--start", required=True, help="YYYY-MM-DD")
    p_bf.add_argument("--end", required=True, help="YYYY-MM-DD")
    p_bf.add_argument("--limit", type=int, default=None)
    p_bf.add_argument("--with-hfq", action="store_true")

    p_ex = sub.add_parser("extras", help="Only AKShare extras for a day")
    p_ex.add_argument("--date", default=None)
    p_ex.add_argument("--with-yjbb", action="store_true")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
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
        return 0

    if args.cmd == "backfill":
        run_backfill(
            date.fromisoformat(args.start),
            date.fromisoformat(args.end),
            limit=args.limit,
            with_hfq=args.with_hfq,
        )
        return 0

    if args.cmd == "extras":
        day = parse_day(args.date)
        counts = run_extras(day, yjbb=args.with_yjbb)
        logger.info("extras done %s", counts)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
