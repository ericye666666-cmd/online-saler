#!/usr/bin/env python3
"""Shared ERP / Online Saler Deli 720 print adapter. See SOURCE.md."""
import base64
import binascii
import errno
import json
import platform
import re
import shutil
import socket
import subprocess
import sys
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
from urllib.parse import urlparse
import erp_agent as erp
import legacy_product_labels as legacy

APP_VERSION = "1.2.0"
DEFAULT_PRINTER_NAME = "Deli DL-720C"
ONLINE_ORIGIN = re.compile(r"^https://online-saler-operations-staging-(?:3fkoh3sliq-bq\.a|865804815203\.africa-south1)\.run\.app$|^http://(?:localhost|127\.0\.0\.1):3001$")
_original_cors = erp._build_cors_headers
_original_normalize = erp._normalize_print_label_request
_original_build = erp._build_tspl_label

def cors_headers(origin):
    if origin and ONLINE_ORIGIN.fullmatch(origin):
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Private-Network": "true"}
    return _original_cors(origin)

def normalize_label_payload(payload):
    label = payload.get("label_payload") or {}
    if not isinstance(label, dict):
        return {}, "Invalid label payload."
    if label.get("template_scope") != "online_saler_product":
        return _original_normalize(payload)
    barcode = str(label.get("barcode_value") or "")
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{3,63}", barcode):
        return {}, "Product barcode is missing or invalid."
    if "raster" not in label:
        old, error = legacy.normalize_label_payload(payload)
        if error:
            return {}, error
        return {"printer_name": old["printer_name"], "copies": old["copies"], "template_size": old["template_size"], "barcode_value": barcode, "display_code": barcode, "label_payload": {**label, "legacy_product": old}}, None
    if payload.get("template_size") != "60x40":
        return {}, "Online product labels require 60x40 mm paper."
    raster = label.get("raster")
    if not isinstance(raster, dict) or raster.get("width") != 480 or raster.get("height") != 320:
        return {}, "Update the Operations page: a 480x320 label preview is required."
    try:
        encoded = raster.get("data") or ""
        if len(encoded) > 25600:
            raise ValueError("oversized")
        pixels = base64.b64decode(encoded, validate=True)
        if len(pixels) != 19200:
            raise ValueError("invalid size")
    except (ValueError, TypeError, binascii.Error):
        return {}, "Invalid label raster."
    printer = str(payload.get("printer_name") or "").strip()
    if not printer or len(printer) > 200:
        return {}, "Select a printer."
    return {"printer_name": printer, "copies": 1, "template_size": "60x40", "barcode_value": barcode, "display_code": barcode, "label_payload": {**label, "raster_bytes": pixels}}, None

def build_tspl_label(label_payload, *, template_size="60x40", copies=1):
    if label_payload.get("template_scope") != "online_saler_product":
        return _original_build(label_payload, template_size=template_size, copies=copies)
    if "legacy_product" in label_payload:
        return legacy.build_tspl_label(label_payload["legacy_product"])
    pixels = label_payload["raster_bytes"]
    return b"SIZE 60 mm,40 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 8\r\nSPEED 4\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,60,320,0," + pixels + b"\r\nPRINT 1,1\r\n"

def send_raw_to_cups_printer(printer_name, tspl):
    """Hands the label bytes to CUPS untouched.

    Windows reaches the printer through the RAW spooler; macOS and Linux reach it
    through `lp -o raw`, which tells CUPS to skip every filter and put the file on
    the wire byte for byte. The DL-720C speaks TSPL, so anything that renders on
    the way — a driver, a PPD, the PDF filter chain — feeds out a blank label.
    """
    if not shutil.which("lp"):
        return False, "The 'lp' command was not found, so CUPS cannot be reached."
    data = tspl if isinstance(tspl, bytes) else str(tspl).encode("ascii", errors="replace")
    result = subprocess.run(["lp", "-d", printer_name, "-o", "raw", "-"], input=data, capture_output=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).decode("utf-8", errors="replace").strip()
        return False, f"lp failed for '{printer_name}': {detail or 'unknown error'}"
    return True, f"Sent {len(data)} TSPL bytes to '{printer_name}'."

