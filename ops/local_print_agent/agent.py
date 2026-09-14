#!/usr/bin/env python3
"""Shared ERP / Online Saler Deli 720 print adapter. See SOURCE.md."""
import base64
import binascii
import json
import platform
import re
from urllib.parse import urlparse
import erp_agent as erp
import legacy_product_labels as legacy

APP_VERSION = "1.0.0"
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
        return {}, "Select a Windows printer."
    return {"printer_name": printer, "copies": 1, "template_size": "60x40", "barcode_value": barcode, "display_code": barcode, "label_payload": {**label, "raster_bytes": pixels}}, None

def build_tspl_label(label_payload, *, template_size="60x40", copies=1):
    if label_payload.get("template_scope") != "online_saler_product":
        return _original_build(label_payload, template_size=template_size, copies=copies)
    if "legacy_product" in label_payload:
        return legacy.build_tspl_label(label_payload["legacy_product"])
    pixels = label_payload["raster_bytes"]
    return b"SIZE 60 mm,40 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 8\r\nSPEED 4\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,60,320,0," + pixels + b"\r\nPRINT 1,1\r\n"

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
                    ok, message, printer, _ = erp._print_label_windows(normalized)
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

if __name__ == "__main__":
    erp.main()
