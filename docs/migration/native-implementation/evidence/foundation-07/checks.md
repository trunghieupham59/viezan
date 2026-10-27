# Foundation 07 checks — 2026-10-27

- Swift: 17 domain + 11 executed AppKit/SwiftUI PASS; general render matrix SKIP
  (not requested by its environment variable). Separate failure-render test PASS.
- Qt: 65 passes, zero failures/skips (63 scenarios + init/cleanup).
- docs:sync, docs:review, check:docs PASS; test:docs 13/13 PASS.
- check:atomic and check:design PASS.
- git diff --check PASS (tracked diff; not an untracked-file linter).
- No new literal design values in product code: product source unchanged this turn.
- No full Electron build/Vitest/web/TypeScript rerun: native tests/docs-only scope.

CUA typeText did not preserve all Unicode in the sent synthetic prompt. The
subsequent paste preserved the unsent Unicode draft exactly. This is not treated
as real-input-method acceptance; manual VI/JA checks remain required.
