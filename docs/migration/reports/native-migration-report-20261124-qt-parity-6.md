# Qt/QML · Sprint 4 · 24/11/2026

## Thay đổi theo file

Các đường dẫn dưới đây tính từ `apps/desktop-qt/`.

| Story | File | Thay đổi |
| --- | --- | --- |
| P1 | `WorkbenchBridge.h`, `WorkbenchBridge.cpp` | `settingsJump` nhận truy vấn từ hai ký tự, bỏ dấu và đổi `đ` thành `d`. Chỉ tiêu đề hoặc từ khóa tối đa 40 ký tự sau chuẩn hóa được xét ở đầu chuỗi hoặc ngay sau dấu cách. Mục khớp tiêu đề đứng trước mục khớp từ khóa. Giữ thứ tự danh mục trong từng nhóm và lấy tối đa ba mục. |
| P1 | `qml/Launcher.qml`, `qml/SettingsSearch.js` | Launcher dùng hàm mới. Trang Cài đặt vẫn tìm trong mô tả và giữa từ. Cả hai dùng chung danh sách từ khóa đang hiện theo trạng thái module phím tắt. |
| P2 | `qml/ChatTranscript.qml` | Trong Chat Glass, chip và nút Dừng cùng hiện khi tác vụ đang chạy có dữ liệu nghiên cứu hoặc phiên ở chế độ `web`/`research`. Nút dùng `SettingsDangerButton`, nhãn `stop` và ID tác vụ của chính câu trả lời. Thiếu `started` vẫn dừng được. Hàng ẩn khi tác vụ kết thúc. |
| P1, P2 | `tests/WorkbenchBridgeTests.cpp` | Port ca Swift cho Launcher, kiểm thêm biên 40/41 ký tự, tiếng Nhật và mô tả chỉ tìm được trong Cài đặt. Kiểm hai nút Dừng, tên trợ năng, nhấn Space để hủy đúng tác vụ khi phiên khác đang chạy và trạng thái trước pha nghiên cứu đầu tiên. |

## Kết quả kiểm

Build Release bằng `cmake --build .native-build/qt --config Release -j 6` trên macOS arm64, Qt 6.12.0. Cả hai lượt build đều thành công và không in cảnh báo. QtTest dùng Fusion/offscreen và thư mục người dùng tạm.

| Story | Hàm QtTest | Tổng kết nguyên văn, gồm init/cleanup |
| --- | --- | --- |
| P1 | `launcherSettingsJumpMatchesTitleAndTermWordsOnly`, `launcherOpensMatchingSettingsSection`, `w4SettingsSearchIme`, `w5bLauncher` | `Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 1867ms` |
| P2 | `researchChipFollowsRunningTask`, `glassChatStates`, `glassImageResearchAndReset` | `Totals: 19 passed, 0 failed, 0 skipped, 0 blacklisted, 8694ms` |

Hai hàm kiểm Chat Glass chạy ở chiều rộng 640, 820, 1200 và 1280, cả sáng lẫn tối. Đối chiếu ghi chú N3/N4, workflow và quy tắc `native-migration`, `ui-ux.md` và Viezan Native UX. Hướng dẫn *Focus States* của UI UX Pro Max được áp dụng qua nút Qt dùng chung có vòng focus.

Tổng kết nguyên văn của `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`.

```text
100% tests passed out of 9

Total Test time (real) =  31.38 sec
```

`git diff --check -- apps/desktop-qt` đạt. Luồng Qt sửa sáu file đã có thay đổi từ các vòng trước và tạo báo cáo này. Khi đối chiếu với đầu lượt, `git status --short` còn ghi nhận `apps/macos/Sources/ViezanDomain/LocalPerformance.swift` từ luồng song song.

## Chưa kiểm

Theo phạm vi sprint, chưa mở app, chạy provider thật, thử trình đọc màn hình hoặc kiểm trên Windows/Linux. Ca QtTest Glass tăng tốc có sẵn bị bỏ qua vì offscreen thiếu RHI.

## Cần Tech Lead xử lý

Ghi nhận Qt đã khớp quy tắc Launcher trong `docs/design/screens/launcher.md` và bổ sung hành vi của hai nút Dừng vào `docs/design/screens/chat.md`. Hai story dùng chuỗi và token hiện có.
