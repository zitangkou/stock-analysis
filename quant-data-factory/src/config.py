from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "config.env")


@dataclass(frozen=True)
class Settings:
    tz: str
    parquet_root: Path
    include_star: bool
    baostock_sleep: float
    akshare_sleep: float
    write_postgres: bool
    database_url: str | None

    @classmethod
    def from_env(cls) -> "Settings":
        root = Path(os.getenv("PARQUET_ROOT", str(ROOT / "storage" / "parquet")))
        return cls(
            tz=os.getenv("TZ", "Asia/Shanghai"),
            parquet_root=root,
            include_star=os.getenv("INCLUDE_STAR", "0").strip() in ("1", "true", "TRUE", "yes"),
            baostock_sleep=float(os.getenv("BAOSTOCK_SLEEP", "0.05")),
            akshare_sleep=float(os.getenv("AKSHARE_SLEEP", "0.4")),
            write_postgres=os.getenv("WRITE_POSTGRES", "0").strip() in ("1", "true", "TRUE", "yes"),
            database_url=os.getenv("DATABASE_URL", "").strip() or None,
        )


def get_settings() -> Settings:
    return Settings.from_env()
