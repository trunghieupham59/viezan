# Sprint 10 · Qt/QML · Trợ năng và đối chiếu hành vi

Ngày 24-11-2026, nhánh `develop`. Đã sửa 12/13 mục. Phím gửi Chat chính giữ nguyên để người dùng quyết định. [Hàng đợi thiết kế](../../design/glass2/SPRINT-DESIGN-NOTES-20261124.md)

| Mục | Kết luận từ mã và ca tái hiện | QtTest |
| --- | --- | --- |
| V1.1 · Ô soạn Chat nhanh | Sửa. Tab từng chèn `\t` vào nháp. Tab và Shift+Tab nay chuyển focus, giữ nội dung và nhường phím cho IME. | `w5bQuickPanels` |
| V1.2 · Menu model Chat nhanh | Sửa. Shift+Tab từ Cài đặt về được danh sách. Hai chiều Tab ở trong popup, Esc trả focus về nút model. | `w5bQuickPanels` |
| V1.3 · Chi tiết cảm biến | Sửa. Tab mở chi tiết như rê chuột. Tên hàng ổn định, mô tả chứa số đo. Focus bám đúng cảm biến qua cập nhật và đảo thứ tự. Chưa xác minh giả thuyết đọc lặp. | `w3SystemPages` |
| V1.4 · Xem lý do | Sửa trạng thái mở trên nút. Giữ xử lý Esc và trả focus đang hoạt động qua `GlassDialog` / `BlockingDialog`. | `w3SystemPages` |
| V1.5 · Tải bản cập nhật | Sửa. Focus theo Tải/Huỷ/Cài đặt khi nút đang chọn biến mất, vẫn ở Nhắc sau nếu đang chọn nút đó. Thông báo trợ năng phát khi đổi pha. | `w5bUpdateSheet` |
| V1.6 · Gỡ ứng dụng | Sửa. Nhãn cảnh báo báo đang gỡ, kết quả, thao tác chưa xác minh và hướng dẫn hoàn tác qua thùng rác. | `w3AppsSafety` |
| V1.7 · Gửi/Dừng và phản hồi Chat nhanh | Sửa. Focus từ Gửi sang Dừng, rồi về Gửi hoặc ô nhập nếu nháp trống. Sao chép và thay vùng chọn phát thông báo. | `w5bQuickPanels` |
| V1.8 · Chờ lưu phím tắt | Sửa. Nhãn `inProgress` báo lúc chờ. Test dịch vụ từ chối và lưu xong sau. | `w3SystemPages` |
| V2.1 · Xoá nguồn và Dùng làm nguồn | Sửa. Xoá nháp hoặc dùng bản dịch làm nháp sau khi đảo cặp trong cùng phiên. Nguồn Tự động lấy locale làm đích mới. Ẩn cả hai khi chạy, ẩn Dùng làm nguồn khi có ảnh. | `translationActionsRespectRunningSession` |
| V2.2 · Khoá khi dịch | Sửa. Glass và Graphite khoá hai bộ chọn, đảo chiều và So sánh theo tác vụ của phiên. Khi xong, đảo chiều vẫn đòi nguồn khác Tự động. | `translationActionsRespectRunningSession`, `glassW2Layout` |
| V2.3 · Từ điển | Sửa. Return/Enter chọn `bank` thay vì gửi lại `bnak`, giữ ngữ cảnh và tôn trọng IME. Mỗi nghĩa ở Glass có nút đọc. Tab Từ liên quan hiện `relatedHint` khi có từ. | `glassW2Dictionary` |
| V2.4 · Đọc câu trả lời Chat | Sửa. Nút sau Sao chép đọc câu trả lời đã kết thúc và có chữ. Bấm lại dừng đọc. Kiểm nguyên văn, ngôn ngữ và ID bằng dịch vụ giả. | `glassChatStates` |
| V2.5 · Phím gửi Chat chính | Giữ nguyên. W1 ghi lý do giữ Ctrl+Enter. QtTest kiểm Enter xuống dòng, Ctrl+Enter gửi và IME chặn gửi. | `glassChatStates` |

