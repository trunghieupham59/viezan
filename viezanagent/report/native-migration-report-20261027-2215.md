# Native migration report — 2026-10-27 22:15

Workflow `native-migration`; rules `native-migration`, `viezan-product-engineering`;
skills `viezan-native-migration`, `viezan-native-ux`. Phase: UI/UX implementation
of the approved Review 18 prototype on both native targets.

- Inventory: prototype `docs/migration/desktop-review/` captured headless (10 pages × 3
  platforms + 8 settings groups); baseline Swift/Qt builds captured and compared.
- Changed: shared kits (`NativeKit.swift`, `qml/Kit.qml`), shell, Home, Chat,
  Translate/Dictionary, Interpret, Everywhere/Utilities, Apps, Thermal, Settings;
  VI/EN/JA keys; generated type-scale ratios. Details: `docs/migration/native-implementation/native-code-39.md`.
- Gates: Design = Review 18 (user-selected). Prototype = unchanged. Runtime = macOS
  build + screenshots for Swift and Qt; Swift 17, Qt 1 suite, node 10 tests pass.
  Windows/Linux runtime, light mode, text scale, screen readers, IME: NOT RUN.
  User acceptance: pending.
- Next slice: run Qt on real Windows and Linux; light mode + three text sizes;
  VoiceOver pass on the new sidebar/header.
