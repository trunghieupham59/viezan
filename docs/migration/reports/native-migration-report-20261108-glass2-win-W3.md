# Liquid Glass 2.0 · W3: trang hệ thống Qt Windows

Ngày yêu cầu: 2026-11-08. Checkout `D:/PPP/viezan`, nhánh
`feat/qt-glass2-windows`, tiếp sau W2 và backend B1/B2. Không truy cập worktree W4,
không commit/push, không cài dependency, không mở app thật hoặc chụp màn hình.

## Nguồn và quy trình

- AGENTS.md; CONTRIBUTING.md/Verification; capability contract và agent/workflow/rule
  `native-migration`; rule `viezan-product-engineering`; skill
  `viezan-native-migration`, `viezan-native-ux` và reference UI UX Pro Max.
- `.claude/rules/ui-ux.md`, hướng native, HANDOFF mục 2–5,
  WINDOWS-HANDOFF mục 4, W3 và prompt mục 6; spec Everywhere, Apps mục 11,
  Thermal, Utilities/Launcher; báo cáo macOS Đợt 4/8, W2 Windows và B1/B2.
- Đã xem PNG tham chiếu và nguồn HTML của Everywhere, Apps, Apps-States,
  Thermal, Thermal-States, Shortcuts, Shortcuts-Recorder, Shell-States.
- Research: `keyboard focus modal --domain ux -n 3`. Kết quả phù hợp là
  Interaction / Focus States / All: giữ focus thấy được trong modal. Áp dụng
  bằng control Qt, focus Huỷ khi xác nhận gỡ, Esc/Tab trong recorder và viền
  `visualFocus`. Không áp dụng CSS/ARIA hoặc kích thước mobile từ catalog.
- Workflow sync-docs được giới hạn vào báo cáo bước này theo phạm vi file đã
  giao; không sửa các spec/README hoặc tài liệu W4 ngoài phạm vi.

## Nguồn đã thay đổi

| Phần | Hành vi |
| --- | --- |
| `DesktopWorkspace.qml` | Everywhere đọc `desktopIntegration.canReplaceSelection`, không giả quyền Trợ năng. Hàng phím tắt, cặp ngôn ngữ riêng, tên model ngắn; bản xem trước có nhãn minh hoạ, không gửi mẫu hoặc có nút thao tác giả. |
| `DesktopSettings.qml`, `ShortcutRecorder.qml`, `ShortcutKeyButton.qml` | Keycap và công tắc, nút Thử cho Launcher/Chat nhanh; recorder giữa cửa sổ, tổ hợp hợp lệ theo giới hạn backend, báo trùng và lỗi đăng ký, áp dụng qua `configure`. Không đổi mặc định/toàn cục; Ctrl+K trong cửa sổ. |
| `RecordingStrip.qml`, phần dải âm thanh trong `Main.qml` | `recordingStarted > 0` quyết định hiện dải; timestamp epoch giây, cập nhật mỗi giây, định dạng tối thiểu `mm:ss`; 0 thì ẩn. Trạng thái xử lý âm thanh tách riêng. |
| `ApplicationsWorkspace.qml` | Context `appUninstall`, inventory bất đồng bộ, tìm/chọn/chi tiết, nguồn/phiên bản/nhà phát hành/vị trí/dung lượng khi có, lỗi đã dịch, trạng thái bận và kết quả. Cửa sổ hẹp đổi danh sách/chi tiết với nút quay lại. |
| `ThermalWorkspace.qml` | Nêu rõ điều khiển quạt chỉ macOS; nút thủ công vô hiệu và badge trung tính. Giữ số đo thực, quyền sở hữu theo dõi và hành vi Linux hwmon hiện có. |
| CMake | Chỉ thêm ba tài liệu QML độc lập bằng `list(APPEND NATIVE_RESOURCES ...)`. |
| Locale | Sau review chuỗi: 62 khoá theo khái niệm trong mỗi catalog VI/EN/JA, dùng lại `appUninstall`, `replaceSelection`, `fanUnsupportedHint`; bổ sung giới hạn macOS vào `fanUnsupportedHint`. Sinh lại hai `native.json`, giống nhau theo byte. |

