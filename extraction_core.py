"""PDF table extraction utility with a PyQt6 user interface."""

from __future__ import annotations

import sys
from dataclasses import dataclass
import logging
from pathlib import Path
import re
import shutil
from typing import Any, Dict, Iterable, List, Optional, Set

import pandas as pd

import pdfplumber
from openpyxl import load_workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover - optional dependency
    fitz = None

# Silence noisy pdfminer色彩解析警告 (灰階設定遇到非數值會噴 log)。
for _logger_name in (
    "pdfminer",
    "pdfminer.layout",
    "pdfminer.pdfinterp",
    "pdfminer.pdfcolor",
):
    logging.getLogger(_logger_name).setLevel(logging.ERROR)


ELECTRICAL_SECTION_LABELS = (
    "DC Electrical Characteristics",
    "AC Electrical Characteristics",
    "Operating Ranges",
)

DUMMY_SECTION_LABELS = (
    "Dummy Clocks and Wrap Length Configurations",
    "SPI/QPI Dummy Clocks",
    "DTR/QPI DTR Dummy Clocks",
)

ALL_SECTION_LABELS = ELECTRICAL_SECTION_LABELS + DUMMY_SECTION_LABELS
COMPARISON_SECTION_LABELS = ELECTRICAL_SECTION_LABELS

HEADER_TOKENS = {"DESCRIPTION", "PARAMETER"}
STRIKETHROUGH_CHARS = {"\u0335", "\u0336", "\u0337", "\u0338"}
SECTION_HEADER_OVERRIDES: Dict[str, Set[str]] = {
    # ponytail: anchor on "ADDRESS MODE" (clean ASCII, always present) instead of
    # "P6 - P4" alone. The PDF renders the en-dash there with a broken glyph
    # ("P6 \ufffd V P4"), and anchoring on it truncated away the real column
    # headers (Fast Read / Burst Read / Fast Read Quad I/O) above it.
    label: {token.upper() for token in ("P6 - P4", "P6 – P4", "ADDRESS MODE")}
    for label in DUMMY_SECTION_LABELS
}
SECTION_HEADER_OVERRIDES["AC Electrical Characteristics"] = {
    token.upper() for token in ("DESCRIPTION", "PARAMETER", "ADDRESS MODE")
}
CUSTOM_PAGE_HEADER_TOKENS = (
    HEADER_TOKENS
    | {"ADDRESS MODE"}
    | set().union(*SECTION_HEADER_OVERRIDES.values())
)

SECTION_KEYWORDS: Dict[str, tuple[str, ...]] = {
    label: (label,) for label in ALL_SECTION_LABELS
}
SECTION_KEYWORDS.update(
    {
        # "Program and Erase Time" pages don't repeat "DC Electrical Characteristics"
        # in their text, so they fall outside the carry window. Anchor them explicitly.
        "DC Electrical Characteristics": (
            "dc electrical characteristics",
            "program and erase time",
        ),
        "Dummy Clocks and Wrap Length Configurations": (
            "dummy clocks and wrap length configurations",
            "dummy clocks & wrap length configurations",
        ),
        "SPI/QPI Dummy Clocks": (
            "spi/qpi dummy clocks",
            "spi dummy clocks",
            "qpi dummy clocks",
        ),
        "DTR/QPI DTR Dummy Clocks": (
            "dtr/qpi dtr dummy clocks",
            "dtr dummy clocks",
            "qpi dtr dummy clocks",
        ),
    }
)

PDF_TABLE_SETTINGS: Dict[str, Any] = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
    "snap_tolerance": 3,
    "join_tolerance": 3,
    "intersection_tolerance": 3,
    "edge_min_length": 3,
    "text_x_tolerance": 3,
    "text_y_tolerance": 3,
}

DIFF_FILL = PatternFill(start_color="FFFF99", end_color="FFFF99", fill_type="solid")
TEXT_FILL = PatternFill(start_color="FF2E75B6", end_color="FF2E75B6", fill_type="solid")
INVALID_SHEET_CHARS = set("\\/*?:[]")

SWISS_MINIMAL_STYLESHEET = """
QMainWindow, QWidget {
    background: #F7F8FA;
    color: #1A1F2B;
    font-family: "Segoe UI", "Noto Sans TC", "Microsoft JhengHei";
}
QGroupBox {
    border: 1px solid #D8DDE6;
    border-radius: 2px;
    margin-top: 10px;
    padding: 14px 12px 12px 12px;
    font-weight: 600;
    background: #FFFFFF;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 4px;
    color: #394458;
}
QLineEdit, QPlainTextEdit, QTextEdit {
    background: #FFFFFF;
    border: 1px solid #C9D0DD;
    border-radius: 2px;
    padding: 7px 9px;
    selection-background-color: #1C5D99;
}
QLineEdit:focus, QPlainTextEdit:focus, QTextEdit:focus {
    border: 2px solid #1C5D99;
}
QPushButton {
    background: #FFFFFF;
    border: 1px solid #C9D0DD;
    border-radius: 2px;
    padding: 8px 12px;
    min-height: 36px;
    font-weight: 600;
}
QPushButton:hover {
    background: #EFF2F7;
}
QPushButton:pressed {
    background: #E1E7F0;
}
QPushButton:disabled {
    color: #7E8796;
    background: #F0F3F7;
}
QPushButton#primaryButton {
    background: #1C5D99;
    color: #FFFFFF;
    border: 1px solid #1C5D99;
}
QPushButton#primaryButton:hover {
    background: #194F83;
}
QPushButton#primaryButton:pressed {
    background: #143E66;
}
QCheckBox {
    color: #F5F8FF;
    background: #1F2A3A;
    border: 1px solid #2D3A4F;
    border-radius: 4px;
    padding: 6px 10px;
    spacing: 8px;
}
QCheckBox::indicator {
    width: 18px;
    height: 18px;
}
QLabel {
    color: #2D3645;
}
"""

