# Sprint 8 · Từ điển, Launcher và tiến độ tải model trên Qt

Ngày 24-11-2026, nhánh `develop`. Thay đổi của lượt này gồm `Main.qml`, `Launcher.qml`, `LocalModelSettings.qml`, `WorkbenchBridgeTests.cpp` trong `apps/desktop-qt/` và báo cáo này.

## U1 · Từ điển

`Ctrl+Shift+C` kích hoạt cùng nút ngữ cảnh trên Glass và Graphite. Bật chuyển focus vào ô ngữ cảnh, tắt trả về ô từ. Khi đã có chữ, dòng ngữ cảnh vẫn hiện và nút vẫn mang trạng thái chọn. Nút ✕ dùng `dictionaryRemoveContext`, xoá nội dung và trả focus về ô từ. QtTest kiểm phím trong IME đang soạn, popup Lịch sử, hộp thoại và sau khi chuyển sang Dịch.

Ô nhập vốn giới hạn 500. Với phiên cũ đã lưu 501 ký tự, nút Tra từng sáng dù backend từ chối. Nút và phím Enter nay dùng chung điều kiện, nhận đúng 500 và chặn 501. Test dùng phiên tổng hợp đọc từ đĩa.

## U2 · Kết quả tái hiện trước khi sửa

| Ca | Kết quả QtTest và thay đổi |
| --- | --- |
| 1. Phím xuyên hộp đổi tên | Không tái hiện trên Glass và Graphite. Delete và hai phím mũi tên giữ nguyên danh sách và lựa chọn. Escape đóng hộp. Return lưu đúng phiên đang đổi tên, thư viện vẫn mở và phiên đang hoạt động giữ nguyên. |
| 2. Tóm tắt che lỗi cập nhật | Không tái hiện. Sau lỗi kiểm tra và lỗi tải giả lập, thông báo lỗi hiển thị bên dưới bản tóm tắt, nằm trong khung hộp. |
| 3a. Launcher lặp tiền tố | Tái hiện với `t hello`, `d hello`, `? hello`. Khi có hàng lệnh theo tiền tố, Launcher bỏ nhóm “Dùng với”. Truy vấn thường và tiền tố của module đang tắt vẫn có các hành động còn dùng được. |
| 3b. Launcher thử lại sai mục | Tái hiện. Mở A lỗi rồi nhấn ↓ sang B vẫn thấy “Thử lại”. Nay đổi ID của hàng đang chọn sẽ xoá lỗi. Test kiểm thử lại A, chuyển sang B rồi quay về A. |
| 4. Toast đổi tên khi lưu lỗi | Không tái hiện. Test làm cho đường dẫn đích trong thư mục tạm trở thành thư mục. Bridge báo lỗi ghi và không có toast thành công. Ca ghi thành công có toast và đọc lại đúng tên từ đĩa. |
| 5. Chip nghiên cứu | Test có sẵn `researchChipFollowsRunningTask` đạt ngay trên mã đầu sprint. |

Chỉ mục 3a và 3b cần sửa mã sản phẩm ở U2.

## U3 · Trợ năng khi tải model

Qt dùng chung một `ProgressBar` cho tiến độ có tổng dung lượng và chỉ báo bận khi chưa biết tổng. Cả hai đã có tên `downloadModel`. Mô tả trợ năng nay lấy trực tiếp từ nhãn trạng thái. Với dữ liệu thử, `QAccessibleInterface` trả đúng “Đang tải · 2,1 / 4,9 GB” và “Đang tải”. Tên giữ nguyên qua các gói. Tín hiệu phản hồi chỉ phát một lần khi tải xong, lỗi hoặc huỷ.

## Kiểm tra

Qt 6.12.0, macOS arm64, Fusion/offscreen, hồ sơ thử tạm. Các lượt QtTest dưới đây lọc theo tên hàm và tính cả init/cleanup.

| Story | Hàm đã chạy | Kết quả |
| --- | --- | --- |
| U1 | `dictionaryContextShortcut`, `glassW2Dictionary` | 10 pass |
| U2 | `historyRenameDialog`, `w5bUpdateSheet`, `launcherPrefixHidesUseWith`, `w5bLauncher`, `researchChipFollowsRunningTask` | Trước sửa 8 pass, 4 fail. Sau sửa 12 pass. |
| U3 | `localModelProgressTracksLayerAndClearsOnExit` | 3 pass |

Build Release và CTest dùng thư mục sẵn có `.native-build/qt`. Log build có 0 cảnh báo. Đã chạy đủ CTest một lần sau lượt lọc cuối. Các dòng tổng kết nguyên văn.

```text
[ 12%] Built target ViezanBackendTests
[ 60%] Built target ViezanNativeQt
[100%] Built target ViezanQtTests
Totals: 21 passed, 0 failed, 0 skipped, 0 blacklisted, 7255ms

100% tests passed out of 9

Total Test time (real) =  34.07 sec
```

`git diff --check -- apps/desktop-qt` đạt. Bốn file Qt đã có thay đổi từ trước. So với `git status --short` đầu phiên, báo cáo là dòng mới duy nhất của luồng Qt. Trong lúc chạy, checkout cũng ghi nhận thay đổi song song dưới `apps/macos/`, `native/fanhelper/` và `docs/`.

## Chưa kiểm

Chưa nghiệm thu trên Windows/Linux thật, IME VI/JA thật, trình đọc màn hình, tải model và kiểm tra cập nhật qua mạng. QtTest bỏ qua `acceleratedGlassSurfacesSurviveAppearanceChanges` vì offscreen thiếu backend RHI tăng tốc.

## Cần Tech Lead xử lý

Cập nhật đặc tả Từ điển cho phím tắt Qt, đặc tả Launcher cho hành vi tiền tố và thử lại, cùng mục trợ năng tiến độ tải model trong đặc tả Cài đặt. Cả ba story dùng được chuỗi và token hiện có.
