# Liquid Glass 2.0 · Windows W0: nghiệm thu Đợt 7a

Phiên kiểm bắt đầu ngày 2026-11-06, tiếp tục sau nửa đêm 2026-11-07
(Asia/Saigon). Giữ tên báo cáo ngày 20261106 theo yêu cầu.

Kết quả cuối sau sửa GPU và ba lỗi shell: Release PASS; Fusion đầy đủ
**153 pass, 0 fail, 1 skip** (590,95 giây CTest); FluentWinUI3 đầy đủ
**151 pass, 2 fail, 1 skip** (633,547 giây QtTest), chạy tuần tự, không
fontdir. SKIP là test GPU trên software. Hai FAIL thư viện đều xanh khi
chạy với fontdir và với QPA Windows thật, xác nhận giới hạn font offscreen.
Test GPU thật **3 pass, 0 fail**; app thật qua cả bốn tổ hợp backend/style,
mỗi lượt giữ thêm hơn 20 s sau khi cửa sổ xuất hiện. Menu, tọa độ, title,
phím tắt, popup và fixture Phiên dịch được kiểm; Claude đã chụp ảnh source
cuối (mục cuối); Narrator chưa kiểm. Các lượt trước được giữ bên dưới như lịch sử, không thay thế
kết quả cuối.

## Điều kiện máy và phạm vi

- HEAD `4e40f50`, Windows 11, Qt 6.8.3 MSVC x64 tại `D:/Qt/6.8.3/msvc2022_64`, VS 2022
  BuildTools. Dùng cấu hình sẵn `.native-build/qt`, generator Visual Studio
  17 2022, Release; không cài phụ thuộc hay cấu hình lại CMake.
- PATH của từng tiến trình kiểm được thêm thư mục `bin` của Qt. CTest dùng
  `QT_QPA_PLATFORM=offscreen`, `QT_QUICK_CONTROLS_STYLE=Fusion`; chạy riêng
  toàn bộ executable với FluentWinUI3/offscreen.
- Lượt tiếp ngày 2026-11-07 được cấp quyền ghi
  `C:/Users/OS/AppData/Local/qttest`. Chạy đủ Fusion rồi đủ FluentWinUI3
  **tuần tự**, không chạy probe QtTest song song. Không đặt QT_QPA_FONTDIR
  trong CMake/test hay hai lượt đầy đủ cuối; fontdir chỉ là ghi chú môi trường.
- Phạm vi: Foundations, Home, Translate-Compact; tốc độ QtTest, DPI/font và
  hình học shell. Bố cục tính năng W1–W5 không thuộc W0.
- Không mở app thật với dữ liệu cá nhân; các QtTest dùng kho tạm và bridge
  không tự gọi provider. Không chụp ảnh, không kiểm Narrator trong phiên này.
- Không commit, push, cài thư viện, sửa C++ dịch vụ, CMake, generator hay
  `.gitattributes`. File `.claude/settings.local.json` xuất hiện ngoài công
  việc này; không đọc hoặc sửa.

## Nguồn và quy trình

Đã đối chiếu `AGENTS.md`, `.claude/rules/ui-ux.md`, `CONTRIBUTING.md`,
`docs/design/direction.md`, foundations và spec Home/Dịch; đọc
[WINDOWS-HANDOFF](../../design/glass2/WINDOWS-HANDOFF.md) mục 3, 4, W0,
[HANDOFF](../../design/glass2/HANDOFF.md) mục 2–4 và các mục Shell, Home,
Dịch. Đọc cả HTML và PNG của Foundations, Home, Translate-Compact.

Tham chiếu [Đợt 7a](native-migration-report-20261103-glass2-dot7.md) và
các quyết định/chênh lệch Đợt 1–3: token thắng literal trong board, Qt dùng
khung hệ thống, kính chỉ vẽ trong scene; software renderer không có bóng
MultiEffect; bố cục bên trong Dịch còn chờ W2.

Capability: agent/workflow/rule `native-migration`, rule
`viezan-product-engineering`, skill `viezan-native-migration`,
`viezan-native-ux` và bản `ui-ux-pro-max` trong repo; `sync-docs` chỉ áp dụng
cho ghi bằng chứng phạm vi W0. Tra cứu `keyboard focus visible --domain ux`
cho kết quả “Focus States”, platform All: giữ focus native riêng với trạng
thái chọn. Không áp dụng ví dụ CSS, kích thước mobile hay tạo design system mới.

Theo ma trận `docs/migration/acceptance.md`: test tự động là bằng chứng một
phần cho UX07–UX09; UX10/Narrator và OS02/DPI với compositor thật còn chờ
Claude. Đo tốc độ QtTest không thay thế PERF01 của app thật.

## Đã sửa

Lượt đầu dừng ở baseline lỗi sandbox; kiểm chéo và quyền test-mode mới đã
gỡ blocker đó. Sau sửa assertion popup, lượt tiếp xử lý crash GPU và ba
lỗi shell Windows do Claude phát hiện khi chụp ảnh. Không sửa C++ dịch vụ,
CMake/CI, font hệ thống, token hay chuỗi.

| Phần | Thay đổi | File |
| --- | --- | --- |
| Đóng popup trên Windows | Đổi kiểm `visible` ngay lập tức sang `QTRY_VERIFY` sau khi chọn lịch sử và lệnh Cài đặt (row chat/translate), đợi exit transition của FluentWinUI3. Giữ nguyên kiểm IME, selection, sessions/tasks/active và route. | `apps/desktop-qt/tests/WorkbenchBridgeTests.cpp` |
| Crash khi có GPU | Thay hai Loader/sourceComponent lồng trong inline component bằng MultiEffect khai báo trực tiếp. Giữ bóng GPU và mọi tham số vật liệu; giữ nguồn GPU ổn định khi ẩn, không gắn source ở software. | `apps/desktop-qt/qml/Kit.qml` |
| Hồi quy GPU | Kiểm frame render, source/visibility/kích thước bóng và chuyển Glass/Graphite, sáng/tối; tải shell thật bằng bridge tạm. QSKIP khi backend software/unknown. | `apps/desktop-qt/tests/WorkbenchBridgeTests.cpp` |
| MenuBar Windows/Linux | Ẩn dải menu; đăng ký Shortcut theo cửa sổ dùng chung Action và điều kiện enabled; macOS giữ menu và shortcut của Action. | `apps/desktop-qt/qml/Main.qml` |
| Header Glass Windows/Linux | Nút sidebar về lề trái `inset`; breadcrumb expanded tại mép mặt đọc + `inset`, rail cách nút `gap`; bỏ padding ngầm của ToolBar tại nhánh này. Giữ hình học macOS và header các preset khác. | `apps/desktop-qt/qml/Main.qml`, `PrimaryNavigation.qml` |
| Title Windows/Linux | Title chỉ chứa tên trang; macOS giữ tiền tố hiện tại. | `apps/desktop-qt/qml/Main.qml` |
| Hồi quy shell | Kiểm tọa độ 1280×800/820×640, expanded/rail, sáng/tối; title/MenuBar; gửi phím thật cho shortcut và trạng thái blocked, bảo toàn dữ liệu IME. | `apps/desktop-qt/tests/WorkbenchBridgeTests.cpp` |
| Báo cáo | Ghi điều kiện, đo trước/sau và các giới hạn nghiệm thu Windows W0. | Báo cáo này |

