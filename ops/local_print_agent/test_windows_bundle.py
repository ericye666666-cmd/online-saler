import contextlib
import io
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.request import urlopen
import zipfile

import agent
from build_windows_bundle import BUNDLE_FILES, SOURCE_FILES, build_bundle, source_sha256


class WindowsBundleTests(unittest.TestCase):
    def test_rejects_source_renamed_to_exe(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            exe = root / "DirectLoopPrintAgent.exe"
            exe.write_text("print('source cannot be distributed as an executable')", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "real Windows executable"):
                build_bundle(exe, root / "downloads")

    def test_archive_is_runtime_only_and_source_changes_invalidate_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source"
            source.mkdir()
            for name in SOURCE_FILES:
                shutil.copyfile(Path(__file__).parent / name, source / name)
            # Minimal PE header fixture; real executable execution is covered on the Windows runner.
            fixture = bytearray(256)
            fixture[:2] = b"MZ"
            struct.pack_into("<I", fixture, 0x3C, 128)
            fixture[128:132] = b"PE\0\0"
            struct.pack_into("<H", fixture, 132, 0x8664)
            exe = root / "fixture.exe"
            exe.write_bytes(fixture)
            manifest = build_bundle(exe, root / "downloads", source)
            self.assertEqual(manifest["version"], agent.APP_VERSION)
            with zipfile.ZipFile(root / "downloads" / manifest["filename"]) as archive:
                self.assertEqual(set(archive.namelist()), {"DirectLoopPrintAgent/" + name for name in BUNDLE_FILES})
                version = json.loads(archive.read("DirectLoopPrintAgent/version.json"))
                self.assertEqual(version["sourceSha256"], manifest["sourceSha256"])
                launcher = archive.read("DirectLoopPrintAgent/start_online_saler_print_agent_windows.bat")
                self.assertIn(b'"%~dp0DirectLoopPrintAgent.exe"', launcher)
                self.assertNotIn(b"python", launcher.lower())
                self.assertNotIn(b"winget", launcher.lower())
            (source / "erp_agent.py").write_bytes((source / "erp_agent.py").read_bytes() + b"\n# changed\n")
            self.assertNotEqual(source_sha256(source), manifest["sourceSha256"])

    def test_double_click_defaults_to_local_api_and_keeps_erp_cli(self):
        for arguments in ([], ["local-api"]):
            with patch.object(sys, "argv", ["DirectLoopPrintAgent.exe", *arguments]), patch.object(agent, "run_local_api_server", return_value=0) as run:
                self.assertEqual(agent.main(), 0)
                run.assert_called_once_with()
        with patch.object(sys, "argv", ["DirectLoopPrintAgent.exe", "print-station", "--config", "erp.json"]), patch.object(agent.erp, "main") as erp_main:
            agent.main()
            erp_main.assert_called_once_with()

    def test_occupied_port_never_replaces_existing_listener(self):
        server = agent.LocalPrintServer(("127.0.0.1", 0), agent.PrintAgentHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(agent.erp, "PORT", server.server_port), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(agent.run_local_api_server(), 0)
                self.assertIn("already running", output.getvalue())
                with patch.object(agent, "existing_agent_is_current", return_value=False):
                    self.assertEqual(agent.run_local_api_server(), 1)
                self.assertIn("No running process was stopped", output.getvalue())
                with urlopen(f"http://127.0.0.1:{server.server_port}/health", timeout=2) as response:
                    self.assertEqual(response.status, 200)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
