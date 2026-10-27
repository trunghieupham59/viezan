# Review 07 — Settings redesign

Design-only proposal; user acceptance pending. No shipped application source changed.

## Source grounding

Read docs/design/screens/settings.md, SettingsPage.tsx section registry, PreferencesSection.tsx and AppearanceSection.tsx. Preserve the eight source groups and immediate-choice model. Native proposal uses one selected section at a time instead of the current Electron scroll-spy over all sections. Existing EN/VI/JA product behavior is not changed; prototype copy remains Vietnamese.

## Changes

- Independent section navigation and scrollable settings detail with consistent grouped rows.
- Search across eight group names/descriptions/keywords, including accent-insensitive Vietnamese; result navigation and zero-results recovery.
- General: language/startup, completed-work reset, translation controls.
- Appearance: working light/dark/system mode, text size, reduced transparency/motion; five source presets shown in a clearly labeled preview area only.
- Models: local runtimes, per-conversation model context, cloud connection entry and supplemental services.
- Voice, Chat, Modules, Updates and About use the same groups/rows. Module selections remain illustrative; they do not enable/disable product capabilities.
- At compact container widths, labeled section tabs scroll horizontally; primary rail collapse no longer hides their labels.

## Evidence

- 22-settings-before.png: oversized intro, sparse section content and outdated Review 03 About copy.
- 23-settings-general.png: grouped General design (initial capture before compact header refinement).
- 24-settings-appearance.png and 25-settings-models.png: main redesigned views.
- 26-settings-linux640-dark.png: recaptured after repairing compact tab labels.

## Checks and limits

All eight section routes inspected; search `trong suot` found Appearance, selecting result cleared query; unmatched query showed recovery action. Dark-mode control changed the rendered theme. Linux 640 dark layout captured and inspected. JS syntax, Atomic/design checks passed; scripts scan product code, not this isolated prototype. No app build/runtime tests because product files are untouched.

Prototype selections live in memory. System startup, credentials, speech, provider calls, updates and module activation are not executed. Preset selection is preview-only. Search matches group keywords, not a complete live index of every source setting. Full accessibility, native OS materials and EN/JA layout acceptance remain unverified. This is not full feature parity with all production Settings controls.
