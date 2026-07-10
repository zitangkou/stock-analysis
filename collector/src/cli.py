#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Allow `python -m src.cli` from collector/ or `python src/cli.py`
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="A-share market data collector")
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="debug logging",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-db", help="Apply SQL schema")
    sub.add_parser("sync-calendar", help="Sync trading calendar")
    sub.add_parser("sync-instruments", help="Sync SH/SZ main + ChiNext instruments")
    sub.add_parser("sync-fundamentals", help="Sync latest fundamentals for scoring")
    p_sw = sub.add_parser("sync-sw-industry", help="Sync Shenwan/EM industry → theme_id")
    p_sw.add_argument("--sleep", type=float, default=1.0, help="Sleep between industries")
    p_sw.add_argument("--limit", type=int, default=None, help="Only first N industries (debug)")
    p_fac = sub.add_parser("compute-factors", help="Compute basic daily factors from bars")
    p_fac.add_argument("--days", type=int, default=60, help="Lookback calendar days")
    p_uni = sub.add_parser("rebuild-universe", help="Rebuild ~2000 quality universe")
    p_uni.add_argument("--dry-run", action="store_true", help="Score only, do not write members")

    p_q = sub.add_parser("ingest-quotes", help="One-shot quote snapshot ingest")
    p_q.add_argument("--force", action="store_true", help="Ignore trading session check")

    sub.add_parser("run-quotes", help="Loop quote ingest during sessions")

    p_bars = sub.add_parser("ingest-bars", help="Ingest daily bars for universe")
    p_bars.add_argument("--days", type=int, default=30, help="Lookback calendar days")
    p_bars.add_argument("--sleep", type=float, default=None, help="Sleep between symbols (default from env)")
    p_bars.add_argument("--limit", type=int, default=None, help="Only first N universe codes")

    sub.add_parser("bootstrap", help="init-db + calendar + instruments + fundamentals + universe")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.cmd == "init-db":
        return cmd_init_db()
    if args.cmd == "sync-calendar":
        from src.jobs.sync_calendar import run

        run()
        return 0
    if args.cmd == "sync-instruments":
        from src.jobs.sync_instruments import run

        run()
        return 0
    if args.cmd == "sync-fundamentals":
        from src.jobs.sync_fundamentals import run

        run()
        return 0
    if args.cmd == "sync-sw-industry":
        from src.jobs.sync_sw_industry import run

        run(sleep=args.sleep, limit=args.limit)
        return 0
    if args.cmd == "compute-factors":
        from src.jobs.compute_factors import run

        run(days=args.days)
        return 0
    if args.cmd == "rebuild-universe":
        from src.jobs.rebuild_universe import run

        run(apply=not args.dry_run)
        return 0
    if args.cmd == "ingest-quotes":
        from src.jobs.ingest_quotes import run

        run(force=args.force)
        return 0
    if args.cmd == "run-quotes":
        from src.jobs.ingest_quotes import run_loop

        run_loop()
        return 0
    if args.cmd == "ingest-bars":
        from src.config import get_settings
        from src.jobs.ingest_bars import run

        sleep = args.sleep if args.sleep is not None else get_settings().bars_sleep_sec
        run(days=args.days, sleep=sleep, limit=args.limit)
        return 0
    if args.cmd == "bootstrap":
        return cmd_bootstrap()
    return 1


def cmd_init_db() -> int:
    import re

    import psycopg

    from src.config import get_settings

    sql_dir = ROOT / "sql"
    files = sorted(sql_dir.glob("*.sql"))
    if not files:
        raise RuntimeError(f"No SQL files in {sql_dir}")

    total = 0
    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        for schema in files:
            raw = schema.read_text(encoding="utf-8")
            no_line_comments = "\n".join(
                line for line in raw.splitlines() if not line.strip().startswith("--")
            )
            statements = [
                s.strip() for s in re.split(r";\s*\n", no_line_comments) if s.strip()
            ]
            for stmt in statements:
                conn.execute(stmt)
                total += 1
            print(f"Applied schema: {schema.name} ({len(statements)} statements)")
    print(f"Done. {len(files)} files, {total} statements.")
    return 0


def cmd_bootstrap() -> int:
    from src.jobs.ingest_quotes import run as ingest_quotes
    from src.jobs.rebuild_universe import run as rebuild_universe
    from src.jobs.sync_calendar import run as sync_calendar
    from src.jobs.sync_fundamentals import run as sync_fundamentals
    from src.jobs.sync_instruments import run as sync_instruments

    log = logging.getLogger(__name__)
    cmd_init_db()
    sync_calendar()
    sync_instruments()
    sync_fundamentals()
    # Spot amounts enable liquidity scoring before daily bars exist
    try:
        ingest_quotes(force=True)
    except Exception as exc:
        log.warning("ingest-quotes during bootstrap failed: %s", exc)
    try:
        rebuild_universe(apply=True)
    except Exception as exc:
        log.warning(
            "universe rebuild deferred (%s). Fix fundamentals/quotes then rebuild-universe.",
            exc,
        )
    print("Bootstrap finished. Next: python -m src.cli ingest-bars --days 30")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
