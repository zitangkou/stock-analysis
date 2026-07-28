from __future__ import annotations

"""Board-aware A-share limit-up helpers (no Eastmoney)."""


def board_of(code: str) -> str:
    c = (code or "").strip()
    if len(c) != 6 or not c.isdigit():
        return "main"
    if c.startswith(("300", "301")):
        return "chi_next"
    return "main"


def limit_up_threshold(code: str, name: str | None = None) -> float:
    """
    Return approximate limit-up % threshold for the board.
    ST/*ST: 5%; ChiNext 300/301: 20%; main 60/00: 10%.
    """
    nm = name or ""
    if "ST" in nm.upper() or "st" in nm:
        return 4.8
    if board_of(code) == "chi_next":
        return 19.5
    return 9.5


def is_limit_up(code: str, change_pct: float | None, name: str | None = None) -> bool:
    if change_pct is None:
        return False
    return float(change_pct) >= limit_up_threshold(code, name)
