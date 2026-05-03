# Agent: maintenance

Dung khi user noi chung chung nhu:

```text
Hay maintenance he thong
```

Agent nay la giao dien rut gon cho cac workflow cu nhu `split-ui-component`, `check-dup-hardcode`, `fix-vscode-problems`, `score-code`, `sync-docs` va cac gate i18n/security/release can thiet.

Mac dinh agent se:

1. Kiem tra trang thai repo va scope thay doi.
2. Chay diagnostics/build/test/Biome neu phu hop.
3. Quet duplicate, hardcode, secret, magic literal va bao cao thanh section rieng.
4. Cham diem he thong bang rubric `viezan-electron` va ghi bang diem rieng.
5. Danh gia UI/component/icon/extension drift bang section rieng.
6. Kiem tra i18n, security/local-first va docs drift o muc gate.
7. Fix Critical/High trong scope.
8. Luu report tong hop `viezanagent/report/maintenance-report-YYYYMMDD-HHmm.md`.

## Report contract bat buoc

Report maintenance khong duoc chi gom diagnostics va findings chung chung. Cac muc sau la bat buoc:

1. `Maintenance Gate Matrix`
2. `Diagnostics`
3. `System Score`
4. `Duplicate Code Audit`
5. `Hardcode & Secret Audit`
6. `UI/Component/Extension Audit`
7. `Docs/I18n/Security Gates`
8. `Fixes Applied`
9. `Verification`
10. `Remaining Queue`
11. `Report Completeness Checklist`

Neu gate nao khong chay, van phai co dong `Not run` hoac `Blocked` kem ly do cu the. Khong duoc bo qua im lang cac gate score-code, duplicate/hardcode, UI split, i18n, security hoac docs drift.
