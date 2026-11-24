# macOS 2.6.1 internal Preview permission retention

On 25 November 2026, two successive Release builds ran on the same Apple Silicon
Mac and macOS user account (macOS 27.2.1). The test installed each build from its
own verified arm64 DMG, used the same app path and isolated app-data profile,
and launched the GUI with Launch Services.

| Observation | Build 1, before the upgrade | Build 2, first activation after the upgrade |
| --- | --- | --- |
| Version | 2.6.1 (1) | 2.6.1 (2) |
| GUI process with a visible window | 66325 | 67375 |
| Accessibility, reported by the GUI process | true | true |
| Screen Recording, reported by the GUI process | true | true |
| App CDHash | `bda7358f6d69c12d8477584908a78ddc7423fc5d` | `b72239df88ee257f34bc3af894b488cc62ec0048` |
| DMG SHA-256 | `bcf434898359bf6ff2bb1fd02123661b356a79d25da83739df38fb74c774b2b6` | `b6781cb467d45d1459340489f6ea054126e8af5e64946f7220f21e06fb6299ad` |

Both permissions were already available to build 1 on this account. The test
quit build 1 normally, replaced the bundle at the same path, and opened build 2.
Build 2 reported both grants before any permission request or Settings change.
The normal GUI with `--report-permissions` wrote only the bundle build number,
PID and the two results from `AXIsProcessTrusted()` and
`CGPreflightScreenCaptureAccess()` to stdout when it became active.

## Signing and packaging

The signer matches the Apple Development leaf used by the project's existing
dev app. The Preview packager pins that public fingerprint. Strict code
verification on each mounted DMG checked the app and all three native helpers
against the pinned leaf, Apple certificate type, architecture and expected code
identifier. Each app satisfied the other's designated requirement and the two
requirements were identical. The previous ad hoc 2.6.1 DMG failed the new
signature check.

To repeat, use `scripts/native/build.py --target macos --configuration Release`
with distinct `--build-number` and `--output` values. Run
`scripts/native/package_macos_preview.py` once per build with separate output
directories. Install the first DMG at a test path and launch using
`open -n --stdout /path/to/build-1.log -a /path/to/Viezan.app --args --report-permissions`.
Establish the baseline with both grants on the first build. Quit, install the
second app at the same path and repeat with a fresh output log. Compare the
first activation of the new PID against the baseline.

## Verification scope

The release-readiness workflow, product-engineering and generate-code rules
guided this change. All 17 Python tests, 11 shared Node tests and two targeted
Swift tests passed. Resource, documentation, whitespace, workflow syntax and 32
signing-mode checks passed. This run covered permission retention on one Mac.
First-time grant dialogs, the ad hoc to development consent transition, Intel,
notarization and hosted CI were outside the live test. GitHub had neither of the
two Preview signing secrets configured at the time of the check.
