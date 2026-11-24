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
    def test_transient_diskimages_failure_keeps_partial_image_out_of_result(self):
        attempts = []
        def create(command, **kwargs):
            image = command[-1]
            attempts.append(image)
            image.write_bytes(b'partial' if len(attempts) == 1 else b'complete')
            return subprocess.CompletedProcess(command, int(len(attempts) == 1), stderr='Resource busy')

        with tempfile.TemporaryDirectory() as directory, patch.object(package.time, 'sleep'), \
                patch.object(subprocess, 'run', side_effect=create), redirect_stderr(io.StringIO()):
            destination = pathlib.Path(directory) / 'Preview.dmg'
            package.create_dmg(directory, destination, 'Viezan')
            self.assertEqual(destination.read_bytes(), b'complete')
            self.assertEqual(len(set(attempts)), 2)

    def test_permanent_diskimages_failure_stops_without_an_artifact(self):
        error = subprocess.CompletedProcess(['hdiutil'], 1, stderr='Permission denied')
        with tempfile.TemporaryDirectory() as directory, redirect_stderr(io.StringIO()), \
                patch.object(subprocess, 'run', return_value=error) as create:
            destination = pathlib.Path(directory) / 'Preview.dmg'
            with self.assertRaises(subprocess.CalledProcessError):
                package.create_dmg(directory, destination, 'Viezan')
            create.assert_called_once()
            self.assertFalse(destination.exists())

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


class WindowsRuntimeTests(unittest.TestCase):
    def test_only_release_dlls_from_the_target_architecture_are_staged(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            stage = root / 'Viezan'
            stage.mkdir()
            names = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140_atomic_wait.dll']
            for architecture in ('x64', 'x86'):
                source = root / architecture / 'Microsoft.VC143.CRT'
                source.mkdir(parents=True)
                for name in names + ['readme.txt']:
                    (source / name).write_text(architecture)
            package.stage_msvc_runtime(root, 'x64', stage)
            self.assertEqual({p.name: p.read_text() for p in stage.iterdir()}, dict.fromkeys(names, 'x64'))

    def test_packaging_stops_if_the_x64_exception_runtime_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / 'x64/Microsoft.VC143.CRT'
            source.mkdir(parents=True)
            for name in ['msvcp140.dll', 'vcruntime140.dll']:
                (source / name).touch()
            with self.assertRaisesRegex(SystemExit, 'vcruntime140_1.dll'):
                package.stage_msvc_runtime(root, 'x64', root)


if __name__ == "__main__":
    unittest.main()
