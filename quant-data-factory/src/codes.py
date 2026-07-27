from __future__ import annotations


def is_target_a_share(bs_code: str, include_star: bool = False) -> bool:
    """
    BaoStock codes like sh.600000 / sz.000001 / sz.300001 / sh.688001.
    V1: SH main 6xxxxx (excl 688 unless include_star), SZ main 00, ChiNext 30.
    """
    if not bs_code or "." not in bs_code:
        return False
    market, raw = bs_code.split(".", 1)
    if len(raw) != 6 or not raw.isdigit():
        return False
    if market == "sh":
        if raw.startswith("688"):
            return include_star
        return raw.startswith("60")
    if market == "sz":
        return raw.startswith("00") or raw.startswith("30")
    return False


def to_plain_code(bs_code: str) -> str:
    return bs_code.split(".", 1)[1]


def exchange_of(bs_code: str) -> str:
    return bs_code.split(".", 1)[0].upper()
