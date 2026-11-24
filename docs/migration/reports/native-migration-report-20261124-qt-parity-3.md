# Qt/QML · Vòng 3 · 24/11/2026

Nhánh `develop`, tiếp nối hai vòng Qt chưa commit. Đối chiếu `resources/tokens.css`, `kit.css`, HANDOFF §2–5, các board và quyết định trong `findings.md`.

## Đối chiếu audit

| Mục | Kết luận và căn cứ |
| --- | --- |
| GlassSwitch | **Sửa.** Ray bật lấy `action` theo chế độ. Ray tắt dùng màu chữ disabled với opacity 0,48. Control bị vô hiệu dùng palette disabled. Reduce Transparency và Increase Contrast dùng mặt đặc và viền của `SurfaceAppearance`. |
| StatusBadge, StatusDot | **Sửa.** Board Settings-Models phân biệt có khoá, chưa xác minh, lỗi và thiếu khoá. Settings-Local và Everywhere dùng success khi runtime trả lời, model đã tải hoặc hệ thống cho phép thay thế. Mỗi trạng thái vẫn có chữ. Các nơi gọi cũ giữ tông mặc định. |
| QuietButton, nút nguy hiểm, focus và disabled | **Sửa.** Nền riêng đã trong suốt. Ở Glass, `ControlLens` kế thừa có binding ẩn nền này. QuietButton dùng trực tiếp nền riêng và bo nửa chiều cao theo `.btn`. Icon, chữ và viền focus của kit, hàng điều hướng Cài đặt theo palette disabled và token 2 px. |
| Danh sách Ứng dụng, xác nhận gỡ và lý do Nhiệt độ | **Sửa.** ↑/↓ di chuyển, Return/Enter/Space chọn. Ở cửa sổ hẹp, chọn đưa focus sang nút quay lại. Nút này đưa focus về danh sách. Đóng hộp thoại trả focus về nút mở nếu nút còn hiển thị và được phép dùng. |
| Launcher | **Sửa.** Khi mở thất bại, Tab tới Thử lại. Hàng dùng tiêu đề làm tên, dòng phụ làm mô tả và có trạng thái selected. Ô tìm gọi `Accessible.announce` với kết quả hoặc tình trạng tỷ giá khi thay đổi. |
| Trợ năng ở màn hệ thống, cửa sổ phụ và Cài đặt | **Sửa.** Đặt tên cho vùng chỉ đọc, chỉ báo bận/tiến độ và danh sách model. Thêm role heading cho tiêu đề thẻ, alert cho nhãn lỗi. Esc đóng phần nhập khoá, xoá nháp và trả focus. Lưu khoá thành công vẫn là thông báo thường. |
| Hộp thoại chặn | **Sửa.** Dùng chung vị trí giữa cửa sổ, giữ và trả focus, scrim Glass 22% và bo 18. Xác nhận Cài đặt dùng token nhỏ 420, Apps-States quy định 440 cho xác nhận gỡ, Shortcuts-Recorder quy định 460 cho ghi phím. Mỗi hộp thu theo bề ngang khả dụng. SettingsConfirm đã có scrim và bán kính đúng. |
| CardBox/CardRow, ô nhập, PrimaryButton | **Không sửa** bố cục, vạch, kiểu field, trọng lượng chữ và bóng nút. Vòng này xử lý trạng thái nút và focus. Bố cục thẻ cần duyệt bằng mắt. |
| Cài đặt | **Không sửa** cột 204 và breakpoint 672 đã chốt ngày 16/11. Giữ khung xem trước, kích thước rãnh lọc, popup tìm kiếm, vạch cuối, bố cục đo model, checkbox nhập bản sao lưu và hàng nút cập nhật cho lượt duyệt hình. |
| Launcher, Quick AI, Dịch nhanh | **Không sửa** khung, chân KeyCap, thẻ hội thoại và picker. Nút quay lại đã phát `launcherRequested` tới `launcher.toggle()`. Chip model Quick AI mở Cài đặt nhà cung cấp theo spec Quick Chat Q6. Chat nhanh có menu model riêng. |
| Ứng dụng, Nhiệt độ, Dịch mọi nơi, Phím tắt | **Không sửa** các đề xuất đổi lens, màu dải kết quả, nút Dừng/Thử, thanh nhiệt độ, màu nhãn recorder và liên kết model. Những chi tiết này nằm ngoài K1–K3. `Main.qml` đã truyền màu danger cho Nhiệt độ và Cài đặt. Spec Qt quy định ngưỡng nóng 90 °C cho số đo Linux. |

