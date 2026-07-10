from __future__ import annotations

import re
from typing import Literal

Board = Literal["SH_MAIN", "SZ_MAIN", "CHINEXT"]


def normalize_code(code: str) -> str:
    code = str(code).strip()
    code = re.sub(r"\D", "", code)
    if len(code) > 6:
        code = code[-6:]
    return code.zfill(6)


def exchange_of(code: str) -> Literal["SH", "SZ"]:
    code = normalize_code(code)
    if code.startswith(("5", "6", "9")):
        return "SH"
    return "SZ"


def board_of(code: str) -> Board | None:
    """Return board if in scope (SH/SZ main + ChiNext), else None."""
    code = normalize_code(code)
    if code.startswith("60"):
        return "SH_MAIN"
    if code.startswith("00"):
        return "SZ_MAIN"
    if code.startswith("30"):
        return "CHINEXT"
    return None


def in_scope(code: str) -> bool:
    return board_of(code) is not None


def is_st_name(name: str) -> bool:
    n = (name or "").upper()
    return "ST" in n
