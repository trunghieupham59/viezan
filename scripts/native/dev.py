#!/usr/bin/env python3
"""Incremental macOS development builds and cooperative, failure-safe reloads."""
import argparse
import contextlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import uuid

from build import ROOT, build_mac

DEV = ROOT / ".native-build/dev"
READY_TIMEOUT = 30


@contextlib.contextmanager
def build_lock(directory):
    import fcntl
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "build.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("A development build is already running") from None
        yield


def write_status(directory, request, state):
    temporary = directory / "reload-status.tmp"
    temporary.write_text(json.dumps({"request": request, "state": state}))
    temporary.replace(directory / "reload-status.json")


def process_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def wait_for_exit(pid, timeout=READY_TIMEOUT):
    deadline = time.monotonic() + timeout
    while process_alive(pid):
        if time.monotonic() >= deadline:
            raise RuntimeError("App did not exit; the current bundle was not replaced")
        time.sleep(0.1)


def promote(directory, staged, launch):
    """Only generated bundles inside the managed dev directory are rotated."""
    current = directory / "Viezan.app"
    previous = directory / "previous/Viezan.app"
    previous.parent.mkdir(exist_ok=True)
    if previous.exists():
        shutil.rmtree(previous)
    if current.exists():
        current.rename(previous)
    try:
        staged.rename(current)
        if launch:
            # LaunchServices can still remember the just-exited process. Request
            # a new instance instead of asking it to reactivate that stale PID.
            subprocess.run(["open", "-n", str(current)], check=True)
    except Exception:
        # Keep the rejected bundle for diagnosis, restore the last working app.
        if current.exists():
            current.rename(staged)
        if previous.exists():
            previous.rename(current)
            if launch:
                subprocess.run(["open", "-n", str(current)], check=False)
        raise
    return current


def development_metadata():
    return {"root": str(ROOT), "python": sys.executable,
            "path": os.environ.get("PATH", "/usr/bin:/bin:/usr/sbin:/sbin"),
            "developerDir": os.environ.get("DEVELOPER_DIR", "")}


def build_and_reload(directory, request, pid=None, launch=True):
    with build_lock(directory):
        # The log is opened only after locking: a second request cannot truncate it.
        with (directory / "build.log").open("w", buffering=1) as log:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                # subprocesses inherit OS descriptors, not Python's stream wrappers.
                saved_out, saved_err = os.dup(1), os.dup(2)
                try:
                    os.dup2(log.fileno(), 1); os.dup2(log.fileno(), 2)
                    write_status(directory, request, "building")
                    staging = directory / "staging"
                    if staging.exists():
                        shutil.rmtree(staging)
                    # Shared catalog changes participate in the same reload.
                    subprocess.run(["node", "scripts/native/generate-resources.mjs"], cwd=ROOT, check=True)
                    staged = build_mac("Debug", staging, scratch=directory / "swift",
                                       development=development_metadata())
                    subprocess.run(["codesign", "--verify", "--strict", str(staged)], check=True)
                    if pid:
                        if not process_alive(pid):
                            raise RuntimeError("Requesting app exited during build; reload cancelled")
                        write_status(directory, request, "ready")
                        wait_for_exit(pid)
                    current = promote(directory, staged, launch)
                    write_status(directory, request, "complete")
                    print(current, flush=True)
                except BaseException:
                    import traceback
                    traceback.print_exc()
                    write_status(directory, request, "failed")
                    raise
                finally:
                    os.dup2(saved_out, 1); os.dup2(saved_err, 2)
                    os.close(saved_out); os.close(saved_err)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reload-pid", type=int)
    parser.add_argument("--request-id", default=str(uuid.uuid4()))
    parser.add_argument("--no-launch", action="store_true")
    options = parser.parse_args()
    if sys.platform != "darwin":
        if options.reload_pid:
            parser.error("In-app reload is macOS-only")
        subprocess.run([sys.executable, str(ROOT / "scripts/native/build.py"),
                        "--output", str(DEV), *([] if options.no_launch else ["--launch"])], check=True)
        return
    if options.reload_pid is not None and (options.reload_pid <= 1 or options.reload_pid != os.getppid()):
        parser.error("Reload must be requested directly by the running app")
    if options.reload_pid is None:
        # Never replace an executable that is currently mapped by the dev app.
        import re
        running = subprocess.run(["pgrep", "-f", re.escape(str(DEV / "Viezan.app/Contents/MacOS/ViezanNative"))],
                                 capture_output=True)
        if running.returncode == 0:
            parser.error("The dev app is running. Use Command-Shift-R in the app, or quit it first.")
        if running.returncode != 1:
            parser.error("Could not check whether the dev app is running")
    try:
        build_and_reload(DEV, options.request_id, options.reload_pid, not options.no_launch)
    except Exception as error:
        raise SystemExit(f"{error}\nBuild log: {DEV / 'build.log'}") from None
    print(DEV / "Viezan.app")


if __name__ == "__main__":
    main()
