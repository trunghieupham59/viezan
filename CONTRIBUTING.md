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

## Verification

Run the checks for the affected targets. From the repository root:

```sh
npm run check:resources
npm run check:docs
node --test scripts/native/__tests__/domain.test.mjs

# macOS
swift test --package-path apps/macos

# Windows/Linux, with the Qt kit configured
cmake -S apps/desktop-qt -B .native-build/qt -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
cmake --build .native-build/qt --config Release
ctest --test-dir .native-build/qt -C Release --output-on-failure
```

Use a Conventional Commits PR title. Describe behavior and tests per platform,
including any manual checks still needed. For changes to user-facing behavior,
update the README and the affected screen specification.
