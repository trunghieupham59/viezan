#!/usr/bin/env python3
"""Package a built native application. No install, publish, dependency download or tests.
Signing identities and notarization credentials remain in platform credential stores.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import zipfile
from runtime_manifest import verify_runtime
from verify_macos_dmg import verify_dmg, VIEZAN_REQUIREMENT

ROOT = Path(__file__).resolve().parents[2]


def run(*args, env=None):
    subprocess.run([str(a) for a in args], check=True, cwd=ROOT, env=env)


def notarize(upload, staple_target, profile, keychain):
    command = ['xcrun', 'notarytool', 'submit', upload, '--keychain-profile', profile,
               '--wait', '--output-format', 'json']
    if keychain:
        command.extend(['--keychain', keychain])
    result = subprocess.run(command, check=True, stdout=subprocess.PIPE, text=True)
    submission = json.loads(result.stdout)
    if submission['status'] != 'Accepted':
        raise SystemExit(f"Apple notarization {submission['id']}: {submission['status']}")
    run('xcrun', 'stapler', 'staple', staple_target)


def legacy_feed(installer, version):
    """electron-updater metadata, so Electron 2.4.x and earlier find this installer."""
    with installer.open('rb') as stream:
        digest = base64.b64encode(hashlib.file_digest(stream, 'sha512').digest()).decode()
    released = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return (f'version: {version}\nfiles:\n  - url: {installer.name}\n    sha512: {digest}\n    size: {installer.stat().st_size}\n'
            f"path: {installer.name}\nsha512: {digest}\nreleaseDate: '{released}'\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='App bundle or built Qt executable')
    parser.add_argument('--output', required=True, type=Path, help='New staging directory')
    parser.add_argument('--qt-bin', type=Path)
    parser.add_argument('--patched-runtime', type=Path, help='Prepared Windows Viezan Ollama runtime directory')
    parser.add_argument('--identity', help='macOS Developer ID Application signing identity')
    parser.add_argument('--notary-profile', help='Existing notarytool Keychain profile')
    parser.add_argument('--notary-keychain', type=Path, help='Keychain containing the notary profile when using a custom keychain')
    parser.add_argument('--certificate-thumbprint', help='Windows code-signing certificate in CurrentUser/My')
    parser.add_argument('--linuxdeploy', type=Path, help='Installed linuxdeploy executable with Qt plugin')
    args = parser.parse_args()
    source = args.input.expanduser().resolve(strict=True)
    output = args.output.expanduser().resolve()
    if output.exists() or source == output or output in source.parents or source in output.parents:
        parser.error('Choose a new staging directory outside the input')
    if sys.platform == 'darwin' and not (args.identity and args.notary_profile):
        parser.error('macOS distribution requires --identity (Developer ID Application) and --notary-profile')
    output.mkdir(parents=True)
    version = json.loads((ROOT / 'package.json').read_text())['version']
    architecture = {'AMD64': 'x64', 'x86_64': 'x64', 'aarch64': 'arm64'}.get(platform.machine(), platform.machine())
    name = f'Viezan-{version}-{sys.platform}-{architecture}'
    if sys.platform == 'darwin':
        if source.suffix != '.app' or not (source / 'Contents/MacOS/ViezanNative').is_file():
            parser.error('Input must be the native Viezan app bundle')
        app = output / 'Viezan.app'
        run('ditto', source, app)
        signing = ['codesign', '--force', '--options', 'runtime', '--timestamp', '--sign', args.identity]
        for binary in sorted((app / 'Contents/Resources/native').iterdir()):
            if binary.is_file() and os.access(binary, os.X_OK):
                run(*signing, '--identifier', 'com.viezan.native.preview.' + binary.name, binary)
        run(*signing, '--identifier', 'com.viezan.native.preview', '--entitlements',
            ROOT / 'apps/packaging/entitlements.mac.plist', app)
        run('codesign', '--verify', '--strict', '--deep', app)
        run('codesign', '--verify', '-R', VIEZAN_REQUIREMENT, app)
        disk = output / 'disk'
        disk.mkdir()
        # Keep the submission ZIP out of the release assets. The public ZIP contains the stapled app.
        submission_zip = disk / 'submit.zip'
        run('ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, submission_zip)
        notarize(submission_zip, app, args.notary_profile, args.notary_keychain)
        submission_zip.unlink()
        archive = output / (name + '.zip')
        run('ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, archive)
        run('ditto', app, disk / 'Viezan.app')
        (disk / 'Applications').symlink_to('/Applications')
        image = output / (name + '.dmg')
        run('hdiutil', 'create', '-volname', 'Viezan', '-srcfolder', disk, '-format', 'UDZO', image)
        run('codesign', '--timestamp', '--sign', args.identity, image)
        notarize(image, image, args.notary_profile, args.notary_keychain)
        verify_dmg(image, distribution_arch=architecture, version=version)
        artifacts = [archive, image]
    elif sys.platform == 'win32':
        if source.suffix.lower() != '.exe' or not args.qt_bin:
            parser.error('Windows requires a built executable and --qt-bin')
        stage = output / 'Viezan'
        stage.mkdir()
        executable = stage / 'ViezanNativeQt.exe'
        shutil.copy2(source, executable)
        run(args.qt_bin / 'windeployqt.exe', '--release', '--qmldir', ROOT / 'apps/desktop-qt/qml', '--dir', stage, executable)
        if args.patched_runtime:
            runtime = args.patched_runtime.resolve(strict=True)
            verify_runtime(runtime)
            shutil.copytree(runtime, stage / 'local-ai/ollama-patched/windows/x64')
        (stage / 'qt.conf').write_text('[Paths]\nPrefix=.\nPlugins=.\nQmlImports=qml\n', encoding='utf-8')
        if args.certificate_thumbprint:
            run('signtool', 'sign', '/sha1', args.certificate_thumbprint, '/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256', executable)
            run('signtool', 'verify', '/pa', executable)
        archive = output / (name + '.zip')
        with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as bundle:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    bundle.write(path, path.relative_to(output))
        # Generate exact uninstall targets, never recursively remove a user-selected folder.
        def nsis_path(path):
            return str(path).replace('\\', '/').replace('$', '$$').replace('"', '$\\"').replace('/', '\\')
        uninstall = output / 'uninstall-files.nsh'
        lines = ['Delete "$INSTDIR\\' + nsis_path(p.relative_to(stage)) + '"' for p in sorted(stage.rglob('*')) if p.is_file()]
        lines += ['RMDir "$INSTDIR\\' + nsis_path(p.relative_to(stage)) + '"' for p in sorted(stage.rglob('*'), key=lambda p: len(p.parts), reverse=True) if p.is_dir()]
        uninstall.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        # NSIS is an explicitly supplied platform build prerequisite, never installed here.
        run('makensis', f'/DAPPDIR={stage}', f'/DOUTFILE={output / (name + ".exe")}', f'/DVERSION={version}', f'/DUNINSTALL_FILES={uninstall}', ROOT / 'apps/packaging/windows.nsi')
        installer = output / (name + '.exe')
        if args.certificate_thumbprint:
            run('signtool', 'sign', '/sha1', args.certificate_thumbprint, '/fd', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/td', 'SHA256', installer)
            run('signtool', 'verify', '/pa', installer)
        artifacts = [archive, installer]
    else:
        if not args.linuxdeploy:
            parser.error('Linux requires --linuxdeploy and its installed Qt plugin')
        appdir = output / 'Viezan.AppDir'
        icon = output / 'viezan.png'
        shutil.copy2(ROOT / 'apps/macos/Sources/ViezanDomain/Resources/brand.png', icon)
        env = dict(os.environ)
        env['QML_SOURCES_PATHS'] = str(ROOT / 'apps/desktop-qt/qml')
        env['OUTPUT'] = str(output / (name + '.AppImage'))
        if args.qt_bin:
            env['QMAKE'] = str(args.qt_bin / 'qmake')
        run(args.linuxdeploy.resolve(), '--appdir', appdir, '--executable', source, '--desktop-file', ROOT / 'apps/packaging/viezan.desktop', '--icon-file', icon, '--plugin', 'qt', '--output', 'appimage', env=env)
        artifacts = [output / (name + '.AppImage')]
    manifest = {'version': version, 'platform': sys.platform, 'architecture': architecture, 'artifacts': []}
    for artifact in artifacts:
        with artifact.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        manifest['artifacts'].append({'name': artifact.name, 'size': artifact.stat().st_size, 'sha256': digest})
    (output / (name + '.json')).write_text(json.dumps(manifest, indent=2) + '\n')
    # The Electron app only shipped these two x64 feeds; on macOS it reads the release assets directly.
    feed = {'win32': 'latest.yml', 'linux': 'latest-linux.yml'}.get(sys.platform)
    if feed and architecture == 'x64':
        (output / feed).write_text(legacy_feed(artifacts[-1], version), encoding='utf-8', newline='\n')
    print(output)


if __name__ == '__main__':
    main()
