#!/usr/bin/env python3
"""Online Saler local label print agent for Deli DL-720C."""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import json
import platform
import re
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

APP_VERSION = "0.1.0"
HOST = "127.0.0.1"
PORT = 8719
DEFAULT_PRINTER_NAME = "Deli DL-720C"

ALLOWED_ORIGIN_RE = re.compile(
    r"^https://online-saler-operations-staging-[a-z0-9-]+\.a\.run\.app$|"
    r"^https://online-saler-operations-staging-[a-z0-9-]+\.run\.app$|"
    r"^http://localhost(:[0-9]+)?$|"
    r"^http://127\.0\.0\.1(:[0-9]+)?$"
)

BARCODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{3,63}$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def cors_headers(origin: str | None) -> dict[str, str]:
    if not origin or not ALLOWED_ORIGIN_RE.fullmatch(origin):
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Private-Network": "true",
    }


def normalize_printer_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def parse_windows_printer_json(raw_json: str) -> tuple[list[dict], str | None]:
    text = str(raw_json or "").strip()
    if not text:
        return [], "Windows returned no printers."
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        return [], f"Windows returned invalid printer JSON: {exc}"

    rows = parsed if isinstance(parsed, list) else [parsed]
    printers: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("Name") or "").strip()
        if not name:
            continue
        work_offline = coerce_bool(row.get("WorkOffline"))
        raw_status = str(row.get("PrinterStatus") or "").strip()
        status_lower = raw_status.lower()
        problem_status = any(marker in status_lower for marker in ("offline", "error", "paper", "jam", "paused"))
        available = not work_offline and not problem_status
        printers.append(
            {
                "name": name,
                "status": "offline" if work_offline else ("unavailable" if problem_status else "available"),
                "raw_status": raw_status or ("Offline" if work_offline else "Normal"),
                "available": available,
            }
        )
    return printers, None if printers else "Windows returned no usable printer names."


def list_windows_printers() -> tuple[list[dict], str | None]:
    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "$ErrorActionPreference = 'Stop'; "
            "Get-Printer | ForEach-Object { "
            "[pscustomobject]@{ "
            "Name = $_.Name; "
            "PrinterStatus = [string]$_.PrinterStatus; "
            "WorkOffline = [bool]$_.WorkOffline "
            "} } | ConvertTo-Json -Compress"
        ),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        error = result.stderr.strip() or result.stdout.strip() or "unknown Get-Printer error"
        return [], f"Get-Printer failed: {error}"
    return parse_windows_printer_json(result.stdout)


def resolve_windows_printer(requested: str) -> tuple[str, str | None]:
    requested = str(requested or DEFAULT_PRINTER_NAME).strip()
    printers, warning = list_windows_printers()
    requested_norm = normalize_printer_name(requested)

    candidates: list[dict] = []
    for printer in printers:
        name = str(printer.get("name") or "")
        name_norm = normalize_printer_name(name)
        if name == requested or name_norm == requested_norm:
            candidates.append(printer)
        elif "deli" in name_norm and ("720" in name_norm or "dl720" in name_norm):
            candidates.append(printer)

    if not candidates:
        available = ", ".join(str(printer.get("name") or "") for printer in printers)
        return requested, f"Deli 720 printer was not found. Available printers: {available or 'none'}"

    selected = candidates[0]
    if not bool(selected.get("available")):
        return str(selected.get("name") or requested), (
            "Deli 720 printer is not available. Turn off Use Printer Offline, clear paused jobs, "
            "and confirm Windows can print a test page."
        )

    return str(selected.get("name") or requested), warning


def clean_text(value: object, limit: int = 32) -> str:
    text = re.sub(r"[\r\n\"]+", " ", str(value or "").strip())
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def normalize_label_payload(payload: dict) -> tuple[dict, str | None]:
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else payload
    template_size = normalize_template_size(payload.get("template_size") or label_payload.get("template_size"))
    barcode = str(label_payload.get("barcode_value") or payload.get("barcode_value") or "").strip().upper()
    if not BARCODE_RE.fullmatch(barcode):
        return {}, "Label barcode is missing or invalid."

    printer_name = str(payload.get("printer_name") or payload.get("printer") or DEFAULT_PRINTER_NAME).strip()
    return {
        "printer_name": printer_name,
        "template_size": template_size,
        "copies": max(1, min(int(payload.get("copies") or 1), 10)),
        "barcode": barcode,
        "title": clean_text(label_payload.get("title"), 34),
        "category": clean_text(label_payload.get("category"), 18),
        "color": clean_text(label_payload.get("color"), 14),
        "size": clean_text(label_payload.get("size"), 10),
        "condition": clean_text(label_payload.get("condition"), 14),
        "product_code": clean_text(label_payload.get("product_code"), 20),
    }, None


def normalize_template_size(value: object) -> str:
    raw = str(value or "").strip().lower().replace(" ", "")
    if raw in {"40x30", "4030", "40*30", "40mmx30mm"}:
        return "40x30"
    return "60x40"


