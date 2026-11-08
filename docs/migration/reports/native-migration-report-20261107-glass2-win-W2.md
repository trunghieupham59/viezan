# Liquid Glass 2.0 · Windows W2

Ngày triển khai 2026-11-07; kiểm cuối tiếp tục sang 2026-11-08 (Asia/Saigon).

**Trạng thái: hoàn tất sửa mã W2e; build Release, Fusion đầy đủ, FluentWinUI3 đầy đủ và GPU D3D11 đều PASS.** Đã sửa lỗi lưu khi khởi động và các mục bố cục Claude yêu cầu. Không mở app thật trong lượt này; chờ Claude nghiệm thu ảnh trên bản mới. Không commit/push.

## Điều kiện máy

Windows 11, Qt 6.8.3 MSVC x64 tại `D:/Qt/6.8.3/msvc2022_64`, VS 17 2022, Release, `.native-build/qt` đã cấu hình. Thêm Qt bin vào PATH của tiến trình kiểm. Các ca tập trung chạy offscreen với style Fusion hoặc FluentWinUI3 chỉ định rõ; fixture dùng thư mục tạm và QStandardPaths test mode, không dùng hồ sơ cá nhân. Không chụp ảnh, không cài phụ thuộc, không commit/push. Giữ nguyên nền W0/W1 chưa commit.

## Nguồn và quyết định

Đã đọc AGENTS, ui-ux, direction, các spec Dịch/Từ điển/Phiên dịch, WINDOWS-HANDOFF mục 4/W2, HANDOFF mục 2–5, HTML và PNG của 12 board W2, báo cáo macOS glass2-dot3/dot8/dot9 và W1, đặc biệt Nghiệm thu bằng ảnh. Đã resolve native-migration workflow/rules và skill viezan-native-ux cùng UI UX Pro Max trong repo. Không tạo palette/preset mới.

Giữ chênh lệch đã chấp nhận: backend So sánh tối đa ba model; không thay độ trễ tự dịch; không thêm shortcut ngữ cảnh; không chuyển quyền ghi màn hình của macOS sang Windows. Loa từng câu Phiên dịch dùng bridge.audio theo ngoại lệ #36. Viền pill kính tối W0/W1 còn sáng hơn board được giữ.

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| C++ — đã được người dùng duyệt | NativeAudio đọc quyền Windows từ ba khoá ConsentStore mỗi lần gọi. Micro/mixed dùng cùng nguồn quyền; denied báo microphoneDenied trước khi tạo phiên. System độc lập. Test seam chỉ biên dịch vào executable QtTest. | NativeAudio.h, NativeAudio.cpp, Interpretation.cpp |
| C++ — lỗi lưu featureLeft | Đóng QFile ngay sau parse, trước launch có thể lưu nguyên tử lại cùng file trên Windows; **người dùng cho phép C++ qua đêm 2026-11-08**. Thêm test khởi động → lưu → nạp lại → lưu với timestamp thập phân và số nguyên lớn ở Dịch/Từ điển. | WorkbenchBridge.cpp:136, tests/WorkbenchBridgeTests.cpp |
| CMake — Claude đã duyệt | Thêm đúng LanguageButton.qml và ListenButton.qml vào NATIVE_RESOURCES để đóng gói các component đã tách nhằm tránh crash imported inline component của Qt 6.8.3. Không đổi dependency/linking/target hoặc C++ khác. | apps/desktop-qt/CMakeLists.txt |
| Dịch | Hai pane đồng đều theo container; giới hạn 5.000 ký tự và trạng thái disabled; footer ẩn khi chưa có kết quả, co nhãn thành icon; ngôn ngữ, Nghe, So sánh và tuỳ chọn có lớp neo nút. | qml/Main.qml, TranslationOptions.qml |
| So sánh | Current model cố định đầu; chọn 2–3 model, giữ thứ tự danh sách backend; dùng compareBySentence bền vững, các thao tác chọn câu/nhận bản dịch/retry/cancel. | qml/ComparisonPane.qml |
| Từ điển | Ô tra làm trọng tâm, nút ngữ cảnh trong ô; tra cứu gần đây/từ đã lưu từ dữ liệu thật; hàng mục từ, số nghĩa, contextSense, exampleRegisters, related; Không tìm thấy với dictionarySuggestions; Dịch cả câu từ ngữ cảnh; sao chép và lưu có toast. | qml/DictionaryResult.qml, Main.qml |
| Phiên dịch | Thẻ quyền và đọc lại; thiết bị theo deviceID; transcript có bản dịch nổi bật, sidebar phiên/tổng hợp, dừng tổng hợp, blocked/reload; xoá ngay + toast Hoàn tác; xuất theo Chỉ bản dịch; loa từng câu dùng bridge.audio. | qml/InterpretationWorkspace.qml, Main.qml |
| Lớp nổi | Dùng lại ReadingPanelSurface W1; không nền Popup thứ hai; vị trí trong cửa sổ, không che nút; scrollbar luôn có khi tràn; tooltip ẩn khi lớp mở. | qml/Kit.qml, LanguageButton.qml, ListenButton.qml |
| Nghe | speakingSource/preparing/lastSource, giọng hệ thống sau lỗi, tốc độ qua voice/rateSupported; tên theo voiceFor(language); hàng 48 không thêm hàng khi bắt đầu đọc. | qml/ListenButton.qml |
| Icon | SVG nét cho So sánh, Sao chép, Dừng, Lưu từ, Đổi ngôn ngữ. | qml/icons/compare.svg, copy.svg, stop.svg, star.svg, swap.svg |
| Test | Quyền, nhánh nguồn thu không ghi âm, giới hạn, thứ tự cột, bố cục 640/820/1280 sáng/tối, từ liên quan/ngữ cảnh/registers/not-found, quyền QML, undo/export, audio fixture. | tests/WorkbenchBridgeTests.cpp, ListenFixture.qml |
| Hồi quy thư viện và popup đóng | Hai binding Không tìm thấy xử lý session rỗng khi thư viện chưa chọn phiên. Danh sách ngôn ngữ/nguồn Nghe chỉ tạo delegate khi popup mở; cache locale map, đưa mục ngôn ngữ đã chọn vào vùng nhìn thấy sau khi model được tạo. Icon tìm từ dùng màu text-muted của theme. | qml/DictionaryResult.qml, LanguageButton.qml, ListenButton.qml, Main.qml |

## Quyền micro Windows

Chỉ đọc đúng các giá trị `Value` sau bằng QSettings NativeFormat:

- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`.
- `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`.
- `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged`.

Khảo sát chỉ đọc trên máy: HKLM có `Allow`, hai khoá HKCU vắng mặt. Không duyệt lịch sử truy cập của từng ứng dụng. Bất kỳ `Deny` nào trả denied; không có Deny trả granted, bao gồm khoá/giá trị vắng mặt. Đây là chính sách được người dùng duyệt cho desktop không đóng gói: Windows quản lý bằng công tắc desktop, không dùng prompt quyền Qt. [Tài liệu Microsoft](https://support.microsoft.com/en-us/windows/privacy/turn-on-app-permissions-for-your-microphone-in-windows) mô tả công tắc riêng cho ứng dụng desktop. Tên khoá được kiểm trên máy; không coi chúng là API WinRT được Qt cung cấp.

Mỗi lần gọi tạo bộ đọc QSettings mới; không ghi registry, không thu âm để dò quyền. Các nền tảng khác giữ qApp->checkPermission. `setMicrophonePermissionForTest` chỉ có khi VIEZAN_CONTRACT_FIXTURE (target QtTest hiện có); không Q_INVOKABLE, không có trong executable production. Test đổi denied/granted/undetermined rồi gọi lại; chặn persist bằng một thư mục fixture trước nhánh bắt đầu capture để kiểm micro/mixed/system mà không mở thiết bị.

Không sửa AudioCapture: tín hiệu failed hiện không phân biệt quyền với thiết bị, QAudioSource không cung cấp loại lỗi permission riêng đủ chắc chắn. Không biến mọi systemAudioError thành microphoneDenied. Denial/recheck với công tắc OS thật chưa nghiệm thu vì không thay quyền của người dùng.

## Kiểm chứng

### Baseline trước QML

Build trước sửa: PASS (`.native-build/w2-preflight-build.log`). Baseline Fusion đã bắt đầu ở lượt đầu nhưng bị ngắt khi phát hiện permission backend; không coi là PASS hoặc regression:

```text
1/1 Test #1: native-qt-bridge .................***Failed  153.25 sec
0% tests passed, 1 tests failed out of 1
Total Test time (real) = 153.25 sec
```

Log `.native-build/w2-preflight-fusion-interrupted.txt`. Lượt tiếp tục **bỏ baseline Fusion đầy đủ trước QML**, theo lựa chọn ghi rõ được người dùng cho phép. Con số W1 không được dùng làm kết quả W2.

Chẩn đoán trước sửa, remainingGapsServices, Fusion rồi Fluent:

```text
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 154ms
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 163ms
```

Log `.native-build/w2-permission-diagnostic-fusion.txt` và `-fluent.txt` chứa thông báo Qt không có permission backend và trả Granted mặc định; chỉ là bằng chứng lỗi trước sửa.

### Kiểm tập trung trong triển khai

C++ permission đã PASS trong lượt smoke. Lượt kiểm QML trực tiếp sau chuyển file độc lập:

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 149161ms
```

`.native-build/w2-local-layout.txt`: ba kích thước 1280-light, 820-light, 640-dark; có cảnh báo Keys gắn vào Popup, đã chuyển handler vào ô tìm kiếm sau lượt này. Không dùng lượt này thay cho bộ cuối.

Các lượt trong triển khai bên dưới từng nạp QML từ source khi chưa đăng ký tài nguyên. Sau duyệt CMake đã đổi về qrc và bỏ đường dẫn máy; bộ cuối kiểm tài nguyên đóng gói.

Bộ tập trung Fusion `.native-build/w2-focused-local-fusion.txt` gồm quyền,
audio fixture và ma trận Dịch/Từ điển 640/820/1280 sáng/tối:

```text
Totals: 16 passed, 0 failed, 0 skipped, 0 blacklisted, 558155ms
```

Đây là lượt trong triển khai (QML được nạp từ source); còn thay đổi sau lượt
khởi chạy, không gọi là kiểm cuối. Không có cảnh báo QML trong log này.

Fluent tập trung lần đầu phát hiện vòng lặp implicitWidth của Popup và contentWidth
của bảng câu. Đã đặt kích thước ngầm định rõ ràng và bỏ phụ thuộc vòng vào availableWidth.
Log `.native-build/w2-focused-local-fluent.txt`, rồi `.native-build/w2-fluent-sizing-recheck.txt`:

```text
Totals: 3 passed, 4 failed, 0 skipped, 0 blacklisted, 154722ms
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 111094ms
```

Lượt kiểm lại gồm lớp Nghe, layout 820 sáng và Từ điển 640 tối. Không có cảnh báo
QML; đây vẫn là kiểm source trong triển khai, chưa thay cho bộ đóng gói cuối.

Fusion sau bổ sung kiểm So sánh theo câu, bấm từ liên quan/gợi ý và làm lại ô tra:
`.native-build/w2-refined.txt`:

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 199508ms
```

Có cảnh báo QFontDatabase thiếu thư mục fonts của Qt; không có cảnh báo QML.
Sau lượt này còn thêm test danh sách gần đây/đã lưu và nội dung hàng danh sách.

FluentWinUI3 với QT_QPA_FONTDIR, quyền C++ và Từ điển 640 tối (gồm bấm mở lại
từ đã lưu và xác nhận xuất hiện ở danh sách gần đây), `.native-build/w2-dictionary-empty-fluent.txt`:

```text
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 103335ms
```

Build Release sau bổ sung test trên thành công. Sau lượt này chỉ đổi mặt ô tra
sang token surface-subtle/border-strong dùng bởi SearchField W1 và thêm null guard
cho dữ liệu danh sách; vẫn cần kiểm lại trong bộ cuối.

GPU tạm thời FluentWinUI3, không offscreen, `.native-build/w2-gpu-interim.txt`:

```text
qrc:/qml/Main.qml:1144:21: LanguageButton is not a type
Totals: 2 passed, 1 failed, 0 skipped, 0 blacklisted, 1273ms
```

Log xác nhận backend D3D11, NVIDIA RTX A1000. Test đi qua mặt kính riêng rồi thất
bại khi nạp Main vì thiếu đăng ký tài nguyên mới, đúng đề nghị CMake bên dưới;
không gọi đây là GPU PASS. Có cảnh báo cache lock trong thư mục ViezanQtTests
ngoài writable roots; không đổi quyền thư mục. Ở thời điểm đó app thật chưa mở vì cùng lỗi nạp Main.

`npm run resources` và `npm run check:resources` đã chạy sau chuỗi mới:

```text
Native resources generated: 3 locales, 78 metrics.
Native resources verified: 3 locales, 78 metrics.
```

Không gặp stale do CRLF trong lượt check này. `git diff --check` xanh, cảnh báo LF→CRLF ở hai bundle.

Kiểm lại resources/docs sau hai bộ đầy đủ và GPU, exit 0:

```text
Native resources verified: 3 locales, 78 metrics.
Native documentation references version 2.4.2; runtime acceptance is separate.
```

Node có ExperimentalWarning về stripTypeScriptTypes; không có lỗi kiểm tài nguyên.
`git diff --check` vẫn exit 0. `git status` có cảnh báo không đọc được global ignore
`C:/Users/OS/.config/git/ignore`; không đổi quyền hay cấu hình Git để xử lý cảnh báo này.

### Kiểm cuối W2 trước nghiệm thu — lịch sử

Lượt Fusion đầy đủ đầu tiên sau đăng ký qrc được chủ động ngắt khi rà thấy binding
session rỗng ở DictionaryResult. Log `.native-build/w2-fusion-interrupted-null-session.txt`
xác nhận 10 ca glassOverlayLayout/glassHistoryActions bị cảnh báo từ hai dòng 56/58;
không phải lỗi W1 có sẵn. Đã sửa cả hai binding, giữ nguyên assert kiểm cảnh báo.
Tổng kết ctest của lượt bị ngắt (không có Totals QtTest vì chưa chạy hết):

```text
1/1 Test #1: native-qt-bridge .................***Failed  2593.86 sec
0% tests passed, 1 tests failed out of 1
Total Test time (real) = 2593.87 sec
```

Kiểm lại FluentWinUI3 + QT_QPA_FONTDIR, `.native-build/w2-null-session-recheck.txt`:

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 70427ms
```

