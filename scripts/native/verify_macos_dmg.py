"""Check the macOS release disk image and the app a user would copy from it."""
import argparse
from contextlib import contextmanager
from pathlib import Path
import plistlib
import subprocess
import tempfile


# codesign reads a requirement from a file unless the argument starts with "=".
DEVELOPER_ID = '=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
VIEZAN_REQUIREMENT = DEVELOPER_ID + ' and identifier "com.viezan.native.preview"'
# Public SHA-1 certificate fingerprint used by codesign's identity selector.
# This is the Apple Development leaf already used for the Viezan dev app.
PREVIEW_CERTIFICATE = '7F224D66CF7F64807169278390D854DFCC434B70'
PREVIEW_REQUIREMENT = ('=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.12] exists'
                       f' and certificate leaf = H"{PREVIEW_CERTIFICATE}"')


def verify_app(app, arch, version, *, preview):
    with (app / 'Contents/Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    if (info.get('CFBundleIdentifier'), info.get('CFBundleExecutable'), info.get('CFBundleShortVersionString')) != (
        'com.viezan.native.preview', 'ViezanNative', version
    ):
        raise ValueError(f'Expected a Viezan {version} app bundle')
    expected = {'arm64': 'arm64', 'x64': 'x86_64'}[arch]
    native = app / 'Contents/Resources/native'
    helpers = [native / name for name in ('viezan-fs', 'viezan-smc', 'viezan-fan-helper')]
    for binary in [app / 'Contents/MacOS/ViezanNative', *helpers]:
        actual = subprocess.check_output(['lipo', '-archs', binary], text=True).strip()
        if actual != expected:
            raise ValueError(f'{binary.name}: expected {expected}, found {actual}')
        signed_item = app if binary.name == 'ViezanNative' else binary
        requirement = DEVELOPER_ID
        if preview:
            identifier = 'com.viezan.native.preview' if signed_item == app else 'com.viezan.native.preview.' + binary.name
            requirement = PREVIEW_REQUIREMENT + f' and identifier "{identifier}"'
        subprocess.run(['codesign', '--verify', '--strict', '-R', requirement, signed_item], check=True)


@contextmanager
def mounted_dmg(image):
    with tempfile.TemporaryDirectory(prefix='viezan-dmg-') as mount:
        subprocess.run(['hdiutil', 'attach', '-readonly', '-nobrowse', '-mountpoint', mount, image], check=True)
        try:
            yield Path(mount) / 'Viezan.app'
        finally:
            subprocess.run(['hdiutil', 'detach', mount], check=True)


def verify_dmg(image, copy_to=None, *, preview_arch=None, distribution_arch=None, version=None):
    with mounted_dmg(image) as app:
        subprocess.run(['codesign', '--verify', '--strict', '--deep', app], check=True)
        if preview_arch or distribution_arch:
            verify_app(app, preview_arch or distribution_arch, version, preview=bool(preview_arch))
        if not preview_arch:
            subprocess.run(['codesign', '--verify', '-R', VIEZAN_REQUIREMENT, app], check=True)
            subprocess.run(['xcrun', 'stapler', 'validate', app], check=True)
            subprocess.run(['syspolicy_check', 'distribution', app], check=True)
            subprocess.run(['codesign', '--verify', '--strict', '-R', DEVELOPER_ID, image], check=True)
            subprocess.run(['xcrun', 'stapler', 'validate', image], check=True)
            subprocess.run(['spctl', '--assess', '--type', 'open', '--verbose=4',
                            '--context', 'context:primary-signature', image], check=True)
        if copy_to:
            if copy_to.exists():
                raise FileExistsError(copy_to)
            subprocess.run(['ditto', app, copy_to], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('--copy-to', type=Path, help='Copy the app to a fresh path for launch testing')
    parser.add_argument('--preview-arch', choices=['arm64', 'x64'], help='Verify a Preview signed by the pinned Apple Development certificate')
    parser.add_argument('--version', help='Expected Preview version')
    args = parser.parse_args()
    if bool(args.preview_arch) != bool(args.version):
        parser.error('Preview verification requires both --preview-arch and --version')
    verify_dmg(args.image.resolve(strict=True), args.copy_to, preview_arch=args.preview_arch, version=args.version)
