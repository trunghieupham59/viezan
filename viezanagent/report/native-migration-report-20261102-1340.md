# Native migration report — 2026-11-02 13:40 (đợt 9, khép loạt)

Workflow: `native-migration` (migrate → verify). Rules: `native-migration`, `viezan-product-engineering`, `.claude/rules/ui-ux.md`. Skills: `viezan-native-ux`, `viezan-native-migration`.

- Migrate: thẻ Tổng hợp theo tab với Sao chép/Tạo lại; hàng lịch sử Phiên dịch có cặp ngôn ngữ, số câu và xoá riêng; `LocalPerformance.selectedMode` + bảng hiệu năng có "Đang dùng". Chi tiết: `docs/migration/native-implementation/native-code-57.md`.
- Verify: swift build PASS; swift test 34 + 46 PASS; documentation.mjs, generate-resources --check (50 metric), validate-viezanagent, domain.test.mjs PASS. Chạy thật: popover Lịch sử Phiên dịch. Not run: thẻ Tổng hợp (cần API), bảng hiệu năng (cần Ollama), Qt.
- Loạt 49→57 khép; hàng đợi còn lại ghi ở `docs/design/direction.md` mục "Việc còn mở".