Gồm glassHistoryActions(640-dark), glassW2Layout(1280-light), glassW2ListenStates;
không có cảnh báo QML. Sau đó dựng lại và chạy lại đủ Fusion rồi Fluent trên bản
cuối, không dùng lượt ngắt làm bằng chứng hoàn tất.

Đã cấu hình lại bằng `cmake -S apps/desktop-qt -B .native-build/qt
-DCMAKE_PREFIX_PATH=D:/Qt/6.8.3/msvc2022_64`, rồi build Release thành công:

```text
-- Configuring done (1.2s)
-- Generating done (0.9s)
-- Build files have been written to: D:/PPP/viezan/.native-build/qt
ViezanNativeQt.vcxproj -> D:\PPP\viezan\.native-build\qt\Release\ViezanNativeQt.exe
ViezanQtTests.vcxproj -> D:\PPP\viezan\.native-build\qt\Release\ViezanQtTests.exe
```

Bộ Fusion dùng `ctest --test-dir .native-build/qt -C Release --timeout 10800
--output-on-failure -V`; timeout chỉ truyền trên CLI để đủ thời gian ma trận W2,
không sửa cấu hình test trong CMake. Cả hai bộ cuối đặt
`QT_QPA_FONTDIR=C:/Windows/Fonts`; Fluent chạy sau khi ctest kết thúc thành công.

Lượt Fusion sau sửa nhưng chưa đặt QT_QPA_FONTDIR được chủ động ngắt để kiểm môi
trường font, `.native-build/w2-fusion-unset-fontdir-interrupted.txt`. Phần đã chạy
không có FAIL QtTest, chỉ cảnh báo QFontDatabase thiếu thư mục fonts của Qt; vẫn
không tính là bộ đầy đủ. Tổng kết ctest của lượt ngắt:

```text
1/1 Test #1: native-qt-bridge .................***Failed  2705.11 sec
0% tests passed, 1 tests failed out of 1
Total Test time (real) = 2705.13 sec
```

Kiểm Fusion với font Windows, `.native-build/w2-fusion-fontdir-check.txt`, gồm
glassHistoryActions(1280-dark) và glassW2Layout(820-dark):

```text
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 198480ms
```

Không có cảnh báo QML/font; chưa đủ bằng chứng quy thời gian chậm cho font hoặc
tuyên bố mức cải thiện tốc độ. Sau đó chạy lại hai bộ đầy đủ với font Windows.

Fusion đầy đủ trên bản đóng gói cuối, bắt đầu 22:50 ngày 07/11 và kết thúc 00:16
ngày 08/11. Log `.native-build/w2-final-fusion.txt` và
`.native-build/w2-final-fusion-ctest.txt`, nguyên văn:

```text
Totals: 202 passed, 0 failed, 1 skipped, 0 blacklisted, 5155804ms
1/1 Test #1: native-qt-bridge .................   Passed  5155.95 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 5155.97 sec
```

Một SKIP là acceleratedGlassSurfacesSurviveAppearanceChanges vì offscreen dùng
software. Tất cả ca W2 và hai ca thư viện đều PASS. Không có cảnh báo QML/font;
có bốn QWARN `QIODevice::read (QNetworkReplyHttpImpl): device not open` ở
platformShellGeometryAndShortcuts (hai lần) và glassSearchAndFiltersPreserveNativeInteraction
(hai lần), các ca vẫn PASS. Không gọi log này là hoàn toàn không có cảnh báo.

Thời gian Fusion khoảng 86 phút, dài hơn mốc W1 người dùng cung cấp. Chưa có
profiling để kết luận nguyên nhân hoặc suy ra độ trễ tương tác của app thật.

FluentWinUI3 đầy đủ chạy tuần tự sau Fusion, bắt đầu 00:16 ngày 08/11, với
`QT_QPA_PLATFORM=offscreen`, `QT_QUICK_CONTROLS_STYLE=FluentWinUI3` và
`QT_QPA_FONTDIR=C:/Windows/Fonts`. Log `.native-build/w2-final-fluent.txt`, exit 0:

```text
Totals: 202 passed, 0 failed, 1 skipped, 0 blacklisted, 2709973ms
```

Hai ca `qmlLoadsWithRealBridge(chat-library|translation-library)` đều PASS ngay
trong bộ đầy đủ dùng font Windows, không cần lượt sửa font riêng. Một SKIP vẫn
là nhánh GPU do software offscreen. Không có cảnh báo QML/font. Có hai QWARN
`QIODevice::read (QNetworkReplyHttpImpl): device not open` trong
platformShellGeometryAndShortcuts và ba QWARN
`QUnifiedTimer::stopAnimationDriver: driver is not running` trong
glassImageResearchAndReset (640-dark, 1200-dark, 1280-light); các ca đều PASS.
Thời gian Fluent khoảng 45 phút; chưa có profiling để giải thích khác biệt thời gian.

GPU sau hai bộ đầy đủ: bỏ QT_QPA_PLATFORM, QT_QUICK_BACKEND, QSG_RHI_BACKEND và
QT_QPA_FONTDIR, đặt FluentWinUI3 và QSG_INFO=1; chạy riêng
acceleratedGlassSurfacesSurviveAppearanceChanges. Log `.native-build/w2-final-gpu.txt`, exit 0:

