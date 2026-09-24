"""Package the macOS print helper.

The Mac download is source, not a binary, and that is deliberate. The helper is
standard-library Python with nothing to compile, so an executable would only add
a code-signing certificate we do not have — leaving warehouse staff to talk an
unsigned binary past Gatekeeper. A folder of readable files and a double-clickable
launcher is both smaller and easier to get running.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

from build_windows_bundle import source_sha256

SOURCE_FILES = (
    "agent.py", "erp_agent.py", "legacy_product_labels.py",
    "start_online_saler_print_agent_macos.command", "README.md", "SOURCE.md",
)
BUNDLE_FILES = SOURCE_FILES + ("version.json",)
LAUNCHER = "start_online_saler_print_agent_macos.command"
FILENAME = "direct-loop-print-agent-macos.zip"
MANIFEST = "direct-loop-print-agent-macos.json"
PREFIX = "DirectLoopPrintAgent/"


def build_bundle(output_dir, source_dir=Path(__file__).resolve().parent):
    version = re.search(r'^APP_VERSION = "([^"]+)"$', (source_dir / "agent.py").read_text(encoding="utf-8"), re.M)
    if not version:
        raise ValueError("Missing APP_VERSION in agent.py")
    source_digest = source_sha256(source_dir, SOURCE_FILES)
    version_info = {
        "version": version.group(1), "platform": "macos", "architecture": "any",
        "port": 8719, "sourceSha256": source_digest,
        "capabilities": ["erp-labels", "online_saler_raster_v1"],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / FILENAME
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in BUNDLE_FILES:
            data = ((json.dumps(version_info, indent=2) + "\n").encode("utf-8") if name == "version.json"
                    else (source_dir / name).read_bytes())
            entry = zipfile.ZipInfo(PREFIX + name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            # Unzipping must leave the launcher runnable. Without the mode, a
            # double-click opens the script in a text editor instead. This archive
            # is built on the Windows runner, where ZipInfo would otherwise mark
            # every entry as FAT and macOS would discard the mode along with it.
            entry.create_system = 3
            entry.external_attr = (0o755 if name == LAUNCHER else 0o644) << 16
            archive.writestr(entry, data)
    bundle_data = archive_path.read_bytes()
    manifest = {
        "version": version.group(1), "sha256": hashlib.sha256(bundle_data).hexdigest(),
        "bytes": len(bundle_data), "filename": FILENAME, "sourceSha256": source_digest,
    }
    (output_dir / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build_bundle(args.output_dir), indent=2))
