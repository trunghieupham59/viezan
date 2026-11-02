# Workflow: maintenance

Workflow tong hop cho maintenance he thong Viezan. Day la workflow chinh thay cho viec user phai goi rieng `fix-vscode-problems`, `check-dup-hardcode`, `score-code`, `split-ui-component`, `sync-docs` va cac gate lien quan.

## Cach dung

```text
Hay dung agent maintenance de maintenance he thong hien tai
```

Hoac neu can goi workflow truc tiep:

```text
Dung workflow maintenance de kiem tra va fix code quality, hardcode, diagnostics, UI drift va docs drift.
```

## Nguyen tac

- Giu cac workflow cu lam capability noi bo, khong xoa reference.
- Uu tien fix Critical/High trong scope.
- Khong refactor rong neu finding chi can fix he thap.
- Sau khi fix, cap nhat report/fix artifact lien quan.
- Report maintenance phai co section rieng cho score-code, duplicate, hardcode va UI; khong duoc gop tat ca vao `Findings`.
- Neu gate nao khong chay duoc, ghi `Not run` hoac `Blocked` kem ly do trong `Maintenance Gate Matrix`.

## Required Gate Matrix

| Gate | Capability | Bat buoc ghi trong report |
|---|---|---|
| Repo Scope | `git status`, recent reports | Branch/submodule/dirty state va scope da loai tru |
| Diagnostics | `fix-vscode-problems`, build/typecheck/test/Biome | Command/status table va loi goc neu fail |
| System Score | `score-code` | Bang diem rubric `viezan-electron`, co weighted total |
| Duplicate Code Audit | `check-dup-hardcode` | Count theo clone type/severity, file:line hoac clean evidence |
| Hardcode & Secret Audit | `check-dup-hardcode` | Count theo credential/magic/config/URL/UI/icon va false-positive note |
| UI/Component/Extension Audit | `split-ui-component`, `audit-extension-ux` | Component map, inline SVG/icon, duplicate UI pattern, extension drift |
| Docs/I18n/Security Gates | `sync-docs`, `audit-i18n-coverage`, `audit-local-first-security` | Docs drift, locale parity/hardcoded UI text, IPC/key/local-first boundary |
| Live/Performance Gate | `audit-live-perf` khi cham live/audio/stream | Lifecycle/perf result hoac Not run + ly do |
| Release Readiness | `release-readiness` khi cham package/release | Release gate result hoac Not run + ly do |

## Report Template Toi Thieu

```md
## Scope
## Maintenance Gate Matrix
## Diagnostics
## System Score
## Duplicate Code Audit
## Hardcode & Secret Audit
## UI/Component/Extension Audit
## Docs/I18n/Security Gates
## Findings
## Fixes Applied
## Verification
## Remaining Queue
## Report Completeness Checklist
```

Checklist cuoi report phai tick ro:

- Tat ca gate bat buoc co mat trong `Maintenance Gate Matrix`.
- Cac section score/duplicate/hardcode/UI khong bi bo trong report.
- Gate skipped co `Not run`/`Blocked` va ly do.
- Verification chi liet ke lenh da chay hoac scope da quet that.
- Critical/High duoc fix hoac co blocker/owner/next action ro rang.

## Bao cao mac dinh

`docs/agents/reports/maintenance-report-YYYYMMDD-HHmm.md`
