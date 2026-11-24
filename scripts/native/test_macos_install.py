"""Exercise a clean install and manual DMG upgrades in disposable Mac profiles."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile

from verify_macos_dmg import mounted_dmg, verify_dmg

ROOT = Path(__file__).resolve().parents[2]
# Digests of the original GitHub Release downloads, including the broken 2.6.0.
LEGACY = {
    '2.4.2': {'arm64': 'ca30f0ca9aa45375e0a4d74745df51d12fb8fb3875061098fe0092bd875eeb61',
              'x64': 'deca3f66a63acaf0262c892dd173988c907e27fb6790900d0185e874995e4b23'},
    '2.5.2': {'arm64': '3b8fa4950dff444f4d57ebd9c1d16136488ce20d29cc8d927e5066e96d03cf09',
              'x64': '070212a5a5cbdcf9c96da02459fc8d4088882673f4b72830a629d5aa5f5f4949'},
    '2.6.0': {'arm64': '56fa98913dffa878f48b224094d5825edfc8351155522408a1b9825df4636469',
              'x64': '96c3ab8fbf0595c33a523778f1d10aea99665a66336263ff6976856d5aba6cf2'},
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def install_old(image, target, version, arch):
    if sha256(image) != LEGACY[version][arch]:
        raise ValueError(f'Unexpected digest for {image.name}')
    with mounted_dmg(image) as old:
        subprocess.run(['ditto', old, target], check=True)
    info = plistlib.loads((target / 'Contents/Info.plist').read_bytes())
    if info['CFBundleShortVersionString'] != version:
        raise ValueError(f'Expected the original {version} installation')


def exercise(root, candidate, launcher, old_images, old_version, arch, image, version):
    case = root / (old_version or 'clean')
    applications = case / 'Applications'
    applications.mkdir(parents=True)
    installed = applications / 'Viezan.app'
    profile = case / 'profile'
    support = profile / 'Library/Application Support'
    support.mkdir(parents=True)
    workspace = support / 'ViezanNativePreview/workbench.json'
    legacy_marker = support / 'Viezan/upgrade-fixture.txt'
    native_upgrade = old_version in ('2.5.2', '2.6.0')
    if old_version:
        prefix = f'Viezan-{old_version}' if old_version == '2.4.2' else f'Viezan-{old_version}-darwin'
        install_old(old_images / f'{prefix}-{arch}.dmg', installed, old_version, arch)
        if native_upgrade:
            workspace.parent.mkdir()
            shutil.copyfile(ROOT / 'contracts/native-workbench/recovery-fixture.json', workspace)
        else:
            legacy_marker.parent.mkdir()
            legacy_marker.write_text('legacy profile fixture')
        # Finder replaces the whole bundle. Merging into an old Electron bundle leaves stale files.
        installed.rename(case / 'prior.app')
    if old_version == '2.6.0':
        # 2.6.0 introduced in-place updates. Exercise its shipping DMG replacement
        # routine and launch the exact bundle it installed.
        (case / 'update.dmg').symlink_to(image.resolve())
        subprocess.run(['swift', 'test', '--package-path', ROOT / 'apps/macos',
                        '--filter', 'updateReplacesReleasedMacBundleFromCandidateDMG'],
                       check=True, env={**os.environ, 'VIEZAN_MAC_UPGRADE_FIXTURE': str(case),
                                        'VIEZAN_MAC_UPGRADE_VERSION': version})
        installed = case / 'updater-install/Viezan.app'
    else:
        subprocess.run(['ditto', candidate, installed], check=True)
    subprocess.run(['codesign', '--verify', '--strict', '--deep', installed], check=True)
    subprocess.run([launcher, installed, profile], check=True, timeout=75)
    saved = json.loads(workspace.read_bytes())
    if not saved['sessions']:
        raise ValueError('The installed app did not initialize its isolated profile')
    if native_upgrade:
        session = next(row for row in saved['sessions'] if row['id'] == 'chat-fixture')
        task = next(row for row in saved['tasks'] if row['id'] == 'task-fixture')
        if session['draft'] != 'Bản nháp chưa gửi' or task['status'] != 'interrupted':
            raise ValueError('The installed app did not recover the legacy workspace')
    if old_version == '2.4.2' and legacy_marker.read_text() != 'legacy profile fixture':
        raise ValueError('The Electron profile marker changed')
    print(f'PASS {case.name}: installed app opened a window and persisted its workspace', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packages', required=True, type=Path)
    parser.add_argument('--old-images', required=True, type=Path)
    parser.add_argument('--arch', required=True, choices=['arm64', 'x64'])
    parser.add_argument('--mode', required=True, choices=['distribution', 'preview'])
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    preview = args.mode == 'preview'
    name = f'Viezan-{args.version}-{"preview" if preview else "darwin"}-{args.arch}'
    image = args.packages / f'{name}.dmg'
    if not preview:
        manifest = json.loads((args.packages / f'{name}.json').read_bytes())
        items = [entry for entry in manifest['artifacts'] if entry['name'] == image.name]
        if (manifest['version'] != args.version or len(items) != 1 or
                items[0]['size'] != image.stat().st_size or items[0]['sha256'] != sha256(image)):
            raise ValueError('Mac update manifest does not match the disk image')
    with tempfile.TemporaryDirectory(prefix='viezan-install-') as temporary:
        root = Path(temporary).resolve()
        candidate = root / 'candidate.app'
        verify_dmg(image.resolve(), candidate, preview_arch=args.arch if preview else None,
                   distribution_arch=None if preview else args.arch, version=args.version)
        launcher = root / 'check-window'
        subprocess.run(['swiftc', ROOT / 'scripts/native/__tests__/macos_installed_window.swift',
                        '-o', launcher], check=True)
        for old_version in [None, *LEGACY]:
            exercise(root, candidate, launcher, args.old_images, old_version, args.arch, image, args.version)


if __name__ == '__main__':
    main()
