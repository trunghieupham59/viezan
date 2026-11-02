# Native migration report — 2026-11-02 12:40 (đợt 7)

Workflow: `native-migration` (migrate → verify). Rules: `native-migration`, `viezan-product-engineering`, `.claude/rules/ui-ux.md`. Skills: `viezan-native-ux`, `viezan-native-migration`.

- Migrate: `ResearchPanel` (pha, truy vấn, nguồn, phát hiện) dưới câu trả lời Chat; diff từ giữa các cột So sánh; kế hoạch Ứng dụng nhóm theo loại với dung lượng và bằng chứng; bảy tỷ lệ bố cục native thành token `--vzn-native-*` sinh vào native.json (49 metric). Chi tiết: `docs/migration/native-implementation/native-code-55.md`.
- Verify: swift build PASS; swift test 33 + 46 PASS; literal tỷ lệ trong view = 0; documentation.mjs, generate-resources --check, validate-viezanagent, domain.test.mjs PASS. Chạy thật: kế hoạch Ứng dụng (chỉ đọc). Not run: panel nghiên cứu và diff (cần API), Qt.
