#!/usr/bin/env python3
"""CI entrypoint for pre-provisioned signing machines; never publishes."""
import os
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[2]
build = root / '.native-build/release'
output = root / '.native-packages'
if build.exists() or output.exists():
    raise SystemExit('Release output must be fresh. Archive previous artifacts before another run.')
qt = os.environ.get('VIEZAN_QT_BIN')
command = [sys.executable, str(root / 'scripts/native/build.py'), '--configuration', 'Release', '--output', str(build)]
if qt and sys.platform != 'darwin': command += ['--qt-prefix', str(Path(qt).parent)]
subprocess.run(command, check=True, cwd=root)
source = build / ('Viezan.app' if sys.platform == 'darwin' else 'Release/ViezanNativeQt.exe' if sys.platform == 'win32' else 'ViezanNativeQt')
if sys.platform == 'win32' and not source.exists(): source = build / 'ViezanNativeQt.exe'
command = [sys.executable, str(root / 'scripts/native/package.py'), '--input', str(source), '--output', str(output)]
required = [('VIEZAN_SIGNING_IDENTITY', '--identity'), ('VIEZAN_NOTARY_PROFILE', '--notary-profile')] if sys.platform == 'darwin' else [('VIEZAN_QT_BIN', '--qt-bin'), ('VIEZAN_CERTIFICATE_THUMBPRINT', '--certificate-thumbprint')] if sys.platform == 'win32' else [('VIEZAN_LINUXDEPLOY', '--linuxdeploy'), ('VIEZAN_QT_BIN', '--qt-bin')]
runtime = os.environ.get('VIEZAN_PATCHED_RUNTIME')
if runtime and sys.platform == 'win32': command += ['--patched-runtime', runtime]
for variable, option in required:
    value = os.environ.get(variable)
    if not value: raise SystemExit(f'Missing provisioned release setting: {variable}')
    command += [option, value]
subprocess.run(command, check=True, cwd=root)