## Cần Tech Lead xử lý

- **Chốt phím gửi với người dùng.** Đặc tả C2 ghi “`Enter` (mặc định) hoặc `⌘/Ctrl+Enter` theo Cài đặt”. W1, dòng 651–652, ghi “Giữ **Ctrl+Enter gửi, Enter xuống dòng** của Qt hiện tại theo yêu cầu không đổi phím tắt”. Đây là quyết định có chủ ý trong W1. `findings.md` yêu cầu Enter xác nhận IME không gửi và cả hai phím Return/Enter dùng chung điều kiện IME. Tech Lead cần chốt mặc định và việc đưa lựa chọn phím gửi vào Cài đặt Qt. [Đặc tả Chat, C2 và mục 8](../../design/screens/chat.md) · [Quyết định bàn phím và IME](../../design/findings.md) · [Báo cáo glass2-win W1](native-migration-report-20261107-glass2-win-W1.md#khác-biệt-trình-bày-và-phần-cần-nghiệm-thu-tiếp)
- Cập nhật các đặc tả màn hình chung theo kết quả Qt, gồm hành vi Xoá nguồn theo Swift và các nút đọc đã triển khai. Nếu cần diễn đạt riêng “Đang lưu phím tắt…”, bổ sung khoá EN/VI/JA thay cho `inProgress`. Sprint dùng các chuỗi và token hiện có.

## Chưa kiểm

Chưa chạy ứng dụng thật, kiểm ảnh, Windows/Linux, Qt 6.8, IME hệ điều hành, trình đọc màn hình hoặc âm thanh thực tế. Các ca dùng fixture, sự kiện bàn phím/IME tổng hợp và giao diện Qt offscreen trên macOS arm64. Chưa xác nhận cách công nghệ trợ năng của từng hệ điều hành phát lời thông báo.

## Kết quả kiểm

Workflow `native-migration`, rule `native-migration` và `viezan-product-engineering`, skill `viezan-native-migration` và `viezan-native-ux` với tham chiếu UI UX Pro Max. QtTest 6.12.0, Fusion/offscreen, hồ sơ thử tạm. Các lượt lọc sau sửa gồm cả khởi tạo và dọn dẹp.

| Story | Bộ lọc theo tên hàm | Tổng kết nguyên văn |
| --- | --- | --- |
| V1 | `w3AppsSafety`, `w3SystemPages`, `w5bQuickPanels`, `w5bUpdateSheet` | `Totals: 11 passed, 0 failed, 0 skipped, 0 blacklisted, 3550ms` |
| V2 | `translationActionsRespectRunningSession`, `glassW2Dictionary`, `glassChatStates`, `glassW2Layout` | `Totals: 24 passed, 0 failed, 0 skipped, 0 blacklisted, 13866ms` |

Build Release trong `.native-build/qt` có sẵn, `BUILD_TESTING=ON`. Build cuối không phát cảnh báo. Lượt biên dịch lại giữa sprint có cảnh báo `QFile::open` sẵn có trong `Research.cpp` và `LocalProvider.cpp`.

```text
[ 12%] Built target ViezanBackendTests
[ 60%] Built target ViezanNativeQt
[100%] Built target ViezanQtTests
```

Tổng kết nguyên văn của lần chạy đủ `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4` cuối sprint.

```text
100% tests passed out of 9

Total Test time (real) =  34.84 sec
```

Cộng chín log QtTest có **409 lượt qua, 0 lỗi, 1 bỏ qua**. `acceleratedGlassSurfacesSurviveAppearanceChanges` tự bỏ qua do backend software/offscreen thiếu RHI tăng tốc.

**Phạm vi ghi.** Sprint sửa 11 file QML và hai file test trong `apps/desktop-qt/`. Báo cáo này là file mới duy nhất của sprint. So với đầu lượt, checkout còn có thay đổi đồng thời ở CMake Qt, NativeUpdates, Phiên dịch, tài liệu, macOS và tài nguyên sinh lại. Các thay đổi đó thuộc phiên khác.
