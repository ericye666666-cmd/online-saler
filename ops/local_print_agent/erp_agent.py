#!/usr/bin/env python3
"""FW-ERP Local Print Agent + Windows print-station mode."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request
from urllib.parse import urlparse

APP_VERSION = "0.3.0"
HOST = "127.0.0.1"
PORT = 8719
ALLOWED_ORIGINS = {
    "https://staging.directlooperp.com",
    "https://directlooperp.com",
    "https://fw-erp-staging.onrender.com",
    "http://34.35.52.250:8000",
    "https://fw-erp-34-35-52-250.nip.io",
    "http://fw-erp-34-35-52-250.nip.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost",
    "http://127.0.0.1",
}


def _build_cors_headers(origin: str | None) -> dict[str, str]:
    if origin not in ALLOWED_ORIGINS:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Private-Network": "true",
    }

_PRINTER_STATUS_MARKERS = [
    "正在接受请求",
    "接受请求",
    "is accepting requests",
    "accepting requests",
    "is idle",
    "idle",
    "已禁用",
    "disabled",
    "not accepting requests",
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_printer_name(raw_line: str) -> str:
    """Extract a stable CUPS queue name from localized lpstat output."""
    line = str(raw_line or "").strip()
    if not line:
        return ""
    first_token = line.split()[0].strip()
    for marker in _PRINTER_STATUS_MARKERS:
        if marker in first_token:
            return first_token.split(marker, 1)[0].strip()
        if marker in line:
            return line.split(marker, 1)[0].strip().split()[0].strip()
    return first_token


def _normalize_printer_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _list_printers_unix() -> tuple[list[str], str | None]:
    if not shutil.which("lpstat"):
        return [], "lpstat is not available. Install CUPS tools or use browser print fallback."

    result = subprocess.run(["lpstat", "-a"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return [], f"lpstat failed: {result.stderr.strip() or result.stdout.strip() or 'unknown error'}"

    printers: list[str] = []
    for line in result.stdout.splitlines():
        printer_name = _extract_printer_name(line)
        if printer_name and printer_name not in printers:
            printers.append(printer_name)

    return printers, None


def _resolve_printer_name_unix(requested_printer: str) -> tuple[str, str | None]:
    requested = str(requested_printer or "").strip()
    if not requested:
        return requested, "No printer name was provided."

    printers, warning = _list_printers_unix()
    if requested in printers:
        return requested, warning

    requested_norm = _normalize_printer_name(requested)
    for printer in printers:
        printer_norm = _normalize_printer_name(printer)
        if not printer_norm:
            continue
        if printer_norm == requested_norm:
            return printer, warning
        if printer_norm.startswith(requested_norm) or requested_norm.startswith(printer_norm):
            return printer, f"Matched requested printer '{requested}' to local queue '{printer}'."

    if printers:
        return requested, f"Requested printer '{requested}' was not found. Available printers: {', '.join(printers)}"
    return requested, warning or "No local printers were found by lpstat."


def _coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def _parse_windows_printer_json(raw_json: str) -> tuple[list[dict], str | None]:
    text = str(raw_json or "").strip()
    if not text:
        return [], "Get-Printer returned no printers."
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        return [], f"Get-Printer returned invalid JSON: {exc}"

    rows = parsed if isinstance(parsed, list) else [parsed]
    printers: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("Name") or row.get("name") or "").strip()
        if not name:
            continue
        work_offline = _coerce_bool(row.get("WorkOffline") or row.get("work_offline"))
        raw_status = str(row.get("PrinterStatus") or row.get("Status") or row.get("status") or "").strip()
        status_lower = raw_status.lower()
        is_problem_status = any(
            marker in status_lower
            for marker in ("offline", "error", "paper", "jam", "paused", "unavailable")
        )
        available = not work_offline and not is_problem_status
        printers.append(
            {
                "name": name,
                "is_default": _coerce_bool(row.get("IsDefault") or row.get("Default") or row.get("is_default")),
                "status": "offline" if work_offline else ("unavailable" if is_problem_status else "available"),
                "raw_status": raw_status or ("Offline" if work_offline else "Normal"),
                "work_offline": work_offline,
                "available": available,
            }
        )

    if not printers:
        return [], "Get-Printer returned no usable printer names."
    return printers, None


def _list_printers_windows() -> tuple[list[dict], str | None]:
    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "$ErrorActionPreference = 'Stop'; "
            "$defaultPrinter = (Get-CimInstance Win32_Printer | "
            "Where-Object { $_.Default -eq $true } | "
            "Select-Object -First 1 -ExpandProperty Name); "
            "Get-Printer | ForEach-Object { "
            "[pscustomobject]@{ "
            "Name = $_.Name; "
            "PrinterStatus = [string]$_.PrinterStatus; "
            "WorkOffline = [bool]$_.WorkOffline; "
            "IsDefault = ($_.Name -eq $defaultPrinter) "
            "} } | ConvertTo-Json -Compress"
        ),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown Get-Printer error"
        return [], f"Get-Printer failed: {err}"
    return _parse_windows_printer_json(result.stdout)


def _resolve_printer_name_windows(requested_printer: str) -> tuple[str, str | None]:
    requested = str(requested_printer or "").strip()
    if not requested:
        return requested, "No printer name was provided."

    printers, warning = _list_printers_windows()
    for printer in printers:
        name = str(printer.get("name") or "").strip()
        if name == requested:
            return name, warning

    requested_norm = _normalize_printer_name(requested)
    for printer in printers:
        name = str(printer.get("name") or "").strip()
        printer_norm = _normalize_printer_name(name)
        if not printer_norm:
            continue
        if printer_norm == requested_norm:
            return name, f"Matched requested printer '{requested}' to Windows queue '{name}'."
        if printer_norm.startswith(requested_norm) or requested_norm.startswith(printer_norm):
            return name, f"Matched requested printer '{requested}' to Windows queue '{name}'."

    if printers:
        return requested, f"Requested printer '{requested}' was not found. Available printers: {', '.join(str(p.get('name') or '') for p in printers)}"
    return requested, warning or "No Windows printers were found by Get-Printer."


def _is_windows_printer_available(printer: dict) -> bool:
    if "available" in printer:
        return bool(printer.get("available"))
    status = str(printer.get("status") or "").strip().lower()
    raw_status = str(printer.get("raw_status") or "").strip().lower()
    work_offline = _coerce_bool(printer.get("work_offline") or printer.get("WorkOffline"))
    problem_status = any(
        marker in f"{status} {raw_status}"
        for marker in ("offline", "error", "paper", "jam", "paused", "unavailable")
    )
    return not work_offline and not problem_status


def _windows_printer_unavailable_message(printer: dict) -> str:
    name = str(printer.get("name") or "").strip() or "(unknown printer)"
    status = str(printer.get("status") or "").strip()
    raw_status = str(printer.get("raw_status") or "").strip()
    work_offline = _coerce_bool(printer.get("work_offline") or printer.get("WorkOffline"))
    details = []
    if status:
        details.append(f"status={status}")
    if raw_status:
        details.append(f"raw_status={raw_status}")
    if work_offline:
        details.append("WorkOffline=True")
    detail_text = ", ".join(details) or "Windows reports the queue is unavailable"
    return (
        f"Printer '{name}' is not available ({detail_text}). "
        "Turn off Use Printer Offline, reconnect the printer, clear paused/error jobs, "
        "confirm a Windows test page prints, then retry."
    )


def _matching_windows_printers(printers: list[dict], requested_printer: str) -> list[tuple[dict, str | None]]:
    requested = str(requested_printer or "").strip()
    requested_norm = _normalize_printer_name(requested)
    exact_matches: list[tuple[dict, str | None]] = []
    normalized_matches: list[tuple[dict, str | None]] = []
    for printer in printers:
        name = str(printer.get("name") or "").strip()
        if not name:
            continue
        if name == requested:
            exact_matches.append((printer, None))
            continue
        if not requested_norm:
            continue
        printer_norm = _normalize_printer_name(name)
        if not printer_norm:
            continue
        if printer_norm == requested_norm or printer_norm.startswith(requested_norm) or requested_norm.startswith(printer_norm):
            normalized_matches.append((printer, f"Matched requested printer '{requested}' to Windows queue '{name}'."))
    return exact_matches + normalized_matches


def _resolve_available_printer_name_windows(requested_printer: str) -> tuple[str, str | None, str | None]:
    requested = str(requested_printer or "").strip()
    if not requested:
        return requested, None, "No printer name was provided."

    printers, warning = _list_printers_windows()
    matches = _matching_windows_printers(printers, requested)
    if matches:
        first_unavailable: dict | None = None
        for printer, match_warning in matches:
            name = str(printer.get("name") or "").strip()
            if _is_windows_printer_available(printer):
                return name, match_warning or warning, None
            if first_unavailable is None:
                first_unavailable = printer
        return str(first_unavailable.get("name") or requested), warning, _windows_printer_unavailable_message(first_unavailable)

    if printers:
        return requested, warning, f"Requested printer '{requested}' was not found. Available printers: {', '.join(str(p.get('name') or '') for p in printers)}"
    return requested, None, warning or "No Windows printers were found by Get-Printer."


def _print_html_unix(printer: str, html_path: str) -> tuple[bool, str, str]:
    if not shutil.which("lp"):
        return False, "lp command is not available. Install CUPS or use browser print fallback.", printer

    resolved_printer, warning = _resolve_printer_name_unix(printer)
    result = subprocess.run(["lp", "-d", resolved_printer, html_path], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown error"
        prefix = f"{warning} " if warning else ""
        return False, f"{prefix}Print command failed for '{resolved_printer}': {err}", resolved_printer

    message = result.stdout.strip() or "Print job submitted."
    if warning:
        message = f"{warning} {message}"
    return True, message, resolved_printer


def _sanitize_text(value: object) -> str:
    return str(value or "").strip()


def _job_field(job: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return default


def _render_bale_label_text(job: dict) -> str:
    data = job.get("payload") if isinstance(job.get("payload"), dict) else job
    title = _job_field(data, "label_title", default="FW-ERP Bale Label")
    lines = [
        title,
        "=" * 36,
        f"Job ID: {_job_field(job, 'id', 'job_id', default='(unknown)')}",
        f"Bale ID: {_job_field(data, 'bale_id', 'barcode', 'code', default='-')}",
        f"Supplier: {_job_field(data, 'supplier_name', 'supplier', default='-')}",
        f"Batch: {_job_field(data, 'batch_number', 'batch_code', default='-')}",
        f"Category: {_job_field(data, 'category', default='-')}",
        f"Grade: {_job_field(data, 'grade', default='-')}",
        f"Quantity: {_job_field(data, 'quantity', 'qty', default='-')}",
        f"Weight (kg): {_job_field(data, 'weight_kg', default='-')}",
        f"Destination: {_job_field(data, 'warehouse_name', 'store_name', default='-')}",
        f"Created: {_job_field(job, 'created_at', default=_utc_now())}",
    ]

    notes = _sanitize_text(_job_field(data, "notes", default=""))
    if notes:
        lines.extend(["-" * 36, f"Notes: {notes}"])

    return "\r\n".join(lines) + "\r\n"


def _print_text_windows(printer_name: str, text_content: str) -> tuple[bool, str, str | None]:
    if platform.system() != "Windows":
        return False, "Windows print-station mode must run on Windows.", None

    resolved_printer, warning, printer_error = _resolve_available_printer_name_windows(printer_name)
    if printer_error:
        return False, printer_error, None

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as temp_file:
        temp_file.write(text_content)
        text_path = temp_file.name

    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "$ErrorActionPreference = 'Stop'; "
            f"Get-Content -LiteralPath '{_powershell_single_quote(text_path)}' | "
            f"Out-Printer -Name '{_powershell_single_quote(resolved_printer)}'"
        ),
    ]

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        error_message = result.stderr.strip() or result.stdout.strip() or "unknown Out-Printer error"
        message = (
            "Windows print failed. Check printer name/driver and confirm Windows test page works first. "
            f"Out-Printer error: {error_message}"
        )
        return False, message, text_path

    prefix = f"{warning} " if warning else ""
    return True, f"{prefix}Printed via Windows Out-Printer to '{resolved_printer}'.", text_path


def _clean_positive_int(value: object, *, default: int = 1, maximum: int = 20) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, maximum))


def _normalize_template_size(value: object) -> str:
    raw = str(value or "").strip().lower().replace(" ", "")
    if raw in {"60x40", "60×40", "60*40", "60mmx40mm"}:
        return "60x40"
    if raw in {"40x30", "40×30", "40*30", "40mmx30mm"}:
        return "40x30"
    return raw or "60x40"


MACHINE_CODE_RE = re.compile(r"^[1-6][0-9]{9}$")
GM_LABEL_BARCODE_RE = re.compile(r"^[0-9]{8,18}$")

TEMPLATE_MACHINE_PREFIXES = {
    "warehouse_in": "1",
    "warehouse_in_60x40": "1",
    "raw_bale_60x40": "1",
    "store_prep_bale_60x40": "2",
    "wait_for_transtoshop": "2",
    "wait_for_sale": "2",
    "store_loose_pick_60x40": "3",
    "lpk_shortage_pick": "3",
    "store_dispatch_60x40": "4",
    "transtoshop": "4",
    "store_item_60x40": "5",
    "apparel_60x40": "5",
    "clothes_retail": "5",
}

DISPLAY_MACHINE_PREFIXES = [
    (re.compile(r"^STOREITEM"), "5"),
    (re.compile(r"^RAW_BALE"), "1"),
    (re.compile(r"^RB"), "1"),
    (re.compile(r"^SDB"), "2"),
    (re.compile(r"^LPK"), "3"),
    (re.compile(r"^SDO"), "4"),
    (re.compile(r"^SDP"), "6"),
]

ENTITY_MACHINE_PREFIXES = {
    "RAW_BALE": "1",
    "STORE_PREP_BALE": "2",
    "DISPATCH_BALE": "2",
    "LOOSE_PICK_TASK": "3",
    "STORE_DELIVERY_EXECUTION": "4",
    "STORE_ITEM": "5",
    "STORE_DELIVERY_PACKAGE": "6",
}

MISSING_MACHINE_CODE_MESSAGE = "Missing valid 10-digit machine_code. Display code cannot be used as barcode."
MISSING_GM_BARCODE_MESSAGE = "Missing valid GM internal_barcode. GM labels require a numeric SKU barcode."


def _normalize_machine_code(value: object) -> str:
    cleaned = str(value or "").strip().upper()
    return cleaned if MACHINE_CODE_RE.fullmatch(cleaned) else ""


def _looks_like_machine_code(value: object) -> bool:
    return bool(_normalize_machine_code(value))


def _normalize_gm_label_barcode(value: object) -> str:
    cleaned = re.sub(r"\s+", "", str(value or "").strip().upper())
    return cleaned if GM_LABEL_BARCODE_RE.fullmatch(cleaned) else ""


def _is_gm_label_request(payload: dict, label_payload: dict | None = None) -> bool:
    label_payload = label_payload if isinstance(label_payload, dict) else (
        payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    )
    template_scope = str(
        label_payload.get("template_scope") or payload.get("template_scope") or ""
    ).strip().lower()
    template_code = str(
        label_payload.get("template_code") or payload.get("template_code") or ""
    ).strip().lower()
    entity_type = str(label_payload.get("entity_type") or payload.get("entity_type") or "").strip().upper()
    return template_scope == "gm_label" or template_code.startswith("gm_label") or entity_type in {"GM_SKU", "GM_GSKU"}


def _template_machine_prefix(template_code: object) -> str:
    return TEMPLATE_MACHINE_PREFIXES.get(str(template_code or "").strip().lower(), "")


def _display_machine_prefix(display_code: object) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]", "", str(display_code or "").strip()).upper()
    for pattern, prefix in DISPLAY_MACHINE_PREFIXES:
        if pattern.match(normalized):
            return prefix
    return ""


def _entity_machine_prefix(entity_type: object) -> str:
    return ENTITY_MACHINE_PREFIXES.get(str(entity_type or "").strip().upper(), "")


def _select_barcode_value(payload: dict) -> tuple[str, str | None]:
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    candidates = [
        label_payload.get("barcode_value"),
        payload.get("barcode_value"),
        label_payload.get("machine_code"),
        payload.get("machine_code"),
    ]
    machine_candidates = [
        label_payload.get("machine_code"),
        payload.get("machine_code"),
    ]

    for candidate in candidates:
        cleaned = str(candidate or "").strip().upper()
        if _looks_like_machine_code(cleaned):
            return cleaned, None

    for candidate in machine_candidates:
        cleaned = str(candidate or "").strip().upper()
        if cleaned:
            return cleaned, "Machine code does not match the expected numeric barcode prefix."

    display_code = str(label_payload.get("display_code") or payload.get("display_code") or "").strip()
    return "", f"Missing machine barcode value. Display code '{display_code}' will not be used as the encoded barcode."


def _select_strict_label_barcode_value(payload: dict) -> tuple[str, str | None]:
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    if _is_gm_label_request(payload, label_payload):
        candidates = [
            label_payload.get("internal_barcode"),
            payload.get("internal_barcode"),
            label_payload.get("barcode_value"),
            payload.get("barcode_value"),
            label_payload.get("machine_code"),
            payload.get("machine_code"),
        ]
        for candidate in candidates:
            barcode_value = _normalize_gm_label_barcode(candidate)
            if barcode_value:
                return barcode_value, None
        return "", MISSING_GM_BARCODE_MESSAGE

    raw_barcode = label_payload.get("barcode_value", payload.get("barcode_value"))
    barcode_value = str(raw_barcode or "").strip().upper()
    if barcode_value:
        normalized_barcode = _normalize_machine_code(barcode_value)
        if normalized_barcode:
            return normalized_barcode, None
        return "", MISSING_MACHINE_CODE_MESSAGE

    raw_machine_code = label_payload.get("machine_code", payload.get("machine_code"))
    machine_code = _normalize_machine_code(raw_machine_code)
    if machine_code:
        return machine_code, None

    return "", MISSING_MACHINE_CODE_MESSAGE


def _validate_label_type_contract(
    *,
    template_code: object,
    display_code: object,
    entity_type: object = "",
    machine_code: str,
) -> str | None:
    if str(template_code or "").strip().lower().startswith("gm_label") or str(entity_type or "").strip().upper() in {"GM_SKU", "GM_GSKU"}:
        return None
    template_prefix = _template_machine_prefix(template_code)
    display_prefix = _display_machine_prefix(display_code)
    entity_prefix = _entity_machine_prefix(entity_type)
    machine_prefix = str(machine_code or "")[:1]
    if entity_prefix and entity_prefix != machine_prefix:
        return "machine_code does not match template/display type."
    if display_prefix and display_prefix != machine_prefix:
        return "machine_code does not match template/display type."
    if template_prefix and template_prefix != machine_prefix:
        normalized_template = str(template_code or "").strip().lower()
        is_sdo_package_on_dispatch_template = (
            normalized_template in {"store_dispatch_60x40", "transtoshop"}
            and machine_prefix == "6"
            and (entity_prefix == "6" or display_prefix == "6" or not display_prefix)
        )
        if is_sdo_package_on_dispatch_template:
            return None
        return "machine_code does not match template/display type."
    return None


def _normalize_print_label_request(payload: dict) -> tuple[dict, str | None]:
    printer = payload.get("printer_name") or payload.get("printer")
    if not printer or not isinstance(printer, str):
        return {}, "Invalid request: 'printer_name' string is required."

    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    merged_payload = {**payload, **label_payload}
    barcode_value, barcode_error = _select_strict_label_barcode_value(payload)
    if barcode_error:
        return {}, barcode_error

    display_code = str(merged_payload.get("display_code") or "").strip().upper()
    template_code = str(merged_payload.get("template_code") or payload.get("template_code") or "").strip().lower()
    type_error = _validate_label_type_contract(
        template_code=template_code,
        display_code=display_code,
        entity_type=merged_payload.get("entity_type"),
        machine_code=barcode_value,
    )
    if type_error:
        return {}, type_error
    normalized_label_payload = {
        **merged_payload,
        "display_code": display_code,
        "machine_code": barcode_value,
        "barcode_value": barcode_value,
        "template_code": template_code,
        "template_scope": str(merged_payload.get("template_scope") or payload.get("template_scope") or "").strip().lower(),
    }
    return (
        {
            "printer_name": printer.strip(),
            "copies": _clean_positive_int(payload.get("copies"), default=1, maximum=20),
            "template_size": _normalize_template_size(payload.get("template_size")),
            "barcode_value": barcode_value,
            "display_code": display_code,
            "label_payload": normalized_label_payload,
        },
        None,
    )


def _normalize_print_html_request(payload: dict) -> tuple[dict, str | None]:
    html = payload.get("html")
    if not html or not isinstance(html, str):
        return {}, "Invalid request: 'html' string is required."

    printer = payload.get("printer_name") or payload.get("printer")
    if not printer or not isinstance(printer, str):
        return {}, "Invalid request: 'printer_name' string is required."

    barcode_value, warning = _select_barcode_value(payload)
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    display_code = str(label_payload.get("display_code") or payload.get("display_code") or "").strip()
    return (
        {
            "html": html,
            "printer_name": printer.strip(),
            "copies": _clean_positive_int(payload.get("copies"), default=1, maximum=20),
            "template_size": _normalize_template_size(payload.get("template_size")),
            "barcode_value": barcode_value,
            "display_code": display_code,
            "label_payload": label_payload,
            "warning": warning,
        },
        None,
    )


def _tspl_text_value(value: object, *, max_len: int = 34) -> str:
    cleaned = re.sub(r"[\r\n\t]+", " ", str(value or "").strip())
    cleaned = cleaned.replace('"', "'")
    cleaned = "".join(ch if 32 <= ord(ch) <= 126 else "?" for ch in cleaned)
    return cleaned[:max_len]


def _tspl_ascii_value(value: object, *, max_len: int = 34, default: str = "-") -> str:
    cleaned = re.sub(r"[\r\n\t]+", " ", str(value or "").strip())
    cleaned = cleaned.replace('"', "'")
    cleaned = "".join(ch if 32 <= ord(ch) <= 126 else " " for ch in cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return (cleaned or default)[:max_len]


def _tspl_text(x: int, y: int, text: str, *, x_scale: int = 1, y_scale: int = 1, max_len: int = 34) -> str:
    return f'TEXT {int(x)},{int(y)},"0",0,{int(x_scale)},{int(y_scale)},"{_tspl_text_value(text, max_len=max_len)}"'


def _wrap_tspl_ascii_lines(value: object, *, max_len: int, max_lines: int = 2) -> list[str]:
    cleaned = _tspl_ascii_value(value, max_len=120, default="")
    if not cleaned:
        return []
    lines: list[str] = []
    current = ""
    for token in cleaned.split(" "):
        while len(token) > max_len:
            if current:
                lines.append(current)
                current = ""
                if len(lines) >= max_lines:
                    return lines
            lines.append(token[:max_len])
            token = token[max_len:]
            if len(lines) >= max_lines:
                return lines
        candidate = f"{current} {token}".strip()
        if len(candidate) <= max_len:
            current = candidate
            continue
        if current:
            lines.append(current)
            if len(lines) >= max_lines:
                return lines
        current = token
    if current and len(lines) < max_lines:
        lines.append(current[:max_len])
    return lines[:max_lines]


def _join_unique_tspl_ascii_values(values: list[object], *, max_len: int = 120) -> str:
    visible: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = _tspl_ascii_value(value, max_len=max_len, default="")
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        visible.append(cleaned)
    return " / ".join(visible)


def _gm_label_40x30_name_lines(label_payload: dict, *, fallback: str) -> list[str]:
    full_name = _tspl_ascii_value(
        _first_label_value(label_payload, "product_name", "sku_name", "product_full_name", "name", default=fallback),
        max_len=120,
        default=fallback,
    )
    base_name = _tspl_ascii_value(
        _first_label_value(
            label_payload,
            "spu_name",
            "spu_product_name",
            "product_base_name",
            "base_product_name",
            "product_name_en",
            "product_name_cn",
            default="",
        ),
        max_len=120,
        default="",
    )
    variant_name = _join_unique_tspl_ascii_values(
        [
            label_payload.get("variant_summary"),
            label_payload.get("sku_variant"),
            label_payload.get("sku_spec"),
            label_payload.get("variant_name_en"),
            label_payload.get("variant_name_cn"),
            label_payload.get("spec"),
            label_payload.get("color"),
            label_payload.get("size"),
            label_payload.get("package"),
            label_payload.get("package_type"),
        ]
    )
    if not base_name and full_name and "-" in full_name:
        possible_base, possible_variant = [part.strip() for part in full_name.rsplit("-", 1)]
        if possible_base and possible_variant:
            base_name = possible_base
            variant_name = variant_name or possible_variant

    candidates: list[str] = []
    if base_name:
        candidates.append(base_name)
    if variant_name and variant_name.lower() not in (base_name or "").lower():
        candidates.append(variant_name)
    if not candidates:
        candidates.append(full_name or fallback)

    lines: list[str] = []
    for candidate in candidates:
        remaining = 2 - len(lines)
        if remaining <= 0:
            break
        lines.extend(_wrap_tspl_ascii_lines(candidate, max_len=30, max_lines=remaining))
    return lines[:2] or [_tspl_ascii_value(fallback, max_len=30)]


def _first_label_value(payload: dict, *keys: str, default: object = "") -> object:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return value
    return default


def _label_category_path(payload: dict) -> str:
    category_main = str(_first_label_value(payload, "category_main", "cat", "category", default="")).strip()
    category_sub = str(_first_label_value(payload, "category_sub", "sub", "subcategory", default="")).strip()
    if category_main and category_sub and category_sub.lower() != category_main.lower():
        return f"{category_main}/{category_sub}"
    return category_main or category_sub or "-"


def _summary_items(value: object, *, limit: int = 2) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    items = [item.strip() for item in re.split(r"\s*;\s*|\r?\n", text) if item.strip()]
    if not items:
        return []
    visible_limit = max(1, int(limit or 1))
    visible = items[:visible_limit]
    hidden_count = max(len(items) - visible_limit, 0)
    if hidden_count:
        visible[-1] = f"{visible[-1]} +{hidden_count} more"
    return visible


def _sdo_package_position(payload: dict) -> str:
    raw_position = str(_first_label_value(payload, "package_position_label", "package_position", default="")).strip()
    if raw_position:
        slash_match = re.search(r"(\d+)\s*/\s*(\d+)", raw_position)
        if slash_match:
            return f"{slash_match.group(1)}/{slash_match.group(2)}"
        chinese_match = re.search(r"第\s*(\d+)\s*包\s*/\s*共\s*(\d+)\s*包", raw_position)
        if chinese_match:
            return f"{chinese_match.group(1)}/{chinese_match.group(2)}"

    current = _first_label_value(payload, "serial_no", "package_index", "package_no", default=1)
    total = _first_label_value(payload, "total_packages", "package_total", "package_count", "packages", "bale_count", default=current)
    try:
        current_int = max(1, int(current))
    except (TypeError, ValueError):
        current_int = 1
    try:
        total_int = max(current_int, int(total))
    except (TypeError, ValueError):
        total_int = current_int
    return f"{current_int}/{total_int}"


def _sdo_source_codes(payload: dict) -> list[str]:
    raw_values = []
    for key in ("source_package_summary", "source_bales", "source_packages", "packing_list"):
        value = payload.get(key)
        if isinstance(value, (list, tuple)):
            raw_values.extend(str(item or "") for item in value)
        else:
            raw_values.append(str(value or ""))
    text = "\n".join(raw_values).upper()
    return list(dict.fromkeys(re.findall(r"\b(?:SDB|LPK)[A-Z0-9]+\b", text)))


def _sdo_packing_lines(payload: dict) -> list[str]:
    source_codes = _sdo_source_codes(payload)
    sdb_count = sum(1 for code in source_codes if code.startswith("SDB"))
    lpk_count = sum(1 for code in source_codes if code.startswith("LPK"))
    total = _first_label_value(payload, "packages", "package_count", "total_packages", "bale_count", default="")
    if source_codes:
        return [
            f"Total: {total or len(source_codes)}",
            f"SDB: {sdb_count}",
            f"LPK: {lpk_count}",
        ]

    if total:
        return [f"Total: {total}", "SDB: -", "LPK: -"]

    return ["Total: -", "SDB: -", "LPK: -"]


def _label_template_family(payload: dict) -> str:
    template_code = str(payload.get("template_code") or "").strip().lower()
    template_scope = str(payload.get("template_scope") or "").strip().lower()
    entity_type = str(payload.get("entity_type") or "").strip().upper()
    if template_scope == "gm_label" or template_code.startswith("gm_label") or entity_type in {"GM_SKU", "GM_GSKU"}:
        return "gm_label"
    entity_prefix = _entity_machine_prefix(payload.get("entity_type"))
    display_prefix = _display_machine_prefix(payload.get("display_code"))
    machine_prefix = str(payload.get("barcode_value") or payload.get("machine_code") or "")[:1]
    if entity_prefix == "6" or display_prefix == "6" or machine_prefix == "6":
        return "store_delivery_package"
    if entity_prefix == "4" or display_prefix == "4":
        return "store_delivery_execution"
    if template_code in {"warehouse_in", "warehouse_in_60x40", "raw_bale_60x40"}:
        return "raw_bale"
    if template_code in {"store_prep_bale_60x40", "wait_for_transtoshop", "wait_for_sale"}:
        return "store_prep_bale"
    if template_code in {"store_loose_pick_60x40", "lpk_shortage_pick"}:
        return "loose_pick_task"
    if template_code in {"store_dispatch_60x40", "transtoshop"}:
        return "store_delivery_execution"
    if template_code in {"store_item_60x40", "apparel_60x40", "clothes_retail"}:
        return "store_item"

    prefix = display_prefix or machine_prefix
    return {
        "1": "raw_bale",
        "2": "store_prep_bale",
        "3": "loose_pick_task",
        "4": "store_delivery_execution",
        "5": "store_item",
        "6": "store_delivery_package",
    }.get(prefix, "")


def _build_tspl_label_lines(payload: dict) -> list[tuple[int, int, str, int, int, int]]:
    barcode_value = str(payload.get("barcode_value") or payload.get("machine_code") or "").strip()
    display_code = str(payload.get("display_code") or "").strip()
    family = _label_template_family(payload)
    if family == "gm_label":
        name_lines = _gm_label_40x30_name_lines(payload, fallback=display_code or barcode_value)
        base_name = name_lines[0] if name_lines else (display_code or barcode_value)
        variant_name = name_lines[1] if len(name_lines) > 1 else ""
        return [
            (24, 34, base_name, 1, 1, 38),
            (24, 62, variant_name, 1, 1, 36),
            (172, 238, barcode_value, 1, 1, 18),
        ]
    if family == "raw_bale":
        return [
            (20, 8, "RAW_BALE", 2, 2, 12),
            (20, 42, f"SUP: {_first_label_value(payload, 'supplier_name', 'supplier', default='-')}", 1, 1, 28),
            (20, 68, f"CAT: {_first_label_value(payload, 'category_main', 'category', default='-')}", 1, 1, 28),
            (20, 94, f"SUB: {_first_label_value(payload, 'category_sub', 'subcategory', default='-')}", 1, 1, 28),
            (328, 42, f"No: {_first_label_value(payload, 'serial_no', 'package_no', default='-')}", 1, 1, 16),
            (328, 68, f"Total: {_first_label_value(payload, 'total_packages', default='-')}", 1, 1, 16),
            (20, 136, f"Display: {display_code or '-'}", 1, 1, 30),
            (20, 162, f"MCode: {barcode_value}", 1, 1, 24),
            (20, 188, f"Enc: {barcode_value}", 1, 1, 20),
        ]
    if family == "store_prep_bale":
        return [
            (20, 8, "SDB / PREP", 2, 2, 12),
            (20, 42, f"Store: {_first_label_value(payload, 'store', 'store_code', 'store_name', 'destination', default='-')}", 1, 1, 24),
            (252, 42, f"Qty: {_first_label_value(payload, 'item_count', 'qty', 'quantity', default='-')}", 1, 1, 20),
            (20, 70, f"Cat: {_label_category_path(payload)}", 1, 1, 34),
            (20, 98, f"Grade: {_first_label_value(payload, 'grade', 'grade_summary', default='-')}", 1, 1, 24),
            (252, 98, f"Src: {_first_label_value(payload, 'source_reference', 'source_bale_no', 'source', default='-')}", 1, 1, 22),
            (20, 126, f"Display: {display_code or '-'}", 1, 1, 30),
            (20, 154, f"Enc: {barcode_value}", 1, 1, 20),
        ]
    if family == "loose_pick_task":
        picked_items = _summary_items(_first_label_value(payload, "picked_item_summary", "pick_summary", "packing_list", default=""), limit=2)
        shortage_items = _summary_items(_first_label_value(payload, "shortage_summary", "short_summary", default=""), limit=1)
        return [
            (20, 8, "LPK / PICK", 2, 2, 12),
            (20, 42, f"Store: {_first_label_value(payload, 'store', 'store_code', 'store_name', default='-')}", 1, 1, 28),
            (20, 68, f"Req: {_first_label_value(payload, 'request', 'transfer_order_no', 'request_no', default='-')}", 1, 1, 34),
            (20, 94, f"Pick1: {picked_items[0] if len(picked_items) > 0 else '-'}", 1, 1, 34),
            (20, 120, f"Pick2: {picked_items[1] if len(picked_items) > 1 else '-'}", 1, 1, 34),
            (20, 146, f"Short: {shortage_items[0] if shortage_items else '-'}", 1, 1, 34),
            (20, 172, f"Display: {display_code or '-'}", 1, 1, 30),
            (20, 198, f"Enc: {barcode_value}", 1, 1, 20),
        ]
    if family == "store_delivery_execution":
        packing_lines = _sdo_packing_lines(payload)
        return [
            (20, 8, "SDO / DELIVERY", 2, 2, 14),
            (20, 44, f"Store: {_first_label_value(payload, 'store', 'store_code', 'store_name', default='-')}", 1, 1, 28),
            (20, 68, f"Req: {_first_label_value(payload, 'request', 'transfer_order_no', 'request_no', default='-')}", 1, 1, 32),
            (20, 92, f"Package: {_sdo_package_position(payload)}", 1, 1, 26),
            (20, 116, f"SDO: {display_code or '-'}", 1, 1, 30),
            (20, 140, f"MCode: {barcode_value}", 1, 1, 24),
            (300, 8, "PACKING", 1, 2, 12),
            (300, 44, packing_lines[0], 1, 1, 18),
            (300, 68, packing_lines[1], 1, 1, 18),
            (300, 92, packing_lines[2], 1, 1, 18),
        ]
    if family == "store_delivery_package":
        store = _tspl_ascii_value(_first_label_value(payload, "store", "store_code", "store_name", default="-"), max_len=10)
        package_position = _sdo_package_position(payload)
        source_code = _tspl_ascii_value(
            _first_label_value(payload, "source_code", "source_package_summary", "source_reference", default="-"),
            max_len=22,
        )
        category = _tspl_ascii_value(
            _first_label_value(payload, "content_summary", "category_summary", "category_display", "category", default="-"),
            max_len=22,
        ).upper()
        item_count = _tspl_ascii_value(_first_label_value(payload, "item_count", "qty", "quantity", default="-"), max_len=8)
        return [
            (20, 8, "SDP PACKAGE", 2, 2, 12),
            (330, 12, store, 1, 2, 10),
            (20, 46, f"PKG {package_position}", 1, 2, 10),
            (250, 42, f"QTY {item_count}", 2, 2, 8),
            (20, 88, display_code or "-", 2, 2, 14),
            (20, 132, f"CAT {category}", 1, 1, 22),
            (20, 160, f"SRC {source_code}", 1, 1, 22),
        ]
    if family == "store_item":
        return [
            (20, 8, "STORE_ITEM", 2, 2, 12),
            (20, 44, f"Price: {_first_label_value(payload, 'price', 'selected_price', default='-')}", 2, 2, 18),
            (250, 44, f"Rack: {_first_label_value(payload, 'rack', 'store_rack_code', default='-')}", 1, 1, 18),
            (20, 86, f"Cat: {_first_label_value(payload, 'category', 'category_summary', default='-')}", 1, 1, 34),
            (20, 118, f"Display: {display_code or '-'}", 1, 1, 30),
            (20, 144, f"MCode: {barcode_value}", 1, 1, 24),
            (20, 170, f"Enc: {barcode_value}", 1, 1, 20),
        ]
    return [
        (20, 8, f"Display: {display_code or '-'}", 1, 1, 34),
        (20, 34, f"Machine: {barcode_value}", 1, 1, 34),
        (20, 60, f"Encoded: {barcode_value}", 1, 1, 34),
    ]


def _build_tspl_60x40_label(label_payload: dict, *, copies: int = 1) -> str:
    barcode_value = str(label_payload.get("barcode_value") or label_payload.get("machine_code") or "").strip()
    family = _label_template_family(label_payload)
    if family == "gm_label":
        if not _normalize_gm_label_barcode(barcode_value):
            raise ValueError(MISSING_GM_BARCODE_MESSAGE)
    elif not _looks_like_machine_code(barcode_value):
        raise ValueError(MISSING_MACHINE_CODE_MESSAGE)

    commands = [
        "SIZE 60 mm,40 mm",
        "GAP 2 mm,0 mm",
        "DENSITY 8",
        "SPEED 4",
        "DIRECTION 1",
        "REFERENCE 0,0",
        "CLS",
    ]
    for x, y, text, x_scale, y_scale, max_len in _build_tspl_label_lines(label_payload):
        commands.append(_tspl_text(x, y, text, x_scale=x_scale, y_scale=y_scale, max_len=max_len))
    if family == "gm_label":
        commands.append("BAR 24,124,432,2")
        commands.extend(
            [
                f'BARCODE 42,148,"128",76,1,0,2,2,"{barcode_value}"',
                f"PRINT {max(1, int(copies))},1",
            ]
        )
        return "\r\n".join(commands) + "\r\n"
    if family not in {"store_prep_bale", "loose_pick_task", "store_delivery_execution", "store_delivery_package"}:
        commands.append("BAR 20,126,436,3")
    commands.extend(
        [
            f'BARCODE 24,232,"128",72,1,0,2,2,"{barcode_value}"',
            f"PRINT {max(1, int(copies))},1",
        ]
    )
    return "\r\n".join(commands) + "\r\n"


def _build_tspl_gm_40x30_label(label_payload: dict, *, copies: int = 1) -> str:
    barcode_value = str(label_payload.get("barcode_value") or label_payload.get("machine_code") or "").strip()
    if not _normalize_gm_label_barcode(barcode_value):
        raise ValueError(MISSING_GM_BARCODE_MESSAGE)

    name_lines = _gm_label_40x30_name_lines(label_payload, fallback=barcode_value)
    commands = [
        "SIZE 40 mm,30 mm",
        "GAP 2 mm,0 mm",
        "DENSITY 8",
        "SPEED 4",
        "DIRECTION 1",
        "REFERENCE 0,0",
        "CLS",
        *[_tspl_text(16, 22 + index * 22, line, x_scale=1, y_scale=1, max_len=30) for index, line in enumerate(name_lines)],
        f'BARCODE 34,84,"128",68,0,0,2,2,"{barcode_value}"',
        _tspl_text(82, 172, barcode_value, x_scale=1, y_scale=1, max_len=18),
        f"PRINT {max(1, int(copies))},1",
    ]
    return "\r\n".join(commands) + "\r\n"


def _build_tspl_label(label_payload: dict, *, template_size: str = "60x40", copies: int = 1) -> str:
    normalized_size = _normalize_template_size(template_size)
    family = _label_template_family(label_payload)
    if family == "gm_label" and normalized_size == "40x30":
        return _build_tspl_gm_40x30_label(label_payload, copies=copies)
    return _build_tspl_60x40_label(label_payload, copies=copies)


def _powershell_single_quote(value: object) -> str:
    return str(value or "").replace("'", "''")


def _windows_file_uri(path: str) -> str:
    normalized = str(path or "").replace("\\", "/")
    if re.match(r"^[A-Za-z]:/", normalized):
        return f"file:///{normalized}"
    if normalized.startswith("//"):
        return f"file:{normalized}"
    return Path(normalized).resolve().as_uri()


def _find_windows_browser() -> str:
    explicit = os.environ.get("FWERP_PRINT_BROWSER_PATH", "").strip()
    candidates = [
        explicit,
        shutil.which("msedge") or "",
        shutil.which("chrome") or "",
        shutil.which("chrome.exe") or "",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return ""


def _build_windows_html_print_script(
    *,
    printer_name: str,
    browser_path: str,
    html_path: str,
    copies: int,
    wait_seconds: int = 8,
    browser_profile_dir: str = "",
) -> str:
    profile_dir = browser_profile_dir or tempfile.mkdtemp(prefix="fwerp-print-agent-browser-")
    file_uri = _windows_file_uri(html_path)
    return (
        "$ErrorActionPreference = 'Stop'; "
        f"$targetPrinter = '{_powershell_single_quote(printer_name)}'; "
        f"$browserPath = '{_powershell_single_quote(browser_path)}'; "
        f"$fileUri = '{_powershell_single_quote(file_uri)}'; "
        f"$profileDir = '{_powershell_single_quote(profile_dir)}'; "
        f"$copies = {int(copies)}; "
        f"$waitSeconds = {int(wait_seconds)}; "
        "$previousDefault = (Get-CimInstance Win32_Printer | "
        "Where-Object { $_.Default -eq $true } | "
        "Select-Object -First 1 -ExpandProperty Name); "
        "Get-Printer -Name $targetPrinter -ErrorAction Stop | Out-Null; "
        "$network = New-Object -ComObject WScript.Network; "
        "$network.SetDefaultPrinter($targetPrinter); "
        "try { "
        "New-Item -ItemType Directory -Force -Path $profileDir | Out-Null; "
        "for ($i = 0; $i -lt $copies; $i++) { "
        "$args = @('--kiosk-printing','--disable-print-preview','--no-first-run',"
        "'--disable-extensions','--user-data-dir=' + $profileDir,$fileUri); "
        "$proc = Start-Process -FilePath $browserPath -ArgumentList $args -PassThru; "
        "Start-Sleep -Seconds $waitSeconds; "
        "if ($proc -and -not $proc.HasExited) { "
        "$proc.CloseMainWindow() | Out-Null; "
        "Start-Sleep -Milliseconds 800; "
        "if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } "
        "} "
        "} "
        "} finally { "
        "if ($previousDefault) { $network.SetDefaultPrinter($previousDefault) } "
        "}"
    )


def _print_html_windows(
    *,
    printer: str,
    html_path: str,
    copies: int = 1,
    template_size: str = "60x40",
) -> tuple[bool, str, str]:
    if platform.system() != "Windows":
        return False, "Windows HTML print is only available when the agent runs on Windows.", printer

    resolved_printer, warning, printer_error = _resolve_available_printer_name_windows(printer)
    if printer_error:
        return False, printer_error, resolved_printer

    browser_path = _find_windows_browser()
    if not browser_path:
        return (
            False,
            "Microsoft Edge or Google Chrome was not found. Install Edge/Chrome or set FWERP_PRINT_BROWSER_PATH.",
            resolved_printer,
        )

    script = _build_windows_html_print_script(
        printer_name=resolved_printer,
        browser_path=browser_path,
        html_path=html_path,
        copies=copies,
        wait_seconds=8,
    )
    command = ["powershell", "-NoProfile", "-Command", script]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown Windows browser print error"
        prefix = f"{warning} " if warning else ""
        return False, f"{prefix}Windows HTML print failed for '{resolved_printer}': {err}", resolved_printer

    prefix = f"{warning} " if warning else ""
    return (
        True,
        f"{prefix}Print job submitted to '{resolved_printer}' via Windows kiosk browser printing ({template_size}, {copies} copies).",
        resolved_printer,
    )


def _send_raw_to_windows_printer(printer_name: str, raw_text: str) -> tuple[bool, str]:
    if platform.system() != "Windows":
        return False, "Windows raw print is only available when the agent runs on Windows."

    try:
        import ctypes
        from ctypes import wintypes
    except Exception as exc:  # pragma: no cover - ctypes is always available on normal Windows Python.
        return False, f"Python ctypes is unavailable for Windows raw printing: {exc}"

    class DOC_INFO_1W(ctypes.Structure):
        _fields_ = [
            ("pDocName", wintypes.LPWSTR),
            ("pOutputFile", wintypes.LPWSTR),
            ("pDatatype", wintypes.LPWSTR),
        ]

    winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)
    winspool.OpenPrinterW.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), wintypes.LPVOID]
    winspool.OpenPrinterW.restype = wintypes.BOOL
    winspool.StartDocPrinterW.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(DOC_INFO_1W)]
    winspool.StartDocPrinterW.restype = wintypes.DWORD
    winspool.StartPagePrinter.argtypes = [wintypes.HANDLE]
    winspool.StartPagePrinter.restype = wintypes.BOOL
    winspool.WritePrinter.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
    winspool.WritePrinter.restype = wintypes.BOOL
    winspool.EndPagePrinter.argtypes = [wintypes.HANDLE]
    winspool.EndDocPrinter.argtypes = [wintypes.HANDLE]
    winspool.ClosePrinter.argtypes = [wintypes.HANDLE]

    printer_handle = wintypes.HANDLE()
    if not winspool.OpenPrinterW(str(printer_name), ctypes.byref(printer_handle), None):
        error_code = ctypes.get_last_error()
        return False, f"OpenPrinter failed for '{printer_name}' (Windows error {error_code})."

    try:
        doc_info = DOC_INFO_1W("FW-ERP 60x40 TSPL Label", None, "RAW")
        if not winspool.StartDocPrinterW(printer_handle, 1, ctypes.byref(doc_info)):
            error_code = ctypes.get_last_error()
            return False, f"StartDocPrinter RAW failed for '{printer_name}' (Windows error {error_code})."
        try:
            if not winspool.StartPagePrinter(printer_handle):
                error_code = ctypes.get_last_error()
                return False, f"StartPagePrinter failed for '{printer_name}' (Windows error {error_code})."
            try:
                data = raw_text if isinstance(raw_text, bytes) else str(raw_text or "").encode("ascii", errors="replace")
                buffer = ctypes.create_string_buffer(data)
                bytes_written = wintypes.DWORD(0)
                ok = winspool.WritePrinter(
                    printer_handle,
                    buffer,
                    len(data),
                    ctypes.byref(bytes_written),
                )
                if not ok or int(bytes_written.value) != len(data):
                    error_code = ctypes.get_last_error()
                    return (
                        False,
                        f"WritePrinter RAW failed for '{printer_name}' "
                        f"({bytes_written.value}/{len(data)} bytes, Windows error {error_code}).",
                    )
            finally:
                winspool.EndPagePrinter(printer_handle)
        finally:
            winspool.EndDocPrinter(printer_handle)
    finally:
        winspool.ClosePrinter(printer_handle)

    return True, f"Sent {len(raw_text if isinstance(raw_text, bytes) else raw_text.encode('ascii', errors='replace'))} TSPL bytes to '{printer_name}'."


def _print_label_windows(normalized: dict) -> tuple[bool, str, str, str]:
    if platform.system() != "Windows":
        return False, "Windows TSPL label print is only available when the agent runs on Windows.", normalized.get("printer_name", ""), ""

    requested_printer = str(normalized.get("printer_name") or "").strip()
    resolved_printer, warning, printer_error = _resolve_available_printer_name_windows(requested_printer)
    if printer_error:
        return False, printer_error, resolved_printer, ""

    try:
        tspl = _build_tspl_label(
            normalized.get("label_payload") if isinstance(normalized.get("label_payload"), dict) else {},
            template_size=normalized.get("template_size") or "60x40",
            copies=int(normalized.get("copies") or 1),
        )
    except Exception as exc:
        return False, f"Could not build TSPL label: {exc}", resolved_printer, ""

    success, raw_message = _send_raw_to_windows_printer(resolved_printer, tspl)
    prefix = f"{warning} " if warning else ""
    if not success:
        return False, f"{prefix}Windows TSPL raw print failed for '{resolved_printer}': {raw_message}", resolved_printer, tspl
    return True, f"{prefix}Print job submitted to '{resolved_printer}' via TSPL raw printing.", resolved_printer, tspl


def _http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url=url, data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8") if resp.length is None or resp.length > 0 else ""
            parsed = json.loads(body) if body else {}
            return int(resp.status), parsed if isinstance(parsed, dict) else {}
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8") if exc.fp else ""
        parsed: dict = {}
        if body:
            try:
                raw = json.loads(body)
                if isinstance(raw, dict):
                    parsed = raw
            except json.JSONDecodeError:
                parsed = {"raw": body}
        return int(exc.code), parsed


def _extract_pending_jobs(response_payload: dict) -> list[dict]:
    for key in ("items", "jobs", "results", "data"):
        value = response_payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    if isinstance(response_payload.get("job"), dict):
        return [response_payload["job"]]

    if response_payload.get("id"):
        return [response_payload]

    return []


def _build_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def run_print_station(config_path: Path):
    if platform.system() != "Windows":
        raise RuntimeError("Print-station mode is Windows-first. Run this mode on a Windows print computer.")

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    config = json.loads(config_path.read_text(encoding="utf-8"))

    api_base_url = _sanitize_text(config.get("api_base_url"))
    station_id = _sanitize_text(config.get("station_id"))
    printer_name = _sanitize_text(config.get("printer_name"))
    poll_interval_seconds = int(config.get("poll_interval_seconds", 5) or 5)

    missing = [
        name
        for name, value in (
            ("api_base_url", api_base_url),
            ("station_id", station_id),
            ("printer_name", printer_name),
        )
        if not value
    ]
    if missing:
        raise ValueError(f"Missing required config fields: {', '.join(missing)}")

    print("[print-station] Starting FW-ERP Windows print-station agent")
    print(f"[print-station] station_id={station_id} printer_name={printer_name} poll={poll_interval_seconds}s")
    print(f"[print-station] api_base_url={api_base_url}")

    while True:
        try:
            pending_url = _build_url(api_base_url, f"print-jobs/pending?{parse.urlencode({'station_id': station_id})}")
            status_code, pending_payload = _http_json("GET", pending_url)
            if status_code >= 400:
                print(f"[{_utc_now()}] pending poll failed: status={status_code} body={pending_payload}")
                time.sleep(poll_interval_seconds)
                continue

            jobs = _extract_pending_jobs(pending_payload)
            if not jobs:
                print(f"[{_utc_now()}] polling ok: no pending jobs")
                time.sleep(poll_interval_seconds)
                continue

            job = jobs[0]
            job_id = _job_field(job, "id", "job_id")
            if not job_id:
                print(f"[{_utc_now()}] skipped malformed pending job: {job}")
                time.sleep(poll_interval_seconds)
                continue

            claim_url = _build_url(api_base_url, f"print-jobs/{job_id}/claim")
            claim_status, claim_payload = _http_json("POST", claim_url, {"station_id": station_id})
            if claim_status >= 400:
                print(f"[{_utc_now()}] claim failed for job={job_id}: status={claim_status} body={claim_payload}")
                time.sleep(poll_interval_seconds)
                continue

            print(f"[{_utc_now()}] claimed job={job_id}; printing...")
            label_text = _render_bale_label_text(job)
            printed, print_message, temp_path = _print_text_windows(printer_name=printer_name, text_content=label_text)

            if printed:
                complete_url = _build_url(api_base_url, f"print-jobs/{job_id}/complete")
                complete_status, complete_payload = _http_json("POST", complete_url, {"station_id": station_id})
                if complete_status >= 400:
                    print(
                        f"[{_utc_now()}] printed but complete failed job={job_id}: "
                        f"status={complete_status} body={complete_payload}"
                    )
                else:
                    print(f"[{_utc_now()}] completed job={job_id}; {print_message}; temp={temp_path}")
            else:
                fail_url = _build_url(api_base_url, f"print-jobs/{job_id}/fail")
                fail_status, fail_payload = _http_json(
                    "POST",
                    fail_url,
                    {
                        "station_id": station_id,
                        "error": print_message,
                    },
                )
                print(
                    f"[{_utc_now()}] failed job={job_id}; fail_status={fail_status}; "
                    f"print_error={print_message}; fail_body={fail_payload}; temp={temp_path}"
                )
        except KeyboardInterrupt:
            print("\n[print-station] Stopped by operator.")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[{_utc_now()}] loop error: {exc}")

        time.sleep(poll_interval_seconds)


class PrintAgentHandler(BaseHTTPRequestHandler):
    server_version = "FWERPPrintAgent/0.2"

    def _set_headers(self, status_code: int = 200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        cors_headers = _build_cors_headers(self.headers.get("Origin"))
        for header_name, header_value in cors_headers.items():
            self.send_header(header_name, header_value)
        self.end_headers()

    def _send_json(self, payload: dict, status_code: int = 200):
        self._set_headers(status_code)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _read_json(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        try:
            decoded = json.loads(raw.decode("utf-8"))
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):  # noqa: N802
        self._set_headers(204)

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path

        if path == "/health":
            self._send_json(
                {
                    "status": "ok",
                    "version": APP_VERSION,
                    "platform": platform.system().lower(),
                    "mode": "local-api",
                    "host": HOST,
                    "port": PORT,
                    "timestamp_utc": _utc_now(),
                }
            )
            return

        if path == "/printers":
            system_name = platform.system()
            if system_name in {"Darwin", "Linux"}:
                printers, warning = _list_printers_unix()
                self._send_json(
                    {
                        "platform": system_name,
                        "printers": printers,
                        "count": len(printers),
                        "warning": warning,
                    }
                )
                return

            if system_name == "Windows":
                printers, warning = _list_printers_windows()
                self._send_json(
                    {
                        "platform": system_name,
                        "printers": printers,
                        "count": len(printers),
                        "warning": warning,
                    },
                    200 if printers else 500,
                )
                return

            self._send_json(
                {
                    "platform": system_name,
                    "printers": [],
                    "count": 0,
                    "warning": f"Unsupported platform for printer listing: {system_name}",
                },
                501,
            )
            return

        self._send_json({"error": "Not found"}, 404)

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path
        payload = self._read_json()

        if path in {"/print/label", "/print/tspl"}:
            normalized, validation_error = _normalize_print_label_request(payload)
            if validation_error:
                self._send_json({"ok": False, "error": validation_error, "message": validation_error}, 400)
                return

            system_name = platform.system()
            if system_name == "Windows":
                success, message, resolved_printer, tspl = _print_label_windows(normalized)
                self._send_json(
                    {
                        "ok": success,
                        "platform": system_name,
                        "mode": "tspl_raw",
                        "printer": normalized["printer_name"],
                        "resolved_printer": resolved_printer,
                        "message": message,
                        "template_size": normalized["template_size"],
                        "copies": normalized["copies"],
                        "barcode_value": normalized["barcode_value"],
                        "display_code": normalized["display_code"],
                        "tspl": tspl,
                    },
                    200 if success else 500,
                )
                return

            self._send_json(
                {
                    "ok": False,
                    "platform": system_name,
                    "mode": "tspl_raw",
                    "message": f"TSPL raw label print is currently supported on Windows only: {system_name}",
                },
                501,
            )
            return

        if path == "/print/html":
            if platform.system() == "Windows" and isinstance(payload.get("label_payload"), dict):
                normalized, validation_error = _normalize_print_label_request(payload)
                if validation_error:
                    self._send_json({"ok": False, "error": validation_error, "message": validation_error}, 400)
                    return
                success, message, resolved_printer, tspl = _print_label_windows(normalized)
                self._send_json(
                    {
                        "ok": success,
                        "platform": "Windows",
                        "mode": "tspl_raw",
                        "printer": normalized["printer_name"],
                        "resolved_printer": resolved_printer,
                        "message": message,
                        "template_size": normalized["template_size"],
                        "copies": normalized["copies"],
                        "barcode_value": normalized["barcode_value"],
                        "display_code": normalized["display_code"],
                        "tspl": tspl,
                    },
                    200 if success else 500,
                )
                return

            normalized, validation_error = _normalize_print_html_request(payload)
            if validation_error:
                self._send_json({"error": validation_error}, 400)
                return
            html = normalized["html"]
            printer = normalized["printer_name"]

            with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False, encoding="utf-8") as temp_file:
                temp_file.write(html)
                html_path = temp_file.name

            system_name = platform.system()
            if system_name in {"Darwin", "Linux"}:
                success, message, resolved_printer = _print_html_unix(printer=printer, html_path=html_path)
                self._send_json(
                    {
                        "ok": success,
                        "platform": system_name,
                        "printer": printer,
                        "resolved_printer": resolved_printer,
                        "message": message,
                        "temp_file": html_path,
                        "template_size": normalized["template_size"],
                        "copies": normalized["copies"],
                        "barcode_value": normalized["barcode_value"],
                        "display_code": normalized["display_code"],
                        "warning": normalized["warning"],
                    },
                    200 if success else 500,
                )
                return

            if system_name == "Windows":
                success, message, resolved_printer = _print_html_windows(
                    printer=printer,
                    html_path=html_path,
                    copies=normalized["copies"],
                    template_size=normalized["template_size"],
                )
                self._send_json(
                    {
                        "ok": success,
                        "platform": system_name,
                        "printer": printer,
                        "resolved_printer": resolved_printer,
                        "message": message,
                        "temp_file": html_path,
                        "template_size": normalized["template_size"],
                        "copies": normalized["copies"],
                        "barcode_value": normalized["barcode_value"],
                        "display_code": normalized["display_code"],
                        "warning": normalized["warning"],
                    },
                    200 if success else 500,
                )
                return

            self._send_json(
                {
                    "ok": False,
                    "platform": system_name,
                    "printer": printer,
                    "message": f"Unsupported platform for HTML print: {system_name}",
                    "temp_file": html_path,
                },
                501,
            )
            return

        if path == "/print/raw":
            self._send_json(
                {
                    "ok": False,
                    "experimental": False,
                    "message": "POST /print/raw is disabled. Use POST /print/label for validated 60x40 TSPL label printing.",
                },
                501,
            )
            return

        self._send_json({"error": "Not found"}, 404)

    def log_message(self, format: str, *args):
        return


def run_local_api_server():
    server = ThreadingHTTPServer((HOST, PORT), PrintAgentHandler)
    print(f"FW-ERP Local Print Agent v{APP_VERSION} running on http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="FW-ERP print agent")
    subparsers = parser.add_subparsers(dest="mode")

    subparsers.add_parser("local-api", help="Run localhost HTTP print bridge (legacy MVP mode)")

    station_parser = subparsers.add_parser("print-station", help="Run Windows cloud print-station poller")
    station_parser.add_argument(
        "--config",
        default="print_station_config.json",
        help="Path to print-station config JSON (default: print_station_config.json)",
    )

    args = parser.parse_args()
    if args.mode in (None, "local-api"):
        run_local_api_server()
        return

    if args.mode == "print-station":
        run_print_station(Path(args.config))


if __name__ == "__main__":
    main()
