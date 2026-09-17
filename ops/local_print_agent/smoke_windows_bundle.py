"""Exercise the downloaded Windows EXE without sending any valid print request."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener
import zipfile

from build_windows_bundle import BUNDLE_FILES, source_sha256, validate_windows_exe

ORIGINS = (
    "https://staging.directlooperp.com",
    "https://directlooperp.com",
    "https://online-saler-operations-staging-3fkoh3sliq-bq.a.run.app",
    "https://online-saler-operations-staging-865804815203.africa-south1.run.app",
)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def request(path, *, method="GET", origin=None, payload=None):
    headers = {"Origin": origin} if origin else {}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if method == "OPTIONS":
        headers.update({"Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true"})
    req = Request("http://127.0.0.1:8719" + path, method=method, headers=headers,
                  data=json.dumps(payload).encode() if payload is not None else None)
    try:
        response = build_opener(ProxyHandler({})).open(req, timeout=20)
    except HTTPError as exc:
        response = exc
    with response:
        body = response.read()
        return response.status, response.headers, json.loads(body) if body else None


def stop_test_process(process):
    if process.poll() is None:
        # Only this test's own PyInstaller parent/child processes are stopped.
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       check=False, capture_output=True, timeout=15)
        process.wait(timeout=15)


def smoke(archive_path):
    require(platform.system() == "Windows", "Run EXE smoke tests on Windows.")
    manifest = json.loads(archive_path.with_suffix(".json").read_text(encoding="utf-8"))
    data = archive_path.read_bytes()
    require(hashlib.sha256(data).hexdigest() == manifest["sha256"], "ZIP digest mismatch")
    require(len(data) == manifest["bytes"], "ZIP size mismatch")
    require(source_sha256(Path(__file__).resolve().parent) == manifest["sourceSha256"], "Source digest mismatch")
    # Fail on an existing listener without touching it.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        probe.bind(("127.0.0.1", 8719))
    # Windows can still hold the image handle for a moment after taskkill has
    # returned, which failed the run on directory cleanup long after every
    # assertion had already passed. The checks below are what this script is
    # for; a temp folder the runner discards anyway is not worth failing over.
    with tempfile.TemporaryDirectory(prefix="direct-loop-exe-smoke-", ignore_cleanup_errors=True) as temp:
        work = Path(temp)
        with zipfile.ZipFile(archive_path) as archive:
            require(set(archive.namelist()) == {"DirectLoopPrintAgent/" + name for name in BUNDLE_FILES},
                    "The ready-to-run ZIP must contain exactly EXE, BAT, README, SOURCE, and version.json.")
            archive.extractall(work)
        folder = work / "DirectLoopPrintAgent"
        exe = folder / "DirectLoopPrintAgent.exe"
        validate_windows_exe(exe.read_bytes())
        version = json.loads((folder / "version.json").read_text(encoding="utf-8"))
        require(version["version"] == manifest["version"], "Version mismatch")
        require(version["sourceSha256"] == manifest["sourceSha256"], "Embedded source digest mismatch")
        env = {key: value for key, value in os.environ.items()
               if key.upper() not in {"PATH", "PYTHONHOME", "PYTHONPATH", "VIRTUAL_ENV"}}
        windows = Path(os.environ["SystemRoot"])
        env["PATH"] = os.pathsep.join(str(path) for path in (
            windows / "System32", windows, windows / "System32" / "Wbem",
            windows / "System32" / "WindowsPowerShell" / "v1.0"))
        with (work / "agent.log").open("w+", encoding="utf-8") as log:
            process = subprocess.Popen([str(exe)], cwd=folder, env=env,
                                       stdout=log, stderr=subprocess.STDOUT,
                                       creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
            try:
                deadline = time.monotonic() + 45
                while True:
                    require(process.poll() is None, "EXE exited before the localhost API was ready.")
                    try:
                        status, _, health = request("/health")
                        break
                    except (URLError, OSError):
                        require(time.monotonic() < deadline, "EXE did not start within 45 seconds.")
                        time.sleep(0.2)
                require(status == 200 and health["status"] == "ok", "Health failed")
                require(health["version"] == manifest["version"], "Running EXE version mismatch")
                require(health["platform"] == "windows" and health["mode"] == "local-api", "Wrong runtime platform or mode")
                require(health["port"] == 8719, "Wrong port")
                require({"erp-labels", "online_saler_raster_v1"}.issubset(health["capabilities"]), "Required label protocols are missing")
                require("60x40" in health["label_sizes"], "720 label size is missing")
                status, _, printers = request("/printers")
                require(status in (200, 500) and printers["platform"] == "Windows", "Windows printer discovery failed")
                require(isinstance(printers["printers"], list) and printers["count"] == len(printers["printers"]), "Invalid printer response")
                # A CI runner need not have a printer installed; discovery must still return structured JSON.
                for origin in ORIGINS:
                    status, headers, _ = request("/health", origin=origin)
                    require(status == 200 and headers.get("Access-Control-Allow-Origin") == origin, "Allowed origin failed")
                    status, headers, _ = request("/print/label", method="OPTIONS", origin=origin)
                    require(status == 204 and headers.get("Access-Control-Allow-Origin") == origin, "CORS preflight failed")
                    require(headers.get("Access-Control-Allow-Private-Network") == "true", "Local-network preflight failed")
                for path in ("/print/label", "/print/tspl"):
                    for invalid in ({}, {"printer_name": "NEVER_PRINT_FROM_CI", "template_size": "60x40",
                                        "label_payload": {"template_scope": "online_saler_product", "barcode_value": "INVALID\"BARCODE"}}):
                        status, _, body = request(path, method="POST", origin=ORIGINS[2], payload=invalid)
                        require(status == 400 and body["ok"] is False, "Invalid print input was not rejected")
                status, headers, body = request("/print/label", method="POST", origin="https://untrusted.example", payload={})
                require(status == 403 and body["ok"] is False and not headers.get("Access-Control-Allow-Origin"), "Untrusted origin was allowed")
                # Starting the same bundle a second time must leave the first helper untouched.
                duplicate = subprocess.Popen([str(exe)], cwd=folder, env=env, stdout=subprocess.PIPE,
                                             stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
                try:
                    output, _ = duplicate.communicate(timeout=15)
                    require(duplicate.returncode == 0 and b"already running" in output, "Duplicate-start handling failed")
                finally:
                    stop_test_process(duplicate)
                require(process.poll() is None and request("/health")[0] == 200, "Original helper stopped after duplicate launch")
                print(f"Windows EXE smoke passed: v{manifest['version']}, no Python on PATH, {printers['count']} queues, no labels printed.")
            finally:
                stop_test_process(process)
                log.seek(0)
                print(log.read())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", required=True, type=Path)
    args = parser.parse_args()
    smoke(args.zip.resolve())
