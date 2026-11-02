# Review 18 — remaining native UI module pass

Workflow: native-migration. Rules: native-migration, viezan-product-engineering,
project Atomic UI and UI/UX rules. Skills: viezan-native-ux and
viezan-native-migration (already resolved in this conversation).

User requested continuing through the remaining design work and retains the
no-build/no-test constraint. Native presentation changes cover Interpretation,
Dictionary, Applications, Thermal, Everywhere, Utilities and detached panels,
plus shared toolbar/empty-state behavior and background-capture visibility.
Source modifications preserve the existing platform capabilities and saved data.

Detailed mapping and limitations:
`docs/migration/native-implementation/review18-native-ui.md`.

Performed: spec/source/nearby-test reads, source edits, call-site review and
regeneration of shared VI/EN/JA native resources. No user data/OS action executed.
Build, tests, lint, Atomic/design checks and native visual/runtime QA: NOT RUN per
user instruction. Runtime acceptance UX01/UX05/UX07–UX10 remains open; these
source changes do not certify visual fidelity, compilation or release readiness.
No dependency installs, commit, push or release.
