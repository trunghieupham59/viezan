# Liquid Glass 2.0 · Windows W4 — Cài đặt

Ngày: 2026-11-08 (Asia/Saigon). Worktree `D:/PPP/viezan-wt-w4`, nhánh
`feat/qt-glass2-w4`. Không commit/push, không cài dependency, không thao tác
worktree W3 `D:/PPP/viezan`.

Trạng thái: triển khai W4 và kiểm chứng tự động hoàn tất; nghiệm thu sống
chưa thực hiện, do Claude tiếp nhận sau.

## Nguồn và phạm vi

Đã đọc AGENTS.md, `.claude/rules/ui-ux.md`, CONTRIBUTING, design direction,
spec Settings, WINDOWS-HANDOFF mục 4/W4 và HANDOFF mục 2–5. Đối chiếu HTML và
PNG của Settings-General, Settings-Appearance, Settings-Models, Settings-Local,
Settings-Speech, Settings-Modules, Settings-Data, Settings-Update, Settings-About
và Overlays-Settings; mã SwiftUI tương ứng và báo cáo macOS Đợt 5, Qt W1/W2.

Capability: native-migration agent/workflow/rules, viezan-product-engineering,
viezan-native-migration, viezan-native-ux và UI UX Pro Max trong repo. Tra cứu
`keyboard focus modal --domain ux`: áp dụng Focus States (All); giữ focus native
và đưa hàng bàn phím vào vùng nhìn thấy. Kết quả Web Focus Not Obscured chỉ là
hướng dẫn; không dùng CSS/web làm chứng cứ Qt.

Không sửa C++ bridge/dịch vụ, DesktopSettings, DesktopWorkspace,
ApplicationsWorkspace, ThermalWorkspace, DesktopPanels hoặc Kit.qml.
Main.qml chỉ nối ô tìm ở header (neo, Return/Enter/Down có kiểm IME) và toast
vào SettingsWorkspace. CMake chỉ thêm một `list(APPEND NATIVE_RESOURCES ...)`
ngay sau khối LanguageButton/ListenButton. Test mới nằm trong khối
`// ---- W4 Settings ----`, khai báo cuối slots, thân cuối file.

## Thay đổi

| Mục | Triển khai |
| --- | --- |
| Khung Cài đặt | Cột mục Glass 292, hai nhóm, nhãn chọn trung tính/lens, ghi chú ở chân; dưới 760 dùng picker. Một mục đang đọc; kết quả tìm nổi dưới ô header, tìm bỏ dấu theo danh mục hiện có. |
| Chung | Giữ hàng phím tắt dẫn sang utilities; nối `smartReset`, giữ autoTranslate và thời gian chờ. |
| Giao diện | Picker dùng lớp nổi; mode/cỡ chữ giữ segmented group; preset/mode/accent tiếp tục độc lập. |
| Nhà cung cấp | Chia Cloud / Tìm kiếm và giọng nói; sửa khoá nội tuyến theo từng hãng, ô Password, xoá có xác nhận theo hãng; giữ kho bảo mật và trạng thái discovery. |
| Model local | Thẻ runtime, CPU/bộ nhớ thật, cấu hình song song/context; gợi ý từ `resources.localModelSuggestions`, trạng thái chờ runtime/đã tải; giữ tải model khác, huỷ, đo hiệu năng và kết quả. Tên lấy từ gợi ý nếu khớp, còn lại qua `shortModelName`. |
| Giọng nói | Tách nhận dạng/đọc; chọn nhà cung cấp áp dụng ngay, giọng hệ thống nhóm ngôn ngữ với tie-break index, tốc độ theo `rateSupported`, nghe thử và quản lý khoá. |
| Module | Hai nhóm, mô tả, khoá công tắc workspace cuối cùng theo cùng điều kiện backend. |
| Dữ liệu | Thẻ Lịch sử / Sử dụng / Sao lưu; dọn và xoá toàn bộ là hai hành động riêng. Xác nhận xoá đọc `clearableHistoryCount`; chặn lúc task chạy, Phiên dịch bận, backup hoặc loadBlocked, kiểm lại trước khi thực thi. Giữ preview nhập và lựa chọn khôi phục settings. |
| Cập nhật | Công tắc `autoCheckUpdates`, trạng thái đang kiểm/đang tải, `packageSize`, `checkedAt`, `remainingSeconds` (ẩn khi −1); giữ kiểm/tải/huỷ/mở bộ cài. |
| Giới thiệu | Brand, phiên bản thật, mã nguồn, giấy phép MIT, phạm vi native và dữ liệu riêng trên thiết bị. |
| Lớp nổi | SettingsPicker, SettingsConfirm và SettingsDangerButton độc lập; không thêm Loader/delegate trong imported inline component. Picker có cuộn hiện khi tràn, lựa chọn bằng bàn phím, Escape và trả focus; dialog giữa cửa sổ, nút xác nhận destructive. |
| Chuỗi | Sau review Claude: bỏ toàn bộ khoá `w4*`, dùng lại 7 khoá có sẵn và giữ 6 khoá mới theo khái niệm; xác nhận một câu có placeholder trong EN/VI/JA, mô tả dùng chung các nền tảng; sinh lại hai native.json. |

