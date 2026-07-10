from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any

import httpx
import pandas as pd

from .codes import board_of, exchange_of, is_st_name, normalize_code

logger = logging.getLogger(__name__)

EASTMONEY_SPOT_URL = "https://push2.eastmoney.com/api/qt/clist/get"
# Market filters: SH A, SZ A (includes ChiNext)
# fs examples commonly used by eastmoney:
# m:1+t:2 = SH A, m:0+t:6 = SZ A main-ish, m:0+t:80 = ChiNext
# Using broader A-share list then filter locally is more reliable.


def fetch_a_share_spot() -> pd.DataFrame:
    """Fetch A-share spot list; Eastmoney first, akshare fallback."""
    try:
        df = _fetch_eastmoney_spot()
        if not df.empty:
            return df
        logger.warning("eastmoney spot empty, falling back to akshare")
    except Exception as exc:
        logger.warning("eastmoney spot failed (%s), falling back to akshare", exc)
    return _fetch_akshare_spot()


def _fetch_eastmoney_spot() -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    page = 1
    page_size = 100
    fields = "f12,f14,f2,f3,f4,f5,f6,f7,f8,f15,f16,f17,f18"
    fs = "m:0+t:6,m:0+t:80,m:1+t:2"
    last_exc: Exception | None = None

    with httpx.Client(
        timeout=30.0,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; stock-analysis-collector/0.1)",
            "Referer": "https://quote.eastmoney.com/",
        },
    ) as client:
        while True:
            params = {
                "pn": page,
                "pz": page_size,
                "po": 1,
                "np": 1,
                "fltt": 2,
                "invt": 2,
                "fid": "f12",
                "fs": fs,
                "fields": fields,
            }
            ok = False
            for attempt in range(3):
                try:
                    resp = client.get(EASTMONEY_SPOT_URL, params=params)
                    resp.raise_for_status()
                    data = resp.json().get("data") or {}
                    diff = data.get("diff") or []
                    ok = True
                    break
                except Exception as exc:
                    last_exc = exc
                    time.sleep(1.5 * (attempt + 1))
            if not ok:
                if frames:
                    logger.warning("eastmoney stopped at page %s (%s), using partial", page, last_exc)
                    break
                raise last_exc or RuntimeError("eastmoney spot failed")
            if not diff:
                break
            frames.append(pd.DataFrame(diff))
            total = int(data.get("total") or 0)
            if page * page_size >= total:
                break
            page += 1
            time.sleep(0.35)

    if not frames:
        return pd.DataFrame()
    return _normalize_spot_df(
        pd.concat(frames, ignore_index=True).rename(
            columns={
                "f12": "code",
                "f14": "name",
                "f2": "price",
                "f3": "change_pct",
                "f4": "change_amt",
                "f5": "volume",
                "f6": "amount",
                "f7": "amplitude",
                "f8": "turnover_rate",
                "f15": "high",
                "f16": "low",
                "f17": "open",
                "f18": "pre_close",
            }
        )
    )


def _fetch_akshare_spot() -> pd.DataFrame:
    import akshare as ak

    df = ak.stock_zh_a_spot_em()
    rename = {
        "代码": "code",
        "名称": "name",
        "最新价": "price",
        "涨跌幅": "change_pct",
        "涨跌额": "change_amt",
        "成交量": "volume",
        "成交额": "amount",
        "振幅": "amplitude",
        "换手率": "turnover_rate",
        "最高": "high",
        "最低": "low",
        "今开": "open",
        "昨收": "pre_close",
    }
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    return _normalize_spot_df(df)


def _normalize_spot_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "code" not in df.columns:
        return pd.DataFrame()
    df = df.copy()
    df["code"] = df["code"].map(normalize_code)
    df = df[df["code"].map(lambda c: board_of(c) is not None)].copy()
    for col in [
        "price",
        "change_pct",
        "change_amt",
        "volume",
        "amount",
        "amplitude",
        "turnover_rate",
        "high",
        "low",
        "open",
        "pre_close",
    ]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "name" not in df.columns:
        df["name"] = df["code"]
    df["exchange"] = df["code"].map(exchange_of)
    df["board"] = df["code"].map(board_of)
    df["is_st"] = df["name"].map(is_st_name)
    return df.drop_duplicates(subset=["code"], keep="first")