```text
PASS   : WorkbenchBridgeTests::acceleratedGlassSurfacesSurviveAppearanceChanges()
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 20639ms
```

Log xác nhận `Creating QRhi with backend D3D11`, `Prefer software device: 0`,
adapter được chọn NVIDIA RTX A1000 6GB Laptop GPU. Test đi qua cả các mặt kính
riêng và Main thật, đổi sáng/tối và glass/graphite/glass. Không có lỗi QML hay
crash. Có ba cảnh báo không tạo được pipeline cache lock ở
`C:/Users/OS/AppData/Local/ViezanQtTests/cache/`, ngoài writable roots;
không đổi quyền hoặc xoá cache để che cảnh báo.

App Release thật: đang chờ hồ sơ preview rảnh. Lượt gọi harness đầu tiên dừng ở
guard vì có ViezanNativeQt đang chạy; khoá application.lock của đúng hồ sơ preview
đang bị giữ độc quyền. Chưa sửa JSON hoặc mở lượt preview nào trong harness này.
Đã đề nghị người dùng thoát preview để chạy lần lượt Dịch/Từ điển/Phiên dịch,
mỗi route ít nhất 20 giây sau khi cửa sổ xuất hiện, rồi khôi phục JSON nguyên byte.

Không gộp kiểm source/offscreen với runtime GPU hoặc nghiệm thu ảnh.

## Chuỗi thêm/đổi

Thêm đúng một key mới `microphonePermissionHintWindows` vào vi/en/ja, sinh cả hai native.json bằng npm run resources. Không đổi chuỗi dùng chung đã có trong W2.

- vi: “Viezan cần quyền microphone để nghe. Cho phép ứng dụng desktop truy cập microphone trong Cài đặt hệ thống, rồi bấm Kiểm tra lại.”
- en: “Viezan needs microphone access to listen. Allow desktop apps to access the microphone in system Settings, then click Check again.”
- ja: “Viezanが音声を聞き取るにはマイクへのアクセスが必要です。システム設定でデスクトップアプリのマイクへのアクセスを許可し、再確認してください。”

Các thay đổi chuỗi W0/W1 có sẵn trong working tree không thuộc W2.

## Chênh lệch và đề xuất cần C++

- Không sửa C++ ngoài ba file đã duyệt. AudioCapture giữ lỗi tổng quát như mô tả trên.
- voiceList hiện lấy availableVoices của QTextToSpeech; voiceFor tìm theo ngôn ngữ. Lớp Nghe dùng voiceFor ở từng nguồn, không hiện raw voice ID. Với provider cloud chưa có tên hiển thị từ service, chỉ hiện tên provider; muốn thêm tên giọng cloud cần hợp đồng catalogue riêng, không tự đoán từ ID.
- So sánh giới hạn ba model là chênh lệch backend đã chấp nhận; không tăng giới hạn.
- So sánh chưa tô khác biệt từ như macOS. Thử nghiệm dùng nhóm Unicode P/S để bỏ dấu câu/ký hiệu gặp `SyntaxError: Invalid regular expression` trên QV4 Qt 6.8.3 (`w2-qrc-smoke.txt`: 3 passed, 1 failed, 65904ms); đã gỡ thử nghiệm khỏi mã cuối, giữ văn bản thuần. Đề xuất C++ ngoài phạm vi đã duyệt: API trả về các đoạn cần tô với phân loại Unicode của Qt, để QML chỉ trình bày; không tự thêm bảng Unicode hay thuật toán thay thế trong QML. Câu, thứ tự cột, retry/cancel, nhận bản dịch và assembly vẫn dùng backend hiện có. Chênh lệch này chưa được nghiệm thu ảnh.
- Viền pill tối W0/W1 và hạn chế #36 được xử lý/giữ như phần Nguồn.
- Chưa xác nhận pixel, IME thật, Narrator hay DPI; dành cho nghiệm thu tiếp theo.

## Bài học crash Qt 6.8.3 và rà inline component

W0 đã khoanh vùng Loader/sourceComponent lồng trong inline component được import:
hai mặt kính tránh lỗi bằng MultiEffect khai báo trực tiếp, giữ nguồn GPU ổn định.
Xem báo cáo W0, mục chẩn đoán GPU. W2 không khôi phục mẫu Loader đó.

W2 tái hiện crash ở QQmlObjectCreator::createInstance khi ListView/Repeater tạo
delegate bên trong imported inline component, kể cả không dùng Loader. Đã tái
hiện riêng ở LanguageButton và ListenButton (`w2-language-load.txt`,
`w2-listen-load.txt`); tách thành file QML độc lập thì nạp được. Vì vậy không chỉ
kiểm Loader: component có view/delegate động cần đặt trong file QML riêng khi
dùng xuyên file. Không suy rộng rằng mọi Repeater hoặc inline component đều lỗi.

Claude đã duyệt thêm đúng `qml/LanguageButton.qml` và `qml/ListenButton.qml` vào
NATIVE_RESOURCES. Đã áp dụng, không đổi dependency, linking, target hay C++ khác.

Thay đổi đã áp dụng, ngay trước qt_add_resources:

```cmake
list(APPEND NATIVE_RESOURCES
    qml/LanguageButton.qml
    qml/ListenButton.qml)
```

Rà 29 file .qml, 57 khai báo inline component bằng tìm kiếm và đối chiếu phạm vi
ngoặc/điểm dùng; log đầy đủ `.native-build/w2-inline-audit.txt`:

| File | Kết quả |
| --- | --- |
| Kit.qml | Các inline component dùng xuyên file không chứa Loader/ListView/Repeater. AnchoredPanel chỉ quản lý khung/vị trí; nội dung danh sách được khai báo ở file sử dụng. |
| Main.qml | ImageControls (Repeater 624/700/726), AudioControls (834), AttachmentChips (860/871), HistoryList (ListView gốc) dùng nội bộ Main; không có tham chiếu Main.TênComponent từ file khác. Loader của workspace nằm ngoài inline component. |
| HomeWorkspace.qml | GlassRecent (170/177), RunningSection (235), RecentSection (272/284), QuickStartSection (322), LayeredQuickStart (357) có Repeater nhưng chỉ dùng nội bộ HomeWorkspace. Loader ở gốc file, ngoài inline component. |
| PrimaryNavigation.qml | NavigationContent, NavigationBackground, NavItem không chứa ba loại động trên; dùng nội bộ. |
| SettingsWorkspace.qml | Description không chứa ba loại động; Loader của phần Settings nằm ngoài inline component. |
| ThermalWorkspace.qml | MetricTile không chứa ba loại động; các Repeater ở ngoài định nghĩa inline. |
| 23 file còn lại | Không khai báo inline component. LanguageButton/ListenButton là hai component file độc lập. |