def print_label_cups(normalized):
    """The macOS / Linux half of erp._print_label_windows, same return shape."""
    requested = str(normalized.get("printer_name") or "").strip()
    resolved, warning = erp._resolve_printer_name_unix(requested)
    if not resolved:
        return False, warning or "No printer name was provided.", requested, b""
    try:
        tspl = build_tspl_label(
            normalized.get("label_payload") if isinstance(normalized.get("label_payload"), dict) else {},
            template_size=normalized.get("template_size") or "60x40",
            copies=int(normalized.get("copies") or 1))
    except (ValueError, TypeError, KeyError) as exc:
        return False, f"Could not build TSPL label: {exc}", resolved, b""
    ok, message = send_raw_to_cups_printer(resolved, tspl)
    prefix = f"{warning} " if warning else ""
    if not ok:
        return False, f"{prefix}Raw label print failed for '{resolved}': {message}", resolved, tspl
    return True, f"{prefix}Print job submitted to '{resolved}' via CUPS raw printing.", resolved, tspl

def print_label(normalized):
    """Sends a built label to whichever spooler this computer happens to have.

    The label itself is identical everywhere: the same 480x320 raster, the same
    TSPL bytes. Only the last hop differs, and for a while only the Windows hop
    existed — a Mac reached the point of pressing print and was told to go find a
    Windows computer.
    """
    if platform.system() == "Windows":
        return erp._print_label_windows(normalized)
    return print_label_cups(normalized)

class PrintAgentHandler(erp.PrintAgentHandler):
    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._send_json({"status": "ok", "version": APP_VERSION, "platform": platform.system().lower(), "mode": "local-api", "capabilities": ["erp-labels", "online_saler_raster_v1"], "label_sizes": ["60x40"], "port": 8719})
            return
        super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin")
        if origin and not cors_headers(origin):
            self._send_json({"ok": False, "message": "Origin is not allowed."}, 403)
            return
        if urlparse(self.path).path in {"/print/label", "/print/tspl"}:
            try:
                payload = self._read_json()
                normalized, error = normalize_label_payload(payload)
                if error:
                    self._send_json({"ok": False, "message": error}, 400)
                    return
                if normalized["label_payload"].get("template_scope") == "online_saler_product":
                    ok, message, printer, _ = print_label(normalized)
                    self._send_json({"ok": ok, "message": message, "printer": printer, "mode": "tspl_raw", "barcode_value": normalized["barcode_value"]}, 200 if ok else 500)
                    return
                # Preserve the original ERP dispatch and platform handling.
                self._read_json = lambda: payload
                super().do_POST()
            except (ValueError, TypeError, KeyError) as exc:
                self._send_json({"ok": False, "message": str(exc)}, 400)
            return
        super().do_POST()

erp._build_cors_headers = cors_headers
erp._normalize_print_label_request = normalize_label_payload
erp._build_tspl_label = build_tspl_label
erp.PrintAgentHandler = PrintAgentHandler

class LocalPrintServer(erp.ThreadingHTTPServer):
    # Windows SO_REUSEADDR can let a second helper steal an active listener.
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def existing_agent_is_current():
    try:
        # Local checks must not travel through a workstation's HTTP proxy.
        opener = build_opener(ProxyHandler({}))
        with opener.open(f"http://{erp.HOST}:{erp.PORT}/health", timeout=2) as response:
            health = json.load(response)
        return (health.get("status") == "ok" and health.get("version") == APP_VERSION
                and health.get("mode") == "local-api"
                and {"erp-labels", "online_saler_raster_v1"}.issubset(health.get("capabilities", [])))
    except (URLError, OSError, ValueError, TypeError, AttributeError):
        return False


def run_local_api_server():
    try:
        server = LocalPrintServer((erp.HOST, erp.PORT), PrintAgentHandler)
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE or getattr(exc, "winerror", None) == 10048:
            if existing_agent_is_current():
                print("Direct Loop print agent is already running. Return to Operations and click Detect.")
                return 0
            print(f"Port {erp.PORT} is already in use. Close the old ERP / Direct Loop helper window, then start this helper again.")
            print("No running process was stopped.")
            return 1
        print(f"Could not start the print helper on {erp.HOST}:{erp.PORT}: {exc}")
        return 1
    print(f"Direct Loop ERP / Online Saler Print Agent v{APP_VERSION}", flush=True)
    print(f"Running on http://{erp.HOST}:{erp.PORT}. Keep this window open and click Detect in Operations.", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


def main():
    # Double-clicking the standalone EXE must start the browser bridge.
    if sys.argv[1:] in ([], ["local-api"]):
        return run_local_api_server()
    return erp.main()


if __name__ == "__main__":
    sys.exit(main())