## Chênh lệch so với board và giới hạn

- Kính là vật liệu trong scene Qt, không blur desktop Windows. Token thắng giá trị literal của board.
- Không giả lập hàng quyền ghi màn hình/trợ năng, đăng nhập hoặc chẩn đoán riêng của macOS. Hàng global shortcuts vẫn dẫn tới trang sở hữu chức năng.
- Tìm kiếm trả mục theo tên/mô tả/terms như macOS Đợt 5; chưa có chỉ mục từng hàng, cuộn/nháy hàng. Breadcrumb vẫn do shell sở hữu, chưa thêm tên mục.
- Picker preset/accent chưa có swatch/mô tả; dùng lựa chọn chữ như bản macOS đã bàn giao. Giọng hệ thống không có giới tính; Edge/ElevenLabs giữ trường ID vì C++ chưa công bố danh mục giọng tương ứng.
- Logo nhà cung cấp là backend gap #20; không tự thêm logo hoặc dữ liệu xác minh giả.
- Xoá model không tuyên bố tự đổi mọi phiên sang model mặc định; giữ hành vi dịch vụ hiện có. Bytes tải model chi tiết vẫn là gap #62, chỉ hiện progress có sẵn.
- Nhắc cập nhật sau 24 giờ/hộp tự hiện thuộc W5. W4 giữ trang cập nhật, không tự tải/cài.
- README/spec không sửa ngoài phạm vi file đã giao; phần hiện trạng Qt và các chênh lệch được ghi tại báo cáo này để điều phối đồng bộ sau khi gộp.

## Chuỗi — sửa sau review Claude

Phạm vi lượt sửa này chỉ gồm định danh/nội dung locale và tham chiếu chuỗi
trong ProviderSettings, LocalModelSettings, ModuleSettings, AboutSettings,
hai bundle sinh tự động và báo cáo. Không sửa Swift, C++ hoặc hành vi QML.

| Khoá cũ | Khoá dùng sau review | Đối chiếu |
| --- | --- | --- |
| `w4Cloud` | `providerGroupCloud` | Có sẵn, macOS ProviderSettings dùng cho nhóm Cloud. |
| `w4SearchVoice` | `providerGroupSearchVoice` | Có sẵn, cùng nhóm tìm kiếm/giọng nói trên macOS. |
| `w4ReplaceKey` | `replaceKey` | Có sẵn, macOS dùng cho nút thay khoá. |
| `w4GetKey` | `getKey` | Có sẵn; dấu ↗ là ký hiệu trình bày tại nút Qt. |
| `w4ThisDevice` | `thisDevice` | Có sẵn; đổi EN “This Mac” → “This device”, JA “このMac” → “このデバイス” để dùng chung ba nền tảng. |
| `w4StartMeasurement` | `start` | Có sẵn, macOS LocalModelSettings dùng trong xác nhận đo hiệu năng. |
| `w4AppsModuleHint` | `moduleDesc_apps` | Có sẵn, macOS NativeSettings dùng; mô tả chung “Quản lý và gỡ ứng dụng” / “Manage and uninstall apps” / “アプリの管理とアンインストール”, không hứa kế hoạch xem trước hoặc reset trên Windows/Linux. |
| `w4DeleteKeyConfirm` | `deleteNamedKeyConfirm` | Mẫu mới một câu có `{name}`, cho đối tượng được nêu tên. |
| `w4DeleteModelConfirm` | `deleteNamedModelConfirm` | Mẫu mới một câu có `{name}`, cho đối tượng được nêu tên. |
| `w4DeviceProcessors` | `deviceProcessors` | Không có mẫu tương đương; macOS hiện ghép số CPU trực tiếp. |
| `w4DeviceMemory` | `deviceMemory` | Không có mẫu tương đương; macOS hiện dùng ByteCountFormatter. |
| `w4Performance` | `runtimePerformanceSummary` | Không có mẫu tương đương; macOS trình bày từng cột hiệu năng. |
| `w4License` | `license` | Không có khoá giấy phép tương đương trong locale hoặc màn Settings macOS. |

