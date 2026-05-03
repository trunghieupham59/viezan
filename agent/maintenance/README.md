# Agent: maintenance

Dung khi user noi chung chung nhu:

```text
Hay maintenance he thong
```

Agent nay la giao dien rut gon cho cac workflow cu nhu `split-ui-component`, `check-dup-hardcode`, `fix-vscode-problems`, `score-code`, `sync-docs` va cac gate i18n/security/release can thiet.

Mac dinh agent se:

1. Kiem tra trang thai repo va scope thay doi.
2. Chay diagnostics/build/test/Biome neu phu hop.
3. Quet duplicate, hardcode, secret, magic literal.
4. Danh gia code quality va UI/component drift.
5. Kiem tra i18n, security/local-first va docs drift o muc gate.
6. Fix Critical/High trong scope.
7. Luu report tong hop `viezanagent/report/maintenance-report-YYYYMMDD-HHmm.md`.
