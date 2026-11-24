"""Native release packaging and legacy update feeds."""
from contextlib import redirect_stderr
import importlib.util
import io
import pathlib
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("viezan_package", SCRIPTS / "package.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)
from verify_macos_dmg import DEVELOPER_ID, PREVIEW_CERTIFICATE, PREVIEW_REQUIREMENT, VIEZAN_REQUIREMENT, verify_app

# SHA-512 of b"abc" (FIPS 180-4 test vector), base64-encoded as electron-updater expects.
ABC_SHA512 = "3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=="


class MacReleaseTests(unittest.TestCase):
    def test_preview_rejects_an_intel_app_with_an_arm_helper(self):
        with tempfile.TemporaryDirectory() as directory:
            app = pathlib.Path(directory) / 'Viezan.app'
            (app / 'Contents').mkdir(parents=True)
            info = {'CFBundleIdentifier': 'com.viezan.native.preview', 'CFBundleExecutable': 'ViezanNative',
                    'CFBundleShortVersionString': '2.6.0'}
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
            with patch.object(subprocess, 'run'), patch.object(subprocess, 'check_output',
                    side_effect=['x86_64\n', 'arm64\n']):
                with self.assertRaisesRegex(ValueError, 'viezan-fs: expected x86_64, found arm64'):
                    verify_app(app, 'x64', '2.6.0', preview=True)

    @unittest.skipUnless(sys.platform == 'darwin', 'Apple code-signing tools')
    def test_apple_parses_signing_requirements(self):
        for requirement in (DEVELOPER_ID, VIEZAN_REQUIREMENT, PREVIEW_REQUIREMENT):
            with self.subTest(requirement=requirement):
                subprocess.run(['csreq', '-r', requirement, '-t'], check=True, capture_output=True)

    def test_preview_requires_the_pinned_leaf_for_every_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            app = pathlib.Path(directory) / 'Viezan.app'
            (app / 'Contents').mkdir(parents=True)
            info = {'CFBundleIdentifier': 'com.viezan.native.preview', 'CFBundleExecutable': 'ViezanNative',
                    'CFBundleShortVersionString': '2.6.1'}
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
            with patch.object(subprocess, 'check_output', return_value='arm64'), patch.object(subprocess, 'run') as verify:
                verify_app(app, 'arm64', '2.6.1', preview=True)
            commands = [call.args[0] for call in verify.call_args_list]
            self.assertEqual([cmd[-1].name for cmd in commands], ['Viezan.app', 'viezan-fs', 'viezan-smc', 'viezan-fan-helper'])
            for cmd in commands:
                self.assertIn(f'certificate leaf = H"{PREVIEW_CERTIFICATE}"', cmd[cmd.index('-R') + 1])

    def test_missing_signing_settings_stop_before_creating_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            output = pathlib.Path(directory) / 'packages'
            app = pathlib.Path(directory) / 'Viezan.app'
            app.mkdir()
            for flags in ([], ['--identity', 'cert'], ['--notary-profile', 'profile']):
                with self.subTest(flags=flags):
                    argv = ['package.py', '--input', str(app), '--output', str(output), *flags]
                    error = io.StringIO()
                    with patch.object(sys, 'platform', 'darwin'), patch.object(sys, 'argv', argv), redirect_stderr(error):
                        with self.assertRaises(SystemExit):
                            package.main()
                    self.assertIn('requires --identity', error.getvalue())
                    self.assertFalse(output.exists())

    def test_notary_rejection_stops_before_stapling(self):
        rejected = subprocess.CompletedProcess([], 0, stdout='{"status":"Invalid","id":"submission-id"}')
        with patch.object(subprocess, 'run', return_value=rejected) as submit, patch.object(package, 'run') as staple:
            with self.assertRaisesRegex(SystemExit, 'submission-id: Invalid'):
                package.notarize('Viezan.zip', 'Viezan.app', 'profile', None)
            submit.assert_called_once()
            staple.assert_not_called()

    def test_accepted_submission_staples_the_target_with_a_custom_profile_keychain(self):
        accepted = subprocess.CompletedProcess([], 0, stdout='{"status":"Accepted","id":"submission-id"}')
        with patch.object(subprocess, 'run', return_value=accepted) as submit, patch.object(package, 'run') as staple:
            package.notarize('Viezan.zip', 'Viezan.app', 'profile', 'ci.keychain-db')
            command = submit.call_args.args[0]
            self.assertEqual(command[command.index('--keychain-profile') + 1], 'profile')
            self.assertEqual(command[command.index('--keychain') + 1], 'ci.keychain-db')
            staple.assert_called_once_with('xcrun', 'stapler', 'staple', 'Viezan.app')


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