Đã kiểm tất cả lời gọi `deleteKeyConfirm` (3) và `deleteModelConfirm` (2)
trong macOS: đều dùng `store.text(...)` không thay `{name}`; tên đối tượng
được truyền riêng hoặc quản lý bằng state. Vì vậy giữ nguyên hai câu tổng
quát đó, không thêm placeholder làm lộ tham số trên macOS. Hai khoá
`deleteNamed*Confirm` phân biệt mẫu có tên đối tượng, không gắn bước W4.

Ví dụ VI sau sửa:

- `deleteNamedKeyConfirm`: “Xoá khoá của {name} và ngừng dùng nhà cung cấp này cho đến khi thêm khoá mới?”
- `deleteNamedModelConfirm`: “Xoá model {name} khỏi máy và tải lại model nếu cần dùng lại?”

Đã chạy lại `npm run resources`, `npm run check:resources` và build Release:
đạt. Kiểm nguồn cả ba locale: không còn khoá tiền tố `w4`, tất cả 13 ánh xạ
đều tồn tại, placeholder đồng nhất, mỗi xác nhận có đúng một câu và một
`{name}`, mọi khoá literal trong bốn QML đều có bản dịch; hai bundle
byte-identical. Không thay đổi khoá khác ngoài danh sách và hai mô tả dùng chung.

Resource-generation tests (`node --test --test-timeout=120000
scripts/native/__tests__/generate-resources.test.mjs`, timeout tiến trình 180 giây):

```text
ℹ tests 2
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 2907.9311
```

Skip symlink vẫn do Windows cần developer mode/elevation; không cài gói
hoặc đổi cấu hình máy. Log `.native-build/w4-copy-resource-tests.stdout`.

Kiểm Qt sau sửa chuỗi chạy tuần tự Fusion → FluentWinUI3 trên cùng bản dựng
Release. Danh sách hàm tường minh: `w4SettingsPages`,
`w4SettingsPickerKeyboard`, `w4HistoryConfirmation`, `w4UpdateMetadata`,
`w4SettingsSearchIme`, `settingsLayoutAndSearch`. Bao gồm bốn cấu hình W4
và sáu cấu hình locale/search VI/EN/JA × wide/640. Không gọi bài GPU.
Mỗi lượt có `QT_QPA_PLATFORM=offscreen`, `QT_QUICK_BACKEND=software`,
`QTEST_FUNCTION_TIMEOUT=600000`, `QT_QUICK_CONTROLS_STYLE` rõ ràng;
timeout tiến trình 5400 giây qua wrapper đã dùng ở trên.

Fusion (`.native-build/w4-copy-fusion.txt`):

```text
Totals: 16 passed, 0 failed, 0 skipped, 0 blacklisted, 168088ms
```

FluentWinUI3 (`.native-build/w4-copy-fluent.txt`):

```text
Totals: 16 passed, 0 failed, 0 skipped, 0 blacklisted, 147243ms
```

Cả hai log không có QWARN/FAIL/SKIP. Build log:
`.native-build/w4-copy-build.stdout`. Kiểm hash của bốn QML, ba locale và
hai bundle sau cả hai lượt:

```text
Copy-review source hash check: 9 files; changed: []
```

`git diff --check` đạt. Không chạy lại toàn suite/backend, không thêm test
nguồn vì chỉ sửa chuỗi/tên khoá; dùng các ca W4 và locale/search hiện có cùng
kiểm nguồn placeholder/khoá và test generator. Không mở app thật, không chụp
ảnh, không chạy macOS runtime; các mục nghiệm thu sống ở cuối vẫn giữ nguyên.

## Kiểm chứng trước review chuỗi

Các tổng kết đầy đủ bên dưới thuộc bản trước lượt đổi tên khoá/nội dung
ở mục Chuỗi phía trên; lượt sau review chỉ chạy lại ca W4 và ca locale/search
liên quan theo yêu cầu, không chạy lại toàn suite.

Windows 11, Qt 6.8.3 MSVC x64 `D:/Qt/6.8.3/msvc2022_64`, generator
Visual Studio 17 2022, Release, build riêng `.native-build/qt`.
`node_modules` không có; `npm run resources` dùng Node built-in và đã chạy được,
không cài gói. Hai bundle sinh cùng nguồn.