## Kiểm chứng

### Trước sửa — lượt đầu, trước khi mở quyền test-mode

Build Release, nguyên văn:

```text
MSBuild version 17.14.51+25f168cee for .NET Framework

  Checking File Globs
  Automatic MOC and UIC for target ViezanNativeQt
  ViezanNativeQt.vcxproj -> D:\PPP\viezan\.native-build\qt\Release\ViezanNativeQt.exe
  Automatic MOC and UIC for target ViezanQtTests
  ViezanQtTests.vcxproj -> D:\PPP\viezan\.native-build\qt\Release\ViezanQtTests.exe
```

`ctest --test-dir .native-build/qt -C Release --output-on-failure`, exit 8:

```text
Internal ctest changing into directory: D:/PPP/viezan/.native-build/qt
Test project D:/PPP/viezan/.native-build/qt
    Start 1: native-qt-bridge
1/1 Test #1: native-qt-bridge .................***Failed  737.88 sec


0% tests passed, 1 tests failed out of 1

Total Test time (real) = 737.88 sec

The following tests FAILED:
	  1 - native-qt-bridge (Failed)
Errors while running CTest
```

QtTest, nguyên văn từ `.native-build/w0-fusion-before.txt`:

```text
FAIL!  : WorkbenchBridgeTests::parityInterpretationRestoreAndCancelSummary() Compared values are not the same
   Actual   (interpretation.sessions().size()): 0
   Expected (1)                               : 1
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(334) : failure location
FAIL!  : WorkbenchBridgeTests::remainingGapsInterpretation() 'file.open(QIODevice::WriteOnly)' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(380) : failure location
Totals: 150 passed, 2 failed, 0 skipped, 0 blacklisted, 737773ms
```

Toàn bộ ca QML xanh. Ngoài cảnh báo font, có cảnh báo khi hủy engine ở ba
row của `foundationOverlayResizeAndEscape` (vi-light, en-light, ja-dark):

```text
"There are still \"1\" items in the process of being created at engine destruction."
```

