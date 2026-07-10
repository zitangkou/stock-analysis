from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from ..db import fetch_all, finish_job, get_conn, start_job

logger = logging.getLogger(__name__)
CN_TZ = ZoneInfo("Asia/Shanghai")

THEME_IDS = (
    "semiconductor",
    "ai",
    "nev",
    "biotech",
    "liquor",
    "military",
    "finance",
    "metals",
    "realestate",
    "greenenergy",
)


def run(retention_days: int = 14, evaluate_alerts: bool = True) -> int:
    """
    Persist stock/sector heat scores from quotes_latest + theme mapping.

    Formula (V1):
      stock = 0.35*change_pctile + 0.25*amount_pctile
            + 0.20*turnover_pctile + 0.20*|change|_momentum_proxy
      sector = amount-weighted stock heat + up-ratio boost
    """
    job_id = start_job("compute_heat")
    try:
        rules = _load_rules()
        rows = fetch_all(
            """
            SELECT
              i.code,
              i.name,
              i.theme_id,
              i.industry,
              q.change_pct,
              q.amount,
              q.turnover_rate,
              q.price
            FROM universe_members um
            JOIN instruments i ON i.code = um.code
            LEFT JOIN quotes_latest q ON q.code = um.code
            WHERE um.effective_to IS NULL
              AND i.board IN ('SH_MAIN', 'SZ_MAIN', 'CHINEXT')
              AND i.theme_id IS NOT NULL
            """
        )
        if not rows:
            finish_job(job_id, "partial", message="no themed universe quotes")
            return 0

        prev_stock = {
            r["code"]: r
            for r in fetch_all(
                "SELECT code, heat, momentum FROM heat_score_stock_latest"
            )
        }
        prev_sector = {
            r["theme_id"]: r
            for r in fetch_all(
                "SELECT theme_id, heat, momentum FROM heat_score_sector_latest"
            )
        }

        changes = [_f(r["change_pct"]) for r in rows]
        amounts = [_f(r["amount"]) for r in rows]
        turnovers = [_f(r["turnover_rate"]) for r in rows]
        change_abs = [abs(c) if c is not None else 0.0 for c in changes]

        change_pctile = _pctiles(changes)
        amount_pctile = _pctiles(amounts)
        turnover_pctile = _pctiles(turnovers)
        mom_pctile = _pctiles(change_abs)

        now = datetime.now(timezone.utc)
        stock_scores: list[dict[str, Any]] = []
        for i, r in enumerate(rows):
            ch = changes[i] if changes[i] is not None else 0.0
            amt = amounts[i] if amounts[i] is not None else 0.0
            to = turnovers[i] if turnovers[i] is not None else 0.0
            heat = (
                rules["w_change"] * change_pctile[i] * 100
                + rules["w_amount"] * amount_pctile[i] * 100
                + rules["w_turnover"] * turnover_pctile[i] * 100
                + rules["w_momentum"] * mom_pctile[i] * 100
            )
            heat = max(5.0, min(100.0, heat))
            prev = prev_stock.get(r["code"])
            prev_heat = float(prev["heat"]) if prev else heat
            momentum = heat - prev_heat
            prev_mom = float(prev["momentum"]) if prev else 0.0
            acceleration = momentum - prev_mom
            # Proxy net inflow: signed amount * change intensity (NOT real money flow)
            net_proxy = amt * (ch / 100.0) if amt else 0.0
            is_limit = ch >= 9.5
            stock_scores.append(
                {
                    "ts": now,
                    "code": r["code"],
                    "name": r["name"],
                    "theme_id": r["theme_id"],
                    "heat": round(heat, 2),
                    "momentum": round(momentum, 2),
                    "acceleration": round(acceleration, 2),
                    "change_pct": ch,
                    "amount": amt,
                    "turnover_rate": to,
                    "net_inflow_proxy": round(net_proxy, 2),
                    "is_limit_up_approx": is_limit,
                    "data_quality": "proxy",
                    "components": {
                        "change_pctile": round(change_pctile[i], 4),
                        "amount_pctile": round(amount_pctile[i], 4),
                        "turnover_pctile": round(turnover_pctile[i], 4),
                        "momentum_pctile": round(mom_pctile[i], 4),
                        "weights": rules,
                    },
                }
            )

        sector_scores = _aggregate_sectors(stock_scores, prev_sector, now)

        written = _persist(stock_scores, sector_scores, now)
        _write_rotation_slots(sector_scores, now)
        if evaluate_alerts:
            _evaluate_alerts(stock_scores, sector_scores)
        _trim_history(retention_days)

        finish_job(
            job_id,
            "success",
            rows_affected=written,
            message=f"stocks={len(stock_scores)} sectors={len(sector_scores)}",
        )
        logger.info(
            "compute-heat done stocks=%s sectors=%s written=%s",
            len(stock_scores),
            len(sector_scores),
            written,
        )
        return written
    except Exception as exc:
        finish_job(job_id, "failed", message=str(exc))
        raise