Không còn mẫu tự khai báo Loader/ListView/Repeater trong imported inline component
ở qml/. Đây là rà cấu trúc mã nguồn, được bổ sung bằng QtTest/qrc/GPU và app thật;
không coi rà tĩnh là bằng chứng mọi nhánh runtime đã được mở.

## Chẩn đoán lỗi lưu featureLeft

Chẩn đoán ngày 2026-11-08, theo yêu cầu chỉ đọc mã nguồn. **Đã xác định nguyên
nhân và kiểm chứng bản sửa trên bản sao tạm; chưa sửa mã ứng dụng hoặc test.**
Không mở app với hồ sơ preview thật, không đọc/ghi hồ sơ đó, không chạy bộ QtTest
đầy đủ, không commit/push. Mọi chương trình, bản sao nguồn có trace, bản sao JSON
và log nằm trong `.native-build/featureLeft-diagnostic/` (được Git bỏ qua).
Phần Nghiệm thu bằng ảnh của Claude được giữ nguyên byte.

### Nguyên nhân chính xác

Lỗi nằm ở **vòng đời file đọc trong WorkbenchBridge::reload**, không phải dữ liệu
thời gian hoặc validate. Trình tự với `repro-featureLeft.json`:

1. `WorkbenchBridge.cpp:131–135` mở `QFile file(m_file)` ReadOnly, đọc và parse JSON.
   Biến `file` nằm trong scope toàn hàm `reload`, vẫn mở đến cuối hàm.
2. `WorkbenchDomain::recover` (`:276–303`) và `validate` đều thành công. Không có
   nhánh `return false` nào của validate bị đi qua trong probe đã gắn trace.
3. `WorkbenchBridge.cpp:142` gọi `command("launch")` trước khi `file` bị huỷ.
   Bridge đóng dấu `_updated = currentMSecsSinceEpoch() / 1000.0` (`:209`);
   `clock()` (`WorkbenchDomain.cpp:66`) trả double hữu hạn, dương.
4. `applySmartReset` (`WorkbenchDomain.cpp:309–317`) thấy feature hiện tại là
   `translate` và có mốc tương ứng. Dòng 314 **xoá `featureLeft.translate` trước
   khi kiểm output trống hoặc đủ thời gian nghỉ hay chưa**. Cả ba phiên vẫn trống,
   không tạo phiên mới; chỉ map `featureLeft` thay đổi.
5. Vì state thay đổi, `command` gọi `save()` đồng bộ. Tại `WorkbenchBridge.cpp:191`,
   validate vẫn true; file đích là file thường, không phải symlink. `QSaveFile.open`
   thành công và ghi đủ 1011/1011 byte. **`QSaveFile.commit()` ở nhánh dòng 197
   thất bại: `QFileDevice::RenameError = 10`, `"Access is denied."`**. File đích vẫn
   bị chính `QFile` trong `reload()` giữ mở; bước thay thế file nguyên tử bị chặn
   trên Windows. `m_storageError` vì thế thành `storageError`.
6. Khi constructor/reload trả về, file đọc được huỷ. Gọi lại `bridge.save()` với
   chính state đó thì commit thành công, không cần sửa một giá trị JSON nào.

Giá trị thực trong file tái hiện là `chat = 1794072258.488`,
`dictionary = 1794072252.42`, `translate = 1794072480.952` (file là `.952`, khác
số làm tròn `.95` trong mô tả). Qt đọc chúng thành double; biểu diễn 17 chữ số
của giá trị cuối là `1794072480.9519999`, vẫn hữu hạn và hợp lệ. Sau launch còn
hai mốc chat/dictionary. Không có việc biến timestamp thành revision/count,
không có lỗi tràn int hay ép kiểu longlong trong đường này.

Vì sao cặp A/B cho kết quả khác: không có `featureLeft` thì launch không đổi state,
`command` thoát tại kiểm `state == m_state`, nên không lưu khi file đọc còn mở.
Chỉ đổi `feature` giữa Dịch và Từ điển không gây lỗi. Điều kiện kích hoạt là
smart reset đang bật (mặc định), feature hiện tại thuộc translate/dictionary,
map có mốc của chính feature đó và clock dương. Map chỉ có mốc màn khác, feature
chat, hoặc smartReset=false không kích hoạt lần lưu này. `navigate` (`:529`) và
`leave` (`:334`, được gọi khi shutdown) ghi các mốc hợp lệ do app sinh ra; chúng
là nguồn dữ liệu kích hoạt lỗi khi nạp lần sau, không tạo state sai schema.

### Bằng chứng tái hiện và đối chứng

Probe domain dùng bản sao có trace ở từng nhánh validate của working tree và
`git show HEAD:apps/desktop-qt/WorkbenchDomain.cpp`: cả hai file mẫu đều qua
parse → recover → launch → route → navigate → leave → ghi JSON → nạp lại.
Log `working-log.txt`, `head-log.txt` trong thư mục chẩn đoán.

Probe bridge đầu tiên liên kết các object đang dùng của executable QtTest đã
build, loại đúng object main test; dùng storageFile chỉ định trong thư mục tạm,
`automaticProvider=false`, QStandardPaths test mode với tên riêng
FeatureLeftDiagnostic. Nó tái hiện lỗi ngay trong constructor, trước khi nạp
QML. Không cần GPU, thao tác UI hoặc provider để gây lỗi.

Sau đó bản sao WorkbenchBridge có trace từng bước ghi cho kết quả nguyên văn
(`bridge-trace-log.txt`):

```text
reload read handle open before launch true
save.open true 0 "Unknown error"
save.write 1011 1011 0 "Unknown error"
save.commit false 10 "Access is denied."
"repro-featureLeft.json" after ctor blocked false error "storageError" valid true
save.open true 0 "Unknown error"
save.write 1011 1011 0 "Unknown error"
save.commit true 0 "Unknown error"
explicit save ""
```

`"Unknown error"` ở các bước thành công là chuỗi mặc định của Qt khi enum error
bằng 0 (NoError), không phải một lỗi ghi khác. Không đổi ACL hay quyền hồ sơ thật
để kiểm chứng. Đối chứng một dòng `file.close()` trên **bản sao tạm**
(`bridge-fixed-log.txt`):

```text
reload read handle open before launch false
save.open true 0 "Unknown error"
save.write 1011 1011 0 "Unknown error"
save.commit true 0 "Unknown error"
"repro-featureLeft.json" after ctor blocked false error "" valid true
```

