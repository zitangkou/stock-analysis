from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
# Load collector/.env then project .env.local if present
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env.local")


@dataclass(frozen=True)
class Settings:
    database_url: str
    universe_size: int
    weight_roe: float
    weight_net_profit: float
    weight_net_profit_yoy: float
    weight_liquidity: float
    min_list_days: int
    min_avg_amount_20d: float
    quote_interval_sec: int
    snapshot_retention_days: int
    quote_batch_size: int
    quote_batch_sleep: float
    bars_sleep_sec: float
    tz: str

    @classmethod
    def from_env(cls) -> "Settings":
        url = os.getenv("DATABASE_URL", "").strip()
        if not url:
            raise RuntimeError(
                "DATABASE_URL is required. Copy collector/config.example.env to collector/.env"
            )
        return cls(
            database_url=url,
            universe_size=int(os.getenv("UNIVERSE_SIZE", "2000")),
            weight_roe=float(os.getenv("WEIGHT_ROE", "0.35")),
            weight_net_profit=float(os.getenv("WEIGHT_NET_PROFIT", "0.25")),
            weight_net_profit_yoy=float(os.getenv("WEIGHT_NET_PROFIT_YOY", "0.25")),
            weight_liquidity=float(os.getenv("WEIGHT_LIQUIDITY", "0.15")),
            min_list_days=int(os.getenv("MIN_LIST_DAYS", "120")),
            min_avg_amount_20d=float(os.getenv("MIN_AVG_AMOUNT_20D", "20000000")),
            quote_interval_sec=int(os.getenv("QUOTE_INTERVAL_SEC", "180")),
            snapshot_retention_days=int(os.getenv("SNAPSHOT_RETENTION_DAYS", "40")),
            quote_batch_size=int(os.getenv("QUOTE_BATCH_SIZE", "100")),
            quote_batch_sleep=float(os.getenv("QUOTE_BATCH_SLEEP", "0.8")),
            bars_sleep_sec=float(os.getenv("BARS_SLEEP_SEC", "2.0")),
            tz=os.getenv("TZ", "Asia/Shanghai"),
        )


def get_settings() -> Settings:
    return Settings.from_env()
