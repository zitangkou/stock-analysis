#!/usr/bin/env python3
"""
Build a plain_code → industry text map from AKShare yjbb Parquet dumps.
Does not call Eastmoney industry boards (cloud-safe).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--yjbb",
        type=Path,
        required=True,
        help="Path to yjbb_*.parquet from quant-data-factory extras",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=ROOT / "storage" / "parquet" / "meta" / "industry_map.json",
    )
    args = p.parse_args()

    df = pd.read_parquet(args.yjbb)
    # Common akshare yjbb column names
    code_col = None
    ind_col = None
    for c in df.columns:
        if c in ("股票代码", "code", "证券代码"):
            code_col = c
        if c in ("所处行业", "industry", "行业"):
            ind_col = c
    if not code_col or not ind_col:
        raise SystemExit(f"Cannot find code/industry columns in {list(df.columns)}")

    mapping = {}
    for _, r in df.iterrows():
        code = str(r[code_col]).zfill(6)[-6:]
        ind = str(r[ind_col]).strip() if pd.notna(r[ind_col]) else ""
        if code.isdigit() and ind:
            mapping[code] = ind

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(mapping, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(mapping)} industry mappings → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
