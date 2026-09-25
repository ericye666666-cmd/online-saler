import ast
import json
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest
import zipfile

import agent
from build_macos_bundle import BUNDLE_FILES, EXECUTABLES, INSTALLER, LAUNCHER, PREFIX, SOURCE_FILES, UNINSTALLER, build_bundle


class MacosBundleTests(unittest.TestCase):
    def build(self, temp):
        root = Path(temp)
        source = root / "source"
        source.mkdir()
        for name in SOURCE_FILES:
            shutil.copyfile(Path(__file__).parent / name, source / name)
        return root, build_bundle(root / "downloads", source)

    def test_source_runs_on_the_python_macos_ships(self):
        # A Mac's python3 from the Command Line Tools is 3.9. Annotations such
        # as `str | None` only evaluate on 3.10+, so every module defers them.
        for name in SOURCE_FILES:
            if not name.endswith(".py"):
                continue
            text = (Path(__file__).parent / name).read_text(encoding="utf-8")
            ast.parse(text, feature_version=(3, 9))
            self.assertIn("from __future__ import annotations", text, name)

    def test_bundle_carries_the_source_the_helper_needs(self):
        with tempfile.TemporaryDirectory() as temp:
            root, manifest = self.build(temp)
            self.assertEqual(manifest["version"], agent.APP_VERSION)
            with zipfile.ZipFile(root / "downloads" / manifest["filename"]) as archive:
                self.assertEqual(set(archive.namelist()), {PREFIX + name for name in BUNDLE_FILES})
                version = json.loads(archive.read(PREFIX + "version.json"))
                self.assertEqual(version["platform"], "macos")
                self.assertEqual(version["sourceSha256"], manifest["sourceSha256"])
                self.assertIn("online_saler_raster_v1", version["capabilities"])

    def test_launcher_unzips_runnable(self):
        # A launcher without the executable bit opens in TextEdit when double-clicked,
        # which looks exactly like a broken download to whoever is holding the printer.
        with tempfile.TemporaryDirectory() as temp:
            root, manifest = self.build(temp)
            with zipfile.ZipFile(root / "downloads" / manifest["filename"]) as archive:
                info = archive.getinfo(PREFIX + LAUNCHER)
                mode = info.external_attr >> 16
                self.assertTrue(mode & stat.S_IXUSR, f"launcher mode is {oct(mode)}")
                # Built on Windows, unzipped on a Mac: a FAT-flagged entry loses the mode.
                self.assertEqual(info.create_system, 3)
                launcher = archive.read(PREFIX + LAUNCHER)
            self.assertTrue(launcher.startswith(b"#!/bin/sh"))
            # CRLF would make macOS report "bad interpreter" and print nothing useful.
            self.assertNotIn(b"\r\n", launcher)
            self.assertIn(b"python3 agent.py", launcher)

    def test_install_scripts_unzip_runnable(self):
        with tempfile.TemporaryDirectory() as temp:
            root, manifest = self.build(temp)
            with zipfile.ZipFile(root / "downloads" / manifest["filename"]) as archive:
                for name in (INSTALLER, UNINSTALLER):
                    self.assertIn(name, EXECUTABLES)
                    info = archive.getinfo(PREFIX + name)
                    self.assertTrue((info.external_attr >> 16) & stat.S_IXUSR, name)
                    self.assertEqual(info.create_system, 3)
                    script = archive.read(PREFIX + name)
                    self.assertTrue(script.startswith(b"#!/bin/sh"), name)
                    self.assertNotIn(b"\r", script, name)

    def test_installer_registers_a_login_item_that_stays_up(self):
        # Staff never open Terminal: the helper must start at login and come back
        # if it dies, from a copy that survives emptying Downloads.
        text = (Path(__file__).parent / INSTALLER).read_text(encoding="utf-8")
        for needle in (
            'LABEL="ke.directloop.printagent"', "<key>Label</key>",
            "<key>RunAtLoad</key>\n  <true/>", "<key>KeepAlive</key>\n  <true/>",
            "<key>ProgramArguments</key>", "<key>WorkingDirectory</key>",
            "<key>StandardOutPath</key>", "<key>StandardErrorPath</key>",
            "Library/Application Support/DirectLoopPrintAgent", "Library/LaunchAgents/$LABEL.plist",
            "Library/Logs/DirectLoopPrintAgent.log", "command -v python3", "xcode-select --install",
            'launchctl bootstrap "$DOMAIN"', "launchctl load -w", 'launchctl bootout "$DOMAIN/$LABEL"',
            "http://127.0.0.1:$PORT/health", "drv:///sample.drv/generic.ppd",
        ):
            self.assertIn(needle, text)
        # Everything the installed copy runs must be copied out of Downloads.
        copied = text.split('FILES="', 1)[1].split('"', 1)[0].split()
        for name in SOURCE_FILES:
            if name.endswith(".py"):
                self.assertIn(name, copied)
        self.assertIn(UNINSTALLER, copied)
        uninstall = (Path(__file__).parent / UNINSTALLER).read_text(encoding="utf-8")
        self.assertIn("ke.directloop.printagent", uninstall)
        self.assertIn("launchctl bootout", uninstall)
        self.assertNotIn("lpadmin", uninstall)

    def test_shell_scripts_parse(self):
        shell = shutil.which("sh")
        if not shell:
            self.skipTest("no POSIX sh on this machine")
        for name in (LAUNCHER, INSTALLER, UNINSTALLER):
            result = subprocess.run([shell, "-n", str(Path(__file__).parent / name)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f"{name}: {result.stderr}")

    def test_changed_source_invalidates_the_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root, manifest = self.build(temp)
            source = root / "source"
            (source / "agent.py").write_bytes((source / "agent.py").read_bytes() + b"\n# changed\n")
            self.assertNotEqual(build_bundle(root / "downloads2", source)["sourceSha256"], manifest["sourceSha256"])


if __name__ == "__main__":
    unittest.main()