def build_tspl_label(data: dict) -> str:
    if data["template_size"] == "40x30":
        return "\r\n".join(
            [
                "SIZE 40 mm,30 mm",
                "GAP 2 mm,0 mm",
                "DENSITY 8",
                "SPEED 4",
                "DIRECTION 1",
                "CLS",
                f'TEXT 20,18,"2",0,1,1,"{data["category"]} {data["color"]}"',
                f'TEXT 20,48,"2",0,1,1,"SIZE {data["size"]} {data["condition"]}"',
                f'BARCODE 20,82,"128",70,1,0,2,2,"{data["barcode"]}"',
                f'TEXT 20,160,"1",0,1,1,"{data["barcode"]}"',
                f"PRINT 1,{data['copies']}",
                "",
            ]
        )

    return "\r\n".join(
        [
            "SIZE 60 mm,40 mm",
            "GAP 2 mm,0 mm",
            "DENSITY 8",
            "SPEED 4",
            "DIRECTION 1",
            "CLS",
            f'TEXT 24,18,"2",0,1,1,"{data["title"]}"',
            f'TEXT 24,50,"2",0,1,1,"{data["category"]} / {data["color"]}"',
            f'TEXT 24,82,"2",0,1,1,"SIZE {data["size"]}  {data["condition"]}"',
            f'BARCODE 24,120,"128",82,1,0,2,2,"{data["barcode"]}"',
            f'TEXT 24,218,"1",0,1,1,"{data["barcode"]}"',
            f'TEXT 24,244,"1",0,1,1,"{data["product_code"]}"',
            f"PRINT 1,{data['copies']}",
            "",
        ]
    )


def send_raw_to_windows_printer(printer_name: str, raw_text: str) -> tuple[bool, str]:
    if platform.system() != "Windows":
        return False, "Local Deli label printing must run on Windows."

    winspool = ctypes.WinDLL("winspool.drv", use_last_error=True)

    class DOC_INFO_1W(ctypes.Structure):
        _fields_ = [
            ("pDocName", wintypes.LPWSTR),
            ("pOutputFile", wintypes.LPWSTR),
            ("pDatatype", wintypes.LPWSTR),
        ]

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
        return False, f"OpenPrinter failed for '{printer_name}' (Windows error {ctypes.get_last_error()})."

    try:
        doc_info = DOC_INFO_1W("Online Saler Product Label", None, "RAW")
        if not winspool.StartDocPrinterW(printer_handle, 1, ctypes.byref(doc_info)):
            return False, f"StartDocPrinter failed for '{printer_name}' (Windows error {ctypes.get_last_error()})."
        try:
            if not winspool.StartPagePrinter(printer_handle):
                return False, f"StartPagePrinter failed for '{printer_name}' (Windows error {ctypes.get_last_error()})."
            try:
                data = raw_text.encode("ascii", errors="replace")
                buffer = ctypes.create_string_buffer(data)
                written = wintypes.DWORD(0)
                ok = winspool.WritePrinter(printer_handle, buffer, len(data), ctypes.byref(written))
                if not ok or int(written.value) != len(data):
                    return False, f"WritePrinter failed ({written.value}/{len(data)} bytes)."
            finally:
                winspool.EndPagePrinter(printer_handle)
        finally:
            winspool.EndDocPrinter(printer_handle)
    finally:
        winspool.ClosePrinter(printer_handle)

    return True, f"Sent {len(raw_text.encode('ascii', errors='replace'))} TSPL bytes to '{printer_name}'."


class PrintAgentHandler(BaseHTTPRequestHandler):
    server_version = "OnlineSalerPrintAgent/0.1"

    def set_headers(self, status_code: int = 200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        for header_name, header_value in cors_headers(self.headers.get("Origin")).items():
            self.send_header(header_name, header_value)
        self.end_headers()

    def send_json(self, payload: dict, status_code: int = 200):
        self.set_headers(status_code)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        try:
            decoded = json.loads(self.rfile.read(length).decode("utf-8"))
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):  # noqa: N802
        self.set_headers(204)

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path
        if path == "/health":
            self.send_json(
                {
                    "status": "ok",
                    "version": APP_VERSION,
                    "mode": "local-api",
                    "platform": platform.system().lower(),
                    "printer": DEFAULT_PRINTER_NAME,
                    "label_sizes": ["60x40", "40x30"],
                    "timestamp_utc": utc_now(),
                }
            )
            return
        if path == "/printers":
            if platform.system() != "Windows":
                self.send_json({"printers": [], "warning": "Run this agent on Windows for Deli printing."}, 501)
                return
            printers, warning = list_windows_printers()
            self.send_json({"printers": printers, "count": len(printers), "warning": warning}, 200 if printers else 500)
            return
        self.send_json({"message": "Not found"}, 404)

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path
        if path != "/print/label":
            self.send_json({"message": "Not found"}, 404)
            return

        normalized, validation_error = normalize_label_payload(self.read_json())
        if validation_error:
            self.send_json({"ok": False, "message": validation_error}, 400)
            return

        if platform.system() != "Windows":
            tspl = build_tspl_label(normalized)
            self.send_json(
                {
                    "ok": False,
                    "message": "Run this local print agent on the Windows computer connected to Deli 720.",
                    "template_size": normalized["template_size"],
                    "barcode_value": normalized["barcode"],
                    "tspl": tspl,
                },
                501,
            )
            return

        printer_name, printer_warning = resolve_windows_printer(normalized["printer_name"])
        if printer_warning and printer_warning.startswith("Deli 720"):
            self.send_json({"ok": False, "message": printer_warning}, 500)
            return

        tspl = build_tspl_label(normalized)
        success, message = send_raw_to_windows_printer(printer_name, tspl)
        if printer_warning:
            message = f"{printer_warning} {message}"
        self.send_json(
            {
                "ok": success,
                "message": message,
                "mode": "tspl_raw",
                "printer": printer_name,
                "template_size": normalized["template_size"],
                "barcode_value": normalized["barcode"],
            },
            200 if success else 500,
        )

    def log_message(self, _format: str, *args):
        return


def run_server():
    server = ThreadingHTTPServer((HOST, PORT), PrintAgentHandler)
    print(f"Online Saler Print Agent v{APP_VERSION} running on http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Online Saler local label print agent")
    parser.add_argument("mode", nargs="?", default="local-api", choices=["local-api"])
    parser.parse_args()
    run_server()


if __name__ == "__main__":
    main()
