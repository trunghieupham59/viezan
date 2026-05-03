# Workflow Layer

Workflow la capability noi bo cua cac purpose agent. User nen prompt theo agent trong `viezanagent/agent/` truoc; chi goi workflow truc tiep khi can debug hoac chay mot gate hep.

## Canonical Workflows

| Purpose | Canonical workflow | Ghi chu |
|---|---|---|
| Implement | `ship-viezan-feature` | Duoc goi boi `agent implement` |
| Maintenance | `maintenance` | Gom diagnostics, hardcode/duplicate, score-code, UI split, docs drift, i18n/security/release gates |
| Docs | `sync-docs` | Duoc goi boi `agent docs` |
| Audit | `audit-local-first-security`, `audit-i18n-coverage`, `audit-extension-ux`, `audit-live-perf` | Duoc goi boi `agent audit` theo scope |
| Release | `release-readiness` | Duoc goi boi `agent release` |

## Internal Capability Workflows

`check-dup-hardcode`, `fix-vscode-problems`, `score-code`, `split-ui-component` va cac audit workflow chi nen duoc xem la capability ben duoi agent. Prompt mac dinh nen la:

```text
Hay dung agent maintenance de maintenance he thong
```