Ma trận tạm có 13 ca: translate/dictionary với double thập phân
1794072480.952, int 1794072480, qlonglong 4294967296 (> INT32_MAX), double nguyên
4294967296.0; các đối chứng không có featureLeft, smartReset=false và chat.
Mỗi ca kiểm lưu → nạp lại → lưu, thêm mốc bằng command leave rồi reload lần nữa,
validate, giữ nguyên các mốc màn khác và việc bản ghi gốc không bị thay khi commit
thất bại. Không dùng mock lỗi ghi cho các ca này.

| Biến thể | Kết quả constructor | Tổng kết nguyên văn |
| --- | --- | --- |
| Working tree, kỳ vọng tái hiện lỗi | 8/13 ca có storageError; 5 đối chứng không có | `MATRIX rows= 13 failures= 0 expectBug= true` |
| Domain của HEAD + Bridge giống HEAD, kỳ vọng tái hiện lỗi | Cùng 8/13 ca lỗi | `MATRIX rows= 13 failures= 0 expectBug= true` |
| Bản sao tạm có file.close(), kỳ vọng hết lỗi | 0/13 ca lỗi, chu kỳ lưu/nạp/lưu đều đạt | `MATRIX rows= 13 failures= 0 expectBug= false` |

Log: `matrix-working-log.txt`, `matrix-head-log.txt`, `matrix-fixed-log.txt`.
`failures=0` ở hai dòng expectBug=true nghĩa là **tái hiện đúng lỗi mong đợi**,
không có nghĩa mã ứng dụng đã được sửa. Đây là chương trình chẩn đoán tạm, không
phải test mới đã thêm vào QtTest của repo. Không dựng toàn app HEAD: probe HEAD
thay module reducer bằng nguồn HEAD, Bridge liên quan không có diff với HEAD,
các service object khác tái dùng từ build hiện có.

### Có sẵn ở HEAD; đối chiếu Swift

HEAD đang xét: `4e40f50e0c97198a54c86651c486722dd5a65f3b`.
`git diff HEAD -- WorkbenchBridge.cpp` rỗng. Diff WorkbenchDomain chỉ là sửa W1
ở dòng 731–732: tránh ghi đè session sau navigate/smart reset. Command launch
đã return tại dòng 336, không đi qua hunk đó. Bởi vậy đây **không phải hồi quy
của working tree W1/W2**. `git blame` ghi nhận command launch trong reload và
logic tiêu thụ featureLeft đã có ở commit `49807bda`, ngày 2026-11-04; QFile với
scope toàn hàm reload có từ `8992fecf`, ngày 2026-10-27.

Swift chỉ được đọc, không chạy hay sửa. `Models.swift:196` khai báo
`featureLeft: [String: Double]?`; `WorkbenchStore.swift:30` dùng clock trả Double.
`FilePersistence.load()` (`Persistence.swift:11–17`) đọc bằng `Data(contentsOf:)`
và trả Workspace; `WorkbenchStore.init` gọi `reload()` xong mới gọi
`applySmartReset` (`WorkbenchStore.swift:64–66`). `applySmartReset` xoá cùng mốc
nhưng không gọi save lồng trong persistence.load. `FilePersistence.save`
(`Persistence.swift:19–33`) encode rồi ghi atomic trong lần gọi riêng. **Không
có cùng lỗi giữ QFile đọc qua lần atomic save trong đường Swift này**; đây là
kết luận từ mã nguồn, không phải nghiệm thu runtime macOS.

### Bản sửa nhỏ nhất đề xuất — chưa áp dụng tại lượt chẩn đoán

Cần sửa **C++ ngoài phạm vi quyền micro đã được duyệt trước đây**:
`apps/desktop-qt/WorkbenchBridge.cpp`, thêm một dòng ngay sau dòng 135 để file
đọc đóng trước recover/emit changed/launch có thể dẫn tới lưu. Không cần đổi
validate, timestamp, QML, schema, CMake hoặc dependency; giữ QSaveFile và tính
nguyên tử, không bật direct-write fallback.

```diff
@@ WorkbenchBridge::reload()
         const auto parsed = QJsonDocument::fromJson(file.readAll(), &error);
+        file.close();
         const auto recovered = WorkbenchDomain::recover(parsed.toVariant().toMap());
```

QtTest đề xuất thêm cạnh `smartResetBridgePersistence` trong
`apps/desktop-qt/tests/WorkbenchBridgeTests.cpp:430`:

- Data rows cho feature hiện tại translate/dictionary; mốc double thập phân,
  int và qlonglong > 32-bit. Ghi fixture bằng QSaveFile và đóng writer trước khi
  tạo bridge; map có đủ ba mốc, cả phiên trống và phiên có output đã hoàn tất.
- Ngay sau constructor, **trước mọi command hoặc save bổ sung**, assert
  !loadBlocked, validate(state), storageError rỗng; đọc file đã lưu và kiểm mốc
  hiện tại đã được tiêu thụ, các mốc khác và session/active giữ đúng quy tắc.
- command leave để app tự tạo mốc mới → save → reload → kiểm storageError ngay
  sau reload → save → tạo bridge thứ hai. Kiểm dữ liệu đọc lại và validate ở
  từng bước. Lặp với smartReset=false/không có mốc làm đối chứng; lỗi file thật
  (ví dụ read-only) vẫn phải báo storageError, không được che lỗi.

Test hiện có ở dòng 431–450 tạo state bằng create(), nên feature ban đầu là chat;
featureLeft chỉ chứa mốc translate/dictionary. Constructor không lưu. Test chỉ gọi
navigate sau khi constructor trả về, lúc đó QFile đã đóng; lần reload tiếp theo
thì mốc feature đã tiêu thụ. Vì vậy các test đó xanh nhưng không phủ đường lưu
ngay trong reload. Gọi save rồi mới kiểm storageError cũng sẽ che mất lỗi này.

Kiểm bảo toàn: SHA-256 của 194 file nguồn trong desktop-qt, ViezanDomain và
resources/locales không đổi trong lượt chẩn đoán. Chỉ bổ sung mục báo cáo này;
phần Nghiệm thu bằng ảnh của Claude được so byte với bản chụp trước lượt và không
đổi. Tại lượt chẩn đoán, mã sửa đề xuất chỉ tồn tại ở bản sao trong thư mục build. Lượt W2e bên dưới đã áp dụng sau khi được duyệt.

## Lượt sửa cuối W2e

