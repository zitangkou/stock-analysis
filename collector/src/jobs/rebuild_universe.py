from __future__ import annotations

import json
import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd

from ..calendar_util import today_cn
from ..config import get_settings
from ..db import fetch_all, fetch_one, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)


def run(apply: bool = True) -> dict:
    """
    Rebuild quality universe (~2000).
    Score = w_roe*rank(ROE) + w_np*rank(net_profit) + w_yoy*rank(yoy) + w_liq*rank(liquidity)
    """
    settings = get_settings()
    job_id = start_job("rebuild_universe")
    try:
        rule = _ensure_rule(settings)
        rule_id = int(rule["id"])

        overrides = {
            r["code"]: r["action"]
            for r in fetch_all("SELECT code, action FROM universe_overrides")
        }
        force_in = {c for c, a in overrides.items() if a == "force_in"}
        force_out = {c for c, a in overrides.items() if a == "force_out"}

        instruments = fetch_all(
            """
            SELECT code, name, board, list_date, status, is_st
            FROM instruments
            WHERE board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
              AND COALESCE(is_st, FALSE) = FALSE
              AND status IN ('active', 'other')
            """
        )
        if not instruments:
            raise RuntimeError("No instruments. Run sync-instruments first.")

        fund = fetch_all(
            """
            SELECT DISTINCT ON (code)
                code, report_date, roe, net_profit, net_profit_yoy
            FROM fundamentals_period
            ORDER BY code, report_date DESC
            """
        )
        fund_map = {r["code"]: r for r in fund}

        liq = fetch_all(
            """
            SELECT code, AVG(amount) AS avg_amount_20d
            FROM (
                SELECT code, amount, trade_date,
                       ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
                FROM bars_1d
                WHERE amount IS NOT NULL
            ) t
            WHERE rn <= 20
            GROUP BY code
            """
        )
        liq_map = {r["code"]: float(r["avg_amount_20d"] or 0) for r in liq}

        # Spot amount fallback when bars not ready
        spot_amt = {
            r["code"]: float(r["amount"] or 0)
            for r in fetch_all("SELECT code, amount FROM quotes_latest")
        }

        today = today_cn()
        rows = []
        for inst in instruments:
            code = inst["code"]
            if code in force_out:
                continue
            list_date = inst.get("list_date")
            if list_date and (today - list_date).days < settings.min_list_days:
                if code not in force_in:
                    continue

            f = fund_map.get(code) or {}
            roe = _f(f.get("roe"))
            net_profit = _f(f.get("net_profit"))
            yoy = _f(f.get("net_profit_yoy"))
            avg_amt = liq_map.get(code) or spot_amt.get(code) or 0.0

            # Soften liquidity gate: only enforce when we have bar history OR spot amount
            if code not in force_in and liq_map and avg_amt < settings.min_avg_amount_20d:
                continue
            if (
                code not in force_in
                and not liq_map
                and spot_amt
                and avg_amt < settings.min_avg_amount_20d
            ):
                continue

            # Require some fundamental signal unless force_in
            if code not in force_in and roe is None and net_profit is None:
                continue

            rows.append(
                {
                    "code": code,
                    "roe": roe,
                    "net_profit": net_profit,
                    "net_profit_yoy": yoy,
                    "liquidity": avg_amt,
                    "force_in": code in force_in,
                }
            )

        if not rows:
            raise RuntimeError(
                "No candidates after filters. Sync fundamentals (and preferably bars) first."
            )

        df = pd.DataFrame(rows)
        for col in ["roe", "net_profit", "net_profit_yoy", "liquidity"]:
            df[f"rank_{col}"] = df[col].rank(method="average", ascending=True, pct=True)
            df[f"rank_{col}"] = df[f"rank_{col}"].fillna(0.0)

        df["score"] = (
            settings.weight_roe * df["rank_roe"]
            + settings.weight_net_profit * df["rank_net_profit"]
            + settings.weight_net_profit_yoy * df["rank_net_profit_yoy"]
            + settings.weight_liquidity * df["rank_liquidity"]
        )
        # Force-in always kept
        force_df = df[df["force_in"]].copy()
        normal_df = df[~df["force_in"]].sort_values("score", ascending=False)
        remain = max(settings.universe_size - len(force_df), 0)
        selected = pd.concat([force_df, normal_df.head(remain)], ignore_index=True)
        selected = selected.drop_duplicates(subset=["code"]).sort_values("score", ascending=False)

        codes = selected["code"].tolist()
        result = {
            "rule_id": rule_id,
            "candidate_count": len(df),
            "selected_count": len(codes),
            "force_in": len(force_in),
            "force_out": len(force_out),
            "top10": codes[:10],
        }

        if apply:
            _apply_members(rule_id, selected, today)
            with get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO universe_snapshots (rule_id, snapshot_date, member_count, codes)
                    VALUES (%s, %s, %s, %s::jsonb)
                    ON CONFLICT (rule_id, snapshot_date) DO UPDATE SET
                        member_count = EXCLUDED.member_count,
                        codes = EXCLUDED.codes,
                        created_at = NOW()
                    """,
                    (rule_id, today, len(codes), json.dumps(codes)),
                )

        finish_job(
            job_id,
            "success",
            rows_affected=len(codes),
            message=f"universe size={len(codes)}",
            detail=result,
        )
        logger.info("rebuild universe done: %s", result)
        return result
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def _ensure_rule(settings) -> dict:
    existing = fetch_one("SELECT * FROM universe_rules WHERE is_active = TRUE ORDER BY id LIMIT 1")
    with get_conn() as conn:
        if existing:
            conn.execute(
                """
                UPDATE universe_rules SET
                    universe_size = %s,
                    weight_roe = %s,
                    weight_net_profit = %s,
                    weight_net_profit_yoy = %s,
                    weight_liquidity = %s,
                    min_list_days = %s,
                    min_avg_amount_20d = %s
                WHERE id = %s
                """,
                (
                    settings.universe_size,
                    settings.weight_roe,
                    settings.weight_net_profit,
                    settings.weight_net_profit_yoy,
                    settings.weight_liquidity,
                    settings.min_list_days,
                    settings.min_avg_amount_20d,
                    existing["id"],
                ),
            )
            return fetch_one("SELECT * FROM universe_rules WHERE id = %s", (existing["id"],))  # type: ignore
        conn.execute(
            """
            INSERT INTO universe_rules (
                name, universe_size, weight_roe, weight_net_profit,
                weight_net_profit_yoy, weight_liquidity, min_list_days, min_avg_amount_20d
            ) VALUES (
                'default_quality_v1', %s, %s, %s, %s, %s, %s, %s
            )
            """,
            (
                settings.universe_size,
                settings.weight_roe,
                settings.weight_net_profit,
                settings.weight_net_profit_yoy,
                settings.weight_liquidity,
                settings.min_list_days,
                settings.min_avg_amount_20d,
            ),
        )
    return fetch_one("SELECT * FROM universe_rules WHERE is_active = TRUE ORDER BY id LIMIT 1")  # type: ignore


def _apply_members(rule_id: int, selected: pd.DataFrame, today: date) -> None:
    new_codes = set(selected["code"].tolist())
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT code FROM universe_members
            WHERE rule_id = %s AND effective_to IS NULL
            """,
            (rule_id,),
        )
        current = list(cur.fetchall())
        for row in current:
            if row["code"] not in new_codes:
                conn.execute(
                    """
                    UPDATE universe_members
                    SET effective_to = %s
                    WHERE rule_id = %s AND code = %s AND effective_to IS NULL
                    """,
                    (today - timedelta(days=1), rule_id, row["code"]),
                )

        for _, r in selected.iterrows():
            conn.execute(
                """
                INSERT INTO universe_members (
                    code, rule_id, score, score_roe, score_net_profit,
                    score_net_profit_yoy, score_liquidity, reason, effective_from, effective_to
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL
                )
                ON CONFLICT (code, rule_id, effective_from) DO UPDATE SET
                    score = EXCLUDED.score,
                    score_roe = EXCLUDED.score_roe,
                    score_net_profit = EXCLUDED.score_net_profit,
                    score_net_profit_yoy = EXCLUDED.score_net_profit_yoy,
                    score_liquidity = EXCLUDED.score_liquidity,
                    reason = EXCLUDED.reason,
                    effective_to = NULL
                """,
                (
                    r["code"],
                    rule_id,
                    float(r["score"]),
                    float(r["rank_roe"]),
                    float(r["rank_net_profit"]),
                    float(r["rank_net_profit_yoy"]),
                    float(r["rank_liquidity"]),
                    "force_in" if bool(r["force_in"]) else "score_rank",
                    today,
                ),
            )


def _f(v):
    if v is None:
        return None
    try:
        x = float(v)
        if np.isnan(x):
            return None
        return x
    except Exception:
        return None
