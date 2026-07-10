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
    """Fetch A-share spot list via Eastmoney, filter to 60/00/30."""
    frames: list[pd.DataFrame] = []
    # Paginate eastmoney clist
    page = 1
    page_size = 100
    fields = "f12,f14,f2,f3,f4,f5,f6,f7,f8,f15,f16,f17,f18"
    # Combined SH+SZ A shares
    fs = "m:0+t:6,m:0+t:80,m:1+t:2"

    with httpx.Client(timeout=30.0, headers={"User-Agent": "stock-analysis-collector/0.1"}) as client:
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
            resp = client.get(EASTMONEY_SPOT_URL, params=params)
            resp.raise_for_status()
            data = resp.json().get("data") or {}
            diff = data.get("diff") or []
            if not diff:
                break
            frames.append(pd.DataFrame(diff))
            total = int(data.get("total") or 0)
            if page * page_size >= total:
                break
            page += 1
            time.sleep(0.2)

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    df = df.rename(
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
    Latest financial indicators for scoring.
    Uses akshare stock_financial_analysis_indicator_em style if available;
    falls back to stock_yjbb_em (业绩报表).
    """
    import akshare as ak

    # 业绩报表：含净利润、同比增长等
    try:
        df = ak.stock_yjbb_em(date=_guess_report_period())
    except Exception as exc:
        logger.warning("stock_yjbb_em failed (%s), trying alternate date", exc)
        df = ak.stock_yjbb_em(date="20241231")

    # Normalize common column names across akshare versions
    colmap = {}
    for c in df.columns:
        cl = str(c)
        if "代码" in cl:
            colmap[c] = "code"
        elif cl in ("名称", "股票简称"):
            colmap[c] = "name"
        elif "净资产收益率" in cl or cl == "ROE":
            colmap[c] = "roe"
        elif "净利润" == cl or cl.endswith("净利润"):
            if "同比" in cl:
                colmap[c] = "net_profit_yoy"
            elif "扣非" in cl:
                colmap[c] = "net_profit_deducted"
            else:
                colmap[c] = "net_profit"
        elif "营业总收入" in cl and "同比" in cl:
            colmap[c] = "revenue_yoy"
        elif "营业总收入" in cl:
            colmap[c] = "revenue"
        elif "公告日期" in cl:
            colmap[c] = "announce_date"
        elif "截止日期" in cl or "报告期" in cl:
            colmap[c] = "report_date"
    df = df.rename(columns=colmap)
    if "code" not in df.columns:
        raise RuntimeError(f"Unexpected yjbb columns: {list(df.columns)}")

    df["code"] = df["code"].map(normalize_code)
    df = df[df["code"].map(lambda c: board_of(c) is not None)].copy()
    for col in ["roe", "net_profit", "net_profit_yoy", "net_profit_deducted", "revenue", "revenue_yoy"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def _guess_report_period() -> str:
    """Pick a recent report period YYYYMMDD for yjbb."""
    today = datetime.now()
    y = today.year
    candidates = [
        f"{y - 1}1231",
        f"{y}0331",
        f"{y - 1}0930",
        f"{y - 1}0630",
    ]
    # Prefer last year annual as stable default
    return candidates[0]


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