| Phần | Thay đổi | File |
| --- | --- | --- |
| Ngôn ngữ | Chip có nhãn Đầu vào/Đầu ra, tên ngôn ngữ và chevron; Phiên dịch đổi chiều bằng nút, vô hiệu khi đầu vào tự nhận dạng hoặc đang chạy. | qml/LanguageButton.qml, InterpretationWorkspace.qml |
| Dịch | Thẻ nguồn riêng theo FlatCard, bản dịch phẳng, khoảng cách pane theo board; gợi ý ở đầu pane; KeyCap Ctrl+Enter; bỏ đường dưới toolbar và đường chân kết quả khi rỗng. | qml/Main.qml, Kit.qml |
| Model | Dùng SessionModelPicker cho cả Dịch/Từ điển/Phiên dịch. Làm mới/chỉnh model nằm trong popup; lựa chọn Phiên dịch không đổi model phiên Dịch. Popup dùng mặt nổi W1, neo nút và báo cuộn khi tràn. | qml/SessionModelPicker.qml, InterpretationWorkspace.qml |
| Icon và disabled | Thêm hình ảnh dùng image.svg; Tổng hợp dùng reasoning.svg; header Tổng hợp disabled dùng nền/viền tĩnh theo token, không vẽ hiệu ứng kính gây hỏng mép. | qml/Main.qml, InterpretationWorkspace.qml |
| Test | Bổ sung persistence ngay sau constructor, nhãn/chevron, canh trên, KeyCap ở 1280, mặt nguồn/đường chân, popup model, đổi chiều và model Phiên dịch độc lập. | tests/WorkbenchBridgeTests.cpp |

Không thêm/đổi chuỗi ở lượt W2e: dùng lại inputLanguage/outputLanguage và các chuỗi có sẵn. Ctrl+Enter là ký hiệu phím Windows. Không sửa CMake, dependency, danh sách nguồn C++ hoặc hồ sơ preview. Giữ nguyên phần nghiệm thu ảnh của Claude theo byte.

### Lệnh treo và biện pháp giới hạn

Lượt bị mất kết nối không có Totals. Log `w2-final-repair-focused.txt` cho thấy bốn ca featureLeft đã PASS; ba ca layout báo FAIL do cảnh báo binding; log cuối dừng ở 820-dark. `w2-final-repair-focused2.txt` chỉ có PASS của bốn ca featureLeft. Claude đã dừng test treo 446 phút và build treo. Không tính hai lượt này là kiểm chứng thành công.

Đã sửa hai lỗi xác định được từ log: sourceSize.height đọc sourceSize.width của cùng grouped property gây binding loop; Binding dùng parent.background trỏ vào content item không có background, nay trỏ thẳng translationCard.background. Không có stack trace của tiến trình đã bị giết, nên **chưa xác định được nguyên nhân trực tiếp của lần treo 446 phút** và không đồng nhất cảnh báo binding với bằng chứng deadlock. Chạy lại riêng đúng ca 820-dark trên mã hiện tại, FluentWinUI3 offscreen, không cảnh báo QML:

```text
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 44975ms
```

Mọi test tiếp theo đặt QTEST_FUNCTION_TIMEOUT=600000, style rõ ràng và offscreen (riêng GPU bỏ offscreen). Script tạm `.native-build/w2-run-bounded.ps1` dùng Start-Process Hidden + WaitForExit có hạn cho build/offscreen; riêng GPU dùng Normal để cửa sổ probe được expose; hết hạn dừng đúng cây tiến trình đã khởi tạo. CTest có --timeout 5400. Không đọc log hay thăm dò tiến trình giữa bộ test; chỉ đọc kết quả sau khi lệnh kết thúc.

### Kiểm chứng cuối W2e

Build Release cuối: PASS (`.native-build/w2e-final-build.txt.stdout`). Kiểm tập trung, FluentWinUI3 offscreen có fontdir, và kiểm riêng bàn phím sau bổ sung:

```text
Totals: 20 passed, 0 failed, 0 skipped, 0 blacklisted, 781518ms
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 73817ms
```

Fusion đầy đủ qua CTest, `QTEST_FUNCTION_TIMEOUT=600000`, `--timeout 5400`, fontdir `C:/Windows/Fonts`:

```text
Totals: 206 passed, 0 failed, 1 skipped, 0 blacklisted, 3330869ms
1/1 Test #1: native-qt-bridge .................   Passed  3331.08 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 3331.11 sec
```

Log `.native-build/w2e-final-fusion.txt`; skip duy nhất là GPU ở offscreen. Có 8 cảnh báo QUnifiedTimer::stopAnimationDriver trong glassImageResearchAndReset; không có lỗi QML/binding hoặc font.

FluentWinUI3 đầy đủ, chạy tuần tự sau Fusion, cùng fontdir, QTEST_FUNCTION_TIMEOUT và hạn 5400 giây:

```text
Totals: 206 passed, 0 failed, 1 skipped, 0 blacklisted, 3167816ms
```

Log `.native-build/w2e-final-fluent.txt`. Hai ca chat-library/translation-library PASS ngay trong bộ đầy đủ, không cần chạy lại. Skip duy nhất là GPU ở offscreen. Có 4 cảnh báo QUnifiedTimer::stopAnimationDriver; không có lỗi QML/binding hoặc font.

GPU `acceleratedGlassSurfacesSurviveAppearanceChanges`, FluentWinUI3, bỏ offscreen/QT_QUICK_BACKEND/QSG_RHI_BACKEND, giữ timeout. Lượt đầu dùng Hidden khiến qWaitForWindowExposed thất bại (`w2e-final-gpu.txt`); sửa wrapper tạm sang Normal cho riêng kiểm cửa sổ GPU, không đổi nguồn, rồi chạy lại:

```text
Totals: 2 passed, 1 failed, 0 skipped, 0 blacklisted, 5197ms
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 29557ms
```

Log đạt `.native-build/w2e-final-gpu-visible.txt` xác nhận `Creating QRhi with backend D3D11`, adapter NVIDIA RTX A1000 6GB Laptop GPU. Còn cảnh báo không tạo được pipeline-cache lock ngoài thư mục được phép; không crash, không lỗi QML. Không mở ViezanNativeQt hoặc hồ sơ preview.

Hash tất cả nguồn Qt và CMake trước/sau hai bộ đầy đủ trùng nhau (`w2e-final-source-hashes.json`). `git diff --check` PASS; chỉ có nhắc CRLF ở hai native.json mang theo. Không sửa danh sách nguồn C++ trong CMake. Phần Nghiệm thu bằng ảnh của Claude giữ nguyên byte. W2e không thêm Loader/ListView/Repeater trong định nghĩa inline component được import; danh sách model nằm trong tài liệu SessionModelPicker.qml. Không tái hiện lại lần treo cũ trong kiểm tập trung hoặc hai bộ đầy đủ có giới hạn thời gian.

App thật/ảnh không chạy ở lượt này theo yêu cầu; Claude nghiệm thu tiếp. Các đề xuất C++ ngoài lỗi lưu vẫn giữ ở mục Chênh lệch và đề xuất cần C++ (đặc biệt tô khác biệt từ trong So sánh).