def _load_rules() -> dict[str, float]:
    rows = fetch_all(
        """
        SELECT w_change, w_amount, w_turnover, w_momentum
        FROM heat_rules WHERE name = 'default' LIMIT 1
        """
    )
    if not rows:
        return {
            "w_change": 0.35,
            "w_amount": 0.25,
            "w_turnover": 0.20,
            "w_momentum": 0.20,
        }
    r = rows[0]
    return {
        "w_change": float(r["w_change"]),
        "w_amount": float(r["w_amount"]),
        "w_turnover": float(r["w_turnover"]),
        "w_momentum": float(r["w_momentum"]),
    }


def _f(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _pctiles(values: list[float | None]) -> list[float]:
    """Rank percentile in [0,1]; None treated as 0 for ranking base."""
    cleaned = [v if v is not None else 0.0 for v in values]
    n = len(cleaned)
    if n == 0:
        return []
    order = sorted(range(n), key=lambda i: cleaned[i])
    ranks = [0.0] * n
    for rank, idx in enumerate(order):
        ranks[idx] = rank / max(n - 1, 1)
    return ranks


def _aggregate_sectors(
    stocks: list[dict[str, Any]],
    prev_sector: dict[str, Any],
    now: datetime,
) -> list[dict[str, Any]]:
    by_theme: dict[str, list[dict[str, Any]]] = {t: [] for t in THEME_IDS}
    for s in stocks:
        tid = s.get("theme_id")
        if tid in by_theme:
            by_theme[tid].append(s)

    out: list[dict[str, Any]] = []
    for theme_id, members in by_theme.items():
        if not members:
            continue
        amt_sum = sum(float(m["amount"] or 0) for m in members)
        if amt_sum > 0:
            heat = sum(float(m["heat"]) * float(m["amount"] or 0) for m in members) / amt_sum
        else:
            heat = sum(float(m["heat"]) for m in members) / len(members)
        up = sum(1 for m in members if (m["change_pct"] or 0) > 0)
        down = sum(1 for m in members if (m["change_pct"] or 0) < 0)
        up_ratio = up / len(members)
        heat = max(5.0, min(100.0, heat + (up_ratio - 0.5) * 10))
        ch = sum(float(m["change_pct"] or 0) for m in members) / len(members)
        net_proxy = sum(float(m["net_inflow_proxy"] or 0) for m in members)
        prev = prev_sector.get(theme_id)
        prev_heat = float(prev["heat"]) if prev else heat
        momentum = heat - prev_heat
        prev_mom = float(prev["momentum"]) if prev else 0.0
        acceleration = momentum - prev_mom
        out.append(
            {
                "ts": now,
                "theme_id": theme_id,
                "heat": round(heat, 2),
                "momentum": round(momentum, 2),
                "acceleration": round(acceleration, 2),
                "change_pct": round(ch, 4),
                "amount_sum": round(amt_sum, 2),
                "up_count": up,
                "down_count": down,
                "stock_count": len(members),
                "net_inflow_proxy": round(net_proxy, 2),
                "data_quality": "proxy",
                "components": {
                    "up_ratio": round(up_ratio, 4),
                    "method": "amount_weighted_heat_plus_up_ratio",
                },
            }
        )
    return out


def _persist(
    stocks: list[dict[str, Any]],
    sectors: list[dict[str, Any]],
    now: datetime,
) -> int:
    written = 0
    with get_conn() as conn:
        for s in stocks:
            conn.execute(
                """
                INSERT INTO heat_score_stock (
                  ts, code, theme_id, heat, momentum, acceleration,
                  change_pct, amount, turnover_rate, net_inflow_proxy,
                  is_limit_up_approx, data_quality, components
                ) VALUES (
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
                )
                ON CONFLICT (ts, code) DO UPDATE SET
                  heat = EXCLUDED.heat,
                  momentum = EXCLUDED.momentum,
                  acceleration = EXCLUDED.acceleration,
                  change_pct = EXCLUDED.change_pct,
                  amount = EXCLUDED.amount,
                  turnover_rate = EXCLUDED.turnover_rate,
                  net_inflow_proxy = EXCLUDED.net_inflow_proxy,
                  is_limit_up_approx = EXCLUDED.is_limit_up_approx,
                  data_quality = EXCLUDED.data_quality,
                  components = EXCLUDED.components,
                  theme_id = EXCLUDED.theme_id
                """,
                (
                    s["ts"],
                    s["code"],
                    s["theme_id"],
                    s["heat"],
                    s["momentum"],
                    s["acceleration"],
                    s["change_pct"],
                    s["amount"],
                    s["turnover_rate"],
                    s["net_inflow_proxy"],
                    s["is_limit_up_approx"],
                    s["data_quality"],
                    json.dumps(s["components"], ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                INSERT INTO heat_score_stock_latest (
                  code, ts, theme_id, heat, momentum, acceleration,
                  change_pct, amount, turnover_rate, net_inflow_proxy,
                  is_limit_up_approx, data_quality, components
                ) VALUES (
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
                )
                ON CONFLICT (code) DO UPDATE SET
                  ts = EXCLUDED.ts,
                  theme_id = EXCLUDED.theme_id,
                  heat = EXCLUDED.heat,
                  momentum = EXCLUDED.momentum,
                  acceleration = EXCLUDED.acceleration,
                  change_pct = EXCLUDED.change_pct,
                  amount = EXCLUDED.amount,
                  turnover_rate = EXCLUDED.turnover_rate,
                  net_inflow_proxy = EXCLUDED.net_inflow_proxy,
                  is_limit_up_approx = EXCLUDED.is_limit_up_approx,
                  data_quality = EXCLUDED.data_quality,
                  components = EXCLUDED.components
                """,
                (
                    s["code"],
                    s["ts"],
                    s["theme_id"],
                    s["heat"],
                    s["momentum"],
                    s["acceleration"],
                    s["change_pct"],
                    s["amount"],
                    s["turnover_rate"],
                    s["net_inflow_proxy"],
                    s["is_limit_up_approx"],
                    s["data_quality"],
                    json.dumps(s["components"], ensure_ascii=False),
                ),
            )
            written += 1

        for sec in sectors:
            conn.execute(
                """
                INSERT INTO heat_score_sector (
                  ts, theme_id, heat, momentum, acceleration, change_pct,
                  amount_sum, up_count, down_count, stock_count,
                  net_inflow_proxy, data_quality, components
                ) VALUES (
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
                )
                ON CONFLICT (ts, theme_id) DO UPDATE SET
                  heat = EXCLUDED.heat,
                  momentum = EXCLUDED.momentum,
                  acceleration = EXCLUDED.acceleration,
                  change_pct = EXCLUDED.change_pct,
                  amount_sum = EXCLUDED.amount_sum,
                  up_count = EXCLUDED.up_count,
                  down_count = EXCLUDED.down_count,
                  stock_count = EXCLUDED.stock_count,
                  net_inflow_proxy = EXCLUDED.net_inflow_proxy,
                  data_quality = EXCLUDED.data_quality,
                  components = EXCLUDED.components
                """,
                (
                    sec["ts"],
                    sec["theme_id"],
                    sec["heat"],
                    sec["momentum"],
                    sec["acceleration"],
                    sec["change_pct"],
                    sec["amount_sum"],
                    sec["up_count"],
                    sec["down_count"],
                    sec["stock_count"],
                    sec["net_inflow_proxy"],
                    sec["data_quality"],
                    json.dumps(sec["components"], ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                INSERT INTO heat_score_sector_latest (
                  theme_id, ts, heat, momentum, acceleration, change_pct,
                  amount_sum, up_count, down_count, stock_count,
                  net_inflow_proxy, data_quality, components
                ) VALUES (
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
                )
                ON CONFLICT (theme_id) DO UPDATE SET
                  ts = EXCLUDED.ts,
                  heat = EXCLUDED.heat,
                  momentum = EXCLUDED.momentum,
                  acceleration = EXCLUDED.acceleration,
                  change_pct = EXCLUDED.change_pct,
                  amount_sum = EXCLUDED.amount_sum,
                  up_count = EXCLUDED.up_count,
                  down_count = EXCLUDED.down_count,
                  stock_count = EXCLUDED.stock_count,
                  net_inflow_proxy = EXCLUDED.net_inflow_proxy,
                  data_quality = EXCLUDED.data_quality,
                  components = EXCLUDED.components
                """,
                (
                    sec["theme_id"],
                    sec["ts"],
                    sec["heat"],
                    sec["momentum"],
                    sec["acceleration"],
                    sec["change_pct"],
                    sec["amount_sum"],
                    sec["up_count"],
                    sec["down_count"],
                    sec["stock_count"],
                    sec["net_inflow_proxy"],
                    sec["data_quality"],
                    json.dumps(sec["components"], ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                INSERT INTO sector_quote_snapshot (
                  ts, theme_id, change_pct, amount_sum, up_count, down_count, stock_count
                ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (ts, theme_id) DO UPDATE SET
                  change_pct = EXCLUDED.change_pct,
                  amount_sum = EXCLUDED.amount_sum,
                  up_count = EXCLUDED.up_count,
                  down_count = EXCLUDED.down_count,
                  stock_count = EXCLUDED.stock_count
                """,
                (
                    sec["ts"],
                    sec["theme_id"],
                    sec["change_pct"],
                    sec["amount_sum"],
                    sec["up_count"],
                    sec["down_count"],
                    sec["stock_count"],
                ),
            )
            written += 1
    return written


def _slot_30m(now: datetime) -> tuple[Any, int]:
    local = now.astimezone(CN_TZ)
    trade_date = local.date()
    minutes = local.hour * 60 + local.minute
    # Trading session slots from 09:30; pre/post map to nearest
    base = 9 * 60 + 30
    if minutes < base:
        slot = 0
    else:
        slot = (minutes - base) // 30
    slot = max(0, min(15, slot))  # cap afternoon
    return trade_date, slot


def _write_rotation_slots(sectors: list[dict[str, Any]], now: datetime) -> None:
    if not sectors:
        return
    trade_date, slot = _slot_30m(now)
    ranked = sorted(sectors, key=lambda s: s["heat"], reverse=True)
    with get_conn() as conn:
        for rank, sec in enumerate(ranked, start=1):
            conn.execute(
                """
                INSERT INTO rotation_matrix (
                  trade_date, slot_30m, theme_id, rank, heat, change_pct, momentum
                ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (trade_date, slot_30m, theme_id) DO UPDATE SET
                  rank = EXCLUDED.rank,
                  heat = EXCLUDED.heat,
                  change_pct = EXCLUDED.change_pct,
                  momentum = EXCLUDED.momentum
                """,
                (
                    trade_date,
                    slot,
                    sec["theme_id"],
                    rank,
                    sec["heat"],
                    sec["change_pct"],
                    sec["momentum"],
                ),
            )


def _evaluate_alerts(
    stocks: list[dict[str, Any]],
    sectors: list[dict[str, Any]],
) -> None:
    rules = fetch_all("SELECT * FROM alert_rule WHERE enabled = TRUE")
    if not rules:
        return
    with get_conn() as conn:
        for rule in rules:
            params = rule["params"] or {}
            if isinstance(params, str):
                params = json.loads(params)
            rtype = rule["rule_type"]
            if rtype == "sector_heat_surge":
                min_heat = float(params.get("min_heat", 75))
                min_mom = float(params.get("min_momentum", 8))
                for sec in sectors:
                    if sec["heat"] >= min_heat and sec["momentum"] >= min_mom:
                        conn.execute(
                            """
                            INSERT INTO alert_record (
                              rule_id, alert_type, target, target_name, message,
                              trigger_value, threshold, priority, payload
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                            """,
                            (
                                rule["id"],
                                rtype,
                                sec["theme_id"],
                                sec["theme_id"],
                                f"题材 {sec['theme_id']} 热力 {sec['heat']} 动量 {sec['momentum']}",
                                sec["heat"],
                                min_heat,
                                "high" if sec["heat"] >= 90 else "medium",
                                json.dumps(sec, default=str),
                            ),
                        )
            elif rtype == "stock_heat_surge":
                min_heat = float(params.get("min_heat", 85))
                min_mom = float(params.get("min_momentum", 10))
                for s in stocks:
                    if s["heat"] >= min_heat and s["momentum"] >= min_mom:
                        conn.execute(
                            """
                            INSERT INTO alert_record (
                              rule_id, alert_type, target, target_name, message,
                              trigger_value, threshold, priority, payload
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                            """,
                            (
                                rule["id"],
                                rtype,
                                s["code"],
                                s.get("name"),
                                f"{s.get('name')}({s['code']}) 热力 {s['heat']} 动量 {s['momentum']}",
                                s["heat"],
                                min_heat,
                                "high" if s["heat"] >= 95 else "medium",
                                json.dumps(
                                    {k: v for k, v in s.items() if k != "components"},
                                    default=str,
                                ),
                            ),
                        )
            elif rtype == "limit_up_approx":
                min_ch = float(params.get("min_change_pct", 9.5))
                for s in stocks:
                    if (s["change_pct"] or 0) >= min_ch:
                        conn.execute(
                            """
                            INSERT INTO alert_record (
                              rule_id, alert_type, target, target_name, message,
                              trigger_value, threshold, priority, payload
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                            """,
                            (
                                rule["id"],
                                rtype,
                                s["code"],
                                s.get("name"),
                                f"{s.get('name')}({s['code']}) 涨幅 {s['change_pct']}%（近似涨停，非正式涨停池）",
                                s["change_pct"],
                                min_ch,
                                "medium",
                                json.dumps(
                                    {
                                        "code": s["code"],
                                        "change_pct": s["change_pct"],
                                        "data_quality": "proxy",
                                    }
                                ),
                            ),
                        )


def _trim_history(retention_days: int) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    with get_conn() as conn:
        conn.execute("DELETE FROM heat_score_stock WHERE ts < %s", (cutoff,))
        conn.execute("DELETE FROM heat_score_sector WHERE ts < %s", (cutoff,))
        conn.execute("DELETE FROM sector_quote_snapshot WHERE ts < %s", (cutoff,))
        conn.execute(
            "DELETE FROM alert_record WHERE ts < %s",
            (datetime.now(timezone.utc) - timedelta(days=30),),
        )
        conn.execute(
            "DELETE FROM rotation_matrix WHERE trade_date < %s",
            ((datetime.now(CN_TZ).date() - timedelta(days=retention_days)),),
        )
