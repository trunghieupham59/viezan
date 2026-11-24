# Sprint 14 · Qt 6.8.3 trên Windows và Linux · 24/11/2026

**Release và CTest đạt 9/9 trên macOS arm64, Qt 6.12.0.** Đã sửa phép thử sai khi Windows dùng hai ổ đĩa và lỗi lọc đường dẫn khi Linux khởi động lại AppImage. Hai job Qt 6.8.3 còn chờ CI.

Đối chiếu `develop` với `HEAD 9ddfac4b`, báo cáo Qt 1–16, 80 file Qt có diff và 12 file Qt chưa được theo dõi tại mốc build. Đường dẫn ngắn bên dưới thuộc `apps/desktop-qt/`.

## Rủi ro theo khả năng làm đỏ CI

| Mức | Kết luận | Vị trí và lý do |
|---|---|---|
| Cao nếu checkout thiếu file | Cần CI xác nhận | `CMakeLists.txt:14,28,60,71,83`. Nguồn HabitSuggestions, HistoryStorage, TweetNaCl, QML/JS/icon mới và `contracts/native-workbench/update-signature-fixture.json` còn untracked. Checkout sạch cần đủ chúng để configure, đóng gói resource và kiểm chữ ký. |
| Cao khi checkout và TEMP khác ổ | Đã sửa | `tests/WorkbenchBridgeTests.cpp:2262–2273`. Trên Windows, `relativeFilePath` có thể trả đường dẫn tuyệt đối sang ổ khác. Test nay thử tên tương đối của **cùng file đang tồn tại** từ thư mục fixture rồi khôi phục thư mục làm việc. |
| Trung bình, NTFS | Cần CI xác nhận | `LauncherTools.cpp:99,115,122`, `tests/WorkbenchBridgeTests.cpp:72,5505,5550`, `HistoryStorage.h:26`. Kiểm đường dẫn chuẩn qua junction, shortcut `.lnk`, mốc sửa file, vị trí hồ sơ test và rename đè file khi hoàn tác. Fixture dùng `mklink /J` và ép lỗi commit bằng `cancelWriting()`. |
| Trung bình, QML/Fusion | Cần CI xác nhận | `qml/PopupAccessibility.js:6–21`, `qml/SurfaceAppearance.qml:9–11`, `qml/Kit.qml:902`, `tests/WorkbenchBridgeTests.cpp:301,775`. Kiểm trạng thái trợ năng khi thiếu `expanded`, focus/delegate, font hệ thống và hình học header ngoài macOS. Header ghi `styleHints.accessibility` từ 6.10, `motionPreference` từ 6.12. Binding kiểm thuộc tính trước khi đọc enum. |
| Trung bình, qtspeech | Cần CI xác nhận | `NativeAudio.cpp:209,248`, `tests/WorkbenchBridgeTests.cpp:1931–1934`. Kiểm overload `findVoices(QLocale::Language)` và chữ ký protected `QTextToSpeechEngine::createVoice`. Header 6.12 ghi API plugin có giới hạn tương thích. |
| Thấp, build và fixture | Đã sửa | `LauncherTools.cpp:2` và `tests/WorkbenchBridgeTests.cpp:31,2446,2475`. Include trực tiếp QDateTime/QFont. Fixture qua nửa đêm dùng UTC+7 cố định và tránh hai tên macro Win32 cũ `near/far`. |
| Thấp với CI, ảnh hưởng chạy thật trên Linux | Đã sửa | `NativeUpdates.cpp:174–186,202`, `NativeUpdates.h:45`, `tests/WorkbenchBridgeTests.cpp:2285–2300`. Chỉ loại mount cũ và thư mục con. Test giữ được thư mục cùng tiền tố, mục PATH rỗng và giá trị văn bản. |
| Thấp, liên kết nền tảng | Cần CI xác nhận | `CMakeLists.txt:93–97`, `NativeUpdates.cpp:189–208`, `SystemAppearance.cpp:22–35`. MSVC cần liên kết User32/Advapi32 và Qt Core với `setNativeArguments`. Linux cần Qt DBus. Chạy bộ cài thật và kiểm gsettings trên desktop nằm ngoài QtTest. |
| Đã đối chiếu | Không phải lỗi | `LauncherTools.cpp:117`, `qml/SettingsPicker.qml:30`, `qml/SessionModelPicker.qml:206`, `tests/WorkbenchBridgeTests.cpp:1835`. QDirListing, Popup.popupType và Accessible.announce dùng được ở 6.8. Item.focusPolicy có revision 6.7, TapHandler.acceptedButtons kế thừa pointer handler, transferTimeout() có macro inline 6.8. URL `file:///tmp/…` ở dòng 4968–4970 chỉ dùng tách tiêu đề. Quyền 0500 và bit thực thi chỉ được kiểm trên Unix. Test phím dùng modifier Qt và binding của nền tảng. |

