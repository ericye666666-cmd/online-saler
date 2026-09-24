"""Package an actual Windows x64 executable and fingerprint its exact source."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile

SOURCE_FILES = (
    "agent.py", "erp_agent.py", "legacy_product_labels.py",
    "start_online_saler_print_agent_windows.bat", "README.md", "SOURCE.md",
)
BUNDLE_FILES = (
    "DirectLoopPrintAgent.exe", "start_online_saler_print_agent_windows.bat",
    "README.md", "SOURCE.md", "version.json",
)
FILENAME = "direct-loop-print-agent.zip"


def source_sha256(source_dir, names=SOURCE_FILES):
    digest = hashlib.sha256()
    for name in names:
        digest.update(name.encode("utf-8") + b"\0")
        digest.update((source_dir / name).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def validate_windows_exe(data):
    if len(data) < 64 or data[:2] != b"MZ":
        raise ValueError("The bundle requires a real Windows executable, not source code.")
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    if (pe_offset + 6 > len(data) or data[pe_offset:pe_offset + 4] != b"PE\0\0"
            or struct.unpack_from("<H", data, pe_offset + 4)[0] != 0x8664):
        raise ValueError("The executable must be a Windows x64 PE binary.")


def build_bundle(exe_path, output_dir, source_dir=Path(__file__).resolve().parent):
    executable = exe_path.read_bytes()
    validate_windows_exe(executable)
    version = re.search(r'^APP_VERSION = "([^"]+)"$', (source_dir / "agent.py").read_text(encoding="utf-8"), re.M)
    if not version:
        raise ValueError("Missing APP_VERSION in agent.py")
    source_digest = source_sha256(source_dir)
    version_info = {
        "version": version.group(1), "platform": "windows", "architecture": "x64",
        "port": 8719, "sourceSha256": source_digest,
        "capabilities": ["erp-labels", "online_saler_raster_v1"],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / FILENAME
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in BUNDLE_FILES:
            data = (executable if name.endswith(".exe") else
                    (json.dumps(version_info, indent=2) + "\n").encode("utf-8") if name == "version.json" else
                    (source_dir / name).read_bytes())
            archive.writestr("DirectLoopPrintAgent/" + name, data)
    bundle_data = archive_path.read_bytes()
    manifest = {
        "version": version.group(1), "sha256": hashlib.sha256(bundle_data).hexdigest(),
        "bytes": len(bundle_data), "filename": FILENAME, "sourceSha256": source_digest,
    }
    (output_dir / "direct-loop-print-agent.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build_bundle(args.exe, args.output_dir), indent=2))
