# Native migration code 33 — implementation status

Scope is full feature migration, per the user's repeated instruction. This
revision continues source implementation but does not satisfy full parity.

Added Swift/C++ cloud transport and credentials, microphone/STT/OS speech,
attachments/OCR/basic screenshot capture, language styles/phonetics/rewrite,
Ollama pull/delete, reversible session archiving and native backup preview/import.
Detailed behaviors and remaining limitations are recorded in
`docs/migration/native-implementation/native-code-33.md` and
`full-migration-status.md`.

No build, test, lint, visual QA, dependency install, user-data migration, commit,
push or release was run. The user explicitly waived builds/tests and will run
these later. Resource generation was run to update bundled locales/templates;
this is not verification. Existing README review fingerprint was not refreshed
and the old fingerprint does not attest to these changes. Existing dirty work
and Electron implementation remain preserved. No subagents were used.
