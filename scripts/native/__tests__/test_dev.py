"""The dev runner must never replace the running app on a failed build/quit."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("viezan_dev", SCRIPTS / "dev.py")
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)


@unittest.skipUnless(sys.platform == "darwin", "The development reload runner is macOS-only")
class DevelopmentBuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="viezan dev ")
        self.addCleanup(self.temporary.cleanup)
        self.directory = pathlib.Path(self.temporary.name)
        self.current = self.bundle("Viezan.app", "current")

    def bundle(self, relative, content):
        path = self.directory / relative
        path.mkdir(parents=True)
        (path / "binary").write_text(content)
        return path

    def test_rotation_keeps_one_previous_and_reuses_cache(self):
        self.bundle("previous/Viezan.app", "older")
        cache = self.directory / "swift/cache"
        cache.parent.mkdir()
        cache.write_text("cache")
        staged = self.bundle("staging/Viezan.app", "new")
        dev.promote(self.directory, staged, False)
        self.assertEqual((self.current / "binary").read_text(), "new")
        self.assertEqual((self.directory / "previous/Viezan.app/binary").read_text(), "current")
        self.assertEqual(cache.read_text(), "cache")

    def test_launch_failure_restores_previous_and_keeps_failed_build(self):
        staged = self.bundle("staging/Viezan.app", "broken")
        with patch.object(dev.subprocess, "run", side_effect=[subprocess.CalledProcessError(1, "open"), None]):
            with self.assertRaises(subprocess.CalledProcessError):
                dev.promote(self.directory, staged, True)
        self.assertEqual((self.current / "binary").read_text(), "current")
        self.assertEqual((staged / "binary").read_text(), "broken")

    def test_build_failure_preserves_current_and_previous(self):
        self.bundle("previous/Viezan.app", "previous")
        with patch.object(dev.subprocess, "run"), patch.object(dev, "build_mac", side_effect=RuntimeError("compile failure")):
            with self.assertRaises(RuntimeError):
                dev.build_and_reload(self.directory, "request", launch=False)
        self.assertEqual((self.current / "binary").read_text(), "current")
        self.assertEqual((self.directory / "previous/Viezan.app/binary").read_text(), "previous")
        self.assertEqual(json.loads((self.directory / "reload-status.json").read_text()),
                         {"request": "request", "state": "failed"})
        self.assertIn("compile failure", (self.directory / "build.log").read_text())

    def test_duplicate_request_does_not_truncate_log(self):
        log = self.directory / "build.log"
        log.write_text("first build")
        with dev.build_lock(self.directory):
            with self.assertRaisesRegex(RuntimeError, "already running"):
                dev.build_and_reload(self.directory, "second", launch=False)
        self.assertEqual(log.read_text(), "first build")

    def test_cancelled_quit_keeps_current_bundle(self):
        def build(*args, **kwargs):
            self.assertEqual(kwargs["scratch"], self.directory / "swift")
            return self.bundle("staging/Viezan.app", "new")
        with patch.object(dev.subprocess, "run"), patch.object(dev, "build_mac", side_effect=build), \
             patch.object(dev, "process_alive", return_value=True), \
             patch.object(dev, "wait_for_exit", side_effect=RuntimeError("quit denied")):
            with self.assertRaises(RuntimeError):
                dev.build_and_reload(self.directory, "request", pid=123, launch=False)
        self.assertEqual((self.current / "binary").read_text(), "current")
        self.assertFalse((self.directory / "previous/Viezan.app").exists())

    def test_wait_timeout_and_exited_process(self):
        with patch.object(dev, "process_alive", return_value=True):
            with self.assertRaisesRegex(RuntimeError, "did not exit"):
                dev.wait_for_exit(123, timeout=0)
        with patch.object(dev, "process_alive", return_value=False):
            dev.wait_for_exit(123, timeout=0)

    def test_ready_is_announced_before_wait_and_promotion(self):
        def build(*args, **kwargs):
            return self.bundle("staging/Viezan.app", "new")
        def wait(pid):
            self.assertEqual(json.loads((self.directory / "reload-status.json").read_text())["state"], "ready")
            self.assertEqual((self.current / "binary").read_text(), "current")
        with patch.object(dev.subprocess, "run"), patch.object(dev, "build_mac", side_effect=build), \
             patch.object(dev, "process_alive", return_value=True), patch.object(dev, "wait_for_exit", side_effect=wait):
            dev.build_and_reload(self.directory, "request", pid=123, launch=False)
        self.assertEqual((self.current / "binary").read_text(), "new")


if __name__ == "__main__":
    unittest.main()
