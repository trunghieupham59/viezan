# Qt/QML · Vòng 2 · 24/11/2026

Đã port R1 và R2 trên `develop`, dựa trên cây làm việc sau vòng 1 và mã Swift hiện tại. Phạm vi nghiệm thu là build Release và QtTest trên macOS arm64, Qt 6.12.0, Fusion/offscreen.

## Thay đổi theo file

| File trong `apps/desktop-qt/` | Thay đổi vòng 2 |
| --- | --- |
| `WorkbenchDomain.{h,cpp}`, `WorkbenchBridge.{h,cpp}` | Lưu tối đa 8 ID theo thứ tự ghim. Từ chối sai kiểu, trùng ID, ID không hợp lệ và danh sách quá dài. Bỏ trường khi gỡ ghim cuối. Lệnh đi qua cơ chế chặn ghi khi tải lỗi và lưu nguyên tử hiện có. |
| `ModelLineup.{h,cpp}` | Nhóm Đã ghim ngay sau Mục đích, loại các ID này khỏi Gần đây. Tìm kiếm vẫn chỉ hiện kết quả khớp. ID ghim còn chọn được sau khi nhà cung cấp ngừng liệt kê. |
| `qml/SessionModelPicker.qml`, `qml/icons/pin.svg` | Các preset dùng chung panel có nhóm và tìm kiếm. Hàng model có nút ghim, tên trợ năng theo hành động, menu chuột phải và Ctrl+P. Hàng Mục đích và Thiết lập không hiện nút. Qt đi theo chỉ số hàng. Sau thao tác ghim, ưu tiên giữ vị trí theo nhóm và ID. |
| `qml/Main.qml`, `qml/InterpretationWorkspace.qml` | Ctrl+Shift+M/T dùng hai `ShellAction`, với menu hệ thống trên macOS. Workspace đang hiển thị cung cấp nút mở cho từng lệnh. Panel trả focus khi đóng và xử lý được lần bấm phím tắt thứ hai. |
| `CurrencyRates.{h,cpp}`, `DesktopIntegration.{h,cpp}` | Port 30 mã tiền, bí danh, dấu phân cách và hệ số như `k`, `tr`, `万`. Ưu tiên đích ghi trong truy vấn, lựa chọn đã lưu rồi ngôn ngữ. Tính chéo từ bảng tỷ giá USD, dùng ngày công bố. Các truy vấn dùng chung lượt tải. Cache 24 giờ, giữ bản cũ khi mất mạng, giới hạn 512 KiB, timeout truyền 8 giây và hạn toàn lượt 10 giây. |
| `qml/Launcher.qml` | Hàng tiền tệ hiện số tiền, tỷ giá/ngày hoặc trạng thái tải/lỗi. Bộ chọn “Đổi sang” lưu đích và bị tắt khi truy vấn đã nêu đích. Enter chờ khi đang tải, thử lại khi lỗi, sao chép riêng số tiền khi có kết quả. |
| `tests/WorkbenchBridgeTests.cpp` | Port các ca Swift về ghim và tiền tệ. QtTest kiểm lưu/đọc, workspace hỏng, model thiếu, phím mũi tên qua hàng trùng ID, nút ghim, menu ngữ cảnh, phím tắt và focus ở Glass/Graphite. Fixture Launcher giữ lượt tải đến thời điểm test cho phép để kiểm cả kết quả đến sau khi đổi truy vấn, lựa chọn tiền và nội dung sao chép. |

## Kết quả kiểm trước và sau

- Trước khi sửa, build đạt. CTest chạy trực tiếp trong sandbox đạt 1/9 vì các fixture không ghi được vào thư mục mặc định dưới `~/.qttest`. Đổi riêng `CFFIXED_USER_HOME` sang thư mục tạm cho tiến trình test, cùng binary đạt 9/9 trong 30,77 giây.
- Sau R1, toàn bộ CTest đạt 9/9 trong 29,62 giây. Sau R2, hai ca tập trung `launcherCurrencyMatchesSwift` và `w5bLauncher` đạt với fixture, không gọi mạng.
- Hướng dẫn Focus States của UI UX Pro Max (truy vấn `keyboard focus modal`, miền `ux`) được áp dụng qua focus native của nút, hàng chọn bằng phím và Esc trả về nút mở.

Lệnh kiểm cuối dùng thư mục build có sẵn.

```sh
cmake --build .native-build/qt --config Release -j 6
CFFIXED_USER_HOME="$(mktemp -d)" ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4
```

Build cuối hoàn tất, không thêm cảnh báo biên dịch. CTest in tổng kết sau.

```text
100% tests passed out of 9

Total Test time (real) =  31.29 sec
```

Tám shard `ViezanQtTests` có 250 ca đạt và một ca bỏ qua khi trừ các dòng init/cleanup của từng shard. `ViezanBackendTests` in tổng kết sau.

```text
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 433ms
```

## Chưa kiểm

Windows/Linux, FluentWinUI3, menu hệ thống macOS trực tiếp, GPU/RHI, trình đọc màn hình, IME thật, hình ảnh ở các DPI và endpoint tỷ giá thật. Ca `acceleratedGlassSurfacesSurviveAppearanceChanges` cần RHI tăng tốc và được QtTest bỏ qua ở offscreen.

## Cần Tech Lead xử lý

- Cập nhật BACKEND-GAPS #44, WINDOWS-HANDOFF và chỉ mục báo cáo sau khi đối chiếu. Ghi rõ các tổ hợp phím theo nền tảng.
- Bộ chọn tiền dùng mã ISO và nhãn “Đổi sang” đã dịch. Nếu cần tên đầy đủ theo từng ngôn ngữ như menu Swift, bổ sung danh mục dùng chung VI/EN/JA. Không cần thêm chuỗi cho ghim hoặc trạng thái tỷ giá.
