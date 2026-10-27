# Native migration code 34 — source status

The user requires full feature migration and removal of Electron, without builds
or tests. This revision adds native desktop shortcuts/panels, extension HTTP and
tokens, microphone Interpretation, thermal integration, macOS application-data
planning/Trash/restore, and installed Ollama process ownership controls.

Detailed source coverage, preserved boundaries and remaining gaps are recorded
in `docs/migration/native-implementation/native-code-34.md` and
`full-migration-status.md`. Full migration is not complete; Electron remains.

No build, test, lint, runtime QA, dependency install, actual provider request,
recording, service launch, helper registration, application removal, user-data
migration, commit, push or release was run. Resource generation updated inert
native assets. The README review fingerprint was not refreshed. Existing dirty
work was preserved and no subagents were used.