DEFAULT_WINDOW_WIDTH = 840
DEFAULT_WINDOW_HEIGHT = 620
MIN_WINDOW_WIDTH = 680
MIN_WINDOW_HEIGHT = 560
DEFAULT_UI_FONT_SIZE = 10
MIN_UI_FONT_SIZE = 8
MAX_UI_FONT_SIZE = 18


def calculate_window_size(available_width: int, available_height: int) -> tuple[int, int]:
    """Return a window size that never exceeds available screen geometry."""
    width_target = min(DEFAULT_WINDOW_WIDTH, int(available_width * 0.92))
    height_target = min(DEFAULT_WINDOW_HEIGHT, int(available_height * 0.9))
    width = min(available_width, max(MIN_WINDOW_WIDTH, width_target))
    height = min(available_height, max(MIN_WINDOW_HEIGHT, height_target))
    return width, height


def build_section_keywords(
    enabled_sections: Optional[Iterable[str]] = None,
    custom_section_keywords: Optional[Dict[str, Iterable[str]]] = None,
) -> Dict[str, tuple[str, ...]]:
    """
    Build a lowercase keyword mapping for section detection.

    Reuses SECTION_KEYWORDS as fallback for enabled sections.
    Merges custom keywords if provided.

    Args:
        enabled_sections: Sections to include. If None, uses all from SECTION_KEYWORDS.
        custom_section_keywords: Custom keyword overrides per section.

    Returns:
        Dict mapping section labels to lowercase keyword tuples.
    """
    result: Dict[str, tuple[str, ...]] = {}
    sections = list(enabled_sections) if enabled_sections is not None else list(SECTION_KEYWORDS.keys())
    if custom_section_keywords:
        for section in custom_section_keywords:
            if section not in sections:
                sections.append(section)

    for section in sections:
        if custom_section_keywords and section in custom_section_keywords:
            keywords = tuple(kw.lower() for kw in custom_section_keywords[section])
        elif section in SECTION_KEYWORDS:
            keywords = tuple(kw.lower() for kw in SECTION_KEYWORDS[section])
        else:
            keywords = (section.lower(),)
        result[section] = keywords

    return result


def get_header_tokens_for_label(label: str) -> Set[str]:
    if label.startswith("Custom Page"):
        return CUSTOM_PAGE_HEADER_TOKENS
    override = SECTION_HEADER_OVERRIDES.get(label)
    if override:
        return override
    # Sub-section labels from TOC (e.g. "i. SPI Mode...") won't be in SECTION_HEADER_OVERRIDES.
    # Use the full token set so Address Mode tables are found correctly.
    return CUSTOM_PAGE_HEADER_TOKENS


def _normalize_keyword_text(text: str) -> str:
    """Normalize text for robust keyword matching across line-break/hyphen variations."""
    lowered = text.lower()
    normalized = re.sub(r"\s*[-–—]\s*", " ", lowered)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


@dataclass
class TableExtraction:
    section: Optional[str]
    page_number: int
    table_index: int
    dataframe: pd.DataFrame


def parse_page_input(raw: str) -> List[int]:
    """Convert a comma-separated page string into a sorted list of ints."""
    cleaned = raw.strip()
    if not cleaned:
        return []
    pages: List[int] = []
    for chunk in cleaned.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if not chunk.isdigit():
            raise ValueError(f"Invalid page number: {chunk}")
        page_number = int(chunk)
        if page_number <= 0:
            raise ValueError("Page numbers must be positive integers")
        pages.append(page_number)
    return sorted(set(pages))


def normalize_table(table: List[List[Optional[str]]]) -> pd.DataFrame:
    """Return a dataframe with consistent column sizes for a raw pdfplumber table."""
    if not table:
        return pd.DataFrame()
    max_len = max(len(row) for row in table)
    normalized_rows: List[List[str]] = []
    for row in table:
        normalized = [
            (cell.strip() if isinstance(cell, str) else "") if cell is not None else ""
            for cell in row
        ]
        if len(normalized) < max_len:
            normalized.extend([""] * (max_len - len(normalized)))
        normalized_rows.append(normalized)
    return pd.DataFrame(normalized_rows)


def non_empty_row_count(frame: pd.DataFrame) -> int:
    """Return the number of rows containing at least one non-empty cell."""
    if frame.empty:
        return 0
    cleaned = frame.replace("", pd.NA).dropna(how="all")
    return len(cleaned.index)


def _fill_merged_cells(frame: pd.DataFrame) -> pd.DataFrame:
    """Forward-fill empty cells in the two leftmost columns (Description/Symbol).

    PDF merged cells appear as empty strings after normalization.  When a cell
    in col 0 or col 1 is empty but the same row has data in other columns, we
    propagate the last non-empty value from the same column downward — exactly
    what a spreadsheet viewer would show for a merged cell.

    Header rows (where col-0 matches a known header token) are never modified.
    """
    if frame.empty or frame.shape[1] < 2:
        return frame
    df = frame.copy()
    cols_to_fill = [0, 1] if df.shape[1] >= 2 else [0]
    last: dict[int, str] = {c: "" for c in cols_to_fill}
    for row_idx in range(len(df)):
        cell0 = str(df.iat[row_idx, 0]).strip()
        # Skip header rows
        if cell0.upper() in CUSTOM_PAGE_HEADER_TOKENS:
            last = {c: "" for c in cols_to_fill}
            continue
        # Check if this row has any data outside the fill columns
        other_cols = [c for c in range(df.shape[1]) if c not in cols_to_fill]
        row_has_data = any(str(df.iat[row_idx, c]).strip() for c in other_cols)
        for col in cols_to_fill:
            val = str(df.iat[row_idx, col]).strip()
            if val:
                last[col] = val
            elif row_has_data and last[col]:
                df.iat[row_idx, col] = last[col]
    return df


