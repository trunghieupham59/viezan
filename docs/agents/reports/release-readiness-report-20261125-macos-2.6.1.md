# Viezan 2.6.1 macOS installation and upgrade checks

On 25 November 2026, the arm64 Preview built from the working checkout opened a
workbench window in all four installation scenarios on an Apple Silicon Mac
running macOS 27.2.1. Each case used an empty temporary Applications directory
and a private Foundation profile. The machine itself was already in use.

| Starting installation | Route exercised | Observed after launch and normal quit |
| --- | --- | --- |
| Empty | Copied the candidate from the verified DMG | The installed executable opened a visible window and created its workspace. |
| Electron 2.4.2 | Installed the original DMG, then replaced the whole bundle with the candidate | The native workspace was created and a marker in the separate Electron profile survived. Browser-history import was outside this check. |
| Native 2.5.2 | Installed the original DMG, seeded the recovery fixture and replaced the bundle as in a manual DMG install | The candidate kept the Unicode chat draft and recovered the interrupted task. The 2.5.2 updater hands a downloaded DMG to the user. |
| Native 2.6.0 | Installed the original DMG and ran the native updater's production disk-image replacement routine against the candidate | The previous bundle in the backup had version 2.6.0. The installed 2.6.1 opened a window, kept the draft and recovered the interrupted task. |

The 2.6.0 replacement routine matched the released tag. Launch Services opened
the executable at each installation path. WindowServer reported an on-screen
layer-zero window belonging to that process. A separate launch of the same
candidate was left open for the owner and showed a 1354 × 844 window.

## Packages and checks

- The original arm64 DMGs matched the pinned GitHub digests in
  [the install test](../../../scripts/native/test_macos_install.py). The mounted
  2.6.0 app failed strict code verification because its signed resource envelope
  was missing. Its build skipped bundle signing when no identity was available.
- Tested asset: `Viezan-2.6.1-preview-arm64.dmg`. SHA-256:
  `10d64b3b7d39567f434032eb2075cbd8407c0d96f8c91bd30149bcaeaabd1cb9`.
  The installed app and its three helpers passed strict signature and arm64
  checks. The distribution verifier rejected the ad hoc signature as expected.
- The Swift test runs reported 122 native and 231 domain tests with no failures.
  Three opt-in rendering tests were skipped. The candidate-DMG updater test
  also passed with the actual old and new packages.
- All 16 Python tests and 11 shared Node tests passed. The resource, documentation,
  whitespace and workflow syntax checks passed. Eight signing-mode combinations
  covered public and draft branches, absent credentials and partial configuration.
- The release-readiness workflow, product-engineering and generate-code rules
  guided packaging, signature verification and documentation. Product-provider,
  audio, extension, Windows and Linux acceptance were outside this Mac install test.

## Public distribution

The stable workflow requires a Developer ID Application signature, Apple
notarization and a matching, tested native update DMG on arm64 and x64. It also
publishes a byte-identical DMG under the filename that Electron 2.4.2 uses when
the GitHub API is rate-limited. Draft builds can produce manual-install Previews.

The machine had zero valid Developer ID Application identities. The repository
had the notarization account settings and lacked the distribution certificate
and its password. Public distribution, a browser-downloaded notarized package
on a clean Mac, the live GitHub update flow and an Intel launch remain unverified.
The local runs used the candidate directly and did not clear quarantine or change
Gatekeeper settings.
