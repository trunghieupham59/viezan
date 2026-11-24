# GitHub workflows after native cutover

- `ci.yml`: Swift package tests and macOS bundle build; Qt configure/build/test on
  Windows and Linux. These jobs run only when GitHub triggers the workflow.
- `docs.yml`: source/manifest/README consistency, generated resources and shared domain tests.
- `release.yml`: packages every platform on GitHub-hosted runners when a push to
  `develop` changes the version in `package.json`, or on manual dispatch. Runs
  from `develop` publish the GitHub Release and create its `vX.Y.Z` tag; runs
  from any other ref only prepare a draft for a new version. With a Developer
  ID identity, both macOS packages require Apple notarization. When both
  distribution certificate secrets are absent, a draft branch can build internal
  Preview DMGs with the project's pinned Apple Development identity. A public release from `develop` requires notarized
  macOS update packages. Each Mac runner opens the installed app in an empty
  profile and after replacing releases 2.4.2, 2.5.2 and 2.6.0.
  Windows signing remains optional.
- `codeql.yml`, `dependency-review.yml` and `pr-checks.yml`: source/dependency and PR
  governance. `pages.yml` publishes documentation, not the desktop application.
- `auto-tag.yml`: inspect its explicit manual inputs before using it; native
  cutover does not imply permission to create a tag or publish.
- Dependabot tracks GitHub Actions.
  Labels and ownership map to `apps/`, `native/`, `contracts/` and design assets.

### macOS release credentials

Configure these GitHub Actions repository secrets for notarized macOS distribution.

| Secret | Required value |
| --- | --- |
| `MACOS_DEVELOPER_ID_P12` | Base64 of a password-protected PKCS#12 export containing one valid Apple **Developer ID Application** certificate and its matching private key. |
| `MACOS_DEVELOPER_ID_PASSWORD` | Password used for that export. |
| `APPLE_ID` | Apple Account with access to notarization for the certificate's team. |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that account. |

The Preview path produces `Viezan-<version>-preview-arm64.dmg` and
`Viezan-<version>-preview-x64.dmg`. On CI it uses `MACOS_PREVIEW_DEVELOPMENT_P12`
and `MACOS_PREVIEW_DEVELOPMENT_PASSWORD`. For a local build the signing identity
must be available to codesign in the macOS keychain. The public leaf fingerprint
is pinned in `scripts/native/verify_macos_dmg.py`. It verifies the bundled app and its helpers
and publishes the two images as manual downloads, outside the native updater.
A partial certificate configuration, invalid certificate or failed notarization
stops the release.

For notarized builds the runner derives the team ID from the signing identity and stores the
notarization profile in its temporary signing keychain. The release job waits
for Apple to accept the app and disk image and for both architectures to pass
the installation check.

For an optional prepared Windows Ollama runtime, set `VIEZAN_PATCHED_RUNTIME` on
its release runner. `package.py` verifies the full file inventory and SHA-256
manifest, including the pinned primary binaries, before copying it into the
installer. `.github/actions/stage-ollama-runtime` remains an explicit preparation
operation and invokes the native validator; it is not an implicit CI download.
No packaging hook imports an Electron packager context.

The retired pipeline description is preserved under
`docs/migration/legacy-reference/github-workflows.md` as historical evidence.