## Thay đổi theo file

Đường dẫn dưới đây tính từ `apps/desktop-qt/`.

| File | Thay đổi |
| --- | --- |
| `CMakeLists.txt`, `WorkbenchBridge.cpp` | Đọc ba token CSS đã có khi cấu hình Qt và đưa vào metrics. Đăng ký component dialog dùng chung. |
| `qml/Kit.qml`, `SettingsDangerButton.qml`, `SettingsWorkspace.qml` | Mặt switch, badge và dot, màu disabled, nền nút lặng và viền focus. |
| `qml/ApplicationsWorkspace.qml`, `ThermalWorkspace.qml`, `DesktopWorkspace.qml` | Phím và focus, tên và vai trò trợ năng, tông cho khả năng thay thế vùng chọn. |
| `qml/Launcher.qml`, `DesktopPanels.qml` | Thử lại bằng Tab, ngữ nghĩa hàng kết quả, thông báo phép tính/tỷ giá, tên nội dung chỉ đọc và danh sách. |
| `qml/ProviderSettings.qml`, `LocalModelSettings.qml`, `DataSettings.qml`, `UsageSettings.qml`, `UpdateSettings.qml`, `UpdateSheet.qml` | Tông theo trạng thái, đóng ô khoá, gắn tên và vai trò theo nội dung, truyền nút mở vào hộp xác nhận. |
| `qml/BlockingDialog.qml` (mới), `GlassDialog.qml`, `SettingsConfirm.qml`, `ShortcutRecorder.qml` | Dùng chung kích thước mặc định, scrim và vòng đời focus. Giữ footer và hành động chuẩn của Qt. |
| `tests/WorkbenchBridgeTests.cpp` | Kiểm palette theo chế độ, mặt đặc, các tông và chữ trạng thái, kích thước, scrim, tên/role, thứ tự phím và focus bằng fixture. |

## Kết quả kiểm

Build Release và QtTest dùng `.native-build/qt` có sẵn trên macOS arm64, Qt 6.12.0, Fusion/offscreen. Thư mục home tạm của riêng tiến trình CTest chứa dữ liệu fixture.

```sh
cmake --build .native-build/qt --config Release -j 6
CFFIXED_USER_HOME="$(mktemp -d)" ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4
```

Build đạt. Khi biên dịch lại, Clang lặp cảnh báo `QFile::open` ở `LocalProvider.cpp` và `Research.cpp` đã ghi ở vòng 1. Cả hai file trùng HEAD. Mã thay đổi không phát sinh cảnh báo mới.

Tổng kết CTest cuối, nguyên văn.

```text
100% tests passed out of 9

Total Test time (real) =  30.23 sec
```

Tám shard bridge có 252 ca đạt sau khi trừ 16 lượt init/cleanup, một ca bỏ qua. Tổng kết backend, nguyên văn.

```text
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 439ms
```

QtTest gửi sự kiện phím vào cửa sổ offscreen để kiểm Tab qua Thử lại, Tab quay vòng trong xác nhận gỡ, Esc và focus sau khi đóng. Cách kiểm dựa trên mục *Focus States* của UI UX Pro Max (truy vấn `keyboard focus modal`, miền `ux`). Phần sửa của vòng này nằm trong cây Qt và báo cáo này. `git diff --check` cho cây Qt đạt.

## Chưa kiểm

Windows/Linux, FluentWinUI3, GPU/RHI, bố cục bằng mắt, IME thật và lời đọc thực tế của Narrator/Orca/VoiceOver. QtTest kiểm nội dung thông báo, phím và thuộc tính QML. Ca đồ hoạ tăng tốc có sẵn yêu cầu RHI và được bỏ qua khi chạy offscreen.

## Cần Tech Lead xử lý

- Đưa `--vzn-opacity-disabled`, `--vzn-focus-ring-width` và `--vzn-dialog-sm-max-inline` vào generator dùng chung, rồi có thể bỏ bước đọc ba giá trị ở CMake Qt. Vòng này dùng các khoá VI/EN/JA sẵn có.
- Cập nhật spec Ứng dụng, Launcher và Cài đặt cùng chỉ mục migration. Các đề xuất bố cục hoãn trong bảng cần nghiệm thu bằng mắt trên Windows/Linux.
