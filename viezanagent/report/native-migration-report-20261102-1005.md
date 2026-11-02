# Native migration report — 2026-11-02 10:05 (đợt 2)

Workflow: `native-migration` (migrate → verify). Rules: `native-migration`, `viezan-product-engineering`, `.claude/rules/ui-ux.md`. Skills: `viezan-native-ux`, `viezan-native-migration`.

- Migrate: `ToastCenter`/`ToastStack` dùng chung; Hoàn tác cho lưu trữ phiên và xoá phiên dịch (`Interpretation.restoreSession`); lỗi tác vụ qua toast; Phiên dịch: đồng hồ, chọn model thật, tự cuộn + Xem mới nhất, deviceID theo phiên, phụ đề neo đáy, SRT đúng kiểu. Chi tiết: `docs/migration/native-implementation/native-code-50.md`.
- Verify: swift build PASS; swift test 32 + 42 PASS; documentation.mjs, generate-resources --check (42 metric), validate-viezanagent, domain.test.mjs PASS. Chạy thật: xoá → Hoàn tác khôi phục kho giống hệt bản sao lưu. Not run: đồng hồ/Xem mới nhất khi ghi âm thật, toast lưu trữ, lỗi sao lưu thật, Qt.
- Sự cố QA: một phiên QA 28/10 bị xoá thật do bấm Hoàn tác sau khi toast đã đóng; đã ghi trong báo cáo.