Các file QML mới chứa Timer/delegate/dialog độc lập; không thêm
Loader/sourceComponent hoặc delegate vào inline component được import.
Không thêm sort QV4. Danh sách Apps ép ScrollBar hiện khi tràn. Hàng Apps đặt
padding tường minh theo token để tránh lỗi `verticalOffset` của ItemDelegate
FluentWinUI3 6.8.3 khi bị vô hiệu. Không sửa Kit hoặc file thuộc W4.

### Gỡ ứng dụng

- Chỉ gửi ID đã quét và cờ xác nhận tới `uninstall`. UI không nhận/chạy lệnh
  shell; không xử lý đường dẫn để gỡ.
- Xác nhận có tên app, hệ quả theo nguồn, nút destructive; Huỷ nhận focus.
  Trước lúc gửi kiểm lại trạng thái bận, inventory đầy đủ, khoá chưa xác minh
  và metadata còn giống mục đã xác nhận. Thay đổi giữa hai thời điểm đóng
  xác nhận và không thực thi.
- Win32/MSI giải thích trình gỡ của nhà cung cấp/UAC và không có Hoàn tác.
  Store/MSIX chỉ mở URI cố định `ms-settings:appsfeatures` sau bấm nút; không
  dùng URI từ metadata, không suy thành đã gỡ.
- Flatpak user không tăng quyền; Flatpak system, Snap, apt/dnf giải thích
  ảnh hưởng toàn máy và pkexec/Polkit. `authorizeSystem=true` chỉ đi cùng
  việc bấm xác nhận cho mục có `requiresAuthorization=true`. Gói apt/dnf
  giải thích nhiều ứng dụng/gói phụ thuộc, không purge/autoremove riêng.
- AppImage giải thích chỉ tệp được chọn vào Thùng rác, giữ launcher và dữ
  liệu; Hoàn tác bằng Thùng rác hệ điều hành. Không dựng nút/API Undo giả.
- Chỉ `removed && verifiedRemoved === true` cho thông báo thành công và
  dải xanh. Các mã khác, kể cả yêu cầu khởi động lại, có nội dung riêng.
  `operationUnverified` khoá gỡ tiếp trong phiên; quét lại còn khả dụng.
- Đặt lại/dọn dữ liệu app vẫn chỉ macOS. Không dựng plan checkbox, nhật ký
  bền vững hoặc tính năng gỡ sạch trên Qt.

### C++ và an toàn test

Không thay đổi C++ sản phẩm, dịch vụ AppUninstall, DesktopIntegration,
WorkbenchBridge hoặc đăng ký context. Thay đổi C++ duy nhất là ba slot cuối
`WorkbenchBridgeTests.cpp`, thân hàm ở khối `// ---- W3 System pages ----`.
`tests/SystemPagesFixture.qml` cung cấp QObject QML giả cho appUninstall,
desktop, audio và thermal; ca route Main cũng dùng context appUninstall giả.

Test chỉ đếm lời gọi giả và trả dữ liệu giả. Không ghi registry, không gọi
uninstall thật, trình gỡ thật, msiexec, pkexec, apt/dnf, flatpak/snap hoặc mở
ms-settings. Không mở ứng dụng thật. Kiểm backend đầy đủ dùng fixture của B1/B2.

## Kiểm chứng

### Nền trước sửa

- Release build: PASS.
- Fusion/offscreen, kiểm nền nhỏ `glassDisabledControlRim`:

```text
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 4032ms
```

Bộ đầy đủ trước sửa không lặp lại; có bằng chứng W2 đã nghiệm thu, và bộ đầy
đủ chạy lại sau thay đổi cuối ở dưới.

### Build và kiểm nguồn

- Release `.native-build/qt`: PASS, log `w3-final-build4.txt.stdout`.
- Hai lần build song song trước đó gặp MSB3491 ở `.lastbuildstate` của
  qmlimportscan. Build tuần tự `--parallel 1` đạt; không xoá sản phẩm build.
