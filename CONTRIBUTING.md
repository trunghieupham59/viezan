# Contributing to Viezan

Build the macOS application with Swift Package Manager and the Windows/Linux
application with CMake and Qt Quick. The [README](README.md#build-when-ready)
lists supported toolchains, build commands and packaging requirements.

## Where to make a change

- Put macOS views in `apps/macos/Sources/ViezanNative` and domain services in
  `apps/macos/Sources/ViezanDomain`. Helper executables live in `native/`.
- Put Windows/Linux views in `apps/desktop-qt/qml` and service code in
  `apps/desktop-qt`. CMake packages the SVGs in `qml/icons` directly.
- For shared strings, update all three JSON catalogs in `resources/locales`.
  For theme and layout values, edit `resources/tokens.css`. Run
  `npm run resources` and include both generated native.json files.
- Keep cross-platform data contracts and fixtures in `contracts/native-workbench`.

## Live QML reload (Windows/Linux)

A development build can load `apps/desktop-qt/qml` from the source tree and
rebuild its window whenever a QML file is saved. Workspace state stays in the
C++ bridge; changes to C++, icons or `native.json` still need a normal build.
Keep it in its own build directory so release and test builds stay packaged:

```sh
cmake -S apps/desktop-qt -B .native-build/qt-live -DVIEZAN_QML_LIVE=ON -DBUILD_TESTING=OFF
cmake --build .native-build/qt-live --config Release --target ViezanNativeQt
```

A file that fails to load closes the window and reports the first error in a
tray notification; the next save loads it again.

## Verification

Run the checks for the affected targets. From the repository root:

```sh
npm run check:resources
npm run check:docs
node --test scripts/native/__tests__/domain.test.mjs
python3 -m unittest discover -s scripts/native/__tests__ -p 'test_*.py'

# macOS
swift test --package-path apps/macos

# Windows/Linux, with the Qt kit configured
cmake -S apps/desktop-qt -B .native-build/qt -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
cmake --build .native-build/qt --config Release
# The Qt suite is split into CTest shards; give --parallel your core count.
ctest --test-dir .native-build/qt -C Release --output-on-failure --parallel 4
```

Use a Conventional Commits PR title. Describe behavior and tests per platform,
including any manual checks still needed. For changes to user-facing behavior,
update the README and the affected screen specification.