Hai fixture lỗi bật `QStandardPaths::setTestModeEnabled(true)` nhưng vẫn
dùng AppLocalDataLocation, không dùng QTemporaryDir. Trên Qt 6.8.3 Windows,
test mode chỉ thêm `/qttest` vào Known Folder AppData của OS; không chuyển
về thư mục tạm. Đường dẫn này ngoài writable roots của phiên. `Interpretation`
tự lấy đường dẫn đó trong constructor (`Interpretation.cpp:32`); không có
tham số đường dẫn thay thế. Ca đầu không lưu được phiên nên số phiên bằng 0;
ca sau thất bại ngay khi tạo file. Đây là lỗi quyền của sandbox ở lượt đầu,
không phải lỗi sản phẩm và **không cần sửa C++ cho W0**.
Ca đầu còn return sớm qua QCOMPARE trước khi trả test mode về false.
[Nguồn Qt 6.8.3](https://github.com/qt/qtbase/blob/v6.8.3/src/corelib/io/qstandardpaths_win.cpp)
xác nhận cách dựng đường dẫn.

Kiểm chéo do Claude cung cấp: cùng build Release ngoài sandbox, hai fixture
đạt `Totals: 4 passed, 0 failed`; bộ Fusion ngoài sandbox exit 0, khoảng
11,5 phút. Đây là bằng chứng do Claude báo, không gộp vào số đo Codex.

Sau khi mở quyền ghi qttest, Codex chạy lại hai fixture với Fusion/offscreen
trên source dịch vụ không đổi, exit 0; log
`.native-build/w0-fixture-permission-recheck.txt`, nguyên văn:

```text
PASS   : WorkbenchBridgeTests::parityInterpretationRestoreAndCancelSummary()
PASS   : WorkbenchBridgeTests::remainingGapsInterpretation()
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 159ms
```

### Đo tốc độ trước sửa

| Phép đo Fusion/offscreen | Kết quả |
| --- | --- |
| Toàn bộ CTest | 737,88 giây; hoàn tất, không treo vô hạn |
| Điều hướng `vi-1200-glass-light`, QSG_INFO=1 | 3 pass, 9631 ms; renderer `software` |
| Cùng ca, QT_QPA_FONTDIR=C:/Windows/Fonts | 3 pass, 14929 ms; hết cảnh báo font, không nhanh hơn |
| Điều hướng `vi-1200-graphite` | 3 pass, 10148 ms |
| Glass, QV4_FORCE_INTERPRETER=1 | 3 pass, 9393 ms |
| `roundTripAndSeparateDrafts` (không load QML) | 3 pass, 1791 ms |
| `glassBackendReducerRules` | 3 pass, 3 ms |

Số pass bao gồm init/cleanup của QtTest. Các probe chạy trong lúc bộ đầy đủ
đang chạy, nên không dùng thời gian này làm benchmark median/p95 hay khẳng
định tỷ lệ tăng tốc. Không đổi cấu hình môi trường toàn máy.

Đã loại trừ việc MultiEffect đang chạy trong phép đo: GlassPane và
ControlGlassSurface chỉ tạo effect khi GraphicsInfo khác Software/Unknown;
log QSG xác nhận software. Graphite cũng chậm; fontdir và tắt JIT không giải
quyết được. Chưa có profile đủ để quy nguyên nhân cho một binding cụ thể.
Chi phí khởi tạo dịch vụ và QML cần được đo riêng nếu tiếp tục profiling.
Không sửa QML theo phỏng đoán; không tuyên bố đã khắc phục tốc độ.

### FluentWinUI3: bộ đầy đủ trước sửa

Lệnh (PATH đã thêm Qt bin), exit 7:

```powershell
$env:QT_QPA_PLATFORM = 'offscreen'
$env:QT_QUICK_CONTROLS_STYLE = 'FluentWinUI3'
& .native-build/qt/Release/ViezanQtTests.exe -o .native-build/w0-fluent-before.txt,txt
```

Tổng kết và các lỗi riêng Fluent, nguyên văn:

```text
FAIL!  : WorkbenchBridgeTests::keypadHistoryRespectsCompositionAndOpensSelection() '!root->findChild<QObject *>("quick-history")->property("visible").toBool()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(518) : failure location
FAIL!  : WorkbenchBridgeTests::keypadSubmitAndCommands(chat) '!root->findChild<QObject *>("command-palette")->property("visible").toBool()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(569) : failure location
FAIL!  : WorkbenchBridgeTests::keypadSubmitAndCommands(translate) '!root->findChild<QObject *>("command-palette")->property("visible").toBool()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(569) : failure location
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(1858) : failure location
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(1858) : failure location
Totals: 145 passed, 7 failed, 0 skipped, 0 blacklisted, 695531ms
```

Bảy lỗi gồm hai lỗi fixture Phiên dịch giống Fusion và năm lỗi trên. Có
16 dòng QWARN: 1 thiếu thư mục font và 15 engine-destruction. Không có cảnh
báo “style does not support customization”; không quy bảy lỗi này thành
cảnh báo style vô hại như trường hợp Qt macOS trong handoff.

Ba assertion popup dùng QVERIFY ngay sau đóng. `Popup.qml` của
FluentWinUI3 6.8.3 có exit animation 83/167 ms; kiểm trạng thái đóng cần đợi
transition bằng QTRY_VERIFY như các test overlay khác, giữ nguyên kiểm
IME và chọn phiên. Lượt tiếp đã xác nhận popup đóng và sửa assertion như
phần dưới. Hai row tràn ngang dùng Graphite/light, không
phải Glass; không tự sửa bố cục Graphite ngoài yêu cầu W0.

Chạy lại riêng năm ca này, vẫn Fluent/offscreen nhưng thêm
`QT_QPA_FONTDIR=C:/Windows/Fonts`: hai row thư viện đã PASS, ba assertion
popup vẫn FAIL, không còn QWARN. Log
`.native-build/w0-fluent-fonts-recheck.txt`, exit 3:

```text
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library)
Totals: 4 passed, 3 failed, 0 skipped, 0 blacklisted, 20870ms
```

Vì vậy không xem hai lỗi tràn ngang khi thiếu font là lỗi Graphite đã xác
nhận trên app thật. Đây cũng không phải kết quả chạy đủ suite với fontdir;
tổng kết bộ đầy đủ vẫn là 145/7 như trên.

### Xác nhận transition trước khi sửa assertion

Thêm đo tạm vào hai test, giữ assertion QVERIFY cũ: ghi `visible` ngay sau
hành động rồi cho event loop chạy 250 ms và kiểm lại. Chạy ba row với
FluentWinUI3/offscreen, không fontdir; cả ba đều chuyển true → false:

```text
QINFO  : WorkbenchBridgeTests::keypadHistoryRespectsCompositionAndOpensSelection() W0 history visible immediately: true
QINFO  : WorkbenchBridgeTests::keypadHistoryRespectsCompositionAndOpensSelection() W0 history visible after transition: false
QINFO  : WorkbenchBridgeTests::keypadSubmitAndCommands(chat) W0 commands visible immediately: true
QINFO  : WorkbenchBridgeTests::keypadSubmitAndCommands(chat) W0 commands visible after transition: false
QINFO  : WorkbenchBridgeTests::keypadSubmitAndCommands(translate) W0 commands visible immediately: true
QINFO  : WorkbenchBridgeTests::keypadSubmitAndCommands(translate) W0 commands visible after transition: false
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 17414ms
```

Log `.native-build/w0-transition-probe.txt`. Kết luận: QML không để visible
kẹt true; assertion phải tôn trọng exit transition native. Đã bỏ toàn bộ
qInfo/qWait đo tạm, thay bằng QTRY_VERIFY (đợi điều kiện, không sleep cố định)
và dựng Release lại. Không sửa kiểm popup còn mở khi IME đang composition.

### Font và DPI

Probe Qt Quick độc lập trong `.native-build/w0-font-probe/`, không tải app
hay dữ liệu cá nhân, chạy FluentWinUI3/offscreen với fontdir Windows:

```text
QINFO  : qmltestrunner::W0FontProbe::test_fonts() qml: Application family: Sans Serif Control family: Segoe UI Variable Segoe UI Variable installed: true
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 11ms
```

FluentWinUI3 tự chọn family Segoe UI Variable; không cần hardcode font vào
QML W0. Offscreen Windows dùng FreeType, không dùng hệ font Windows như QPA
windows; vì vậy đây chưa xác nhận raster/fallback font của app thật.
[Nguồn Qt offscreen](https://github.com/qt/qtbase/blob/v6.8.3/src/plugins/platforms/offscreen/qoffscreenintegration.cpp)
và [theme FluentWinUI3](https://github.com/qt/qtdeclarative/blob/v6.8.3/src/quickcontrols/fluentwinui3/qquickfluentwinui3theme.cpp).

Chạy thêm các ca có sẵn với FluentWinUI3/offscreen, fontdir Windows, lần
lượt `QT_SCALE_FACTOR=1`, `1.25`, `1.5`:

```powershell
& .native-build/qt/Release/ViezanQtTests.exe `
  'navigationSelectionSurvivesRepeatedActivation:vi-820-glass-light' `
  'navigationSelectionSurvivesRepeatedActivation:ja-1200-glass-dark' `
  glassSearchAndFiltersPreserveNativeInteraction `
  -o .native-build/w0-dpi-<scale>-final.txt,txt
```

Nhóm Home/filter có hai row `light-vi-640`, `dark-ja-1200`, cỡ chữ large;
kiểm reflow, giữ control/focus, selected text, IME và Escape. Nhóm điều
hướng kiểm nhấn lặp bằng chuột/bàn phím và chuyển Chat → Dịch. Mỗi lượt có
4 row thực + init/cleanup, không thay thế toàn bộ suite.

| DPI mô phỏng | DPR đọc lại từ probe Qt Quick | Tổng kết QtTest nguyên văn |
| --- | --- | --- |
| 100% | 1 | `Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 29813ms` |
| 125% | 1.25 | `Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 29869ms` |
| 150% | 1.5 | `Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 29787ms` |

Các log DPI `*-final.txt` không có QWARN. Lần gọi probe đầu dùng nhầm tag
`vi-820` cho nhóm filter, được QtTest báo “Data tag not found”; đã gọi lại
đúng cả nhóm và chỉ dùng kết quả `*-final.txt` ở bảng này.

Kiểm source shell: không đặt FramelessWindowHint, không thay nút cửa sổ OS;
header nằm trong client area, cao `navControl + small` (48). Pane sidebar
bắt đầu 56; mép mặt đọc x=256 khi mở/x=88 khi rail; breadcrumb mở rộng
x=272. Nút thu gọn nằm trong hàng đầu sidebar, nút mở rail đứng đầu header;
đây vẫn là bố cục Qt đã ghi ở Đợt 7a, chưa xác nhận trục và khoảng cách so
với titlebar DWM thật. Không lấy frame margin giả của offscreen làm bằng
chứng khung Windows 11 đạt.

### Kiểm tra tài nguyên và portable domain

`npm run check:resources` báo chênh lệch CRLF/LF đã được người dùng xác nhận
trước phiên; không chạy generator để sửa checkout:

```text
Error: Stale native resources: apps/macos/Sources/ViezanDomain/Resources/native.json
```

`node --test scripts/native/__tests__/domain.test.mjs`, nguyên văn:

```text
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 165.0279
```

`python -B -m unittest discover -s scripts/native/__tests__ -p 'test_*.py'`:

```text
sssssss
----------------------------------------------------------------------
Ran 7 tests in 0.000s

OK (skipped=7)
```

Bảy test dành riêng cho dev runner macOS, skip theo điều kiện `sys.platform`.
Swift build/test: NOT RUN trên Windows.

## Chênh lệch còn lại

- Offscreen dùng software renderer (đã đo với `QSG_INFO=1`); test GPU mới
  QSKIP ở đó. Crash GPU đã có repro, sửa QML và kiểm độc lập của Claude
  trên bốn tổ hợp; không suy nghiệm thu hình ảnh/DWM từ kết quả offscreen.
- `QFontDatabase` cảnh báo thiếu thư mục `Qt/lib/fonts` khi offscreen.
  Trỏ `QT_QPA_FONTDIR` sang `C:/Windows/Fonts` bỏ cảnh báo nhưng không làm
  ca điều hướng nhanh hơn; đây chưa phải bằng chứng nguyên nhân chậm.
- Reduce Transparency / High Contrast của Qt vẫn thuộc W5 (#34).
- Chưa chạy runtime macOS/Linux trong phiên Windows này. Nhánh macOS giữ
  menu/title/header hiện tại bằng điều kiện nền tảng; không coi đọc source
  là nghiệm thu trực tiếp trên hai nền tảng đó.
- Claude đã chụp ảnh shell trước sửa và phát hiện ba lỗi được xử lý trong
  lượt tiếp. Tọa độ shell được kiểm bằng QtTest; ảnh source cuối, DPI vật lý,
  font fallback VI/JA và Narrator vẫn do Claude nghiệm thu.
- Hai lỗi fixture Phiên dịch đã được xác nhận là quyền sandbox và xanh sau
  khi mở quyền qttest; không còn là blocker W0. Ba assertion thời điểm đóng
  popup đã sửa bằng QTRY_VERIFY sau khi xác nhận QML đóng đúng.
- Fluent cuối còn hai row thư viện Graphite (`chat-library`,
  `translation-library`) tràn ngang khi không nạp font hệ thống. Lượt sau sửa
  shell đã xác nhận **cả hai xanh với offscreen + fontdir và QPA Windows thật
  + font hệ thống**, cùng FluentWinUI3, không sửa layout thư viện. Đây là
  giới hạn môi trường offscreen; không đưa fontdir vào CMake/test.
  Bộ Fluent cuối không được ghi là hoàn toàn xanh.
- Hai bộ sau sửa popup chạy tuần tự khoảng 9,4 phút mỗi bộ, đều kết thúc. Chưa xác
  định đầy đủ điểm nóng và chưa sửa hiệu năng. Không giảm độ phủ; không
  quy chênh lệch thời gian so với lượt trước thành tăng tốc nhờ QTRY_VERIFY.
- Lượt cuối GPU/shell: Fusion 590,95 s, Fluent 633,547 s. Fluent có 12 cảnh
  báo engine-destruction (nhiều hơn lượt popup), Fusion có 4; chưa xác định
  nguyên nhân của chênh lệch này. Không coi các cảnh báo là lỗi font, không
  che chúng hay tuyên bố đã sửa hiệu năng/lifecycle. Các assertion vẫn đạt
  ngoài hai row font nói trên.

## Đề xuất cần đụng C++/CMake

1. **Tùy chọn để cô lập test, không chặn W0:** cho `Interpretation` nhận đường dẫn lưu tùy chọn qua
   constructor, giữ đường dẫn mặc định của app. File dự kiến:
   `apps/desktop-qt/Interpretation.h`, `Interpretation.cpp`. Hai test dùng
   `QTemporaryDir` riêng rồi truyền đường dẫn; kiểm restore/delete/reload/
   export như hiện tại, không giảm assertion hoặc skip. Cân nhắc truyền
   đường dẫn kho Phiên dịch cùng vùng fixture từ WorkbenchBridge khi bridge
   đã nhận storageFile tạm, để mọi service trong test cùng được cô lập.
2. **Tùy chọn cho độ độc lập fixture:** bỏ thao tác xóa file test
   dùng chung, dùng RAII nếu còn đổi QStandardPaths test mode, để QCOMPARE/
   QVERIFY thất bại không rò trạng thái sang ca sau. Không cần thay đổi này
   để chạy W0 khi test-mode store được phép ghi. Sửa QTRY_VERIFY cho ba row
   popup đã thực hiện riêng trong phạm vi tests được duyệt; không thêm
   cấu hình font vào tests/CMake.
3. **Profiling:** thêm đo riêng constructor bridge, engine.load, xử lý sự
   kiện và destructor trong fixture chẩn đoán; nếu cần QML Profiler thì
   đề xuất target/profile CMake riêng trước khi sửa CMake. Chưa có bằng
   chứng để tắt hiệu ứng, giảm dữ liệu test hoặc thay style.

Không thực hiện các đề xuất C++/CMake này trong W0. Nghiệm thu runtime/ảnh
và user acceptance vẫn riêng với kết quả test tự động.

## Lịch sử bàn giao sau sửa popup, trước sửa GPU/shell

Build Release sau sửa QTRY_VERIFY PASS; log
`.native-build/w0-popup-final-build.log`. Chạy lại đủ Fusion rồi đủ
FluentWinUI3 tuần tự trên bản dựng này. Log nằm trong `.native-build/w0-*`;
không đưa build product vào git. Các phép đo trước sửa ở trên là lịch sử,
không thay thế kết quả cuối.

### Fusion đầy đủ sau sửa

`ctest --test-dir .native-build/qt -C Release --output-on-failure`, exit 0.
Nguyên văn từ `.native-build/w0-popup-fusion-final.log` và
`.native-build/w0-popup-fusion-final.txt`:

```text
Internal ctest changing into directory: D:/PPP/viezan/.native-build/qt
Test project D:/PPP/viezan/.native-build/qt
    Start 1: native-qt-bridge
1/1 Test #1: native-qt-bridge .................   Passed  563.01 sec

100% tests passed, 0 tests failed out of 1

Total Test time (real) = 563.01 sec
Totals: 152 passed, 0 failed, 0 skipped, 0 blacklisted, 562913ms
```

Hai fixture Phiên dịch và cả ba row popup đều PASS trong bộ đầy đủ. Không
bỏ ca kiểm, không chạy QtTest song song, không đặt fontdir. Thời gian này
được đo tuần tự; không quy chênh lệch so với lượt đầu chạy song song thành
mức tăng tốc do hai dòng sửa assertion.

### FluentWinUI3 đầy đủ sau sửa

Chỉ bắt đầu sau khi CTest Fusion trả exit 0, cùng binary Release cuối:

```powershell
$env:PATH = 'D:\Qt\6.8.3\msvc2022_64\bin;' + $env:PATH
$env:QT_QPA_PLATFORM = 'offscreen'
$env:QT_QUICK_CONTROLS_STYLE = 'FluentWinUI3'
# QT_QPA_FONTDIR, QT_SCALE_FACTOR, QV4_FORCE_INTERPRETER, QSG_INFO không được đặt.
& .native-build/qt/Release/ViezanQtTests.exe -o .native-build/w0-popup-fluent-final.txt,txt
```

Exit 2. Kết quả liên quan và tổng kết nguyên văn:

```text
PASS   : WorkbenchBridgeTests::parityInterpretationRestoreAndCancelSummary()
PASS   : WorkbenchBridgeTests::remainingGapsInterpretation()
PASS   : WorkbenchBridgeTests::keypadHistoryRespectsCompositionAndOpensSelection()
PASS   : WorkbenchBridgeTests::keypadSubmitAndCommands(chat)
PASS   : WorkbenchBridgeTests::keypadSubmitAndCommands(translate)
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(1860) : failure location
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(1860) : failure location
Totals: 150 passed, 2 failed, 0 skipped, 0 blacklisted, 565956ms
```

Stopwatch của lệnh, nguyên văn từ
`.native-build/w0-popup-fluent-final-timing.txt`:

```text
Exit code: 2; wall seconds: 566.0610349
```

Fluent có 3 QWARN: thiếu thư mục font và 2 engine-destruction. Fusion có
5 QWARN: thiếu thư mục font và 4 engine-destruction. Không lọc hoặc che
cảnh báo. Hai row tràn ngang là đúng các row đã xanh với fontdir trong
`.native-build/w0-fluent-fonts-recheck.txt`; chưa chạy toàn bộ suite với
fontdir, không suy ra suite đó xanh. Không chỉnh layout Graphite hay thêm
cấu hình font vào source để xử lý chênh lệch môi trường này.

### Kiểm tra tài liệu và phạm vi cuối

`npm run check:docs` cuối phiên PASS, nguyên văn:

```text
Native documentation references version 2.4.2; runtime acceptance is separate.
```

`git diff --check` không báo lỗi. Hai bundle native.json được so byte trực
tiếp, giống nhau; chênh lệch CRLF với output generator vẫn giữ nguyên.

Lượt popup giữ nguyên các preset, chuỗi, tài nguyên generated và mã ứng dụng;
chỉ sửa test đóng popup và báo cáo. Ảnh, 1280×800/820×640,
sáng/tối, DPI 100/150% và Narrator do Claude điền tiếp ở mục dưới.

Hoàn tất phần sửa assertion W0 được yêu cầu: popup đã được xác nhận đóng
sau transition, cả ba row xanh trên hai style, fixture Phiên dịch xanh
trong sandbox được cấp quyền. Fusion PASS; Fluent còn hai lỗi môi trường
đã ghi nguyên văn. Không tuyên bố toàn bộ W0 đạt nghiệm thu runtime/ảnh.

## Crash khi có GPU

### Triệu chứng và thí nghiệm có kiểm soát

Claude báo app Release thoát `-1073741819` (`0xC0000005`) trước khi hiện
cửa sổ, cả FluentWinUI3/Fusion × D3D11/OpenGL. Event Log trỏ
`Qt6Qml.dll` 6.8.3, offset `0x266ccc`. Offscreen hoặc
`QT_QUICK_BACKEND=software` không crash. Codex tái hiện bằng app thật trên
hồ sơ preview được cấp quyền, không dùng dữ liệu cá nhân.

Các repro chạy bằng `D:/Qt/6.8.3/msvc2022_64/bin/qml.exe`, QPA Windows,
backend D3D11 mặc định, cùng máy/Qt. Timer của repro thoát sau 2,5 giây;
chỉ coi thành công khi có log tạo QRhi và `frameSwapped`, không chỉ dựa
vào tiến trình còn sống. Artifact chẩn đoán nằm trong `.native-build/`.

| Thí nghiệm | Kết quả đo bởi Codex |
| --- | --- |
| App gốc, D3D11 (`w0-gpu-original-confirmed`) | Crash `-1073741819` sau 2,809 s, chưa có cửa sổ. |
| Inline Surface chứa Loader → MultiEffect, khai báo trong cùng file Window (`w0-gpu-minimal-inline`) | Exit 0, render frame, 3,56 s. |
| Chuyển nguyên Surface sang QtObject ở file import riêng (`w0-gpu-external-inline`) | Crash `-1073741819`, 1,109 s. |
| Cùng file import, chỉ đặt Loader `active: false` (`w0-gpu-external-loader-off`) | Exit 0, render frame, 3,37 s. |
| Cùng file import, thay MultiEffect trong sourceComponent bằng Rectangle (`w0-gpu-external-loader-rectangle`) | Vẫn crash `-1073741819`, 0,976 s. |
| Cùng file import, bỏ Loader, khai báo MultiEffect trực tiếp (`w0-gpu-external-direct-effect`) | Exit 0, render frame, 3,472 s. |
| Hai component Kit thật sau sửa, bridge giả chỉ chứa metrics/palette generated (`w0-gpu-kit-direct-fixed`) | Exit 0, render frame, 4,337 s. |
| App thật sau sửa, style mặc định, D3D11 (`w0-gpu-fixed-default-d3d`) | Có cửa sổ, QRhi dùng NVIDIA RTX A1000 6GB Laptop GPU, không crash trong 30,567 s; đóng tiến trình sau kiểm. |

Một số lượt đầu (12/40 s app gốc và 8 s Kit/pane/control riêng) còn tiến
trình nhưng không có frame/cửa sổ; không tính PASS. WER giữ tiến trình lỗi
trong lúc xử lý crash. Harness sau đó truyền error mode
`SEM_NOGPFAULTERRORBOX` cho tiến trình con để quan sát exit code, khôi phục
ngay error mode của tiến trình gọi; không đổi thiết lập Windows lâu dài.
Đây là cơ chế kế thừa được mô tả trong
[Microsoft SetErrorMode](https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-seterrormode).

Dạng repro tối thiểu gây lỗi (file được import, Window riêng dùng
`W0Effect.Surface`):

```qml
import QtQuick
import QtQuick.Effects
QtObject {
    component Surface: Item {
        id: surface
        Rectangle { id: face; anchors.fill: parent; visible: false; color: "white" }
        Loader {
            anchors.fill: parent
            active: GraphicsInfo.api !== GraphicsInfo.Software && GraphicsInfo.api !== GraphicsInfo.Unknown
            sourceComponent: MultiEffect { source: face; anchors.fill: parent; shadowEnabled: true }
        }
    }
}
```

### Nguyên nhân và sửa

Bằng chứng khoanh vùng cấu trúc QML gây lỗi ở Qt 6.8.3: Loader tạo
sourceComponent lồng trong inline component được import từ file khác.
Rectangle cũng gây lỗi nên không quy cho shader MultiEffect hoặc driver.
GPU kích hoạt nhánh này; software/offscreen trước đó không đi qua nó.
Chưa có symbol/debugger để kết luận hàm nội bộ Qt và chưa tìm được QTBUG
khớp đã xác minh; không gán một mã bug hoặc phiên bản Qt đã sửa khi chưa có
bằng chứng.

`Kit.GlassPane` dùng Item giữ nguyên khung kích thước trước đây của Loader,
với MultiEffect khai báo trực tiếp; `ControlGlassSurface` dùng MultiEffect
trực tiếp. Giữ blur, offset, opacity, màu, bán kính và nguồn sibling như cũ.
Software vẫn dùng nhánh fallback. Một bản thử ngắt source khi ẩn đã phát
cảnh báo texture lúc chuyển preset; bản cuối giữ source GPU ổn định và dùng
visibility để ẩn. Test hồi quy sẽ fail nếu cảnh báo texture này quay lại.

Không cần sửa C++/CMake/CI hay nâng Qt để né cấu trúc gây crash. Có thể
kiểm lại repro khi nâng Qt theo kế hoạch riêng; W0 không tự nâng phiên bản.
Không còn thay đổi thí nghiệm trong source. Repro/log ngoài source chỉ ở
thư mục dựng được ignore.

### Kiểm chứng độc lập của Claude

Claude kiểm cùng source sửa GPU, trước ba sửa shell:

- App thật chạy **hơn 20 s, không crash ở cả bốn tổ hợp** D3D11/OpenGL ×
  FluentWinUI3/Fusion; bản trước sửa crash cả bốn. Đã đóng sau mỗi lần.
- `acceleratedGlassSurfacesSurviveAppearanceChanges` xanh với GPU thật ở
  cả bốn tổ hợp. Đổi về `Kit.qml` HEAD cũ thì test **SEGFAULT**: test bắt
  đúng hồi quy, không chỉ kiểm thuộc tính của bản mới.
- Chạy exe test trực tiếp mà không đặt style chọn **Windows**, phát 55 cảnh
  báo `style does not support customization` và test đỏ. App Windows luôn
  đặt FluentWinUI3 trong `main.cpp:39`; đây là điều kiện chạy test, không
  phải lỗi sản phẩm. Các lượt GPU cuối đặt style rõ ràng.
- Fusion đầy đủ trước sửa shell: `100% tests passed, 0 tests failed out of 1`
  (631 s). Fluent/offscreen: `Totals: 150 passed, 2 failed, 1 skipped`
  (555 s). SKIP là test GPU, hai FAIL là các row thư viện cần kiểm font/QPA
  bên dưới. Đây là số liệu do Claude cung cấp, không phải log Codex.

Claude đã chụp ảnh trước ba sửa shell ở `.native-build/w0-shots/`;
Codex đọc ảnh được cung cấp để đối chiếu. Ảnh này không phải bằng chứng
nghiệm thu source shell cuối. Mục nghiệm thu ảnh vẫn dành cho Claude.

## Kiểm chứng cuối sau sửa GPU và shell

MenuBar non-osx ẩn và cao 0; header Glass bắt đầu tại (0, 0), rộng bằng
cửa sổ. Test kiểm nút sidebar tại x = `metrics.inset` (16), breadcrumb
expanded bằng mép mặt đọc + 16; rail bằng mép phải nút + `metrics.gap`
(12), ở 1280×800 và 820×640, hai chế độ sáng/tối, cả hai trạng thái lưu
navigationCollapsed. Không lấy tọa độ từ pixel ảnh 150% để thay logical
token. Header macOS và các preset khác giữ binding/style cũ.

Shortcut của non-osx dùng `Qt.WindowShortcut`, kích hoạt cùng Action với
điều kiện enabled cũ; macOS tiếp tục dùng shortcut của Action trong menu.
Việc tách logic Action khỏi trình bày phù hợp với
[Qt Action](https://doc.qt.io/qt-6.8/qml-qtquick-controls-action.html).
QtTest dùng `QTest::keyClick` cho Ctrl+K, Ctrl+Backslash, Ctrl+0..3,
StandardKey.New, Ctrl+Shift+H/A, thêm trạng thái loadBlocked/Settings và
preedit IME không làm đổi dữ liệu. `StandardKey.Preferences` **không có
binding trên platform theme Windows của Qt này**, đã xác nhận bằng
QKeySequence; giữ nguyên hành vi nền tảng, không tự gán Ctrl+Comma hay
phím khác. Test gửi phím Preferences trên nền tảng có binding; nếu không,
kiểm Settings qua lệnh sẵn có. Title non-osx chứa tên trang, không lặp tên
app; macOS giữ tiền tố `Viezan Native —`.

### Kiểm tập trung trên source cuối

Release build PASS, `.native-build/w0-shell-build.log`, lệnh
`cmake --build .native-build/qt --config Release`, exit 0. Nguyên văn:

```text
MSBuild version 17.14.51+25f168cee for .NET Framework

  Checking File Globs
  Automatic MOC and UIC for target ViezanNativeQt
  ViezanNativeQt.vcxproj -> D:\PPP\viezan\.native-build\qt\Release\ViezanNativeQt.exe
  Automatic MOC and UIC for target ViezanQtTests
  WorkbenchBridgeTests.cpp
  ViezanQtTests.vcxproj -> D:\PPP\viezan\.native-build\qt\Release\ViezanQtTests.exe
```

Hai ca
`platformShellGeometryAndShortcuts foundationBlockedLoadInMountedShell`
chạy offscreen, không fontdir, nguyên văn:

```text
Fusion:
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 32120ms
FluentWinUI3:
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 31761ms
```

Log: `.native-build/w0-shell-focused-fusion-final.txt`,
`.native-build/w0-shell-focused-fluent.txt`.

Hai row `qmlLoadsWithRealBridge:chat-library` và
`qmlLoadsWithRealBridge:translation-library`, FluentWinUI3, cùng binary:

```text
Offscreen, QT_QPA_FONTDIR=C:/Windows/Fonts:
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library)
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 6572ms

QPA Windows, không offscreen, không QT_QPA_FONTDIR:
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library)
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 7580ms
```

Cả hai exit 0. Log `.native-build/w0-shell-libraries-fontdir.txt`,
`.native-build/w0-shell-libraries-windows.stdout.txt` và `.result.json`.
Lượt Windows có QRhi D3D11 thật, dùng font hệ thống; hai cảnh báo không
ghi được pipeline-cache lock ở AppData/Local/ViezanQtTests do sandbox,
không có lỗi layout hay cảnh báo thiếu font. Không sửa thư viện Graphite.

Test GPU trên source cuối, `QT_QUICK_CONTROLS_STYLE=FluentWinUI3`, QPA
Windows, D3D11, không offscreen/fontdir, exit 0:

```text
PASS   : WorkbenchBridgeTests::acceleratedGlassSurfacesSurviveAppearanceChanges()
PASS   : WorkbenchBridgeTests::cleanupTestCase()
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 15431ms
```

Log `.native-build/w0-shell-gpu-final-fluent.stdout.txt` và `.result.json`.
Ba cảnh báo pipeline-cache lock không ghi được do sandbox; không còn
cảnh báo texture `t1`, không cảnh báo QML. Kiểm chuyển appearance dùng
bridge với QTemporaryDir, không sửa dữ liệu ngoài hồ sơ preview.

### App thật sau cả ba sửa shell

Chạy tuần tự `.native-build/qt/Release/ViezanNativeQt.exe` trong hồ sơ
preview đã được cho phép. Harness đợi thấy window handle, sau đó giữ
thêm 20 s; mọi lượt có log tạo QRhi đúng backend, không crash và được đóng
trước lượt kế tiếp. Không chụp ảnh nghiệm thu mới.

| Style | Backend thực tế | Thấy cửa sổ sau | Tổng quan sát | Giữ sau khi có cửa sổ |
| --- | --- | --- | --- | --- |
| Mặc định app (FluentWinUI3) | D3D11 / NVIDIA RTX A1000 | 3,416 s | 23,439 s | 20,023 s |
| Mặc định app (FluentWinUI3) | OpenGL 4.6 / NVIDIA RTX A1000 | 3,310 s | 23,323 s | 20,013 s |
| Fusion | D3D11 / NVIDIA RTX A1000 | 3,514 s | 23,529 s | 20,015 s |
| Fusion | OpenGL 4.6 / NVIDIA RTX A1000 | 3,089 s | 23,102 s | 20,013 s |

Log và JSON: `.native-build/w0-shell-app-{default,fusion}-{d3d,opengl}.*`.
Không đặt `QT_QUICK_CONTROLS_STYLE` ở hai lượt mặc định; app tự chọn
FluentWinUI3. Cả bốn không offscreen/software/fontdir. Chuyển preset và
sáng/tối được kiểm bằng bridge tạm trong test GPU ở trên; không dùng tự
động hóa để thay settings của hồ sơ người dùng.

### Fusion đầy đủ trên source cuối

`ctest --test-dir .native-build/qt -C Release --output-on-failure -V`,
exit 0; offscreen/Fusion theo CTest, không fontdir hay override renderer.
Nguyên văn từ `.native-build/w0-shell-fusion-final.log` và `.txt`:

```text
1/1 Test #1: native-qt-bridge .................   Passed  590.95 sec

100% tests passed, 0 tests failed out of 1

Total Test time (real) = 590.95 sec
Totals: 153 passed, 0 failed, 1 skipped, 0 blacklisted, 590854ms
```

Stopwatch ngoài CTest, nguyên văn:

```text
Exit code: 0; wall seconds: 591.0494072
```

SKIP duy nhất là test accelerated trên software, đúng thiết kế. Hai fixture
Phiên dịch và các row popup xanh. Năm QWARN: một thiếu font offscreen,
bốn engine-destruction như các lượt trước; không lọc cảnh báo. Lượt Fluent
đầy đủ chỉ khởi động sau khi tiến trình CTest này kết thúc.

### FluentWinUI3 đầy đủ trên source cuối

Chạy sau Fusion, cùng binary Release, PATH có Qt bin:

```powershell
$env:QT_QPA_PLATFORM = 'offscreen'
$env:QT_QUICK_CONTROLS_STYLE = 'FluentWinUI3'
# Không đặt QT_QPA_FONTDIR, QT_QUICK_BACKEND, QSG_RHI_BACKEND, QT_SCALE_FACTOR.
& .native-build/qt/Release/ViezanQtTests.exe -o .native-build/w0-shell-fluent-final.txt,txt
```

Exit 2. Nguyên văn phần lỗi và tổng kết:

```text
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(2078) : failure location
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
D:\PPP\viezan\apps\desktop-qt\tests\WorkbenchBridgeTests.cpp(2078) : failure location
Totals: 151 passed, 2 failed, 1 skipped, 0 blacklisted, 633547ms
```

Stopwatch ngoài QtTest, nguyên văn:

```text
Exit code: 2; wall seconds: 633.6564983
```

SKIP duy nhất là GPU trên software. `platformShellGeometryAndShortcuts`,
`foundationBlockedLoadInMountedShell`, hai fixture Phiên dịch và ba row
popup đều PASS. Có 13 QWARN: một thiếu font, 12 engine-destruction;
giữ nguyên trong log `.native-build/w0-shell-fluent-final.txt`. Hai lỗi
thư viện đã xanh trong cả hai phép đối chứng font/QPA trên cùng binary ở
trên; không suy ra toàn bộ suite với fontdir hay QPA Windows đã chạy xanh.
Không thay đổi test để bỏ qua hai assertion tràn ngang.

### Phạm vi bàn giao

`npm run check:docs` cuối lượt PASS:

```text
Native documentation references version 2.4.2; runtime acceptance is separate.
```

`git diff --check` PASS. So SHA-256 của hai bundle native.json cho kết quả
giống nhau; không chạy lại generator để đổi CRLF.

Chỉ sửa `Kit.qml`, `Main.qml`, `PrimaryNavigation.qml`,
`tests/WorkbenchBridgeTests.cpp` và báo cáo này. Không sửa C++ dịch vụ,
CMake/CI, token, locale, generated resources; không nâng Qt/cài phụ thuộc,
commit hoặc push. Hai native.json giữ đồng bộ; chênh lệch CRLF/LF của
check:resources vẫn là ghi chú môi trường ban đầu. Không còn tiến trình
app/test của các lượt nghiệm thu đang chạy. Mục ảnh bên dưới dành cho
Claude; không dùng ảnh source trước sửa để tuyên bố nghiệm thu source cuối.

## Nghiệm thu bằng ảnh

Claude chụp ngày 2026-11-07 bằng app Release thật (QPA windows, D3D11,
FluentWinUI3 mặc định), cửa sổ hệ thống Windows 11 với màu nhấn thanh tiêu đề
của máy. Chụp bằng `PrintWindow` sau 8 giây; kích thước client đặt theo pixel
logic, DPI mô phỏng bằng `QT_SCALE_FACTOR`. Hồ sơ preview
(`%LOCALAPPDATA%/ViezanNativePreview/ViezanNativeQt`) được sao lưu trước, chỉ đổi
`appearance.mode` / `shell.lastRoute` / `feature` để chụp, rồi trả lại nguyên
byte. Không có dữ liệu cá nhân hay provider thật; vì vậy Gần đây trống và chip
model là Ollama chưa chạy (chấm đỏ). Ảnh trong [`glass2-win-W0/`](glass2-win-W0/),
thu nhỏ 50 %.

| Ảnh | So với board | Kết quả |
| --- | --- | --- |
| [before-home-1280-light](glass2-win-W0/before-home-1280-light.png) | Home | **Trước sửa shell**: dải MenuBar "Bảng lệnh" chiếm một hàng riêng, header bị đẩy xuống; nút thu gọn nằm trên mép phải sidebar; title "Viezan Native — Trang chủ - Viezan". Ba lỗi này là nguồn của ba sửa shell. |
| [home-1280-light](glass2-win-W0/home-1280-light.png) | Home | Đạt cấu trúc: header là hàng đầu dưới thanh tiêu đề OS; nút sidebar ở lề trái; breadcrumb ở mép mặt đọc + 16; pill Launcher / Hoạt động có vạch ngăn; sidebar kính 236, lens "Trang chủ", ô Tìm capsule + keycap Ctrl+K; mặt đọc bo 22; 4 ô Bắt đầu nhanh 56; `.seg` bên phải nhãn Gần đây. Title "Trang chủ - Viezan". |
| [home-1280-dark](glass2-win-W0/home-1280-dark.png) | Chat-Dark (shell) | Đạt: nền gradient tối, sidebar và mặt đọc tối, chữ đủ tương phản. |
| [home-1280-dark-150](glass2-win-W0/home-1280-dark-150.png) | Home, 150 % | Đạt: không cắt chữ, không tràn; keycap, icon SVG và bo góc nét ở 1,5×. |
| [home-820-light](glass2-win-W0/home-820-light.png) | Translate-Compact (shell) | Đạt: dưới 900 dùng rail 68; nút mở rộng đứng đầu header ở lề trái, breadcrumb lùi sau nó; Bắt đầu nhanh 2×2. |
| [translate-820-light](glass2-win-W0/translate-820-light.png), [translate-820-dark](glass2-win-W0/translate-820-dark.png) | Translate-Compact | Shell đạt (rail, lens Dịch, header icon-only). Bố cục bên trong Dịch vẫn là bản cũ (hàng ngôn ngữ dạng combobox, thẻ cảnh báo provider, pane bản dịch cắt dòng gợi ý) — đúng phạm vi W2, không sửa ở W0. |

Chênh lệch còn lại ghi nhận qua ảnh (không chặn W0):

- Chế độ tối trên GPU: viền phản sáng của pill kính (chip model, Launcher,
  Hoạt động) sáng và dày hơn Chat-Dark.png. Do MultiEffect giờ chạy thật trên
  GPU; trước sửa crash chưa từng thấy được nhánh này trên Windows. Xem lại cùng
  vật liệu ở W1.
- Chân sidebar thiếu nhóm "Đang chạy nền · Phím tắt toàn cục" vì hồ sơ preview
  chưa đăng ký phím tắt toàn cục; seg Gần đây thiếu "Phiên dịch" vì chưa có phiên.
  Phụ thuộc dữ liệu, không phải lỗi bố cục.
- Thanh tiêu đề dùng màu nhấn hệ thống của máy (tím); đó là cài đặt Windows của
  người dùng, không phải màu app.

Chưa kiểm (NOT RUN), để người dùng nghiệm thu trực tiếp hoặc làm ở bước sau:
Narrator, font fallback EN/JA và ba cỡ chữ trên app thật, DPI vật lý 125/150 %
của màn hình (chỉ mô phỏng bằng `QT_SCALE_FACTOR`), Linux.

Kiểm của Claude trên source cuối (ngoài sandbox Codex): build Release PASS; app
chạy >20 s ở D3D11/OpenGL × FluentWinUI3/Fusion (trước sửa: crash 0xC0000005 cả
bốn); test GPU xanh cả bốn tổ hợp và **segfault với `Kit.qml` của HEAD**, tức là
test bắt đúng hồi quy.
