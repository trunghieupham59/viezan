# macOS release packaging and DMG verification

## Release readiness

The distribution check rejected both published Viezan 2.6.0 disk images.
Verification of a replacement on Apple Silicon and Intel is blocked pending a
Developer ID Application identity with a private key. The workflow changes are local.

| Check | Result | Evidence |
| --- | --- | --- |
| GitHub asset identity | Pass | SHA-256 matched the v2.6.0 release for each download. |
| Apple Silicon 2.6.0 DMG | Fail | `codesign --verify --strict --deep` failed on the mounted Viezan.app. |
| Intel 2.6.0 DMG | Fail | The same signature check failed on the mounted Viezan.app. This was a static check on Apple Silicon. |
| Development-signed control DMG | Rejected as expected | The mounted local app passed bundle integrity, then failed the Developer ID Application requirement. |
| Credential preflight | Pass | Running the workflow step with absent credentials stopped before keychain setup. A synthetic signing identity produced the expected certificate fingerprint and team ID. |
| Tests and configuration | Pass | 12 Python tests, 13 Node tests, native resources and documentation checks passed. The release workflow parsed as YAML and its Bash steps passed syntax validation. |
| Apple notarization and fresh-runner launch | Blocked | No usable local distribution signing identity. The repository secret names for the distribution certificate and its password were absent. |

## Reproducing the check

Use both disk images from the [v2.6.0 release](https://github.com/trunghieupham59/viezan/releases/tag/v2.6.0).

```sh
python3 scripts/native/verify_macos_dmg.py Viezan-2.6.0-darwin-arm64.dmg
python3 scripts/native/verify_macos_dmg.py Viezan-2.6.0-darwin-x64.dmg
```

| Asset | Verified SHA-256 |
| --- | --- |
| darwin-arm64.dmg | `56fa98913dffa878f48b224094d5825edfc8351155522408a1b9825df4636469` |
| darwin-x64.dmg | `96c3ab8fbf0595c33a523778f1d10aea99665a66336263ff6976856d5aba6cf2` |

## Capability coverage

The `release-readiness` workflow and the `viezan-product-engineering` and
`generate-code` rules guided the packaging change. The signing review covered
secret scope and temporary keychain handling. The i18n and documentation checks
covered native resource parity and README consistency. Product UI, extension
and live-performance smoke tests were outside this packaging check. Swift and
Qt product suites were not run locally for this change.

## Follow-up on 2026-11-25 — manual-install Preview DMGs

Two additional DMGs are available on the public v2.6.0 release. The arm64 app
was built from tag `v2.6.0`. The x64 app came from the SHA-256-verified Intel
release DMG and was re-signed and repackaged. The mounted app and three helpers
in each Preview passed strict signature, ad hoc signature and CPU architecture
checks. Both downloads matched their local SHA-256 digests after publication.

| Download | SHA-256 |
| --- | --- |
| [Apple Silicon Preview](https://github.com/trunghieupham59/viezan/releases/download/v2.6.0/Viezan-2.6.0-preview-arm64.dmg) | `3bc1688d233c37b2f0c7895d515fc61e9976f262500d1d253463b9336cea00ee` |
| [Intel Preview](https://github.com/trunghieupham59/viezan/releases/download/v2.6.0/Viezan-2.6.0-preview-x64.dmg) | `642169260439fc597c4f6b3cb27a5886e464104fb2b4494cf10a02c7787b23dc` |

The local Actions change selects Preview only when both certificate secrets
are absent. Workflow syntax, all four combinations of certificate and password,
13 Python tests, native resources and doc checks passed. These assets have
no Apple notarization ticket. First launch on a clean Mac of either architecture
was not tested during this manual upload.
