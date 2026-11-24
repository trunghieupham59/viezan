# CMake configure recovery — 2026-11-04

## Scope and finding
One CMake Tools configure error: the native-release cache referenced the previous checkout at ~/Github/personal/viezan, while the workspace is now ~/Personal/viezan. Confirmed from the current VS Code CMakeBuild.log and CMAKE_HOME_DIRECTORY/CMAKE_CACHEFILE_DIR. Severity: Error; category: stale local build configuration.

## Fix
Preserved the entire old build directory as apps/desktop-qt/build/native-release.backup-20261104-090716. Regenerated native-release using the existing preset. No source or editor settings changed.

## Verification
Pass: `/opt/homebrew/bin/cmake --preset native-release -DCMAKE_EXPORT_COMPILE_COMMANDS:BOOL=TRUE -G "Unix Makefiles"` from apps/desktop-qt returned 0; configuring and generating completed. Both cache paths now reference the current workspace. Optional WrapVulkanHeaders discovery was unsuccessful but did not prevent generation.

Not run: compilation, tests and live application acceptance; scope was configure recovery only. Broad maintenance, UI, security, i18n and release gates not run because unrelated to this local cache repair. Editor notification dismissal was not verified.

## Workflow and rules
Applied fix-vscode-problems workflow and diagnostic skill, scoped to the supplied CMake error; preserved unrelated work per AGENTS.md and product-engineering/generate-code guardrails. No remaining configure blocker observed.