## Nghiệm thu bằng ảnh


Claude kiểm ngày 2026-11-08 trên bản Release cuối của Codex, GPU D3D11,
FluentWinUI3 (mặc định app), hồ sơ preview (sao lưu trước, trả lại nguyên byte
sau). Ảnh trong [`glass2-win-W2/`](glass2-win-W2/). Rà diff: C++ quyền micro đúng
phạm vi người dùng duyệt; CMake chỉ thêm `qml/LanguageButton.qml`,
`qml/ListenButton.qml`; không thấy `sort` thiếu khoá phụ, màu literal hay mẫu
crash inline component; "Xoá" thống nhất.

App thật nạp Dịch, Từ điển, Phiên dịch ở 1280×800 sáng/tối và 820×640, không
crash, không lỗi QML hiện ra (bước Codex chưa làm vì hồ sơ đang bị khoá).

### Lỗi chặn: không lưu được khi hồ sơ có `featureLeft`

[storage-error-featureLeft](glass2-win-W2/storage-error-featureLeft.png): mọi màn
hiện băng "Chưa thể lưu thay đổi. Bản nháp vẫn còn trong bộ nhớ." (`storageError`)
khi hồ sơ preview có `featureLeft` — trường do chính app ghi khi chuyển giữa các
màn (Smart Reset). Tái hiện: hồ sơ không có `featureLeft` → không có băng; cùng hồ
sơ đó cộng `featureLeft` (`{"chat":…, "dictionary":…, "translate": <giây epoch>}`)
→ có băng ngay khi mở. Nạp vẫn qua `validate`; lỗi đến từ lần lưu
(`WorkbenchBridge.cpp:191` hoặc `:197`). Chưa xác định là hồi quy W1/W2 hay lỗi có
sẵn; người dùng thật chỉ cần chuyển màn một lần là gặp. Khi băng hiện, màn Dịch còn
ép cửa sổ rộng ≥1040, không co về 820. Cần sửa trước khi duyệt W2; nếu cần C++
thì hỏi người dùng. File tái hiện được giữ ngoài repo (thư mục tạm của Claude).

### Đối chiếu board (ảnh từ hồ sơ không có `featureLeft`)

| Ảnh | Board | Kết quả |
| --- | --- | --- |
| [translate-1280-light](glass2-win-W2/translate-1280-light.png), [dark](glass2-win-W2/translate-1280-dark.png) | Translate | Chưa đạt: chip ngôn ngữ thiếu nhãn "Đầu vào"/"Đầu ra" và chevron; thêm nút làm mới model cạnh chip model; hai pane nằm chung một thẻ trắng có vạch chia thay vì thẻ nguồn + mặt bản dịch phẳng; chữ gợi ý ("Nhập hoặc dán văn bản…", "Bản dịch sẽ xuất hiện ở đây") canh giữa theo chiều dọc thay vì ở đầu pane; nút "Dịch văn bản" thiếu gợi ý phím Ctrl+Enter; vạch chân trống ở pane bản dịch; vạch ngang dưới hàng công cụ không có trên board. Tối: viền pill sáng hơn board (chênh lệch mang theo). |
| [translate-820-light](glass2-win-W2/translate-820-light.png) | Translate-Compact | Bố cục xếp dọc đạt. Header thu icon: "Thêm hình ảnh" dùng icon "+" trùng với "Bản dịch mới" — phải là icon ảnh như board. |
| [dictionary-1280-light](glass2-win-W2/dictionary-1280-light.png), [dark](glass2-win-W2/dictionary-1280-dark.png), [820](glass2-win-W2/dictionary-820-light.png) | Dictionary-Empty | Bố cục đạt (tiêu đề, ô tra, gợi ý 120 ký tự; không có dữ liệu nên không có cột gần đây/đã lưu). Chip ngôn ngữ cùng lỗi thiếu "Đầu vào/Đầu ra". Bỏ phím ngữ cảnh/dán-tra là quyết định Đợt 9 đã chấp nhận. |
| [interpret-1280-light](glass2-win-W2/interpret-1280-light.png), [dark](glass2-win-W2/interpret-1280-dark.png), [820](glass2-win-W2/interpret-820-light.png) | Interpret, Interpret-States | Trạng thái sẵn sàng đạt bố cục. Chưa đạt: chip ngôn ngữ thiếu nhãn/chevron và dùng "→" thay nút đổi chiều; thiếu chip model; "Tổng hợp nội dung" dùng icon "+" thay icon tổng hợp ✦; ở 820 pill "Tổng hợp" bị vô hiệu vẽ thiếu nửa trái. |

**NOT RUN:** lớp Nghe, chọn ngôn ngữ (Overlays-Language), lớp nổi Phiên dịch, các
trạng thái cần AI hoặc micro thật (bản dịch, So sánh, mục từ, đang nghe, tổng hợp,
thẻ quyền micro khi Windows từ chối), 150 % DPI, Narrator. Đã có QtTest cho các
trạng thái này.

## Nghiệm thu GPU sau commit (Claude, 2026-11-08 12:50)

App thật, Direct3D 11, màn hình mở khoá, 100 % DPI. Exe dựng từ commit W2 cộng các file W3
đang làm dở (W3 không sửa Dịch, Từ điển, Phiên dịch). Ảnh trong `glass2-win-W2/*-final.png`.

| Màn | Ảnh | Kết luận |
|---|---|---|
| Dịch 1280 sáng/tối | `translate-1280-{light,dark}-final.png` | Khớp board Translate: chip Đầu vào/Đầu ra có mũi tên, nút đảo, chip model, thẻ nguồn riêng, placeholder ở đầu, keycap Ctrl+Enter, không có nút làm mới model. Nút Dịch disabled khi trống. |
| Từ điển 1280 sáng/tối | `dictionary-1280-{light,dark}-final.png` | Khớp Dictionary-Empty. |
| Phiên dịch 1280 sáng/tối | `interpret-1280-{light,dark}-final.png` | Khớp Interpret: chip model, "Tổng hợp nội dung" có ✦ và disabled khi chưa có bản ghi. |
| Dịch 820 sáng | `translate-820-light-final.png` | Bố cục một cột đúng. Chênh lệch so với Translate-Compact: chip model xuống dòng hai (board thu gọn chip ngôn ngữ và chuyển model thành nút biểu tượng), thẻ Bản dịch chưa có nền và chân riêng. Board `*-Compact` thuộc W5, nên chuyển sang W5. |

Còn mang theo: viền pill ở chế độ tối sáng hơn board; 150 % DPI, Narrator và các lớp nổi
đã liệt kê ở trên vẫn NOT RUN.
