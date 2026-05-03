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

## Bao cao mac dinh

`viezanagent/report/maintenance-report-YYYYMMDD-HHmm.md`
