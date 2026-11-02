# Native migration report — 2026-11-02 09:40

Workflow: `native-migration` (inventory → design → migrate → verify). Rules: `native-migration`, `viezan-product-engineering`, `.claude/rules/ui-ux.md`. Skills: `viezan-native-ux`, `viezan-native-migration`.

- Inventory: 10 route chụp thật (ux-01), ba bản kiểm kê gap spec/prototype ↔ Swift.
- Design: một hướng duy nhất "Quiet Workbench" — `docs/design/direction.md`, bản vẽ Claude Design, quyết định ghi vào `findings.md` và `ui-ux.md`.
- Migrate: đợt 1 nối backend–frontend (route notification, Gần đây có phiên dịch, Hoạt động có phiên dịch, ⌘K lọc module, Dịch mọi nơi bỏ gieo chữ mẫu, Từ điển ô ngữ cảnh, helper quạt theo trạng thái, thang chữ token). Chi tiết: `docs/migration/native-implementation/native-code-49.md`.
- Verify: swift build PASS; swift test PASS (41 native + domain); documentation.mjs, generate-resources --check, domain.test.mjs chạy cuối phiên. Not run: Qt, VoiceOver, ba cỡ chữ, 640 pt, thẻ phiên dịch trong Hoạt động (cần ghi âm thật).
- Remaining queue: mục 6 của native-code-49.