## Dòng thêm hoặc sửa trong nhánh nền tảng

Đã giao các hunk `git diff -U0 HEAD` với ngăn xếp điều kiện của từng file và kiểm cả nguồn mới.

| File | Dòng trong cây làm việc |
|---|---|
| `CredentialStore.cpp` | 6, 54, 79, 102 chọn Windows sau fixture. 21 chọn macOS trước helper Linux ở 32. Sản phẩm dùng WinCred hoặc secret-tool, QtTest dùng kho giả. |
| `LauncherTools.cpp` | 46–48 là nhánh ngoài macOS, chỉ trả true sau khi kiểm isDir(). Include và kiểu CoreFoundation nằm ở 14–17, 31–45. |
| `NativeUpdates.cpp` | 157–158 và 216–217 cho Windows, 159–160 cho Linux. 189–193 và 207–208 dùng chung, 194–198 cho Windows, 199–206 cho Linux. 161–163, 209–211 là nhánh dự phòng. Phần WinTrust cũ ở HEAD 17–21, 113–117 đã được gỡ cùng thư viện. |
| `SystemAppearance.cpp` | 22–24 đọc cờ animation kiểu BOOL trên Windows. 34–35 đọc kết quả gsettings trên Linux. |
| `tests/WorkbenchBridgeTests.cpp` | 51–53, 5550–5556 include QProcess và tạo junction trên Windows. 5529–5531 kiểm thư mục ngoài macOS. 5557–5559 tạo symlink Unix. 2278–2283 và 2316–2318 kiểm quyền Unix, cũng chạy trên Mac. |

Không có dòng mới riêng dưới `Q_OS_UNIX && !Q_OS_MACOS`. `NativeAudio.cpp:169–172` chỉ đổi fixture macOS. Điều kiện QML theo hệ điều hành nằm ở `Main.qml:26,308,2034`, `PrimaryNavigation.qml:56`, `InterpretationWorkspace.qml:80`.

## Kiểm chứng

- Đối chiếu API mới theo file và toàn cây với header Qt cài đặt, macro phiên bản và `plugins.qmltypes`. Đã kiểm các nhóm chuỗi/grapheme, ngày giờ, filesystem, mạng, audio, trợ năng, QML và QtTest. Header 6.12 không ghi phiên bản đầu tiên của mọi overload.
- CMake dùng C++17 và IPO Release nếu được hỗ trợ, không bật `/WX` hay `-Werror`. Cả 22 đơn vị C++ qua kiểm cú pháp Clang cho VLA, designated initializer, extension C++20 và thứ tự khởi tạo. `-Wsign-compare` không báo lỗi so sánh khác dấu. Macro `QSKIP` của Qt được miễn cảnh báo variadic rỗng. Ba cảnh báo bỏ qua kết quả `QFile::open` tại `LocalProvider.cpp:70,76,89` đã có ở HEAD.
- Chọn nhánh Linux của NativeUpdates, CredentialStore, SystemAppearance và LauncherTools để kiểm cú pháp với header cục bộ. TweetNaCl qua `clang -fsyntax-only -std=c11 -pedantic-errors` cho hai target x86_64 Windows MSVC và Linux GNU. Các bước này chưa kiểm ABI/linker của runner.

Build bằng `cmake --build .native-build/qt --config Release -j 6`. Ba dòng kết quả nguyên văn.

```text
[ 13%] Built target ViezanBackendTests
[ 56%] Built target ViezanNativeQt
[100%] Built target ViezanQtTests
```

QtTest lọc theo tên, 12 hàm bridge và hàm backend `appearanceNotifiesAndActivationRefreshes`.

```text
Totals: 16 passed, 0 failed, 0 skipped, 0 blacklisted, 1328ms
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 256ms
```

Chạy đủ bộ một lần bằng `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`, Fusion/offscreen với hồ sơ tạm.

```text
100% tests passed out of 9

Total Test time (real) =  44.13 sec
```

Chín log QtTest ghi 451 lượt qua. Một ca Glass cần RHI tăng tốc được bỏ qua. SHA-256 của hai binary test giữ nguyên suốt CTest. Phiên khác sinh lại `qml/native.json` sau mốc build. Kết quả trên ứng với resource đã nhúng.

## Cần Tech Lead xử lý

Đưa đủ file ở hàng đầu vào checkout CI và xác nhận hai job Qt 6.8.3 trong `.github/workflows/ci.yml:27–54`. Không cần thêm chuỗi hoặc token.

Lượt này sửa bốn file Qt nêu ở các hàng “Đã sửa” và tạo báo cáo này. So với đầu lượt, `git status --short` còn ghi nhận QML, macOS và tài liệu do phiên khác sửa. Áp dụng workflow/rule `native-migration`, rule `viezan-product-engineering` và skill `viezan-native-migration`. Chưa mở app hay chạy thử trên Windows/Linux.
