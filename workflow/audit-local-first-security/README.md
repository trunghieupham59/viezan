# Workflow: audit-local-first-security

Workflow audit cam kết local-first/privacy và bảo mật Electron IPC trước khi merge/release.

## Cách dùng

```text
Dùng workflow audit-local-first-security để kiểm tra nhánh hiện tại.
```

```text
Audit security cho feature vừa thêm provider/chat/live translation.
```

## Quy trình

1. Xác định phạm vi thay đổi.
2. Chạy static searches cho key exposure, Node import trong renderer, preload surface, IPC handlers, openExternal, fetch/WebSocket.
3. Dùng skill `viezan-ipc-security-audit` để phân loại findings.
4. Sửa critical/high hoặc tạo action plan.
5. Verify build/test liên quan.
6. Lưu báo cáo vào `viezanagent/report/` nếu người dùng yêu cầu báo cáo file.

