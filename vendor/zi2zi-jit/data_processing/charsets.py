from typing import FrozenSet

from .charsets_data import (
    GB2312_CODEPOINTS,
    BIG5_CODEPOINTS,
    JISX0208_CODEPOINTS,
    KSX1001_CODEPOINTS,
)


SUPPORTED_CHARSETS = frozenset([
    "gb2312",
    "gbk",
    "big5",
    "jisx0208",
    "ksx1001",
])


def get_charset_codepoints(charset_name: str) -> FrozenSet[int]:
    charset_lower = charset_name.lower()
    if charset_lower not in SUPPORTED_CHARSETS:
        raise ValueError(
            f"Unknown charset: {charset_name}. "
            f"Available: {', '.join(sorted(SUPPORTED_CHARSETS))}"
        )

    if charset_lower == "gb2312":
        return GB2312_CODEPOINTS
    if charset_lower == "gbk":
        # Keep behavior identical to font-data-dump preprocessing/consts.py.
        return GB2312_CODEPOINTS
    if charset_lower == "big5":
        return BIG5_CODEPOINTS
    if charset_lower == "jisx0208":
        return JISX0208_CODEPOINTS
    if charset_lower == "ksx1001":
        return KSX1001_CODEPOINTS

    raise ValueError(f"Unknown charset: {charset_name}")