def fetch_instruments_akshare() -> pd.DataFrame:
    """Fallback / enrichment: stock list via akshare."""
    import akshare as ak

    df = ak.stock_info_a_code_name()
    # columns typically: code, name
    df = df.rename(columns={"code": "code", "name": "name"})
    df["code"] = df["code"].map(normalize_code)
    df = df[df["code"].map(lambda c: board_of(c) is not None)].copy()
    df["exchange"] = df["code"].map(exchange_of)
    df["board"] = df["code"].map(board_of)
    df["is_st"] = df["name"].map(is_st_name)
    return df


def fetch_financial_indicator_akshare() -> pd.DataFrame:
    """
    Latest financial indicators for scoring via stock_yjbb_em (业绩报表).
    Tries several report periods until one returns data.
    """
    import akshare as ak

    df = None
    last_exc: Exception | None = None
    for period in _report_period_candidates():
        try:
            logger.info("fetching yjbb for period %s", period)
            cand = ak.stock_yjbb_em(date=period)
            if cand is not None and len(cand) > 0:
                df = cand
                break
        except Exception as exc:
            last_exc = exc
            logger.warning("stock_yjbb_em(%s) failed: %s", period, exc)
    if df is None:
        raise RuntimeError(f"stock_yjbb_em failed for all periods: {last_exc}")

    logger.info("yjbb columns: %s", list(df.columns))
    series_map: dict[str, pd.Series] = {}

    def take(target: str, series: pd.Series) -> None:
        if target not in series_map:
            series_map[target] = series

    for c in df.columns:
        cl = str(c)
        s = df[c]
        if isinstance(s, pd.DataFrame):
            s = s.iloc[:, 0]
        if "代码" in cl:
            take("code", s)
        elif cl in ("名称", "股票简称") or cl.endswith("简称"):
            take("name", s)
        elif "净资产收益率" in cl or cl.upper() == "ROE":
            take("roe", s)
        elif "扣非" in cl and "净利润" in cl:
            take("net_profit_deducted", s)
        elif "净利润" in cl and "同比" in cl:
            take("net_profit_yoy", s)
        elif cl == "净利润" or cl.endswith("-净利润") or cl == "净利润-净利润":
            take("net_profit", s)
        elif "营业总收入" in cl and "同比" in cl:
            take("revenue_yoy", s)
        elif "营业总收入" in cl:
            take("revenue", s)
        elif "公告日期" in cl:
            take("announce_date", s)
        elif "截止日期" in cl or "报告期" in cl:
            take("report_date", s)

    if "code" not in series_map:
        raise RuntimeError(f"Unexpected yjbb columns: {list(df.columns)}")

    out = pd.DataFrame(series_map)
    out["code"] = out["code"].map(normalize_code)
    out = out[out["code"].map(lambda c: board_of(c) is not None)].copy()
    for col in ["roe", "net_profit", "net_profit_yoy", "net_profit_deducted", "revenue", "revenue_yoy"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def _report_period_candidates() -> list[str]:
    """Recent report periods YYYYMMDD for yjbb."""
    today = datetime.now()
    y, m = today.year, today.month
    periods = [
        f"{y - 1}1231",
        f"{y}0331",
        f"{y - 1}0930",
        f"{y - 1}0630",
        f"{y - 1}0331",
        "20241231",
        "20240930",
    ]
    # If past April, annual of last year is usually available; keep order above.
    if m >= 5:
        periods.insert(0, f"{y - 1}1231")
    # dedupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for p in periods:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def fetch_hist_bars_akshare(code: str, start: str, end: str) -> pd.DataFrame:
    """Daily bars. start/end: YYYYMMDD."""
    import akshare as ak

    df = ak.stock_zh_a_hist(
        symbol=code,
        period="daily",
        start_date=start,
        end_date=end,
        adjust="qfq",
    )
    rename = {
        "日期": "trade_date",
        "开盘": "open",
        "收盘": "close",
        "最高": "high",
        "最低": "low",
        "成交量": "volume",
        "成交额": "amount",
        "振幅": "amplitude",
        "涨跌幅": "change_pct",
        "涨跌额": "change_amt",
        "换手率": "turnover_rate",
    }
    df = df.rename(columns=rename)
    df["code"] = normalize_code(code)
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
    return df


def fetch_trade_calendar_akshare() -> list[dict[str, Any]]:
    import akshare as ak

    df = ak.tool_trade_date_hist_sina()
    # column: trade_date
    col = "trade_date" if "trade_date" in df.columns else df.columns[0]
    dates = pd.to_datetime(df[col]).dt.date.tolist()
    return [{"trade_date": d, "is_open": True} for d in dates]
