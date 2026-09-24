import json
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
import zipfile

import agent
from build_macos_bundle import BUNDLE_FILES, LAUNCHER, PREFIX, SOURCE_FILES, build_bundle


class MacosBundleTests(unittest.TestCase):
    def build(self, temp):
        root = Path(temp)
        source = root / "source"
        source.mkdir()
        for name in SOURCE_FILES:
            shutil.copyfile(Path(__file__).parent / name, source / name)
        return root, build_bundle(root / "downloads", source)

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

    def test_changed_source_invalidates_the_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            root, manifest = self.build(temp)
            source = root / "source"
            (source / "agent.py").write_bytes((source / "agent.py").read_bytes() + b"\n# changed\n")
            self.assertNotEqual(build_bundle(root / "downloads2", source)["sourceSha256"], manifest["sourceSha256"])


if __name__ == "__main__":
    unittest.main()
