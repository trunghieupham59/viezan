"""Create a manually installed Preview DMG from a native macOS release build."""
import argparse
import json
import os
from pathlib import Path
import tempfile

from build import ROOT, run, sign_mac
from package import create_dmg
from verify_macos_dmg import PREVIEW_CERTIFICATE, verify_dmg


def package_preview(source, output, arch, version):
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f'Viezan-{version}-preview-{arch}.dmg'
    if destination.exists():
        raise FileExistsError(destination)
    with tempfile.TemporaryDirectory(dir=output) as temporary:
        stage = Path(temporary)
        disk = stage / 'disk'
        disk.mkdir()
        app = disk / 'Viezan.app'
        run('ditto', source, app)
        sign_mac(app, PREVIEW_CERTIFICATE)
        (disk / 'Applications').symlink_to('/Applications')
        image = stage / destination.name
        create_dmg(disk, image, f'Viezan {version} Preview')
        verify_dmg(image, preview_arch=arch, version=version)
        # Make only a verified image visible, including when another build targets the same path.
        os.link(image, destination)
    return destination


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--arch', required=True, choices=['arm64', 'x64'])
    args = parser.parse_args()
    source = args.input.resolve(strict=True)
    output = args.output.resolve()
    if source.suffix != '.app' or not (source / 'Contents/MacOS/ViezanNative').is_file():
        parser.error('Input must be a built Viezan.app')
    if output == source or source in output.parents:
        parser.error('Choose an output directory outside the app')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    print(package_preview(source, output, args.arch, version))