- `npm run check:resources`: PASS, 3 locales / 78 metrics.
- `npm run check:docs`: PASS, version 2.4.2; không đổi version/lockfile.
- `node --test scripts/native/__tests__/domain.test.mjs`: 11 pass / 0 fail.
- `git diff --check`: PASS; chỉ có nhắc chuyển LF/CRLF của native.json.
- So catalog với HEAD: không đổi/xoá khoá cũ; hai bundle sinh ra giống byte.

### QtTest W3 tập trung

Fixture bao phủ bảy biến thể nguồn gỡ, xác nhận/huỷ, cờ tăng quyền, khoá bận,
inventory thiếu/đổi, operationUnverified, Store giả, điều kiện xác nhận đã gỡ,
chuỗi mọi mã kết quả/lỗi trong ba locale, lọc rỗng; timestamp/tick/ẩn dải ghi
âm; khả năng thay vùng chọn; quạt không hỗ trợ; phím tắt Ctrl/Shift, Esc không
lưu, trùng phím, lỗi đăng ký và áp dụng; route Apps trong Main với fake context.

Đổi bố cục fixture 640×480, 820×640, 1280×640, sáng/tối, VI/EN/JA, state `textSize=large`;
kiểm kích thước viewport và cảnh báo QML. Đây là kiểm offscreen, chưa phải
nghiệm thu hình ảnh, IME hoặc screen reader.

