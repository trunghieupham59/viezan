# UI UX Pro Max integration — 2026-11-02

## Scope

User authorized using `nextlevelbuilder/ui-ux-pro-max-skill` in Viezan design
after reviewing its SwiftUI, Qt and Liquid Glass coverage. This change installs
the research skill in the repository and connects it to the existing native UX
workflow. It does not change application UI or settle a new screen design.

The checkout already had application, token, resource, design and dev-reload
changes. This task edited only the agent/design guidance listed below and added
the vendored skill and this report. Concurrent shell work remains separate.

## Sources and capability resolution

- Agent: `docs/agents/agent/native-migration/native-migration.json`.
- Workflows: `native-migration`; scoped `sync-docs` for agent documentation.
- Rules: `AGENTS.md`, `.claude/rules/ui-ux.md`, capability contract,
  `native-migration` and applicable `viezan-product-engineering` rules.
- Skills: `viezan-native-ux`, `viezan-native-migration`, `viezan-doc-sync`;
  installer and skill-creator helpers for installation/integration.
- Current design inputs: `docs/design/direction.md`, `foundations.md`, shell
  spec, `docs/migration/workbench-ux.md` and `acceptance.md`. Current native
  direction governs historical migration proposals.
- Upstream: <https://github.com/nextlevelbuilder/ui-ux-pro-max-skill> at commit
  `3a13158ff1f32156cbe144108de48eda2ecaed9a`, source directory
  `.claude/skills/ui-ux-pro-max`, installed to `.agents/skills/ui-ux-pro-max`.

## Integration

- Vendored the upstream skill, scripts, data, references and included tests.
  Added the root MIT license and `UPSTREAM.json` recording the source commit
  and original/installed skill hashes. Python 3 is the runtime requirement;
  no npm/pip dependencies or global skill installation were added.
- Added a short Viezan entry section to the upstream `SKILL.md`. Its generic
  body remains, while the entry section routes to the local adapter and actual
  search path. Upstream data and executable scripts are unchanged.
- Added `docs/agents/skill/viezan-native-ux/references/ui-ux-pro-max.md` with
  targeted searches, source precedence, SwiftUI/AppKit and Qt mappings,
  Liquid Glass placement, accessibility and evidence boundaries.
- Linked the adapter through `AGENTS.md`, `.claude/rules/ui-ux.md`, the existing
  native UX skill/JSON, the native workflow design step, and agent README/prompts.
  The existing agent already declares native UX, so no new purpose agent or
  parallel design system is introduced.

## First research use

Commands below ran from the repository root with
`python3 -B .agents/skills/ui-ux-pro-max/scripts/search.py`.

| Query and mode | Observed result | Applied to the design workflow |
| --- | --- | --- |
| `"Liquid Glass" --domain style -n 1 --json` | One result: `liquid-glass`, Platform/Material, SwiftUI/UIKit/AppKit. | Use glass selectively for native navigation/controls and retain readable content surfaces. Current Viezan direction decides exact shell geometry. |
| `"keyboard focus" --stack swiftui -n 2 --json` | One result: `Use @FocusState for keyboard`, with iOS applicability. | Treat as a candidate for macOS; retain existing AppKit first-responder and IME bridges instead of blindly following the row's prohibition of manual handling. |
| `"keyboard focus modal" --domain ux -n 3 --json` | Focus States (`All`), plus two Web focus-obscuration rows. | Adopt the visible-focus outcome. Map to native controls; do not copy Tailwind/CSS examples or relabel Web criteria as Qt implementation guidance. |
| `"reduced motion" --stack swiftui -n 1 --json` | One result: `Respect reduced motion`. | Preserve the platform preference and existing Viezan motion fallback. |

The installed stack inventory has no Qt/QML entry. Qt work uses relevant general
UX research plus primary Qt API documentation. A material approximation in the
QML scene is not evidence of Apple Liquid Glass or desktop backdrop support.

## Verification

| Check | Result |
| --- | --- |
| `npm run check:agent` | PASS — 36 JSON files, 246 relative references. |
| `npm run check:docs` | PASS — native references and version 2.4.2 consistency. |
| `python3 -B .agents/skills/ui-ux-pro-max/scripts/validate_data.py` | PASS — 12 domains, 22 stacks and `ui-reasoning.csv`. |
| Four targeted searches above | PASS — results and platform applicability inspected. |
| Absolute-path Liquid Glass search from `/private/tmp` | PASS — assets resolve outside the repository working directory. |
| Skill link/provenance check | PASS — 9 local links/references, installed skill SHA-256 and MIT license. |
| Skill metadata/placeholder validation using Ruby standard-library YAML | PASS for installed upstream and native UX skill. |
| Bundled `skill-creator/scripts/quick_validate.py` | NOT RUN to completion — the available Python lacks `PyYAML`; equivalent metadata/placeholder checks used Ruby without installing dependencies. |
| `git diff --check` for this task's tracked guidance | PASS. |
| Independent read-only integration review | PASS — no blocking findings for SwiftUI sidebar refinement and corresponding Qt design requests. |
| Full upstream test suite | NOT RUN — installation smoke/data validation covers this unchanged import; no search-engine implementation changes. |
| Native builds and live UI/IME/screen-reader acceptance | NOT RUN — no application source or UI changed in this task. |

## Acceptance boundary

The skill is installed and usable now through its local script and documented
workflow; automatic Codex discovery is available on the next turn. This is
design-tooling acceptance only. It does not change the live macOS, Windows or
Linux acceptance status, and it does not count as user approval of any screen.
