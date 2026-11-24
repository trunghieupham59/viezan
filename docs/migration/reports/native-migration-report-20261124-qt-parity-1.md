# Qt parity · Vòng 1 · 24/11/2026

Nhánh `develop`, nền `9ddfac4b`. Build Release trong `.native-build/qt` với Qt Homebrew 6.12.0 trên macOS arm64. QtTest dùng Fusion và offscreen.

## Q0 · Nguyên nhân gốc

- **123 lỗi QML.** `Shortcut.sequence` ở `Main.qml:303` nhận `StandardKey.New`, có nhiều tổ hợp trên macOS. Dù shortcut phụ đã disabled, phép gán vẫn phát `QQmlEngine::warnings`. macOS nay dùng shortcut của menu hệ thống. Windows/Linux giữ shortcut cửa sổ. Giữ nguyên phép kiểm cảnh báo.
- **Microphone.** Hai `NativeAudio` dựng sẵn đầu vào khiến Qt tra quyền ngay khi khởi tạo bridge. Nay chỉ tạo đầu vào sau thao tác ghi và sau khi được cấp quyền. Thẻ quyền của màn Phiên dịch dùng fixture khi chạy QtTest macOS vì binary console thiếu Info.plist. Log cuối có 0 dòng cảnh báo quyền micro.
- **6 lỗi khác.** Sáu biến thể VI/EN/JA sáng/tối của `w5bQuickPanels` đều ép `var task` thành `QJSValue`. Test nay đọc qua QML engine và so đúng `request.sessionID` với ID phiên. Cả sáu đều qua.

## Thay đổi theo file

Các đường dẫn trong bảng tính từ `apps/desktop-qt/`.

| File | Thay đổi |
| --- | --- |
| `NativeAudio.{h,cpp}` | Tạo micro khi cần. Báo chuẩn bị từng đoạn, đang phát và dừng. Lỗi phiên âm mang ID riêng để lỗi phát giọng không làm hỏng câu đang dịch. |
| `Interpretation.{h,cpp}`, `qml/InterpretationWorkspace.qml` | Hai giao diện dùng chung trình phát và nguồn đọc theo câu. Đổi phiên dừng nguồn cũ. Sao chép theo công tắc như TXT/SRT. Xuất tệp đã nhận đúng cờ ở bản nền. |
| `WorkbenchDomain.cpp`, `ModelLineup.{h,cpp}`, `CloudProtocol.cpp` | Bốn mức Chat đồng bộ cờ Kỹ. Request đã gửi giữ nguyên qua hủy/thử lại. Menu và provider dùng chung regex trong tài nguyên. |
| `qml/Main.qml`, `qml/SessionModelPicker.qml` | Sửa shortcut. Hai menu “+” có bốn hàng, Thấp/Vừa disabled khi model không hỗ trợ. Phiên cũ chỉ có `carefulReasoning=true` vẫn hiện Kỹ. Chat trống đặt chip dưới “Tiếp tục” hoặc dưới composer. |
| `HabitSuggestions.{h,cpp}`, `WorkbenchBridge.{h,cpp}` | Bridge cung cấp khả năng chỉnh mức và gợi ý. Ngưỡng ba phiên có tin nhắn/kết quả trong 30 ngày. Điểm `exp(−tuổi_ngày/10)` nhân đôi khi có ba lần trong ±90 phút địa phương, kể cả qua nửa đêm. Lọc phiên so sánh, module tắt, mode hiện tại. Hòa điểm xét lần mới nhất rồi ID. |
| `qml/HabitChips.qml`, `qml/HomeWorkspace.qml`, `CMakeLists.txt` | Tối đa ba nút có nhãn trợ năng, focus và tự xuống hàng. Trang chủ đặt nhóm dưới danh sách gần đây. Bắt đầu Chat hoặc Dịch từ gợi ý giữ nội dung phiên cũ. Đăng ký nguồn cho app và QtTest. |
| `tests/WorkbenchBridgeTests.cpp` | Port ca Swift cho Q2/Q3. Kiểm request, tải lại phiên, bàn phím, hai giao diện, chuyển nguồn đọc, hủy trước khi gọi provider, cờ Sao chép và nội dung tệp TXT/SRT. |

## Kết quả kiểm

Mốc nền của `ViezanQtTests` là **111 passed, 129 failed, 1 skipped**. Ngay sau Q0 là **240 passed, 0 failed, 1 skipped**, quy về một lần init/cleanup từ tám shard. Backend nền có 36 passed. Các lượt chạy dùng thư mục tạm riêng cho `CFFIXED_USER_HOME`.

Các lệnh kiểm toàn bộ

```sh
cmake --build .native-build/qt --config Release -j 6
ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4
```

Kết quả nguyên văn theo thứ tự CTest, ViezanQtTests và ViezanBackendTests

```text
100% tests passed out of 9

Total Test time (real) =  29.59 sec

Totals: 248 passed, 0 failed, 1 skipped, 0 blacklisted, 95337ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 417ms
```

Build cuối không có cảnh báo mới. Khi CMake biên dịch lại toàn bộ sau khi thêm nguồn, Clang báo các lệnh `QFile::open` bỏ qua kết quả ở `LocalProvider.cpp` và `Research.cpp`. Cả hai file trùng với HEAD. Ca bỏ qua có từ mốc nền là `acceleratedGlassSurfacesSurviveAppearanceChanges`, cần backend RHI tăng tốc.

Áp dụng workflow/skill native-migration, rule product-engineering, UI/UX và chat-state. Viezan Native UX và mục Focus States của UI UX Pro Max hướng dẫn phần bàn phím.

## Chưa kiểm

Nghiệm thu sống trên Windows/Linux, FluentWinUI3, GPU/RHI, UI bằng mắt, Narrator, IME thật, micro, phát giọng và provider thật. Vòng này chỉ build và chạy QtTest trên macOS.

## Cần Tech Lead xử lý

- Cập nhật trạng thái #36 trong BACKEND-GAPS, ghi Qt đã port gợi ý và mức suy luận trong WINDOWS-HANDOFF, spec và chỉ mục báo cáo. Toàn bộ nhãn dùng khóa VI/EN/JA đã có.
- Bản Swift tham chiếu của native-code-62 chỉ đặt chip trong Chat trống. Qt có thêm vị trí ở Trang chủ theo yêu cầu vòng này. Cần chốt vị trí đó trong spec dùng chung.
- Chốt nghiệm thu sau khi chạy CI Windows/Linux và kiểm trực tiếp âm thanh, trợ năng và bố cục. Các thay đổi song song ở tài nguyên sinh và ngoài cây Qt thuộc luồng khác.