FluentWinUI3 cuối, `w3-focused3-fluent.txt`:

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 23261ms
```

Lượt tập trung đầu có hai lỗi trong mã test (tăng biến bên trong macro
QTRY_COMPARE và tìm recorder sai đường dẫn QObject), đã sửa. Lượt Fluent đầu
bắt lỗi padding Qt nêu trên; lượt cuối không còn cảnh báo QML. Rà nguồn còn
phát hiện `ControlLens` của GlassButton ẩn nền đỏ tuỳ chỉnh: nút xác nhận đã
đặt `glassMaterial=false`, test kiểm nền thực sự hiện và đúng màu danger.
Hướng dẫn Thùng rác cũng hiện khi backend báo `canUndo/systemTrash` nhưng
kết quả tổng thể chưa xác minh; không đổi điều kiện dải thành công.

### Hai bộ đầy đủ sau cùng

Mọi lượt đặt `QT_QPA_PLATFORM=offscreen`,
`QTEST_FUNCTION_TIMEOUT=600000`, style tường minh, fontdir Windows;
CTest `--timeout 5400 -j 1`, wrapper giới hạn 5700 giây. Fusion chạy trước,
FluentWinUI3 chạy sau. Fluent dùng bản CTestTestfile sinh ra trong thư mục
build phụ, chỉ thay ENVIRONMENT style (CTest gốc ép Fusion), vẫn dùng cùng
hai binary Release từ `.native-build/qt/Release`.

Fusion trung gian trước sửa nền destructive, nguyên văn từ
`w3-intermediate-fusion.stdout` và hai log QtTest:

```text
1/2 Test #1: native-qt-bridge .................   Passed  2762.12 sec
2/2 Test #2: native-qt-backend ................   Passed    0.56 sec
100% tests passed, 0 tests failed out of 2
Total Test time (real) = 2762.70 sec
Totals: 209 passed, 0 failed, 1 skipped, 0 blacklisted, 2761968ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 506ms
```

Lượt Fluent ngay sau Fusion trung gian được chủ động dừng để sửa nền
destructive, không có Totals và không được tính PASS. Đã chấm dứt phiên lệnh
và kiểm không còn tiến trình ViezanQtTests của checkout này trước khi build
lại; không dừng tiến trình ở worktree W4.

Hai lượt đầy đủ trên mã cuối đã đạt, chạy tuần tự Fusion trước,
FluentWinUI3 sau. Tổng kết nguyên văn (bridge trước, backend sau):

Fusion, `w3-final-fusion.stdout`, `w3-final-fusion-qt-test-results.txt`,
`w3-final-fusion-backend-test-results.txt`:

```text
1/2 Test #1: native-qt-bridge .................   Passed  2721.12 sec
2/2 Test #2: native-qt-backend ................   Passed    0.79 sec
100% tests passed, 0 tests failed out of 2
Total Test time (real) = 2721.93 sec
Totals: 209 passed, 0 failed, 1 skipped, 0 blacklisted, 2721001ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 512ms
```

FluentWinUI3, `w3-final-fluent.stdout`, `w3-final-fluent-qt-test-results.txt`,
`w3-final-fluent-backend-test-results.txt`:

```text
1/2 Test #1: native-qt-bridge .................   Passed  2377.26 sec
2/2 Test #2: native-qt-backend ................   Passed    0.60 sec
100% tests passed, 0 tests failed out of 2
Total Test time (real) = 2377.87 sec
Totals: 209 passed, 0 failed, 1 skipped, 0 blacklisted, 2375717ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 542ms
```

Skip duy nhất mỗi lượt là `acceleratedGlassSurfacesSurviveAppearanceChanges`
vì backend offscreen/software; không chạy GPU có cửa sổ. Fusion có 8 cảnh báo
`QUnifiedTimer::stopAnimationDriver: driver is not running`, Fluent có 3,
đều trong `glassImageResearchAndReset` (cũng đã được ghi ở W2). Không có
cảnh báo QML/binding, không có lỗi test hoặc crash trong hai lượt cuối.

Đối chiếu SHA-256 của 109 file nguồn Qt/test/QML/CMake/locale/bundle trước và
sau hai bộ cuối: **0 file thay đổi**, bản kê `w3-final-hashes.json`. Đọc log
chỉ sau khi lệnh kết thúc; không thăm dò log/tiến trình giữa các lượt hoàn tất.
`check:resources`, `check:docs` và `git diff --check` chạy lại sau đó đều đạt.

## Sửa chuỗi sau review Claude · 2026-11-08

Claude đã duyệt luồng gỡ và fixture an toàn. Lượt sửa này chỉ đổi khoá/chuỗi,
nội suy và kiểm tra locale trong khối test W3; không đổi hành vi dịch vụ gỡ.

- Bỏ toàn bộ 65 tên khoá có tiền tố `w3`/`w3Apps_` khỏi ba catalog và bundle.
  62 khoá còn lại dùng tên theo khái niệm, như `appsUninstall`,
  `appsSourceFlatpakUser`, `appsUninstallVerified`, `selectionReplacementAvailable`.
  QML ánh xạ tường minh mã backend sang khoá; các mã giao thức giữ nguyên.
- Đối chiếu locale và cách macOS dùng: tái sử dụng `appUninstall` cho AppImage
  vào Thùng rác, `replaceSelection` cho tiêu đề thay vùng chọn. Giữ dùng chung
  `refresh`, `recordingElapsed`, `shortcutFor`, `shortcutConflict`.
  `appUninstall` có nghĩa chuyển vào Thùng rác nên không dùng cho trình gỡ/gói;
  hành động đó dùng `appsUninstall`. Thông báo hoàn tất quét khác hành động quét lại.
- Dùng lại `fanUnsupportedHint`, bổ sung câu điều khiển quạt chỉ macOS bằng
  nội dung W3 đã duyệt. Đây là khoá có sẵn duy nhất đổi giá trị trong mỗi catalog;
  các khoá cũ khác giữ nguyên. Không sửa Swift hay các file/worktree thuộc W4.
- Thay nội suy `.replace("{…}", …)` bằng helper `tpl(key, values)` cùng cách
  `split/join` của Main.qml tại ApplicationsWorkspace, DesktopSettings,
  ShortcutRecorder, RecordingStrip và ThermalWorkspace. Định dạng dấu `+`
  trong keycap vẫn giữ nguyên vì không phải nội suy bản dịch.
- C++: chỉ cập nhật kiểm tra locale trong `w3AppsSafety` để tra khoá qua ánh xạ,
  phát hiện mã thiếu bản dịch và khoá còn tiền tố bước. Không đổi C++ sản phẩm.

Kiểm sau sửa: `npm run resources`; build Release `.native-build/qt`;
chạy tuần tự `w3AppsSafety`, `w3SystemPages`, `w3MainAppsRoute` bằng
`ViezanQtTests.exe` với Fusion rồi FluentWinUI3. Cả hai lượt đặt
`QT_QPA_PLATFORM=offscreen`, `QTEST_FUNCTION_TIMEOUT=600000`,
`QT_QUICK_CONTROLS_STYLE` tường minh và giới hạn tiến trình 900 giây.
Build cũng giới hạn 900 giây, exit 0. Không chạy lại toàn suite/backend vì
phạm vi lần này chỉ chuỗi; các tổng kết ctest ở mục trước là bằng chứng
**trước lượt sửa chuỗi**, không phải kết quả chạy lại sau sửa.

Tổng kết nguyên văn, Fusion (`.native-build/w3-strings-fusion.txt`):

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 20172ms
```

