# Workflow: audit-extension-ux

Workflow audit Chrome Extension UX và local bridge security của Viezan.

## Cách dùng

```text
Dùng workflow audit-extension-ux để audit chrome-extension/ và local bridge.
```

```text
Dùng workflow audit-extension-ux trước release Windows/macOS.
```

## Quy trình

1. Xác định scope (toàn bộ extension hoặc theo file diff).
2. Static search: inline SVG/emoji, chrome.storage, bridge bind/origin/key, direct SDK call.
3. Đọc 5 surface: popup, options, content script, background, local bridge.
4. Phân loại findings theo skill `viezan-extension-ux`.
5. Cross-check bridge security với skill `viezan-ipc-security-audit`.
6. Cross-check i18n parity nếu scope chạm text.
7. Ưu tiên fix theo blocking policy.
8. Verify: `node --check`, `npm run build:electron`, manual smoke translate/copy/replace/listen.
9. Lưu báo cáo `extension-ux-report-YYYYMMDD-HHmm.md` nếu user yêu cầu.

## Báo cáo mặc định

`docs/agents/reports/extension-ux-report-YYYYMMDD-HHmm.md`
