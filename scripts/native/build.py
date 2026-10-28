#!/usr/bin/env python3
"""Build the native applications using platform toolchains. Never runs tests or npm."""
import json
import os
import argparse
import pathlib
import plistlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def run(*args, capture=False):
    result = subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


def signing_identity():
    """A stable signing identity keeps keychain "Always Allow" and privacy grants across builds.

    VIEZAN_SIGN_IDENTITY overrides; otherwise the first valid Apple Development identity.
    Ad-hoc signatures change with every build, so macOS asks again for each saved key."""
    explicit = os.environ.get("VIEZAN_SIGN_IDENTITY")
    if explicit:
        return explicit
    listing = run("security", "find-identity", "-v", "-p", "codesigning", capture=True)
    # `security` lists identities in no fixed order; a different identity changes the
    # designated requirement and re-prompts, so always pick the same one (by name, then hash).
    identities = sorted((line.split('"')[1], line.split()[1]) for line in listing.splitlines()
                        if '"Apple Development:' in line)
    return identities[0][1] if identities else None


def sign_mac(app, identity):
    # Sign helpers first, then the bundle; never --deep (it re-signs nested code blindly).
    for binary in sorted((app / "Contents/Resources/native").iterdir()):
        run("codesign", "--force", "--sign", identity, "--identifier", "com.viezan.native.preview." + binary.name, binary)
    run("codesign", "--force", "--sign", identity, "--identifier", "com.viezan.native.preview", app)


def build_mac(configuration, output):
    if sys.platform != "darwin":
        raise SystemExit("The SwiftUI target requires macOS and Xcode.")
    package = ROOT / "apps/macos"
    common = ["--package-path", package, "--configuration", configuration.lower(),
              "--scratch-path", output / "swift"]
    run("swift", "build", *common, "--product", "ViezanNative")
    products = pathlib.Path(run("swift", "build", *common, "--show-bin-path", capture=True))
    bundles = list(products.glob("*ViezanDomain*.bundle"))
    if len(bundles) != 1:
        raise SystemExit("Expected one ViezanDomain resource bundle in Swift build output.")
    app = output / "Viezan.app"
    if app.exists():
        raise SystemExit(f"Bundle already exists; choose a fresh --output directory: {app}")
    contents = app / "Contents"
    (contents / "MacOS").mkdir(parents=True)
    (contents / "Resources").mkdir()
    shutil.copy2(products / "ViezanNative", contents / "MacOS/ViezanNative")
    shutil.copytree(bundles[0], contents / "Resources" / bundles[0].name)
    shutil.copy2(ROOT / "build/icon.icns", contents / "Resources/AppIcon.icns")
    with (contents / "Info.plist").open("wb") as stream:
        plistlib.dump({
            "CFBundleExecutable": "ViezanNative", "CFBundleIdentifier": "com.viezan.native.preview",
            "CFBundleName": "Viezan", "CFBundleDisplayName": "Viezan",
            "CFBundlePackageType": "APPL", "CFBundleShortVersionString": json.loads((ROOT / "package.json").read_text())["version"],
            "CFBundleVersion": "1", "CFBundleIconFile": "AppIcon", "LSMinimumSystemVersion": "15.0",
            "NSMicrophoneUsageDescription": "Viezan records audio only when you start recording for transcription or interpretation.",
            "NSAudioCaptureUsageDescription": "Viezan captures system audio only when you start system-audio interpretation.",
            "NSAppleEventsUsageDescription": "Viezan uses keyboard shortcuts only when you invoke translation in another application.",
            "NSHighResolutionCapable": True, "NSPrincipalClass": "NSApplication",
        }, stream)
    native_resources = contents / "Resources/native"
    native_resources.mkdir()
    run("swiftc", "-O", ROOT / "native/files/main.swift", "-o", native_resources / "viezan-fs", "-framework", "AppKit")
    common_smc = ROOT / "native/common/SMC.swift"
    run("swiftc", "-O", common_smc, ROOT / "native/smc/main.swift", "-o", native_resources / "viezan-smc", "-framework", "IOKit")
    run("swiftc", "-O", common_smc, ROOT / "native/fanhelper/main.swift", "-o", native_resources / "viezan-fan-helper", "-framework", "IOKit", "-framework", "Security")
    daemon_dir = contents / "Library/LaunchDaemons"
    daemon_dir.mkdir(parents=True)
    with (ROOT / "native/fanhelper/com.viezan.fan-helper.plist").open("rb") as stream:
        daemon = plistlib.load(stream)
    daemon["AssociatedBundleIdentifiers"] = ["com.viezan.native.preview"]
    with (daemon_dir / "com.viezan.fan-helper.plist").open("wb") as stream:
        plistlib.dump(daemon, stream)
    identity = signing_identity()
    if identity:
        sign_mac(app, identity)
    else:
        print("warning: no valid Apple Development identity; ad-hoc signed builds re-prompt for keychain access",
              file=sys.stderr)
    print(app)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=["macos", "qt"], default="macos" if sys.platform == "darwin" else "qt")
    parser.add_argument("--configuration", choices=["Debug", "Release"], default="Debug")
    parser.add_argument("--output", type=pathlib.Path, required=True, help="Dedicated native build directory")
    parser.add_argument("--qt-prefix", type=pathlib.Path, help="Installed Qt kit; dependencies are not installed")
    parser.add_argument("--launch", action="store_true", help="Launch after a successful build")
    options = parser.parse_args()
    output = options.output.expanduser().resolve()
    if output == ROOT or ROOT.is_relative_to(output):
        parser.error("Choose a dedicated output directory, not the repository or an ancestor")
    if options.target == "macos":
        app = build_mac(options.configuration, output)
        if options.launch: run("open", app)
    else:
        args = ["cmake", "-S", ROOT / "apps/desktop-qt", "-B", output,
                "-DBUILD_TESTING=OFF", f"-DCMAKE_BUILD_TYPE={options.configuration}"]
        if options.qt_prefix:
            args.append(f"-DCMAKE_PREFIX_PATH={options.qt_prefix.expanduser().resolve()}")
        run(*args)
        run("cmake", "--build", output, "--config", options.configuration)
        bundle = output / "ViezanNativeQt.app"
        if sys.platform == "darwin" and bundle.exists():
            # Same reason as the SwiftUI app: a stable signature keeps keychain/privacy grants.
            identity = signing_identity()
            if identity:
                run("codesign", "--force", "--sign", identity, "--identifier", "com.viezan.native.qt.preview", bundle)
            else:
                print("warning: no valid Apple Development identity; ad-hoc signed builds re-prompt for keychain access",
                      file=sys.stderr)
        if options.launch:
            executable = output / (options.configuration + "/ViezanNativeQt.exe" if sys.platform == "win32" else "ViezanNativeQt")
            if not executable.exists() and sys.platform == "win32": executable = output / "ViezanNativeQt.exe"
            run(executable)
        print(f"Native Qt build: {output} (requires the matching Qt runtime)")


if __name__ == "__main__":
    main()