FluentWinUI3 (`.native-build/w3-strings-fluent.txt`):

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 23768ms
```

Mỗi lượt gồm ba ca W3 và init/cleanup. Không có QWARN/QFATAL trong log.
Fixture vẫn dùng appUninstall giả; không gọi gỡ thật, công cụ gỡ, Settings,
registry hoặc mở app thật. Hai bundle Qt/macOS khớp từng byte; kiểm tra catalog
không còn khoá `w3`. `check:resources`, `check:docs`, `git diff --check` đạt.
Ảnh/Narrator/150 % DPI: **Claude nghiệm thu sau**. Linux gỡ cài đặt chưa nghiệm
thu trên máy thật. Không commit/push.

## Chênh lệch và nghiệm thu còn lại

- **Ảnh / GPU / Narrator / 150 % DPI: Claude nghiệm thu sau.** Không chụp hoặc
  chạy test GPU có cửa sổ vì người dùng đang dùng màn hình.
- **Linux gỡ cài đặt chưa nghiệm thu trên máy thật.** Các nhánh chỉ có bằng
  chứng fixture/service test; không suy từ Windows thành Linux runtime pass.
- Không gỡ thật trên Windows để nghiệm thu. UI và hợp đồng giả đã kiểm;
  trình gỡ của nhà cung cấp, Store và UAC chưa được chạy ở bước này.
- IME thật, screen reader, DPI, độ tương phản/render và ba cỡ chữ đầy đủ:
  NOT RUN ở phiên này; Claude nghiệm thu sau. Offscreen không chứng minh chúng.
  Theo ma trận acceptance: UX07 có bằng chứng bàn phím fixture, IME thật
  NOT RUN; UX08/UX09 mới kiểm state/kích thước offscreen; UX10 và OS02
  NOT RUN. Không nâng các kiểm fixture thành nghiệm thu runtime của các ID này.
- Swift build/test: NOT RUN trên Windows; không đổi mã Swift, chỉ bundle tài
  nguyên dùng chung đã đối chiếu. Python native-script tests: NOT RUN vì không
  thay đổi script Python/build/packaging.
- Dải ghi âm giữ hành động `audio.cancel()` của shell trước W3. Vì Dừng ở dải
  huỷ bản ghi, câu mô tả không hứa chuyển thành văn bản như board. Nút thu âm
  trong composer giữ hành vi sẵn có.
- Board Apps là macOS: Qt dùng metadata/hệ quả theo nguồn thay plan tệp,
  reset và nhật ký/Undo trong app; không giả tính năng chưa có.
- Thermal Windows không có backend số đo đã xác minh; không tạo ba tile giả
  hoặc nút helper/profile của macOS. Linux chỉ hiển thị số đo backend thực.
- Preview Everywhere là minh hoạ có nhãn, không có Sao chép/Dán giả, theo
  quyết định đã chấp nhận ở macOS Đợt 4. Hình học và chất liệu cuối chờ Claude.

Source, build, QtTest và nghiệm thu trực tiếp là các mức bằng chứng riêng.
Không tuyên bố hoàn tất nghiệm thu runtime hoặc phát hành.
