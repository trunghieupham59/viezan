# GitHub workflows after native cutover

- `ci.yml`: Swift package tests and macOS bundle build; Qt configure/build/test on
  Windows and Linux. These jobs run only when GitHub triggers the workflow.
- `docs.yml`: source/manifest/README consistency through `scripts/native/documentation.mjs`.
- `release.yml`: manual packaging on provisioned native signing runners. Builds
  Swift/Qt, signs and packages with `scripts/native/release.py`, uploads artifacts
  for review, and does not publish a release or install an artifact.
- `codeql.yml`, `dependency-review.yml` and `pr-checks.yml`: source/dependency and PR
  governance. `pages.yml` publishes documentation, not the desktop application.
- `auto-tag.yml`: inspect its explicit manual inputs before using it; native
  cutover does not imply permission to create a tag or publish.
- Dependabot tracks the resource generator's npm dependencies and GitHub Actions.
  Labels and ownership map to `apps/`, `native/`, `contracts/` and design assets.

For an optional prepared Windows Ollama runtime, set `VIEZAN_PATCHED_RUNTIME` on
its release runner. `package.py` verifies the full file inventory and SHA-256
manifest, including the pinned primary binaries, before copying it into the
installer. `.github/actions/stage-ollama-runtime` remains an explicit preparation
operation and invokes the native validator; it is not an implicit CI download.
No packaging hook imports an Electron packager context.

The retired pipeline description is preserved under
`docs/migration/legacy-reference/github-workflows.md` as historical evidence.
