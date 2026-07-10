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
    p_uni = sub.add_parser("rebuild-universe", help="Rebuild ~2000 quality universe")
    p_uni.add_argument("--dry-run", action="store_true", help="Score only, do not write members")

    p_q = sub.add_parser("ingest-quotes", help="One-shot quote snapshot ingest")
    p_q.add_argument("--force", action="store_true", help="Ignore trading session check")

    sub.add_parser("run-quotes", help="Loop quote ingest during sessions")

    p_bars = sub.add_parser("ingest-bars", help="Ingest daily bars for universe")
    p_bars.add_argument("--days", type=int, default=30, help="Lookback calendar days")
    p_bars.add_argument("--sleep", type=float, default=0.25, help="Sleep between symbols")

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
        from src.jobs.ingest_bars import run

        run(days=args.days, sleep=args.sleep)
        return 0
    if args.cmd == "bootstrap":
        return cmd_bootstrap()
    return 1


def cmd_init_db() -> int:
    import re

    import psycopg

    from src.config import get_settings

    schema = ROOT / "sql" / "001_schema.sql"
    raw = schema.read_text(encoding="utf-8")
    # Strip line comments, split into statements (psycopg executes one at a time)
    no_line_comments = "\n".join(
        line for line in raw.splitlines() if not line.strip().startswith("--")
    )
    statements = [s.strip() for s in re.split(r";\s*\n", no_line_comments) if s.strip()]

    with psycopg.connect(get_settings().database_url, autocommit=True) as conn:
        for stmt in statements:
            conn.execute(stmt)
    print(f"Applied schema: {schema} ({len(statements)} statements)")
    return 0


def cmd_bootstrap() -> int:
    from src.jobs.rebuild_universe import run as rebuild_universe
    from src.jobs.sync_calendar import run as sync_calendar
    from src.jobs.sync_fundamentals import run as sync_fundamentals
    from src.jobs.sync_instruments import run as sync_instruments

    cmd_init_db()
    sync_calendar()
    sync_instruments()
    sync_fundamentals()
    # Optional short bars help liquidity filter; skip if slow — universe can use spot amount
    try:
        rebuild_universe(apply=True)
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "universe rebuild deferred (%s). Run ingest-bars then rebuild-universe.",
            exc,
        )
    print("Bootstrap finished.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
