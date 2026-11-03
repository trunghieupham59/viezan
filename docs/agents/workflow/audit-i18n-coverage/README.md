# Workflow: audit-i18n-coverage

Workflow audit i18n VI/EN/JA của Viezan trước release hoặc sau khi thêm/sửa locale.

## Cách dùng

```text
Dùng workflow audit-i18n-coverage để kiểm tra i18n giữa vi/en/ja và Chrome Extension.
```

```text
Dùng workflow audit-i18n-coverage và lưu report vào docs/agents/reports/.
```

## Quy trình

1. Xác định phạm vi (toàn bộ / renderer / extension / scoped).
2. Static search bằng `rg` cho missing key, hardcoded string, attribute literal.
3. Đọc 3 locale (`vi.ts`, `en.ts`, `ja.ts`) và `types.ts`.
4. Diff key giữa 3 locale, liệt kê missing/extra.
5. Phát hiện hardcoded UI string, đề xuất i18n key theo namespace.
6. Kiểm tra key unused / duplicate giá trị.
7. Nếu scope có `chrome-extension/`: kiểm tra parity popup/options/tooltip.
8. Ưu tiên fix theo severity, fix Critical/High trong scope.
9. Verify bằng `npm run build` và `npm test`.
10. Lưu báo cáo `i18n-audit-report-YYYYMMDD-HHmm.md` nếu user yêu cầu.

## Báo cáo mặc định

`docs/agents/reports/i18n-audit-report-YYYYMMDD-HHmm.md`
