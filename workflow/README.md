# Workflow Layer

Workflow la capability noi bo cua cac purpose agent. User nen prompt theo agent trong `viezanagent/agent/` truoc; chi goi workflow truc tiep khi can debug hoac chay mot gate hep.

Workflow phai khai bao ro rule/skill lien quan trong JSON. Neu workflow co gate goi workflow khac, dung `related_workflows` hoac field gate-specific `workflow` de the hien lien ket truc tiep/gian tiep trong capability graph.

## Canonical Workflows

| Purpose | Canonical workflow | Ghi chu |
|---|---|---|
| Implement | `ship-viezan-feature` | Duoc goi boi `agent implement` |
| Maintenance | `maintenance` | Gom diagnostics, hardcode/duplicate, score-code, UI split, extension drift, docs drift, i18n/security/perf/release gates |
| Docs | `sync-docs` | Duoc goi boi `agent docs` |
| Audit | `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf` | Duoc goi boi `agent audit` theo scope |
| Release | `release-readiness` | Duoc goi boi `agent release` |

## Internal Capability Workflows

`check-dup-hardcode`, `fix-vscode-problems`, `score-code`, `split-ui-component` va cac audit workflow chi nen duoc xem la capability ben duoi agent. Prompt mac dinh nen la:

```text
Hay dung agent maintenance de maintenance he thong
```

`workflow/maintenance` phai sinh report co `Maintenance Gate Matrix` va section rieng cho `System Score`, `Duplicate Code Audit`, `Hardcode & Secret Audit`, `UI/Component/Extension Audit`. Khong duoc thay the cac section nay bang mot bang `Findings` chung.
