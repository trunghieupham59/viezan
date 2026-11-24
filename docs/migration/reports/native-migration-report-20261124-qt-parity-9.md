# Qt · Sprint 6 · Review QML ngày 24/11/2026

| Mục | Quyết định và bằng chứng | QtTest |
| --- | --- | --- |
| 1 · Switch | **Sửa.** Track đang bật từng che viền focus cùng màu. Vòng mới nằm ngoài track và dùng màu chữ của palette. Đã kiểm màu, kích thước và chuyển focus ở sáng/tối. | `glassControlStates` |
| 2 · Dialog | **Sửa.** Graphite lấy lại scrim của style. Sau Escape, focus về nút mở. Khi xác nhận làm nút đó mất hiệu lực, dialog dùng điều khiển dự phòng của trang. Đã tái hiện bằng thao tác xoá lịch sử. | `glassDialogPreservesStandardActions`, `w4HistoryConfirmation` |
| 3 · Chip gợi ý | **Sửa.** Trang chủ từng gọi `habitSuggestions()` 4 lần cho 4 lần sửa nháp. Trang chủ và Chat nay gọi thêm 0 lần cho 4 lần sửa nháp và 3 chunk. Delegate dùng `modelData`, danh sách thu về rỗng khi gửi. Chưa tái hiện riêng `TypeError` trên bản cũ. **Giữ** trạng thái khoá kế thừa từ workspace, đã kiểm bằng reload lỗi. | `catalogBindingsIgnoreDraftsAndChunks`, `habitChipsNavigateWithoutReplacingWork` |
| 4 · Panel model | **Sửa.** Panel đóng từng gọi `modelSections()` 4 lần cho 4 lần sửa nháp, nay là 0. Panel mở cũng nhận 3 chunk mà không gọi lại. Ghim đọc từ snapshot của shell. Menu ghim dùng `Popup.Item`, đóng cùng panel khi đổi phiên và trả focus về ô tìm sau Escape. | `catalogBindingsIgnoreDraftsAndChunks`, `modelPinsAndPanelShortcuts` |
| 5 · Menu suy luận | **Sửa** đường phân cách bị thiếu. **Giữ** binding `checked`. Sau cú nhấp thật, dấu tích vẫn đúng khi sang phiên khác, trở về phiên đã lưu và áp dụng tier Careful. | `chatReasoningPreservesSessionAndAttempt` |
| 6 · Launcher | **Sửa.** Escape ở nút tiền tệ và Thử lại đóng cửa sổ. Khi ẩn, menu tiền tệ đóng và bộ đếm tìm tệp không tăng sau thời hạn 250 ms. Các nhãn con đã có nội dung trên hàng được đánh dấu `Accessible.ignored`. | `w5bLauncher` |
| 7 · Nghiên cứu | **Sửa.** Chip và nút Dừng theo `task.request.chatMode` hoặc pha nghiên cứu đã nhận. Đổi mode của phiên không làm đổi tác vụ đang chạy. Đồng hồ có giờ hiện tại ngay khi tạo. | `researchChipFollowsRunningTask` |
| 8 · Bản địa hoá | **Sửa** tên ghim bằng `pinModelNamed` và `unpinModelNamed`, dùng màu chữ disabled của palette. Đã kiểm VI/EN/JA. **Giữ** mã đo `gpu` và `hybrid` theo bảng kết quả và macOS. | `modelPinsAndPanelShortcuts`, `installedModelRowsRefreshStoredMeasurements` |
| 9 · Cỡ chữ và tương phản | **Sửa phần kiểm được.** Badge và chip gợi ý cao theo chữ. Nền badge bận có alpha 255 khi giả lập High Contrast. Nút tiền tệ có chevron, dòng tỷ giá dùng `captionScale`. | `glassControlStates`, `habitChipsNavigateWithoutReplacingWork`, `w5bLauncher` |

## Kết quả kiểm

Build Release trong `.native-build/qt` thành công, không có cảnh báo build. QtTest chạy trên macOS arm64, Qt 6.12.0, Fusion/offscreen với hồ sơ tạm. Hai lượt lọc ban đầu lần lượt ghi nhận 4 và 11 ca đỏ. Lượt ctest đầu đạt 8/9. Ca thanh cuộn Chat đã được chỉnh để chờ nút mở đến vị trí của phiên có nội dung rồi mới nhấp, vẫn kiểm điều kiện thanh cuộn ở 1280×800.

Tổng kết nguyên văn của lượt QtTest lọc theo hàm và lượt ctest cuối.

```text
Totals: 21 passed, 0 failed, 0 skipped, 0 blacklisted, 11472ms
```

```text
100% tests passed out of 9

Total Test time (real) =  31.52 sec
```

Đối chiếu SHA-256 với đầu lượt ghi nhận 16 file nguồn/test Qt thay đổi. `git diff --check -- apps/desktop-qt` đạt. Báo cáo này là đường dẫn mới duy nhất trong `git status --short` so với đầu lượt.

Áp dụng workflow, rule và skill `native-migration`, rule `viezan-product-engineering`, skill `viezan-native-ux` và ghi chú thiết kế N2/N5. Tra cứu UI UX Pro Max `keyboard focus modal` khớp *Focus States*.

## Cần Tech Lead xử lý

Bổ sung mẫu chung có tham số `{code}` cho nhãn tiền tệ của Launcher, ví dụ JA `換算先：{code}`. Qt hiện vẫn ghép nhãn và mã bằng `: `.

## Chưa kiểm

Windows/Linux thật, Segoe UI 125–150%, High Contrast hệ thống, chevron bằng mắt, IME hệ điều hành, Narrator/NVDA và focus danh sách Ứng dụng. Chưa mở app hoặc chụp ảnh. QtTest bỏ qua `acceleratedGlassSurfacesSurviveAppearanceChanges` vì offscreen thiếu RHI tăng tốc.
