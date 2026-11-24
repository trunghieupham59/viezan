# Sprint 7 · Audit trợ năng Qt/QML · 24-11-2026

Luồng Qt trên `develop`. Đối chiếu các màn trong `apps/desktop-qt/qml/` với audit macOS ở `native-code-63.md`, các story ở `native-code-66.md` và ghi chú thiết kế ngày 24-11. Bằng chứng gồm mã nguồn, QtTest offscreen và build Release. Nghiệm thu với trình đọc màn hình thật còn mở.

## Kiểm kê control chỉ có icon

Đơn vị là một vị trí khai báo control chỉ có icon hoặc có nhánh thu gọn thành icon. Một delegate sinh nhiều hàng được tính một lần. Đếm ở nơi sử dụng wrapper dùng chung. Icon nằm bên trong control được xét riêng về trang trí. Trong 45 file QML, tìm thấy **78 vị trí** thuộc 11 file. Cả 78 đã có nguồn tên từ chữ, chuỗi địa phương hoá hoặc dữ liệu ở caller. Kiểm tên độc lập với tooltip. Số dòng bên dưới tính từ phiên bản đã sửa, tương đối với `apps/desktop-qt/qml/`.

| File | Số vị trí | Dòng khai báo | Có sẵn và phần đã sửa |
| --- | ---: | --- | --- |
| ApplicationsWorkspace.qml | 1 | 129 | Làm mới có tên sẵn. |
| ComparisonPane.qml | 1 | 45 | Đóng có tên sẵn. Đã đặt tên cho vùng kết quả chọn/chép theo model. |
| DesktopPanels.qml | 5 | 82, 83, 104, 105, 144 | Mở trong workspace, đóng, quay lại, tạo hội thoại và sao chép có tên sẵn. |
| DictionaryResult.qml | 8 | 70, 71, 72, 73, 151, 152, 159, 160 | Nghe, lưu, mở Chat và thao tác theo ví dụ có tên sẵn. Đã đặt tên cho ô văn bản kết quả. |
| HomeWorkspace.qml | 1 | 146 | Nút tìm ở nhánh hẹp đã có tên. Đã ẩn bốn hình trang trí của các hàng/tile khỏi cây trợ năng. |
| InterpretationWorkspace.qml | 9 | 149, 205, 281, 291, 326, 329, 341, 342, 367 | Các nút có tên sẵn. Đã bổ sung trạng thái cho nút mở thiết lập và xuất bản ghi. |
| ListenButton.qml | 3 | 42, 69, 70 | Đóng, đọc lại và dừng đọc có tên sẵn. Nút mở danh sách nguồn phản ánh việc mở lớp nổi. |
| Main.qml | 38 | 477, 482, 507, 525, 526, 527, 529, 530, 531, 532, 534, 595, 658, 832, 881, 908, 930, 972, 980, 1039, 1166, 1268, 1358, 1425, 1503, 1506, 1562, 1563, 1564, 1831, 1832, 1833, 1834, 1836, 1920, 1962, 2081, 2173 | Tên có sẵn cho header, composer, đính kèm, Dịch, Từ điển, lịch sử và toast. Đã bổ sung trạng thái mở và vòng focus ở control có nền tự vẽ. |
| PrimaryNavigation.qml | 5 | 117, 128, 130, 171, 177 | Thu gọn, đóng, tìm và hai delegate route đã có tên. Đã ẩn hai hình trang trí, bổ sung trạng thái mở và vòng focus. |
| SessionModelPicker.qml | 6 | 38, 61, 96, 114, 134, 273 | Các nút model và cấu hình có tên sẵn. Đã nối trạng thái mở với popup tương ứng. |
| UpdateSheet.qml | 1 | 57 | Nút đóng có tên sẵn. |

## Trạng thái, cấu trúc, bàn phím và chuyển động