Lệnh build/test chạy qua `.native-build/w4-bounded.ps1` (Start-Process Hidden,
WaitForExit có hạn; hai bộ cuối kết thúc trước timeout). Test đặt
`QT_QPA_PLATFORM=offscreen`, `QT_QPA_FONTDIR=C:/Windows/Fonts`,
`QT_QUICK_BACKEND=software`, `QTEST_FUNCTION_TIMEOUT=600000`, style rõ ràng.
Bộ cuối dùng timeout 5400 giây; Fusion/CTest trước, FluentWinUI3 sau.

### Nền trước khi áp dụng mã

Cấu hình và build Release đạt. Kiểm nền tập trung Settings layout/search và
Smart Reset persistence, Fusion (`.native-build/w4-baseline-tests.txt`):

```text
Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 76137ms
```

Không chạy lại toàn bộ baseline trước sửa; hai bộ đầy đủ được dành cho mã cuối.

### Trong triển khai

Build đầu phát hiện dấu chấm phẩy thừa giữa hai object QML ở AboutSettings;
đã sửa. MSBuild báo MSB3491 với `.lastbuildstate` của qmlimportscan. File không
read-only, ghi lại cùng bytes từ tiến trình hiện tại thành công. Build đạt khi
đặt `MSBUILDDISABLENODEREUSE=1`, `--parallel 1 -- /nodeReuse:false`; không sửa
ACL hoặc xoá build. Đây là biện pháp đã kiểm được, chưa kết luận nguyên nhân
của node MSBuild cũ. Log `w4-build-1/2/3/4.stdout` trong `.native-build/`.

Các lượt tập trung FluentWinUI3 (log `.native-build/w4-focused-1.txt`,
`w4-focused-2.txt`, `w4-focused-3.txt`, `w4-confirm-4.txt`):

```text
Totals: 15 passed, 2 failed, 0 skipped, 0 blacklisted, 175007ms
Totals: 3 passed, 1 failed, 0 skipped, 0 blacklisted, 24241ms
Totals: 3 passed, 1 failed, 0 skipped, 0 blacklisted, 6414ms
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 4691ms
```

Lượt đầu: chín trang/locale/size, metadata cập nhật và các ca tìm kiếm/IME cũ
PASS; picker/header nhóm bị loop do gán height từ implicitHeight, test geometry
đọc quá sớm trước expose. Đã bỏ gán height, dùng Popup.Item và đợi offscreen
window expose. Lượt sau: payload huỷ của test mới dùng sai sessionID, đã sửa
thành taskID; Fluent Dialog implicitHeight cần tính trực tiếp từ nhãn/thông điệp/
footer và padding, bỏ insets native âm. Ca cuối xác nhận Escape không đổi dữ
liệu, chặn lúc task chạy, xác nhận xoá và chỉ phát accepted đúng một lần.
Không sửa test cũ hay C++ dịch vụ để làm xanh.

Kiểm tra cuối trước bộ đầy đủ: Return/Down nhường xử lý cho IME khi đang
composition; thêm ca search IME và kiểm công tắc auto-check cập nhật. Release
build đạt; FluentWinUI3 kiểm IME và bốn cấu hình trang (1280 sáng VI, 1280 tối
EN, 820 tối JA, 640 sáng VI):

```text
Totals: 7 passed, 0 failed, 0 skipped, 0 blacklisted, 107475ms
```

Log: `.native-build/w4-final-focused.txt` và `w4-final-build.stdout`.

### Kiểm nguồn và tài nguyên

```text
Native resources verified: 3 locales, 78 metrics.
vi: original keys unchanged; 13 new keys
en: original keys unchanged; 13 new keys
ja: original keys unchanged; 13 new keys
Both generated native bundles are byte-identical.
```

Domain + resource generation Node:

```text
ℹ tests 13
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 3167.7103
```

Skip: test symlink cần Windows developer mode/elevation; không bật hoặc xin quyền.
Python (`test_dev.py` chỉ cho macOS):

```text
Ran 7 tests in 0.000s
OK (skipped=7)
```

`npm run check:docs`:

```text
Native documentation references version 2.4.2; runtime acceptance is separate.
```

Kiểm tĩnh không có khoá dịch/icon literal bị thiếu; `git diff --check` không lỗi
whitespace, chỉ nhắc LF/CRLF. Source hash lưu tại
`.native-build/w4-final-source-hashes.json` để so sau hai bộ cuối.

### Hai bộ cuối

Fusion — CTest, loại GPU bằng danh sách hàm tường minh:

```text
Totals: 214 passed, 0 failed, 0 skipped, 0 blacklisted, 2826270ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 574ms

1/2 Test #1: native-qt-bridge .................   Passed  2826.44 sec
2/2 Test #2: native-qt-backend ................   Passed    0.62 sec

100% tests passed, 0 tests failed out of 2

Total Test time (real) = 2827.09 sec
```

