# Workflow: sync-docs

Workflow đồng bộ docs Viezan với source code, đảm bảo `ARCHITECTURE.md`, `PROMPTS.md`, `product-intro.md`, `README.md`, `chrome-extension/README.md` và `docs/migration/legacy-reference/agent-handbook/manual/` luôn khớp với code thực tế.

## Cách dùng

```text
Dùng workflow sync-docs để rà drift giữa code và docs.
```

```text
Dùng workflow sync-docs sau khi thêm IPC/provider/locale/agent/skill mới.
```

```text
Dùng workflow sync-docs và lưu report vào docs/agents/reports/.
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

## README và version

- Đối chiếu tính năng, hướng dẫn, nhãn UI và giới hạn hệ điều hành với source/tests.
  Rà diff từ release trước; không chỉ thay số version hoặc chép commit titles.
- `npm run docs:sync` chỉ cập nhật các khối generated (version, providers,
  locales, dependency ranges); không viết lại mô tả và không xác nhận review.
- Khi bump version, cập nhật cả `package-lock.json` và mục `## [X.Y.Z]` trong
  `CHANGELOG.md`. Release workflow lấy nội dung mục đó để xuất bản.
- Sau khi đã rà đầy đủ và được yêu cầu sửa docs, chạy
  `npm run docs:review -- --summary "Nội dung và giới hạn đã đối chiếu"`, rồi
  `npm run check:docs` và `npm run test:docs`.
- Record `.github/readme-review.json` ghi fingerprint source, README và changelog.
  Nếu chỉ sửa nội bộ và không cần đổi mô tả, ghi lý do trong summary.
  Không chạy `docs:review` trong CI hoặc để bỏ qua một diff chưa đọc.
- Fingerprint phát hiện review đã cũ; tính chính xác của mô tả vẫn cần agent/người
  review đối chiếu source. CI không chứng nhận tính năng chạy đúng.

## Báo cáo mặc định

`docs/agents/reports/doc-sync-report-YYYYMMDD-HHmm.md`