| Mục | Vị trí | Có sẵn và phần đã sửa |
| --- | --- | --- |
| Mở lớp nổi | Kit.qml, PopupAccessibility.js, các caller ở shell, composer, picker, sheet, Launcher | 42 khai báo `popupOpen` trên các nút. Dùng `expanded/expandable` khi Qt cung cấp thuộc tính. Trên phiên bản thiếu thuộc tính, dùng `checked/checkable` và đồng bộ lại khi Qt kích hoạt trợ năng. Test kiểm tra trạng thái thật khi mở và đóng. [API Qt Quick ở Qt 6.8.3](https://github.com/qt/qtdeclarative/blob/v6.8.3/src/quick/items/qquickaccessibleattached_p.h) |
| Tên và lựa chọn | Main.qml, SettingsWorkspace.qml, InterpretationWorkspace.qml, Launcher.qml, PrimaryNavigation.qml | Tên nút kiểu dịch gồm kiểu đang hiển thị. Đã thêm trạng thái chọn cho mục Cài đặt và bản ghi Phiên dịch hiện hành. Route, kết quả Launcher, lịch sử và bảng lệnh đã có trạng thái chọn. |
| Đang chạy, lỗi, hoàn tất | ChatTranscript.qml, Main.qml, DesktopPanels.qml, RecordingStrip.qml, InterpretationWorkspace.qml, Kit.qml | Lỗi dùng `AlertMessage`, toast hoàn tất dùng `StatusBar`. Chip nghiên cứu đã có tên ổn định theo N2. Chip ghi âm nay giữ tên khi giây thay đổi. Đầu ra Chat/Dịch đang stream tạm ẩn khỏi cây đọc, nội dung hoàn tất có thể đọc/chọn lại. Thời gian và văn bản vẫn cập nhật trên màn hình. |
| Danh sách, card và heading | Kit.qml, Main.qml, ChatTranscript.qml, ComparisonPane.qml, DesktopPanels.qml, InterpretationWorkspace.qml, SettingsWorkspace.qml và các workspace | 14 vị trí `ListView` có vai trò danh sách và tên, gồm 11 vị trí bổ sung và ba vị trí có sẵn. 13 chỗ dùng `Kit.Card` có tên và vai trò nhóm. 21 chỗ dùng `Kit.CardBox` dùng tiêu đề GroupBox. Tổng cộng 39 khai báo role Heading, gồm các component tiêu đề dùng chung. `CardRow` gộp title/detail thành một phần tử văn bản với tên và mô tả theo N5. Các nút bên cạnh vẫn độc lập. |
| Cuộn | NamedScrollView.qml, các ScrollView và ListView | QtTest phát hiện thanh cuộn có thể thao tác nhưng thiếu tên. 31 chỗ dùng ScrollView chung đặt tên cho hai thanh cuộn gốc theo nội dung. Thanh cuộn tự khai báo của các danh sách dùng tên vùng tương ứng. |
| Bàn phím và focus | Main.qml, PrimaryNavigation.qml, HomeWorkspace.qml, ListenButton.qml, Launcher.qml, InterpretationWorkspace.qml, RegionCapture.qml | Bổ sung `focusRingWidth` cho các control tự vẽ thiếu vòng focus. Esc trả focus về nút mở ở lịch sử Phiên dịch và menu tiền tệ. Khi chuyển qua nhiều lớp nổi, shell nhớ nút còn hiển thị. Ở vùng chọn ảnh, phím mũi tên di chuyển theo pixel, Shift+mũi tên đổi kích thước, Space xác nhận vùng, Enter chọn toàn màn hình, Esc huỷ. Test dùng bridge giả chỉ ghi toạ độ. |
| Reduce Motion | SystemAppearance.cpp/.h, SurfaceAppearance.qml, Kit.qml | Thêm đọc tuỳ chọn animation vào cơ chế đọc hệ thống sẵn có trên Windows và Linux/GNOME. Qt có `motionPreference` từ 6.12. Switch Glass bỏ chuyển động trượt khi bật giảm chuyển động. Đây là `Behavior` tự khai báo duy nhất trong QML. Chat và bộ chọn dùng lệnh định vị danh sách trực tiếp. Hành vi cuộn quán tính của từng nền tảng cần kiểm tay. [Qt motionPreference](https://doc.qt.io/qt-6/qaccessibilityhints.html#motionPreference-prop) |
| Cỡ chữ đọc | Main.qml, ChatTranscript.qml, SettingsWorkspace.qml | Đã có `readingPointSize` theo `textScales` cho nội dung chat, ô nguồn/kết quả dịch và preview Cài đặt. Việc đọc ở ba mức, tràn dòng và clipping trên màn hình thật nằm trong checklist. |

## Bằng chứng QtTest

`WorkbenchBridgeTests::mainScreenAccessibleNames` có 42 hàng, bằng 3 ngôn ngữ VI/EN/JA × 7 màn × 2 cấu hình. Shell mở bảng lệnh. Chat, Dịch và Từ điển có kết quả tổng hợp. Các màn còn lại là Phiên dịch, Cài đặt chung và Launcher. Cửa sổ shell dùng Glass 820 px hoặc Graphite 1200 px. Launcher dùng kích thước cửa sổ riêng. Mỗi hàng xác nhận đã thấy control đặc trưng của màn trước khi duyệt các item hiển thị.

Test đọc `QAccessibleInterface::text(QAccessible::Name)` trên nút, trường văn bản, bộ chọn, slider, spinbox, thanh cuộn có thể thao tác và item có hành động nhấn. Có kiểm control bị vô hiệu hoá. Ô nội bộ chỉ dùng để vẽ giá trị của ComboBox Fusion loại không cho nhập được tính ở control cha. Các test bổ sung kiểm vai trò, trạng thái mở/đóng, timer và focus. Fixture dùng dữ liệu tổng hợp trong thư mục tạm. Các nhánh quyền hệ điều hành, dữ liệu thực, lời đọc và thứ tự Tab đầy đủ của từng nền tảng cần nghiệm thu riêng.

| Nhóm | Hàm QtTest đã lọc | Kết quả QtTest, kể cả init/cleanup |
| --- | --- | --- |
| 1 · Tên | mainScreenAccessibleNames | 44 pass |
| 2 · Trạng thái | glassOverlayScrollbarsAndPointerFocus, researchChipFollowsRunningTask, w3SystemPages, interpretationRowPlaybackAndExport, glassW2ListenStates | 9 pass |
| 3 · Cấu trúc | mainScreenAccessibleNames, installedModelRowsRefreshStoredMeasurements, glassW2Dictionary | 51 pass |
| 4 · Bàn phím | regionSelectionWithKeyboard, w5bLauncher, w4SettingsPickerKeyboard, glassOverlayScrollbarsAndPointerFocus, foundationPanelDismissControlsRemainReachable, w4SettingsSearchIme | 9 pass |
| 5 · Reduce Motion | glassControlStates và appearanceNotifiesAndActivationRefreshes trong hai binary | 3 + 3 pass |
| Kiểm lại sau sửa thanh cuộn và trạng thái của Qt | mainScreenAccessibleNames, glassOverlayScrollbarsAndPointerFocus, w3SystemPages, w5bLauncher | 48 pass |
| Kiểm lại focus khi đổi lớp và ma trận tên trên bản build cuối | foundationOverlayResizeAndEscape, mainScreenAccessibleNames | 50 pass |

## Build Release và CTest

Dùng thư mục đã cấu hình `.native-build/qt`. Đã chạy `cmake --build .native-build/qt --config Release -j 6` và chạy đủ CTest một lần bằng `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`. Hồ sơ thử nghiệm của tiến trình nằm trong thư mục tạm. Log build đầu và cuối đều có 0 cảnh báo biên dịch. Khi CMake nạp lại danh sách resource ở bước giữa, nó báo thiếu header Vulkan tuỳ chọn.

Các dòng hoàn tất target từ build cuối và tổng kết CTest được trích nguyên văn.

```text
[ 13%] Built target ViezanBackendTests
[ 56%] Built target ViezanNativeQt
[100%] Built target ViezanQtTests
```

```text
100% tests passed out of 9

Total Test time (real) =  34.79 sec
```

Cả 42 hàng của ma trận tên cũng xuất hiện với kết quả PASS trong log của tám shard. QtTest bỏ qua riêng `acceleratedGlassSurfacesSurviveAppearanceChanges` vì môi trường offscreen thiếu backend RHI tăng tốc. Log QtTest có thông báo của plugin offscreen về `raise()`, font alias và thiết bị CoreAudio.

## Phạm vi thay đổi

Luồng này chỉnh mã, khai báo tài nguyên của CMake và QtTest trong `apps/desktop-qt/`, cùng báo cáo này. Đối chiếu `git status --short` đầu/cuối còn thấy luồng song song tạo thêm ba dòng trạng thái ngoài phạm vi ở `apps/macos/Sources/ViezanNative/ThermalWorkspace.swift`, `apps/macos/Sources/ViezanNative/UpdateSettings.swift` và `docs/migration/native-implementation/native-code-68.md`. Không có dòng trạng thái đầu phiên nào biến mất. Bundle sinh sẵn `qml/native.json` đã có thay đổi từ trước. `git diff --check -- apps/desktop-qt` đạt.

## Checklist nghiệm thu bằng trình đọc màn hình

Chạy lần lượt bằng Narrator, NVDA trên Windows và Orca trên Linux. Mỗi cột ghi trạng thái riêng. Dùng phiên thử bằng VI, EN và JA, cửa sổ hẹp/rộng, giao diện sáng/tối.

| Thao tác và kết quả cần nghe hoặc quan sát | Narrator | NVDA | Orca |
| --- | --- | --- | --- |
| Duyệt bảy màn. Kiểm tên nút ở cả nhánh chỉ icon, trạng thái disabled và tên có chứa nhãn đang nhìn thấy. Icon trang trí cạnh chữ không tạo điểm đọc thứ hai. | NOT RUN | NOT RUN | NOT RUN |
| Mở điều hướng, lịch sử, bảng lệnh, bộ chọn model, ngôn ngữ và tiền tệ. Nghe trạng thái mở/đóng và mục đang chọn. Chuyển liên tiếp hai lớp rồi Esc, kiểm focus về đúng nút. | NOT RUN | NOT RUN | NOT RUN |
| Dùng Tab/Shift+Tab theo thứ tự nhìn thấy, mũi tên trong danh sách, Enter/Space để chọn. Kiểm vòng focus khi selected, IME tiếng Nhật khi Esc và thao tác vùng chọn ảnh bằng phím. | NOT RUN | NOT RUN | NOT RUN |
| Duyệt heading, danh sách, vùng nguồn/kết quả và card. Nghe tên cùng chi tiết của model đã cài rồi Tab tới nút của hàng. | NOT RUN | NOT RUN | NOT RUN |
| Chạy và huỷ Chat/Dịch, thử lỗi, nghiên cứu và ghi âm. Nghe trạng thái có ý nghĩa, xác nhận không đọc lại từng token/giây và có thể đọc kết quả cuối. | NOT RUN | NOT RUN | NOT RUN |
| Bật Reduce Motion của hệ điều hành, thử switch và cuộn. Đổi ba cỡ chữ đọc, kiểm chữ dài tiếng Việt/Nhật, xuống dòng và vòng focus ở cả hai độ rộng. | NOT RUN | NOT RUN | NOT RUN |

## Cần Tech Lead xử lý

- Cập nhật chuỗi hiện có `captureRegionHint` trong VI/EN/JA để người dùng khám phá được các phím di chuyển, đổi kích thước và xác nhận vùng. Luồng Qt dùng nguyên khoá và bundle hiện có.
- Ghi kết quả nghiệm thu Windows/Qt 6.8.3 và Linux/Qt 6.8.3, gồm cả trình đọc màn hình và tuỳ chọn chuyển động của hệ điều hành. Lượt chạy tại đây dùng Qt 6.12.0/macOS arm64, Fusion/offscreen.