def _drop_empty_columns(frame: pd.DataFrame) -> pd.DataFrame:
    """Drop columns that are entirely empty (after the header row)."""
    if frame.empty:
        return frame
    # A column is empty when every cell below row 0 is blank
    data_rows = frame.iloc[1:]
    non_empty_mask = data_rows.replace("", pd.NA).notna().any(axis=0)
    # Always keep the header row — include col even if data is empty
    header_non_empty = frame.iloc[0].replace("", pd.NA).notna()
    keep = non_empty_mask | header_non_empty
    return frame.loc[:, keep].reset_index(drop=True)


def _flatten_newlines(frame: pd.DataFrame) -> pd.DataFrame:
    """Replace in-cell newlines with a space across the whole frame."""
    if frame.empty:
        return frame
    return frame.apply(
        lambda col: col.map(
            lambda v: str(v).replace('\n', ' ').strip() if isinstance(v, str) else v
        )
    )


def _merge_continuation_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Merge parenthetical-only rows (e.g. '(03h/13h)') into the previous description.

    When compact_split_spec_table splits a multi-line PDF cell, the wrapped
    portion (like a footnote or sub-qualifier) ends up as a separate row with
    content only in col 0 that starts with '('.  We append that content to the
    previous row's Description column and drop the phantom row.
    """
    if frame.empty or frame.shape[1] < 2:
        return frame
    df = frame.copy()
    keep_mask = [True] * len(df)
    last_data_idx: Optional[int] = None
    for i in range(len(df)):
        col0 = str(df.iat[i, 0]).strip()
        # Skip header rows
        if col0.upper() in CUSTOM_PAGE_HEADER_TOKENS:
            last_data_idx = i
            continue
        other_empty = all(not str(df.iat[i, j]).strip() for j in range(1, df.shape[1]))
        if col0.startswith('(') and other_empty and last_data_idx is not None:
            prev = str(df.iat[last_data_idx, 0]).strip()
            df.iat[last_data_idx, 0] = f"{prev} {col0}".strip()
            keep_mask[i] = False
        else:
            last_data_idx = i
    return df[[keep_mask[i] for i in range(len(df))]].reset_index(drop=True)


def clean_table(
    frame: pd.DataFrame, header_tokens: Optional[Set[str]] = None
) -> pd.DataFrame:
    """Trim leading rows until designated header text sits at A1."""
    if frame.empty:
        return frame
    tokens = header_tokens or HEADER_TOKENS
    first_col = frame.iloc[:, 0].astype(str).str.strip()
    for idx, value in first_col.items():
        header_token = _match_header_token(value, tokens)
        if header_token:
            trimmed = frame.iloc[idx:].reset_index(drop=True)
            trimmed.iloc[:, 0] = trimmed.iloc[:, 0].astype(str).str.strip()
            trimmed.iat[0, 0] = header_token
            return trimmed
    return pd.DataFrame()


def _match_header_token(value: str, header_tokens: Set[str]) -> Optional[str]:
    uppercase = value.upper()
    for token in header_tokens:
        if uppercase == token or uppercase.startswith(f"{token} "):
            return token
    return None


def filter_flagged_rows(
    frame: pd.DataFrame, header_tokens: Optional[Set[str]] = None
) -> pd.DataFrame:
    """Remove rows where MIN/TYP/MAX cells contain footnotes or strikeouts."""
    if frame.empty:
        return frame
    spec_columns = _detect_spec_columns(frame)
    if not spec_columns:
        return frame
    tokens = header_tokens or HEADER_TOKENS
    rows: List[List[Any]] = []
    for row_idx in range(len(frame)):
        series = frame.iloc[row_idx]
        first_cell = _normalize_cell(series.iloc[0])
        is_header_row = first_cell.upper() in tokens
        if row_idx == 0 or is_header_row:
            rows.append(series.tolist())
            continue
        if _row_has_flagged_value(series, spec_columns):
            continue
        rows.append(series.tolist())
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows, columns=frame.columns)


def _detect_spec_columns(frame: pd.DataFrame) -> List[int]:
    header_scan_rows = min(2, len(frame))
    detected: Dict[str, int] = {}
    for row_idx in range(header_scan_rows):
        for col_idx in range(frame.shape[1]):
            value = _normalize_cell(frame.iat[row_idx, col_idx]).replace(" ", "")
            upper = value.upper()
            if "MIN" in upper and "MIN" not in detected:
                detected["MIN"] = col_idx
            elif "TYP" in upper and "TYP" not in detected:
                detected["TYP"] = col_idx
            elif "MAX" in upper and "MAX" not in detected:
                detected["MAX"] = col_idx
    return sorted(set(detected.values()))


def _row_has_flagged_value(series: pd.Series, spec_columns: List[int]) -> bool:
    for col_idx in spec_columns:
        if col_idx >= len(series):
            continue
        value = _normalize_cell(series.iloc[col_idx])
        if _value_has_flag_marker(value):
            return True
    return False


def _value_has_flag_marker(value: str) -> bool:
    if not value:
        return False
    if "(" in value and ")" in value:
        return True
    return any(char in value for char in STRIKETHROUGH_CHARS)


def compact_split_spec_table(frame: pd.DataFrame) -> pd.DataFrame:
    """Collapse over-split AC spec tables into 7 logical columns when possible."""
    if frame.empty or frame.shape[1] <= 7:
        return frame
    header_rows = min(4, len(frame))
    symbol_idx = _find_header_index(frame, header_rows, "SYMBOL")
    condition_idx = _find_header_index(frame, header_rows, "CONDITION")
    min_idx = _find_header_index(frame, header_rows, "MIN")
    typ_idx = _find_header_index(frame, header_rows, "TYP")
    max_idx = _find_header_index(frame, header_rows, "MAX")
    unit_idx = _find_header_index(frame, header_rows, "UNIT")
    indices = [symbol_idx, condition_idx, min_idx, typ_idx, max_idx, unit_idx]
    if any(idx is None for idx in indices):
        return frame
    symbol_idx = int(symbol_idx)
    condition_idx = int(condition_idx)
    min_idx = int(min_idx)
    typ_idx = int(typ_idx)
    max_idx = int(max_idx)
    unit_idx = int(unit_idx)
    if not (0 < symbol_idx < condition_idx < min_idx < typ_idx < max_idx < unit_idx < frame.shape[1]):
        return frame
    rows: List[List[str]] = []
    for _, series in frame.iterrows():
        row_values = [_normalize_cell(v) for v in series.tolist()]
        rows.append(
            [
                _merge_cells(row_values[0:symbol_idx]),
                _merge_cells(row_values[symbol_idx:condition_idx]),
                _merge_cells(row_values[condition_idx:min_idx]),
                _merge_cells(row_values[min_idx:typ_idx]),
                _merge_cells(row_values[typ_idx:max_idx]),
                _merge_cells(row_values[max_idx:unit_idx]),
                _merge_cells(row_values[unit_idx:]),
            ]
        )
    return pd.DataFrame(rows)  # use integer column indices to stay compatible with combine_tables


def _find_header_index(frame: pd.DataFrame, header_rows: int, token: str) -> Optional[int]:
    wanted = token.upper()
    for row_idx in range(header_rows):
        for col_idx in range(frame.shape[1]):
            value = _normalize_cell(frame.iat[row_idx, col_idx]).upper()
            if value == wanted:
                return col_idx
    return None


def _merge_cells(values: List[str]) -> str:
    parts = [v for v in values if v]
    if not parts:
        return ""
    return " ".join(parts)


def compact_address_mode_dummy_cycle(frame: pd.DataFrame) -> pd.DataFrame:
    """Merge split Dummy Cycle label/value in Address Mode tables."""
    if frame.empty or frame.shape[1] < 2:
        return frame
    first_header = _normalize_cell(frame.iat[0, 0]).upper()
    if "ADDRESS MODE" not in first_header:
        return frame
    result = frame.copy()
    in_dummy_block = False
    for row_idx in range(len(result)):
        left = _normalize_cell(result.iat[row_idx, 0])
        right = _normalize_cell(result.iat[row_idx, 1])
        left_upper = left.upper()
        if "DUMMY" in left_upper:
            in_dummy_block = True
            if right:
                result.iat[row_idx, 0] = f"{left} {right}".strip()
                result.iat[row_idx, 1] = ""
            continue
        if in_dummy_block and not left and right:
            result.iat[row_idx, 0] = f"Dummy Cycle {right}".strip()
            result.iat[row_idx, 1] = ""
        elif in_dummy_block and left:
            in_dummy_block = False
    return result


def split_table_on_repeated_headers(
    frame: pd.DataFrame, header_tokens: Optional[Set[str]] = None
) -> List[pd.DataFrame]:
    """Split a combined frame when the header row appears again."""
    if frame.empty:
        return []
    tokens = {token.upper() for token in (header_tokens or HEADER_TOKENS)}
    split_points: List[int] = []
    for row_idx in range(1, len(frame)):
        first_cell = _normalize_cell(frame.iat[row_idx, 0]).upper()
        if first_cell in tokens:
            split_points.append(row_idx)
    if not split_points:
        return [frame.reset_index(drop=True)]
    parts: List[pd.DataFrame] = []
    start = 0
    for point in split_points:
        part = frame.iloc[start:point].reset_index(drop=True)
        if not part.empty:
            parts.append(part)
        start = point
    tail = frame.iloc[start:].reset_index(drop=True)
    if not tail.empty:
        parts.append(tail)
    return parts


def _extract_table_match_keys(
    frame: pd.DataFrame, header_tokens: Optional[Set[str]] = None
) -> Set[str]:
    """Extract stable row keys from first column for cross-version table pairing."""
    if frame.empty:
        return set()
    tokens = {token.upper() for token in (header_tokens or HEADER_TOKENS)}
    ignore = tokens | {
        "SYMBOL",
        "CONDITION",
        "SPEC",
        "MIN",
        "TYP",
        "MAX",
        "UNIT",
    }
    keys: Set[str] = set()
    for row_idx in range(len(frame)):
        value = _normalize_cell(frame.iat[row_idx, 0])
        if not value:
            continue
        upper = value.upper()
        if upper in ignore:
            continue
        keys.add(upper)
    return keys


def pair_table_entries(
    new_entries: List[Dict[str, Any]], old_entries: List[Dict[str, Any]]
) -> List[tuple[Dict[str, Any], Dict[str, Any]]]:
    """Pair split tables by key overlap, then fallback to order for leftovers."""
    if not new_entries or not old_entries:
        return []
    candidates: List[tuple[int, int, int]] = []
    for n_idx, n_entry in enumerate(new_entries):
        n_keys = n_entry.get("keys", set())
        for o_idx, o_entry in enumerate(old_entries):
            o_keys = o_entry.get("keys", set())
            score = len(n_keys & o_keys)
            if score > 0:
                candidates.append((score, n_idx, o_idx))
    candidates.sort(reverse=True)
    used_new: Set[int] = set()
    used_old: Set[int] = set()
    pairs: List[tuple[Dict[str, Any], Dict[str, Any]]] = []
    for _score, n_idx, o_idx in candidates:
        if n_idx in used_new or o_idx in used_old:
            continue
        pairs.append((new_entries[n_idx], old_entries[o_idx]))
        used_new.add(n_idx)
        used_old.add(o_idx)
    remaining_new = [idx for idx in range(len(new_entries)) if idx not in used_new]
    remaining_old = [idx for idx in range(len(old_entries)) if idx not in used_old]
    for n_idx, o_idx in zip(remaining_new, remaining_old):
        pairs.append((new_entries[n_idx], old_entries[o_idx]))
    return pairs


def sanitize_sheet_fragment(text: str) -> str:
    if not text:
        return "Sheet"
    sanitized = ["_" if ch in INVALID_SHEET_CHARS else ch for ch in text]
    cleaned = "".join(sanitized).strip()
    return cleaned or "Sheet"


def combine_tables(tables: Iterable[pd.DataFrame]) -> pd.DataFrame:
    """Concatenate multiple tables, padding columns to align shapes."""
    frames = [df for df in tables if not df.empty]
    if not frames:
        return pd.DataFrame()
    max_cols = max(df.shape[1] for df in frames)
    aligned: List[pd.DataFrame] = []
    for df in frames:
        if df.shape[1] < max_cols:
            df = df.reindex(columns=range(max_cols), fill_value="")
        aligned.append(df)
    combined = pd.concat(aligned, ignore_index=True)
    return combined


def _normalize_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _sheet_to_rows(sheet) -> List[List[str]]:
    rows: List[List[str]] = []
    for row in sheet.iter_rows(values_only=True):
        rows.append([_normalize_cell(cell) for cell in row])
    return rows


def _build_row_lookup(rows: List[List[str]], start_row: int) -> Dict[str, Dict[str, Any]]:
    lookup: Dict[str, Dict[str, Any]] = {}
    for offset, row in enumerate(rows):
        if not row:
            continue
        key = row[0].strip()
        if not key or key.upper() in HEADER_TOKENS:
            continue
        lookup.setdefault(key, {"row": start_row + offset})
    return lookup


_DIFF_FILL = PatternFill("solid", fgColor="CC0000")  # red for changed cells
_NEW_FILL  = PatternFill("solid", fgColor="375623")  # dark green for added rows


def _composite_key(*vals) -> str:
    """Row identity key using (col0, col1, col3) normalized to lowercase.

    col3 = device/sub-condition column — distinguishes rows within the same
    merged parameter group (e.g., W25Q33RV row vs W25Q01RV row).
    Case-insensitive so 'Icc1' and 'ICC1' hash to the same key.
    """
    def _n(v) -> str:
        return re.sub(r'\s+', ' ', str(v or '').strip().lower())

    k0 = _n(vals[0]) if len(vals) > 0 else ""
    k1 = _n(vals[1]) if len(vals) > 1 else ""
    k3 = _n(vals[3]) if len(vals) > 3 else ""

    if k3 and k3.upper() not in CUSTOM_PAGE_HEADER_TOKENS:
        return f"{k0}\x00{k1}\x00{k3}"
    if k1:
        return f"{k0}\x00{k1}"
    return k0


def _table_sig(df: pd.DataFrame) -> str:
    """First non-header col-0 value as a table fingerprint for matching."""
    for _, row in df.iterrows():
        v = str(row.iloc[0]).strip()
        if v and v.upper() not in CUSTOM_PAGE_HEADER_TOKENS:
            return v.lower()
    return ""


def _pair_parts(
    new_parts: List[pd.DataFrame],
    old_parts: List[pd.DataFrame],
) -> List["tuple[pd.DataFrame, Optional[pd.DataFrame]]"]:
    """Signature-based 1:1 matching of new→old sub-tables.

    Each old_part is consumed at most once (no double-matching).
    Unmatched new parts get None as the old counterpart.
    """
    available: List[pd.DataFrame] = list(old_parts)
    result: List[tuple] = []
    for new_p in new_parts:
        sig = _table_sig(new_p)
        match_idx = next(
            (i for i, op in enumerate(available) if _table_sig(op) == sig),
            None,
        )
        if match_idx is not None:
            result.append((new_p, available.pop(match_idx)))
        else:
            result.append((new_p, None))
    return result


def apply_comparison_highlights(
    workbook_path: Path,
    compare_pairs: Dict[str, pd.DataFrame],
) -> None:
    """Annotate diff cells in new-version sheets.

    Changed cells  → red bg, white text, "old --> new"
    Added rows     → dark-green bg, white text, "(新增)"
    compare_pairs  : sheet_name → (new_part_df, old_part_df)
    Row matching   : composite key (col0, col1, col3) case-insensitive
                     col3 = device sub-condition (e.g. W25Q33RV) — unique per data row
    """
    if not compare_pairs:
        return
    wb = load_workbook(workbook_path)
    for sheet_name, old_df in compare_pairs.items():
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]

        # Build lookup: composite_key → [normalized values for cols 1..]
        old_lookup: Dict[str, List[str]] = {}
        for _, row in old_df.iterrows():
            k0 = str(row.iloc[0]).strip()
            if not k0 or k0.upper() in CUSTOM_PAGE_HEADER_TOKENS:
                continue
            key = _composite_key(*row.tolist())
            old_lookup[key] = [_normalize_cell(v) for v in row.iloc[1:].tolist()]

        # Row 1 = section title (prepended by write_to_excel, not in old_df)
        # Row 2 = column headers (in CUSTOM_PAGE_HEADER_TOKENS → skipped by guard anyway)
        # Comparison is only meaningful for data rows starting at row 3.
        for r in range(3, (ws.max_row or 0) + 1):
            k0 = str(ws.cell(r, 1).value or "").strip()
            if not k0 or k0.upper() in CUSTOM_PAGE_HEADER_TOKENS:
                continue
            max_col = ws.max_column or 0
            row_vals = [ws.cell(r, c).value for c in range(1, max_col + 1)]
            ckey = _composite_key(*row_vals)

            old_row_vals = old_lookup.get(ckey)
            if old_row_vals is None:
                # Row exists in new but not in old → mark as added
                for c in range(1, max_col + 1):
                    cell = ws.cell(r, c)
                    if cell.value not in (None, ""):
                        cell.fill = _NEW_FILL
                        cell.font = Font(name="Calibri", size=10, bold=False, color="FFFFFFFF")
                        cell.border = _BORDER_ALL
                # Append "(新增)" label to col-1 cell
                ws.cell(r, 1).value = f"{k0} (新增)"
                continue

            # Compare individual cells (col 2 onward)
            for c in range(2, max_col + 1):
                new_val = _normalize_cell(ws.cell(r, c).value)
                old_val = old_row_vals[c - 2] if c - 2 < len(old_row_vals) else ""
                if new_val == old_val:
                    continue
                if old_val and new_val:
                    ws.cell(r, c).value = f"{old_val} --> {new_val}"
                elif old_val:
                    ws.cell(r, c).value = f"{old_val} --> (removed)"
                else:
                    ws.cell(r, c).value = f"--> {new_val}"
                ws.cell(r, c).fill = _DIFF_FILL
                ws.cell(r, c).font = Font(name="Calibri", size=10, bold=False, color="FFFFFFFF")
                ws.cell(r, c).border = _BORDER_ALL
    wb.save(workbook_path)


_THIN_SIDE = Side(style="thin", color="000000")
_BORDER_ALL = Border(
    left=_THIN_SIDE, right=_THIN_SIDE, top=_THIN_SIDE, bottom=_THIN_SIDE
)
_TITLE_FONT = Font(name="Calibri", bold=True, size=12)
_HEADER_FONT = Font(name="Calibri", bold=True, size=10)
_DATA_FONT = Font(name="Calibri", bold=False, size=10)
_TITLE_FILL = PatternFill("solid", fgColor="2E75B6")   # dark blue
_HEADER_FILL = PatternFill("solid", fgColor="4472C4")  # medium blue


def apply_sheet_formatting(workbook_path: Path) -> None:
    """Apply consistent formatting to every sheet:
    - Row 1: section title (bold, dark-blue background, white text, merged)
    - Row 2: column headers (bold, medium-blue background, white text)
    - All content rows: auto-width, thin black border on every populated cell
    - Sheet gridlines disabled
    """
    wb = load_workbook(workbook_path)
    white_font_color = "FFFFFFFF"
    for ws in wb.worksheets:
        max_col = ws.max_column or 1
        max_row = ws.max_row or 1
        # Disable gridlines
        ws.sheet_view.showGridLines = False
        # Row 1: title row — merge across all columns
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max_col)
        title_cell = ws.cell(row=1, column=1)
        title_cell.font = Font(name="Calibri", bold=True, size=12, color=white_font_color)
        title_cell.fill = _TITLE_FILL
        title_cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=False)
        title_cell.border = _BORDER_ALL
        ws.row_dimensions[1].height = 18
        # Row 2: column headers
        for col in range(1, max_col + 1):
            cell = ws.cell(row=2, column=col)
            cell.font = Font(name="Calibri", bold=True, size=10, color=white_font_color)
            cell.fill = _HEADER_FILL
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = _BORDER_ALL
        ws.row_dimensions[2].height = 30
        # Data rows: border + wrap text
        for r in range(3, max_row + 1):
            for col in range(1, max_col + 1):
                cell = ws.cell(row=r, column=col)
                if cell.value is not None and str(cell.value).strip():
                    cell.border = _BORDER_ALL
                    cell.alignment = Alignment(wrap_text=True, vertical="top")
                    # Keep existing fill; just ensure font
                    existing = cell.font
                    cell.font = Font(
                        name="Calibri", size=10,
                        bold=False,
                        color=(existing.color.rgb if existing.color and existing.color.type == "rgb" else "FF000000"),
                    )
        # Auto column width (capped at 40)
        from openpyxl.cell import MergedCell
        for col in ws.columns:
            first_cell = next((c for c in col if not isinstance(c, MergedCell)), None)
            if first_cell is None:
                continue
            col_letter = first_cell.column_letter
            max_len = 0
            for cell in col:
                if not isinstance(cell, MergedCell) and cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            ws.column_dimensions[col_letter].width = min(max_len + 2, 40)
    wb.save(workbook_path)


def apply_text_cell_fill(workbook_path: Path) -> None:
    """Fill text cells with light gray while keeping numeric cells white/default."""
    workbook = load_workbook(workbook_path)
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(
            min_row=1,
            max_row=sheet.max_row or 0,
            min_col=1,
            max_col=sheet.max_column or 0,
        ):
            for cell in row:
                value = cell.value
                if value is None:
                    continue
                normalized = _normalize_cell(value)
                if not normalized:
                    continue
                if _is_numeric_like(normalized):
                    continue
                cell.fill = TEXT_FILL
                f = cell.font
                cell.font = Font(
                    name=f.name, size=f.size, bold=f.bold,
                    italic=f.italic, underline=f.underline,
                    strike=f.strike, color="FFFFFFFF",
                )
    workbook.save(workbook_path)


def _is_numeric_like(value: str) -> bool:
    compact = value.replace(",", "")
    try:
        float(compact)
        return True
    except ValueError:
        return False


def group_tables_by_label(tables: List[TableExtraction]) -> Dict[str, List[pd.DataFrame]]:
    grouped: Dict[str, List[pd.DataFrame]] = {}
    for entry in tables:
        label = entry.section or f"Page_{entry.page_number}"
        grouped.setdefault(label, []).append(entry.dataframe)
    return grouped


def parse_toc_section_range(
    pdf: Any,
    target_keyword: str,
    toc_pages: int = 8,
) -> Optional[tuple[int, int]]:
    """Return (start_page, end_page) for a chapter by parsing top-level TOC entries.

    Scans the first *toc_pages* pages for TOC entries of the form
    ``<title> ......... <page_number>``.  Restricts to **top-level** entries
    (title starts with a single integer like "7 ELECTRICAL CHARACTERISTICS")
    to avoid sub-section noise.  Returns None when the keyword is not found.
    """
    total_pages = len(pdf.pages)
    toc_text = ""
    for i in range(min(toc_pages, total_pages)):
        toc_text += (pdf.pages[i].extract_text() or "") + "\n"

    all_entries = re.findall(
        r"^(.{3,80}?)\.{2,}\s*(\d{1,4})\s*$", toc_text, re.MULTILINE
    )
    if not all_entries:
        return None

    # Keep only top-level entries: title begins with a plain integer ("7 TITLE")
    top_level: List[tuple[str, int]] = []
    for title, page in all_entries:
        title = title.strip()
        if re.match(r"^\d+\s+[A-Z]", title):
            top_level.append((title.lower(), int(page)))

    if not top_level:
        return None

    kw = target_keyword.lower()
    match_idx = next((i for i, (t, _) in enumerate(top_level) if kw in t), None)
    if match_idx is None:
        return None

    start = top_level[match_idx][1]
    # End = page before the next top-level chapter, or end of PDF
    end = total_pages
    for _, p in top_level[match_idx + 1 :]:
        if p > start:
            end = p - 1
            break
    return start, end


def parse_toc_subsections(
    pdf: Any,
    chapter_keyword: str = "electrical characteristics",
    toc_pages: int = 8,
) -> List[tuple[str, int]]:
    """Return [(title, start_page), ...] for every leaf sub-section in the chapter.

    Handles:
    - Split-line TOC entries (title on one line, "......... 168" on the next)
    - Roman-numeral sub-sections (i/ii/iii/iv) replacing their numbered parent
      when they share the same start page
    Returns an empty list when no sub-sections are found (caller uses full range).
    """
    total = len(pdf.pages)
    raw_lines: List[str] = []
    for i in range(min(toc_pages, total)):
        raw_lines.extend((pdf.pages[i].extract_text() or "").splitlines())

    # Repair split entries: title line, optional footnote "(1)", then "......168"
    # Look ahead up to 3 lines for a dots+page line.
    lines: List[str] = []
    j = 0
    while j < len(raw_lines):
        line = raw_lines[j].strip()
        # Only attempt look-ahead repair for numbered sub-section titles (7.x.)
        if (
            line
            and re.match(r'^7\.\d+', line)
            and not re.search(r'\.{2,}\s*\d+\s*$', line)
        ):
            merged = False
            for look in range(1, 4):
                if j + look >= len(raw_lines):
                    break
                ahead = raw_lines[j + look].strip()
                page_m = re.search(r'\.{2,}\s*(\d+)\s*$', ahead)
                if page_m:
                    lines.append(f"{line} {'.' * 8} {page_m.group(1)}")
                    j += look + 1
                    merged = True
                    break
                # Only skip over short footnote markers like "(1)" or single digits
                if not re.match(r'^\(?[0-9]+\)?$', ahead):
                    break
            if not merged:
                lines.append(line)
                j += 1
        else:
            lines.append(line)
            j += 1

    chapter_range = parse_toc_section_range(pdf, chapter_keyword, toc_pages)
    if not chapter_range:
        return []
    ch_start, ch_end = chapter_range

    # Numbered sub-sections:  "7.1. Title ..... 165"
    num_pat = re.compile(r'^7\.\d+\.?\s+(.+?)\.{2,}\s*(\d+)\s*$')
    # Roman-numeral entries:  "i. Title ..... 172"
    rom_pat = re.compile(
        r'^(i{1,3}|iv|vi{0,3}|ix)\.\s+(.+?)\.{2,}\s*(\d+)\s*$', re.IGNORECASE
    )

    entries: List[tuple[str, int, bool]] = []  # (title, page, is_roman)
    for line in lines:
        m = num_pat.match(line)
        if m:
            title = re.sub(r'\s*\(\d+\)\s*$', '', m.group(1).strip())  # strip footnote "(1)"
            title = re.sub(r'\s+', ' ', title)
            page = int(m.group(2))
            if ch_start <= page <= ch_end:
                entries.append((title, page, False))
            continue
        m = rom_pat.match(line)
        if m:
            prefix, body, pg_str = m.group(1), m.group(2), m.group(3)
            title = f"{prefix}. {re.sub(r'\s+', ' ', body.strip())}"
            page = int(pg_str)
            if ch_start <= page <= ch_end:
                entries.append((title, page, True))

    if not entries:
        return []

    # When roman entries exist at the same start page as a numbered parent,
    # drop the numbered parent (the roman entries are finer).
    roman_pages = {p for _, p, is_rom in entries if is_rom}
    result: List[tuple[str, int]] = []
    for title, page, is_rom in entries:
        if not is_rom and page in roman_pages:
            continue
        result.append((title, page))
    # Drop subsections that are not proper spec tables (alternative symbol appendices, etc.)
    _SKIP_RE = re.compile(r'alternative symbol', re.IGNORECASE)
    result = [(t, p) for t, p in result if not _SKIP_RE.search(t)]
    return result


def iter_target_pages(
    pdf: Any,
    section_keywords: Dict[str, tuple[str, ...]],
    explicit_pages: List[int],
) -> Iterable[tuple[Optional[str], int, Any]]:
    """
    Iterate over target pages from PDF.

    In explicit mode (when explicit_pages is not empty):
    - Validate pages against total pages, raising ValueError for invalid.
    - Yield tuples: (section_label, page_number, page)
    - section_label is "Custom Page <N>" for explicit pages.

    In section mode (when explicit_pages is empty):
    - Keep existing matching/carry behavior.
    - Yield tuples: (section_label, page_number, page)
    - section_label is the matched section or None if not in a section.
    """
    total_pages = len(pdf.pages)

    if explicit_pages:
        valid_pages = [p for p in explicit_pages if 1 <= p <= total_pages]
        invalid_pages = [p for p in explicit_pages if p not in valid_pages]
        if invalid_pages:
            invalid_text = ", ".join(str(page) for page in invalid_pages)
            raise ValueError(
                f"指定頁碼超出範圍: {invalid_text} (有效範圍: 1-{total_pages})"
            )
        for page_number in valid_pages:
            page = pdf.pages[page_number - 1]
            yield f"Custom Page {page_number}", page_number, page
    else:
        current_section: Optional[str] = None
        carry_pages_left = 0
        for page_number, page in enumerate(pdf.pages, start=1):
            page_text = _normalize_keyword_text(page.extract_text() or "")
            matched_section: Optional[str] = None
            for section, keywords in section_keywords.items():
                if any(_normalize_keyword_text(keyword) in page_text for keyword in keywords):
                    matched_section = section
                    break
            if matched_section:
                current_section = matched_section
                carry_pages_left = 5
            elif current_section is None:
                continue
            elif carry_pages_left <= 0:
                continue
            else:
                carry_pages_left -= 1
            yield current_section, page_number, page


def extract_page_tables(
    page: Any,
    section_label: Optional[str],
    page_number: int,
    table_settings: Dict[str, Any],
    fitz_page: Optional[Any] = None,
) -> List[TableExtraction]:
    """
    Extract tables from a single page.

    Args:
        page: pdfplumber page object.
        section_label: Section label or None.
        page_number: Page number (1-indexed).
        table_settings: Settings dict for pdfplumber extract_tables.
        fitz_page: Optional PyMuPDF page for fallback extraction.

    Returns:
        List of TableExtraction objects for tables found on the page.
    """
    results: List[TableExtraction] = []
    tables = page.extract_tables(table_settings=table_settings) or []
    if not tables and fitz_page is not None:
        tables = _extract_tables_with_fitz(fitz_page)
    for idx, table in enumerate(tables, start=1):
        df = normalize_table(table)
        if df.empty:
            continue
        results.append(
            TableExtraction(
                section=section_label,
                page_number=page_number,
                table_index=idx,
                dataframe=df,
            )
        )
    return results


def _extract_tables_with_fitz(page: Any) -> List[List[List[Optional[str]]]]:
    """Extract tables with PyMuPDF as a fallback when pdfplumber misses grid tables."""
    try:
        finder = page.find_tables()
    except Exception:
        return []
    results: List[List[List[Optional[str]]]] = []
    for table in finder.tables:
        extracted = table.extract() or []
        if extracted:
            results.append(extracted)
    return results


def extract_tables(
    pdf_path: Path,
    enabled_sections: List[str],
    explicit_pages: List[int],
    custom_section_keywords: Optional[Dict[str, tuple[str, ...]]] = None,
) -> List[TableExtraction]:
    """Extract tables from a PDF using TOC-based page ranges or keyword fallback.

    When *explicit_pages* is empty and *enabled_sections* contains electrical
    characteristics labels, the function first tries to parse the PDF Table of
    Contents to find the exact page range of the ELECTRICAL CHARACTERISTICS
    chapter.  All pages in that range are scanned, and each table is labelled
    with the matching sub-section (or "Electrical Characteristics" when no
    finer label is found).

    Falls back to per-page keyword matching when the TOC cannot be parsed.
    """
    results: List[TableExtraction] = []
    fitz_doc = fitz.open(str(pdf_path)) if fitz is not None else None

    # Build fine-grained sub-section keyword map for labelling within the chapter.
    section_keywords = build_section_keywords(enabled_sections, custom_section_keywords)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            if not explicit_pages and enabled_sections:
                # Try TOC-based extraction for each top-level keyword that
                # covers a range (e.g. "electrical characteristics" → p165-183).
                toc_keywords = [
                    "electrical characteristics",
                ]
                toc_pages: List[int] = []
                for kw in toc_keywords:
                    rng = parse_toc_section_range(pdf, kw)
                    if rng:
                        start, end = rng
                        toc_pages.extend(range(start, end + 1))
                        logging.info("TOC resolved '%s' to pages %d–%d", kw, start, end)

                if toc_pages:
                    # Build sub-section page ranges from TOC structure.
                    subsections = parse_toc_subsections(pdf)  # [(title, start_page), ...]
                    chapter_range = parse_toc_section_range(pdf, "electrical characteristics")
                    chapter_end = chapter_range[1] if chapter_range else toc_pages[-1]

                    def _subsection_label(page_number: int) -> str:
                        """Last sub-section whose start_page <= page_number."""
                        label = "Electrical Characteristics"
                        for title, start_page in subsections:
                            if start_page <= page_number:
                                label = title
                            else:
                                break
                        return label

                    for page_number in toc_pages:
                        page = pdf.pages[page_number - 1]
                        section_label = _subsection_label(page_number)
                        fallback_page = None
                        if fitz_doc is not None and 1 <= page_number <= fitz_doc.page_count:
                            fallback_page = fitz_doc[page_number - 1]
                        results.extend(
                            extract_page_tables(
                                page=page,
                                section_label=section_label,
                                page_number=page_number,
                                table_settings=PDF_TABLE_SETTINGS,
                                fitz_page=fallback_page,
                            )
                        )
                    return results

            # Fallback: per-page keyword matching with carry window.
            for section_label, page_number, page in iter_target_pages(
                pdf, section_keywords, explicit_pages
            ):
                fallback_page = None
                if fitz_doc is not None and 1 <= page_number <= fitz_doc.page_count:
                    fallback_page = fitz_doc[page_number - 1]
                results.extend(
                    extract_page_tables(
                        page=page,
                        section_label=section_label,
                        page_number=page_number,
                        table_settings=PDF_TABLE_SETTINGS,
                        fitz_page=fallback_page,
                    )
                )
    finally:
        if fitz_doc is not None:
            fitz_doc.close()
    return results



__all__ = [name for name in globals() if not name.startswith("__")]
