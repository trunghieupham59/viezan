# Workflow: sync-docs

Workflow đồng bộ docs Viezan với source code, đảm bảo `ARCHITECTURE.md`, `PROMPTS.md`, `product-intro.md`, `README.md`, `chrome-extension/README.md` và `viezanagent/docs/` luôn khớp với code thực tế.

## Cách dùng

```text
Dùng workflow sync-docs để rà drift giữa code và docs.
```

```text
Dùng workflow sync-docs sau khi thêm IPC/provider/locale/agent/skill mới.
```

```text
Dùng workflow sync-docs và lưu report vào viezanagent/report/.
```

## Quy trình

1. Xác định scope docs.
2. Extract truth từ code (IPC, preload, providers, slices, locales, agents/skills/workflows, report paths).
3. Đọc docs liên quan.
4. Diff truth vs docs theo các category của skill `viezan-doc-sync`.
5. Validate cross-reference và `classification` trong agent/rule/skill/workflow JSON.
6. Đề xuất patch tối thiểu (giữ format bảng/heading hiện có).
7. Apply nếu user yêu cầu, hoặc trả patch dạng diff.
8. Verify bằng markdownlint.
9. Lưu báo cáo `doc-sync-report-YYYYMMDD-HHmm.md` nếu user yêu cầu.

## Báo cáo mặc định

`viezanagent/report/doc-sync-report-YYYYMMDD-HHmm.md`
