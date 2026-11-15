"""Electron 2.4.x and earlier only find an update through an electron-updater feed."""
import importlib.util
import pathlib
import sys
import tempfile
import unittest

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("viezan_package", SCRIPTS / "package.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

# SHA-512 of b"abc" (FIPS 180-4 test vector), base64-encoded as electron-updater expects.
ABC_SHA512 = "3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=="


class LegacyFeedTests(unittest.TestCase):
    def test_feed_names_the_installer_with_its_size_and_sha512(self):
        with tempfile.TemporaryDirectory() as directory:
            installer = pathlib.Path(directory) / "Viezan-2.5.1-win32-x64.exe"
            installer.write_bytes(b"abc")
            lines = package.legacy_feed(installer, "2.5.1").splitlines()
        self.assertEqual(lines[:7], [
            "version: 2.5.1",
            "files:",
            "  - url: Viezan-2.5.1-win32-x64.exe",
            f"    sha512: {ABC_SHA512}",
            "    size: 3",
            "path: Viezan-2.5.1-win32-x64.exe",
            f"sha512: {ABC_SHA512}",
        ])
        self.assertRegex(lines[7], r"^releaseDate: '\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z'$")
        self.assertEqual(len(lines), 8)


if __name__ == "__main__":
    unittest.main()
