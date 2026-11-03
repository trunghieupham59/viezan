# Native migration preparation — 2026-10-26

Scope: project rules/skills/workflow, desktop migration plan and editable Figma UX.
No native implementation or production data migration performed.

Capabilities used: sync-docs, viezan-doc-sync, viezan-product-engineering;
new native-migration workflow/rule and viezan-native-migration/viezan-native-ux
skills. Authoring used Skill Creator and Figma create/use/generate-design/library.

Capability drift resolved by registering native-migration agent, workflow, rule
and both skills; updating PROMPTS, agent README and doc-sync references.

Deliverables and verification: [review evidence](../review-01.md),
[migration entrypoint](../README.md).
Runtime gates are NOT RUN; docs review remains stale due concurrent unrelated
source edits. Python skill validator blocked by missing PyYAML; equivalent scoped
frontmatter checks passed with existing js-yaml. No commits, pushes or releases.

Next: user design review, then one fake-provider Chat spike across SwiftUI and Qt.
