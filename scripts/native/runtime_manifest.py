"""Validate an explicitly supplied prepared runtime, without running its binaries."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]


def verify_runtime(directory):
    root = Path(directory).resolve(strict=True)
    manifest_path = root / 'runtime.json'
    if not root.is_dir() or manifest_path.is_symlink() or manifest_path.stat().st_size > 1_048_576:
        raise ValueError('Invalid runtime manifest')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    pinned = json.loads((ROOT / 'contracts/native-workbench/ollama-runtime.json').read_text())
    if any(manifest.get(key) != pinned[key] for key in ('version', 'fix')):
        raise ValueError('Unexpected runtime identity')
    expected = manifest.get('files')
    if not isinstance(expected, dict) or not expected or len(expected) > 10000:
        raise ValueError('Invalid runtime file inventory')
    actual = set()
    for path in root.rglob('*'):
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError('Runtime links are not permitted')
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError('Unsupported runtime entry')
        name = path.relative_to(root).as_posix()
        if name == 'runtime.json':
            continue
        actual.add(name)
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest().upper()
        if not isinstance(expected.get(name), str) or digest != expected[name].upper():
            raise ValueError(f'Runtime checksum mismatch: {name}')
        if name in pinned['files'] and digest != pinned['files'][name]:
            raise ValueError(f'Runtime binary is not the pinned build: {name}')
    if actual != set(expected) or not set(pinned['files']).issubset(actual):
        raise ValueError('Runtime file inventory is incomplete')
    return manifest


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: runtime_manifest.py PREPARED_RUNTIME_DIRECTORY')
    verify_runtime(sys.argv[1])
    print('Prepared native runtime matches its pinned binaries and file manifest.')