Log: `.native-build/w4-final-fusion.txt`, `w4-final-fusion-backend.txt`,
`w4-final-fusion.stdout`. Tám cảnh báo `QUnifiedTimer::stopAnimationDriver:
driver is not running` xuất hiện ở tám dữ liệu của `glassImageResearchAndReset`;
không có cảnh báo trong các ca W4, không có FAIL/SKIP. Không coi đây là log
hoàn toàn không cảnh báo.

FluentWinUI3 — cùng danh sách 69 hàm, chạy executable Release sau khi Fusion
kết thúc; backend chạy kế tiếp, cùng style:

```text
Totals: 214 passed, 0 failed, 0 skipped, 0 blacklisted, 2414634ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 514ms
```

Log: `.native-build/w4-final-fluent.txt`, `w4-final-fluent-backend.txt`,
`w4-final-fluent.stdout`. Bốn cảnh báo cùng loại `QUnifiedTimer` ở
`glassImageResearchAndReset` (640-light, 820-light, 1200-dark, 1280-dark);
không có cảnh báo ở các ca W4, không có FAIL/SKIP. Không sửa phần W1 ngoài
phạm vi để loại cảnh báo.

Lệnh Fusion: `ctest --test-dir .native-build/qt -C Release
--output-on-failure --timeout 5400 -j 1`. CTestTestfile trong build được thay
arguments của executable Release bằng danh sách hàm từ `-functions`, loại
duy nhất `acceleratedGlassSurfacesSurviveAppearanceChanges`; bản gốc được
lưu riêng và khôi phục sau kiểm thử. FluentWinUI3 gọi `ViezanQtTests.exe`
trực tiếp với cùng danh sách, timeout tiến trình 5400 giây, rồi
`ViezanBackendTests.exe` với timeout 600 giây. Không sửa CMake test registration
trong nguồn để lọc GPU.

Đối chiếu sau cả hai bộ:

```text
Source hash check: 106 files; changed: []
```

Không thay đổi QML/C++/test/CMake/bundle Qt giữa các bộ cuối. Kiểm lại ba
locale vẫn chỉ thêm 13 khoá mỗi file, hai bundle byte-identical;
`git diff --check` đạt (chỉ nhắc LF/CRLF). Phạm vi git chỉ gồm các file W4,
Main.qml nối tìm kiếm/toast, CMake, test, locale/bundle và báo cáo này.

Script chuẩn bị danh sách loại GPU ban đầu đặt sai assertion >90 (executable
thực có 69 hàm), nên Python dừng nhưng PowerShell vẫn khởi chạy CTest mặc định.
Lượt Fusion đó vẫn luôn offscreen/software; không vào nhánh GPU có cửa sổ.
Lệnh `taskkill /T` bị từ chối; sau đó `Stop-Process` với PID được kiểm đúng
đường dẫn executable W4 đã dừng lượt này để bổ sung sửa IME. Không dừng hay
sửa tiến trình W3. Log ghi GPU SKIP do software backend; không lấy lần khởi
chạy là bằng chứng GPU. Lượt gián đoạn kết thúc sau 654.98 giây, CTest báo
50% (bridge bị dừng, backend PASS), không có Qt Totals; không tính là bộ đạt.
Log giữ tại `.native-build/w4-interrupted-*`.
Đã sửa script kiểm exit code. Sau khi thêm ca IME, executable có 70 hàm;
danh sách cuối chọn đủ 69 hàm ngoài acceleratedGlass… cho cả hai style.
Chỉ chỉnh CTestTestfile trong thư mục build để lọc, không đổi đăng ký test ở nguồn.


## Nghiệm thu sống

- Ảnh 1280×800, 820×640 sáng/tối: **Claude nghiệm thu sau**.
- Narrator, bàn phím/IME trong app thật: **Claude nghiệm thu sau**.
- 150 % DPI: **Claude nghiệm thu sau**.
- GPU `acceleratedGlassSurfacesSurviveAppearanceChanges`: **Not run — Claude nghiệm thu sau**, theo yêu cầu không mở cửa sổ trên màn hình đang dùng.
- Provider thật, micro/loa thật, tải/gỡ model, đo máy, tải/cài cập nhật và nhập/xoá dữ liệu cá nhân: **Not run**; test dùng fixture, không thay cho nghiệm thu dịch vụ thật.
- Linux/macOS runtime và release: **Not run**, ngoài phạm vi W4 Windows.
