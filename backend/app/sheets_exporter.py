from __future__ import annotations

import json
import logging
import os
import re
import threading
from functools import lru_cache
from typing import Any, Optional, Sequence

from .exporter import CSV_HEADER
from .settings import get_settings

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
_append_lock = threading.Lock()
_COLUMN_RE = re.compile(r"[A-Za-z]+")
_ROW_RE = re.compile(r"[A-Za-z]+(\d+)")


def _column_to_index(column: str) -> int:
    idx = 0
    for char in column.upper():
        if not ("A" <= char <= "Z"):
            continue
        idx = idx * 26 + (ord(char) - ord("A") + 1)
    return max(idx, 1)


def _index_to_column(index: int) -> str:
    if index < 1:
        return "A"
    chars: list[str] = []
    value = index
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        chars.append(chr(ord("A") + remainder))
    return "".join(reversed(chars))


def _split_range(range_str: str) -> tuple[str, str]:
    if "!" in range_str:
        sheet, cells = range_str.split("!", 1)
        return sheet.strip(), cells.strip()
    return "", range_str.strip()


def _header_range(range_str: str, header_len: int) -> str:
    sheet, cell_range = _split_range(range_str)
    cols = _COLUMN_RE.findall(cell_range)
    start_col = cols[0].upper() if cols else "A"
    start_index = _column_to_index(start_col)
    end_col = _index_to_column(start_index + header_len - 1)
    prefix = f"{sheet}!" if sheet else ""
    return f"{prefix}{start_col}1:{end_col}1"


def _clear_range(range_str: str, header_len: int) -> str:
    sheet, cell_range = _split_range(range_str)
    cols = _COLUMN_RE.findall(cell_range)
    start_col = cols[0].upper() if cols else "A"
    start_index = _column_to_index(start_col)
    end_col = _index_to_column(start_index + header_len - 1)
    prefix = f"{sheet}!" if sheet else ""
    return f"{prefix}{start_col}:{end_col}"


def _row_range(range_str: str, row_index: int, header_len: int) -> str:
    sheet, cell_range = _split_range(range_str)
    cols = _COLUMN_RE.findall(cell_range)
    start_col = cols[0].upper() if cols else "A"
    start_index = _column_to_index(start_col)
    end_col = _index_to_column(start_index + header_len - 1)
    prefix = f"{sheet}!" if sheet else ""
    return f"{prefix}{start_col}{row_index}:{end_col}{row_index}"


def _extract_row_index(updated_range: str) -> Optional[int]:
    if "!" in updated_range:
        after_bang = updated_range.split("!", 1)[1]
    else:
        after_bang = updated_range

    match = _ROW_RE.findall(after_bang)
    if not match:
        return None
    try:
        return int(match[0])
    except ValueError:
        return None


def _load_credentials() -> Any:
    settings = get_settings()
    credentials_json = settings.google_sheets_credentials_json
    credentials_path = settings.google_sheets_credentials_path

    if not credentials_path:
        env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if env_path:
            credentials_path = env_path

    try:
        from google.oauth2.service_account import Credentials
    except ImportError as exc:
        raise RuntimeError(
            "google-auth is required for Google Sheets export. Install google-api-python-client."
        ) from exc

    if credentials_json:
        info = json.loads(credentials_json)
        return Credentials.from_service_account_info(info, scopes=SCOPES)
    if credentials_path:
        return Credentials.from_service_account_file(str(credentials_path), scopes=SCOPES)

    raise RuntimeError("Google Sheets credentials are not configured.")


@lru_cache(maxsize=1)
def _get_sheets_service() -> Any:
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise RuntimeError(
            "google-api-python-client is required for Google Sheets export."
        ) from exc

    creds = _load_credentials()
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _ensure_header(service: Any, settings: Any) -> None:
    header_range = _header_range(settings.google_sheets_range, len(CSV_HEADER))
    response = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=settings.google_sheets_id, range=header_range)
        .execute()
    )
    values = response.get("values", [])
    first_row = values[0] if values else []
    first_cell = str(first_row[0]).strip() if first_row else ""
    has_data = any(str(cell).strip() for cell in first_row)

    if has_data and first_cell != CSV_HEADER[0]:
        logger.warning(
            "Google Sheets header row already contains data; skipping header write."
        )
        return

    body = {"values": [CSV_HEADER]}
    service.spreadsheets().values().update(
        spreadsheetId=settings.google_sheets_id,
        range=header_range,
        valueInputOption="RAW",
        body=body,
    ).execute()


@lru_cache(maxsize=1)
def _ensure_header_once() -> None:
    settings = get_settings()
    if not settings.google_sheets_enabled or not settings.google_sheets_id:
        return
    service = _get_sheets_service()
    _ensure_header(service, settings)


def upsert_row(values: Sequence[Any], sheet_row: Optional[int]) -> Optional[int]:
    settings = get_settings()
    if not settings.google_sheets_enabled:
        return sheet_row
    if not settings.google_sheets_id:
        logger.warning("Google Sheets export enabled but no spreadsheet ID configured.")
        return sheet_row

    try:
        with _append_lock:
            _ensure_header_once()
            service = _get_sheets_service()
            body = {"values": [list(values)]}
            if sheet_row:
                update_range = _row_range(
                    settings.google_sheets_range, sheet_row, len(CSV_HEADER)
                )
                service.spreadsheets().values().update(
                    spreadsheetId=settings.google_sheets_id,
                    range=update_range,
                    valueInputOption=settings.google_sheets_value_input_option,
                    body=body,
                ).execute()
                return sheet_row

            response = service.spreadsheets().values().append(
                spreadsheetId=settings.google_sheets_id,
                range=settings.google_sheets_range,
                valueInputOption=settings.google_sheets_value_input_option,
                insertDataOption="INSERT_ROWS",
                body=body,
            ).execute()
            updated_range = response.get("updates", {}).get("updatedRange", "")
            return _extract_row_index(str(updated_range))
    except Exception:
        logger.exception("Failed to write row to Google Sheets")
        return sheet_row


def clear_sheet() -> bool:
    settings = get_settings()
    if not settings.google_sheets_enabled:
        logger.warning("Google Sheets clear requested but export is disabled.")
        return False
    if not settings.google_sheets_id:
        logger.warning("Google Sheets clear requested but no spreadsheet ID configured.")
        return False

    clear_range = _clear_range(settings.google_sheets_range, len(CSV_HEADER))
    try:
        with _append_lock:
            service = _get_sheets_service()
            service.spreadsheets().values().clear(
                spreadsheetId=settings.google_sheets_id,
                range=clear_range,
                body={},
            ).execute()
            _ensure_header_once.cache_clear()
            _ensure_header_once()
        return True
    except Exception:
        logger.exception("Failed to clear Google Sheets")
        raise
