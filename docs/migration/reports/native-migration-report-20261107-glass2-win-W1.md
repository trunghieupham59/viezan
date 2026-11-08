# Liquid Glass 2.0 · Windows W1: Chat, lớp nổi và Thư viện lịch sử

Ngày kiểm: 2026-11-07 (Asia/Saigon). Báo cáo này tiếp nối W0 đã được người dùng
duyệt; các sửa W0 còn trong working tree được giữ nguyên. Chưa commit.

**Trạng thái: hoàn tất bốn sửa về thứ tự palette, cuộn, tooltip/focus và
kiểm sáng/tối; chờ Claude nghiệm thu ảnh mới.** Bản cuối: build PASS,
Fusion đầy đủ 186 PASS / 0 FAIL / 1 SKIP; Fluent đầy đủ 184 PASS / 2 FAIL font
đã biết / 1 SKIP, hai ca font chạy lại đều PASS; GPU D3D11 9 PASS. App preview
chạy thêm 20,023 s sau khi cửa sổ xuất hiện, không crash.

Claude đã xác nhận đạt Hoạt động ôm nội dung, Nav-Overlay một mặt, tên hãng
model, thư viện trống/chưa chọn, nút Lưu trữ, rim disabled tối và chữ “Xoá”.
Vòng này chỉ sửa Main.qml, SessionModelPicker.qml, QtTest và báo cáo; không
sửa C++ dịch vụ, chuỗi hay tài nguyên. Các kết quả 184/182 PASS và GPU 8 PASS
ở mục lịch sử thuộc vòng sửa 12 điểm trước đó. Giữ nguyên phần ảnh của Claude;
không chụp ảnh, không commit/push.

Lượt trước đã dừng đúng giới hạn C++ khi phát hiện snapshot không hợp lệ.
Người dùng xác nhận phân tích và duyệt riêng việc loại `navigate` khỏi bước
ghi lại `item`; đã thực hiện đúng phạm vi đó, không mở rộng sang C++ khác.

## Điều kiện máy và phạm vi

- Windows 11, Qt 6.8.3 MSVC x64 tại `D:/Qt/6.8.3/msvc2022_64`, VS 17 2022,
  Release, dùng cấu hình `.native-build/qt` có sẵn. Thêm Qt `bin` vào PATH
  của tiến trình kiểm; không cài phụ thuộc, không sửa CMake.
- QtTest dùng bridge với kho `QTemporaryDir`, không chạy provider thật.
  Fusion/CTest và FluentWinUI3/offscreen chạy tuần tự. Test offscreen dùng
  software; chỉ test GPU trên QPA Windows xác nhận nhánh accelerated.
- Chỉ sửa QML, SVG, QtTest, chuỗi trong ba locale và hai bundle qua
  `npm run resources`; thêm đúng bản sửa Smart Reset trong `WorkbenchDomain.cpp`
  đã được người dùng duyệt. Không sửa C++ khác, Swift, helper, schema, route
  hay tổ hợp phím tắt đang có. Báo cáo này là tài liệu đã được yêu cầu.
- Không đọc/sửa `.claude/settings.local.json`, không commit/push. Không chụp
  ảnh; phần nghiệm thu bằng ảnh dành cho Claude. Không sử dụng dữ liệu cá nhân.

## Nguồn và quyết định áp dụng

Đã đọc `AGENTS.md`, `.claude/rules/ui-ux.md`, `.claude/rules/chat-state.md`,
`CONTRIBUTING.md`, `docs/design/direction.md`, các spec Shell/Home/Chat,
[WINDOWS-HANDOFF](../../design/glass2/WINDOWS-HANDOFF.md) mục 4 và W1 mục 5,
[HANDOFF](../../design/glass2/HANDOFF.md) mục 2–4 và Shell, Trang chủ, AI Chat,
Thư viện lịch sử. Đọc HTML và PNG của Chat-Empty, Chat-Active, Chat-Dark,
Chat-Compact, Chat-States, Overlays, History, History-Archived, History-States,
Shell-States, Nav-Overlay.

Tham chiếu mã macOS `apps/macos/Sources/ViezanNative`, báo cáo
[Đợt 2](native-migration-report-20261103-glass2-dot2.md), các quyết định liên quan
trong Đợt 3/7/8/9 và [W0](native-migration-report-20261106-glass2-win-W0.md).
Giữ các quyết định đã chấp nhận: reading column 760 theo token; composer
nhiều dòng radius 22; dải trạng thái dùng selectionOpacity 10%; nhãn bộ lọc
kho là “Lưu trữ”; nút Mở bị tắt trong kho; tên đầy đủ model ở trợ năng/tooltip.
Kính là scene Qt, không phải vật liệu xuyên xuống desktop Windows.

Capability đã resolve: native-migration agent/workflow/rule và
viezan-product-engineering; skill viezan-native-migration, viezan-native-ux,
UI UX Pro Max bản trong repo. Tra cứu `keyboard focus modal --domain ux`:
áp dụng Focus States (All), giữ focus native riêng với selection và tránh
che phần tử đang focus; không áp CSS/web hay kích thước mobile vào Qt.

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| Smart Reset (C++, được người dùng duyệt) | Loại navigate khỏi bước ghi lại item theo index cũ, tránh đè phiên vừa prepend. Navigate không sửa item; các phiên cũ giữ nguyên dữ liệu và thứ tự. Chỉ đổi điều kiện này và chú thích, không đổi C++ khác. | `apps/desktop-qt/WorkbenchDomain.cpp` |
| Kính tối | Giữ alpha sẵn trong material-highlight/material-border, bỏ việc ghi đè thành alpha sáng của light; bóng pane theo shadowRole. Giữ cấu trúc MultiEffect trực tiếp của W0, không lồng Loader/sourceComponent trong inline component import. | `qml/Kit.qml` |
| Chat trống/composer | Brand, câu mở đầu, tiếp tục phiên gần đây; một TextArea xuyên trạng thái và đổi preset; composer bo 26/22, nhóm công cụ 36, nút gửi/dừng; ảnh đính kèm; lựa chọn model rút gọn ở cửa sổ hẹp. | `qml/Main.qml` |
| Model | Panel tìm kiếm và nhóm từ modelSections; tier qua applyModelTier; tên qua shortModelName; mục gần đây do backend cung cấp; giữ ID chủ phiên, IME, ↑/↓/Enter, đóng khi đổi phiên, phục hồi focus. | `qml/SessionModelPicker.qml` |
| Công cụ/hướng dẫn | Panel chế độ Chat, đính kèm/chụp/OCR, suy luận kỹ, hướng dẫn và thư viện prompt; trạng thái native disabled; các panel và lớp shell loại trừ nhau. | `qml/Main.qml`, `qml/Kit.qml` |
| Chat đang chạy/kết quả | Bubble người dùng 75%, nhãn Viezan, đang trả lời, lỗi/huỷ/gián đoạn, metadata model/token/thời lượng, retry câu mới nhất bằng lệnh backend; thẻ nghiên cứu với tiến độ, nguồn và nội dung checkpoint; ảnh với kích thước/model/thời lượng, Sao chép ảnh, Lưu ảnh, Chỉnh sửa ảnh. | `qml/ChatTranscript.qml` |
| Thông báo | Provider rỗng/model không dùng được/imageKeyNotice theo thứ tự ưu tiên; resetNotice với mở lại/đóng; thời gian ghi âm từ recordingStarted; toast cho copy, xuất, đổi tên, lưu trữ, khôi phục, xoá, prompt. | `qml/Main.qml`, `qml/ChatTranscript.qml` |
| Lớp shell | Hoạt động gom các task So sánh cùng phiên cha; bảng lệnh theo nhóm, giữ lệnh và Ctrl; Nav Overlay giữ hình học rail phía dưới và scrim theo token. | `qml/Main.qml` |
| Lịch sử | Gọi history(query, archived, features); lọc mọi tính năng/Chat/Dịch/Từ điển; nhóm ngày theo updated hoặc archivedAt; hàng hai dòng 52; preview không đổi phiên; panel trái 376, chuyển xếp dọc khi container hẹp. | `qml/Main.qml` |
| Quản lý phiên | Đổi tên rỗng để backend lấy lại tiêu đề; xoá ngay bằng removeSession và toast Hoàn tác qua restoreSession; lưu trữ/khôi phục; chỉ xoá vĩnh viễn có dialog giữa cửa sổ; disabled và focus/IME. Preview từ điển đọc đúng phiên được chọn. | `qml/Main.qml`, `qml/DictionaryResult.qml` |
| Chuỗi | historyAll, historyRenameHint, historyRenamed, historyJustNow, historyMinutesAgo, historyHoursAgo, historyDaysAgo, historyNoMatchesHint. | `resources/locales/{vi,en,ja}.json`, hai `native.json` |
| Kiểm thử | Mở rộng composer/model; bổ sung lịch sử, trạng thái Chat, ảnh/nghiên cứu/reset/So sánh ở 640/820/1200, sáng/tối. Giữ validate(later), thêm ngưỡng 2 giờ/30 phút, reset/không reset, ID/active/thứ tự, save/reload, reopen/dismiss. Giữ các test W0. | `tests/WorkbenchBridgeTests.cpp` |
| Sửa ảnh: mặt lớp nổi và viền tối/disabled | Ghép token mặt overlay lên app-bg để chữ phía sau không xuyên qua; giữ màu sáng/tối và bóng token. Thay hai vòng Shape bằng một viền Rectangle antialias ở dark/disabled, giữ alpha mặt disabled theo token. Không dùng Loader/sourceComponent lồng. | `qml/Kit.qml` |
| Sửa ảnh: Hoạt động, Bảng lệnh, Nav-Overlay | Hoạt động ôm nội dung, đếm việc theo nhóm; palette 560 gần đỉnh, tìm kiếm + Esc ở đầu, TRANG trước THAO TÁC, tên trợ năng trên nội dung dialog. Ẩn nền Popup native của nav khi Glass. | `qml/Main.qml` |
| Sửa ảnh: công cụ + và model | SVG đúng nghĩa, Switch native, tên hướng dẫn hiện tại và chevron; đo neo khi mở, cuộn có scrollbar rõ và tự đưa focus vào vùng nhìn thấy, không đè nút mở. Tên hãng qua formatter chung + tpl; tooltip chip ẩn khi popup mở. | `qml/Main.qml`, `qml/Kit.qml`, `qml/SessionModelPicker.qml`, `qml/icons/*.svg` |
| Sửa ảnh: thư viện | Chưa chọn: chỉ dòng nhạt giữa preview, không tiêu đề/nút. Đã chọn: một hàng action quiet có icon, primary Mở lại bên phải, tự thu nhãn theo bề rộng chữ và cửa sổ; vạch dọc. Lọc Lưu trữ có icon và chữ accent trên pill sáng, không dấu gạch accent. Phân biệt lịch sử trống/kho trống với tìm không khớp. | `qml/Main.qml`, `qml/Kit.qml` |
| Sửa ảnh: chuỗi | Chuẩn hoá mọi Xóa/xóa thành Xoá/xoá trong VI; chooseHistory nói rõ phiên. Bổ sung activityCount, historyEmpty, historyArchivedEmpty, customInstruction đủ EN/VI/JA; sinh đồng bộ hai bundle. | `resources/locales/{vi,en,ja}.json`, hai `native.json` |
| Sửa ảnh: QtTest | Tên hãng ở setup rows; popup gần đặc, thứ tự palette; menu trong cửa sổ và trên opener ở 640/820/1280, cuộn đến mục cuối, Switch bàn phím; nav không nền thứ hai; Activity co giãn và đếm; empty preview/empty history, nút kho tương phản ≥4.5:1 trên nền sáng của Glass auto và không tràn. Thêm 1280 vào các ca lịch sử/Chat/ảnh, giữ 640/820/1200 và cả hai mode. Kiểm rim software và đổi inactive trong test GPU. | `tests/WorkbenchBridgeTests.cpp` |
| Vòng tiếp: thứ tự palette | Bỏ sort theo group; filter hai lần rồi concat, giữ nguyên thứ tự catalog trong từng nhóm. Test so toàn bộ ID của 10 mục trang và 4 thao tác với resources.commands, ở Chat 1280×800. | `qml/Main.qml`, `tests/WorkbenchBridgeTests.cpp` |
| Vòng tiếp: cuộn ba panel | Khôi phục parent/x/y/height của ScrollBar trong ScrollView; thanh dọc ở mép phải thay vì nút kéo nhỏ ở gốc menu. Tắt thanh ngang của menu +. Plus/model/palette dùng AlwaysOn khi tràn, AlwaysOff khi vừa; chiều cao plus/model tính đúng topPadding + bottomPadding của style; thumb lấy text-muted/text theo theme, giữ native kéo/cuộn. Chừa chỗ cho thanh ở model/palette. | `qml/Main.qml`, `qml/SessionModelPicker.qml` |
| Vòng tiếp: tooltip và focus + | Ẩn tooltip khi menu mở. Bỏ checkable tự đổi khi nhấp (nguồn gạch selection), giữ dấu hiệu cấu hình bằng màu icon và trạng thái chọn trong menu. Focus dựa visualFocus; giữ lý do mở bằng chuột/bàn phím qua mở lại/đóng popup. | `qml/Main.qml` |
| Vòng tiếp: test tương tác | QtTest mouse click, Tab/Backtab/Space và HoverEnter native; tooltip bị ẩn dù opener đang hover; không checked/focus giả. Kiểm kích thước/vị trí/opacity thumb sau 800 ms idle; kéo tới Dừng đọc; menu vừa thì không thanh cuộn. Kiểm tới trọn hàng setup local, 40 model giả qua ModelLineup, lọc làm hết tràn, Ctrl+K thật, cả sáng/tối. Ca bộ lọc cũ chờ layout sau khi trả độ rộng tiêu đề bằng QTRY_VERIFY, giữ nguyên assertion giới hạn cửa sổ. | `tests/WorkbenchBridgeTests.cpp` |

Đường dẫn `qml/` và `tests/` trong bảng thuộc `apps/desktop-qt/`.

## Kiểm chứng

### Vòng tiếp theo: palette/cuộn/tooltip/focus (kết quả mới nhất)

Bản cuối sau sửa chờ layout: Fusion/CTest đầy đủ exit 0,
`.native-build/w1-scroll-final-fusion.log` và `.txt`, nguyên văn:

```text
Totals: 186 passed, 0 failed, 1 skipped, 0 blacklisted, 1406246ms
1/1 Test #1: native-qt-bridge .................   Passed  1406.38 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 1406.41 sec
```

FluentWinUI3/offscreen đầy đủ chạy sau Fusion, không fontdir, exit 2
(`.native-build/w1-scroll-final-fluent.txt`). Ca bộ lọc 640/1200 đều PASS;
chỉ còn hai lỗi font thư viện đã biết, không FAIL mới. Nguyên văn:

```text
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
Totals: 184 passed, 2 failed, 1 skipped, 0 blacklisted, 1374894ms
```

SKIP ở cả hai suite là accelerated trên software/offscreen. Hai ca thư viện
chạy lại với `QT_QPA_FONTDIR=C:/Windows/Fonts`, FluentWinUI3/offscreen, exit 0
(`.native-build/w1-scroll-fontdir.txt`), nguyên văn:

```text
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library)
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 10431ms
```

GPU bản cuối chạy sau các suite trên, QPA `windows`, FluentWinUI3,
không offscreen/software/backend/fontdir/scale override, `QSG_INFO=1`, exit 0
(`.native-build/w1-scroll-gpu.txt`). Log xác nhận D3D11 trên NVIDIA RTX A1000
6GB Laptop GPU. Nguyên văn:

```text
PASS   : WorkbenchBridgeTests::acceleratedGlassSurfacesSurviveAppearanceChanges()
PASS   : WorkbenchBridgeTests::glassOverlayLayout(light)
PASS   : WorkbenchBridgeTests::glassOverlayLayout(dark)
PASS   : WorkbenchBridgeTests::glassOverlayScrollbarsAndPointerFocus(light)
PASS   : WorkbenchBridgeTests::glassOverlayScrollbarsAndPointerFocus(dark)
PASS   : WorkbenchBridgeTests::glassSearchAndFiltersPreserveNativeInteraction(light-vi-640)
PASS   : WorkbenchBridgeTests::glassSearchAndFiltersPreserveNativeInteraction(dark-ja-1200)
Totals: 9 passed, 0 failed, 0 skipped, 0 blacklisted, 98848ms
```

Không crash, không cảnh báo QML. Cảnh báo không tạo được pipeline-cache lock
trong thư mục cache ngoài quyền ghi sandbox vẫn giống lượt trước; không phải
FAIL. Menu + và Chọn model được kiểm hành vi/geometry/scrollbar sáng/tối trên
GPU; nghiệm thu pixel/DPI vẫn dành cho Claude, không suy từ test sang ảnh.

App Release thật, namespace `ViezanNativePreview`, FluentWinUI3, D3D11 mặc
định, giữ thêm ≥20 s sau khi cửa sổ xuất hiện; không dùng hồ sơ cá nhân.
Log `.native-build/w1-scroll-app-d3d.result.json` và `.stderr.txt`:

```text
"exited": false,
"firstWindowSeconds": 4.69,
"holdAfterWindow": true,
"observedSeconds": 24.713,
```

App giữ thêm 20,023 s, không tự thoát; harness đóng app sau kiểm. Log xác
nhận D3D11 trên NVIDIA, `Prefer software device: 0`. Không cảnh báo QML hay
crash. Đây là kiểm liveness, không phải nghiệm thu ảnh. Không sửa nguồn
app/test sau khi bắt đầu lượt Fusion/Fluent cuối.


Release build PASS, exit 0 (`.native-build/w1-scroll-build.log`, dựng lại QtTest trong `w1-scroll-build-final.log`). Ca mới
`glassOverlayScrollbarsAndPointerFocus` chạy sáng/tối, cùng
`glassOverlayLayout` đã đổi sang so toàn bộ ID catalog (10 trang, 4 thao tác).
Các fixture chỉ có dữ liệu giả và QTemporaryDir. Không chụp ảnh.

FluentWinUI3/offscreen, `.native-build/w1-scroll-focused-fluent.txt`:

```text
Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 62640ms
```

Fusion/offscreen, `.native-build/w1-scroll-focused-fusion.txt`:

```text
Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 65853ms
```

Các kiểm bao gồm hover được giữ lúc popup mở, mouse click, Tab/Backtab/Space,
thumb còn hiện sau 800 ms idle, kéo tới Dừng đọc, trọn hàng setup local sau
layout của ListView, 40 model giả rồi lọc hết tràn, Ctrl+K và menu active-chat
vừa nội dung. ForceLayout trong test đợi delegate thay đổi chiều cao ổn định
trước positionViewAtEnd; không thay logic/model trong QML.

Không đổi chuỗi/bundle trong vòng này; hai bundle vẫn bằng nhau với SHA256
`A372044B8B41C15F95355AD855353DB6CE1BACD28C5C43294B8E9E7B8B53C89B`.
`git diff --check` qua (chỉ cảnh báo LF → CRLF của bundle cũ), check:docs:

```text
Native documentation references version 2.4.2; runtime acceptance is separate.
```

Lượt đầy đủ đầu: Fusion/CTest exit 0 (`.native-build/w1-scroll-full-fusion.log`,
`.native-build/w1-scroll-full-fusion.txt`). Dùng timeout 2400 s của lệnh ctest,
không sửa CMake; bộ đầy đủ trước mất gần 24 phút. Nguyên văn:

```text
Totals: 186 passed, 0 failed, 1 skipped, 0 blacklisted, 1446736ms
1/1 Test #1: native-qt-bridge .................   Passed  1446.94 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 1446.95 sec
```

SKIP là accelerated trên offscreen/software. Fluent đầy đủ chạy sau Fusion,
lượt đầu exit 3 (`.native-build/w1-scroll-full-fluent.txt`), nguyên văn:

```text
FAIL!  : WorkbenchBridgeTests::glassSearchAndFiltersPreserveNativeInteraction(light-vi-640) 'filters->mapToScene(QPointF(filters->width(), 0)).x() <= width' returned FALSE. ()
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
Totals: 183 passed, 3 failed, 1 skipped, 0 blacklisted, 1362039ms
```

Hai ca thư viện là lỗi font đã biết. Ca bộ lọc 640 xanh khi chạy riêng cùng
environment, không fontdir (`.native-build/w1-scroll-filter-recheck.txt`):

```text
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 10289ms
```

Assertion ở ca cũ kiểm ngay sau khi trả lại implicitWidth của tiêu đề,
trong khi layout có thể còn chờ frame. Đổi đúng assertion đó sang QTRY_VERIFY,
không đổi điều kiện giới hạn bề rộng, fixture hay QML Trang chủ. Dựng lại và
chạy lại bộ tập trung, rồi hai bộ đầy đủ tuần tự trên source cuối. Kết quả
cuối nằm ở đầu mục này; các mục phía dưới là lịch sử các vòng trước.

Các ca tập trung trên bản QtTest cuối, FluentWinUI3/offscreen, gồm
`glassOverlayLayout`, `glassOverlayScrollbarsAndPointerFocus` sáng/tối và
`glassSearchAndFiltersPreserveNativeInteraction` (VI 640, JA 1200), exit 0
(`.native-build/w1-scroll-focused-final.txt`):

```text
Totals: 8 passed, 0 failed, 0 skipped, 0 blacklisted, 79115ms
```

### Trước sửa: W0 làm nền

Release build PASS. Fusion đầy đủ, log `.native-build/w1-baseline-fusion.log`
và `.native-build/w1-baseline-fusion.txt`:

```text
Totals: 153 passed, 0 failed, 1 skipped, 0 blacklisted, 593799ms
1/1 Test #1: native-qt-bridge ................. Passed 593.90 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 593.90 sec
```

### Source và tài nguyên trước vòng sửa ảnh

`npm run resources` sinh 3 locale, 78 metrics. `npm run check:resources`:

```text
Native resources verified: 3 locales, 78 metrics.
```

Hai bundle bằng nhau từng byte, SHA256:
`32AEA7A72E429AA6E0AA378A188DB0248C00F8C3501C8F18D2F839BC14DE150B`.
Sau lần sinh này check không còn stale. Git vẫn cảnh báo LF sẽ đổi sang CRLF
vì core.autocrlf; không đổi cấu hình Git/generator hay chuẩn hoá file khác.
`git diff --check` qua. `npm run check:docs` qua:

```text
Native documentation references version 2.4.2; runtime acceptance is separate.
```

Node contract tests:

```text
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 141.9993
```

Python:

```text
Ran 7 tests in 0.000s
OK (skipped=7)
```

Bảy test dev runner chỉ chạy trên macOS nên skip trên Windows. Không chạy
Swift build/test vì không sửa Swift và máy này không phải macOS.

### Lượt trước khi được duyệt sửa C++ (lịch sử, không phải kết quả cuối)

Các lượt tập trung trước khi gặp chặn:

- Composer/model sáng và tối: `Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 56835ms`
  (`.native-build/w1-model.txt`). Bao gồm cả ba chiều rộng, đổi preset,
  IME, tier, owner phiên, lớp nổi loại trừ nhau và trả focus.
- Lịch sử 640 sáng và Chat-States 640 sáng đã qua trong các lượt tập trung.
  Lịch sử 1200 tối, Chat-States 820 tối cũng đã qua (`w1-behavior4.txt`).
- Test ảnh/nghiên cứu dùng `QStandardPaths::setTestModeEnabled(true)` có
  guard trả trạng thái cũ, dưới thư mục test `qttest` được cấp quyền. Tạo PNG
  64×48, ingest, nhận ảnh, copy clipboard, caption và mở nguồn nghiên cứu đã
  qua trước điểm Smart Reset; toàn ca FAIL do lỗi bên dưới. Không báo toàn ca
  này PASS. Không chạy provider hay mở URL trong test.

Release build sau sửa cuối PASS (exit 0), log
`.native-build/w1-build-final-blocked.log`; app và test executable đều dựng
được. Lượt tập trung cuối dùng Fusion/offscreen, log
`.native-build/w1-final-blocked.txt`, exit 1:

```text
FAIL!  : WorkbenchBridgeTests::glassBackendSmartReset() 'validate(later)' returned FALSE. (Smart reset must retain a unique session matching the new active ID; navigate must not overwrite the prepended session at its old index.)
PASS   : WorkbenchBridgeTests::glassHistoryActions(640-light)
PASS   : WorkbenchBridgeTests::glassChatStates(820-dark)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(glass-library-640)
Totals: 5 passed, 1 failed, 0 skipped, 0 blacklisted, 42085ms
```

Đếm 5 PASS bao gồm initTestCase và cleanupTestCase. Cảnh báo QFontDatabase
thiếu `Qt/lib/fonts` vẫn có trên offscreen, không gây FAIL ba ca UI trên.
FAIL là assertion tính hợp lệ của state trong test domain thuần, không dùng
QML, không phụ thuộc style/font/GPU.

Lượt trước đã dừng theo yêu cầu “Cần đụng C++ … thì dừng và ghi đề xuất”.
Kết quả bên dưới sẽ thay thế trạng thái chặn sau khi sửa C++ được duyệt.

### Build, QtTest và GPU sau bản sửa C++ đã duyệt, trước vòng sửa ảnh

Release build PASS, exit 0 (`.native-build/w1-resume-build.log`). Không đổi
CMake hay cấu hình build. Nhóm tập trung Fusion/offscreen
(`.native-build/w1-resume-focused.txt`), nguyên văn:

```text
PASS   : WorkbenchBridgeTests::glassBackendSmartReset()
PASS   : WorkbenchBridgeTests::smartResetPreservesSessionIdentity(translate-two-hours)
PASS   : WorkbenchBridgeTests::smartResetPreservesSessionIdentity(dictionary-thirty-minutes)
PASS   : WorkbenchBridgeTests::smartResetBridgePersistence(translate-two-hours)
PASS   : WorkbenchBridgeTests::smartResetBridgePersistence(dictionary-thirty-minutes)
PASS   : WorkbenchBridgeTests::glassImageResearchAndReset(640-light)
PASS   : WorkbenchBridgeTests::glassImageResearchAndReset(640-dark)
PASS   : WorkbenchBridgeTests::glassImageResearchAndReset(820-light)
PASS   : WorkbenchBridgeTests::glassImageResearchAndReset(820-dark)
PASS   : WorkbenchBridgeTests::glassImageResearchAndReset(1200-light)
PASS   : WorkbenchBridgeTests::glassImageResearchAndReset(1200-dark)
Totals: 13 passed, 0 failed, 0 skipped, 0 blacklisted, 181972ms
```

Ca tích hợp đã chạy đến hết, bao gồm So sánh hai task thành một hàng/nhãn
đang chạy và nút mở lượt Từ điển trước; không còn cảnh báo session undefined.
Fusion/CTest đầy đủ PASS, log `.native-build/w1-final-fusion.log` và
`.native-build/w1-final-fusion.txt`:

```text
Totals: 175 passed, 0 failed, 1 skipped, 0 blacklisted, 1073807ms
1/1 Test #1: native-qt-bridge .................   Passed  1073.89 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 1073.89 sec
```

SKIP là acceleratedGlassSurfacesSurviveAppearanceChanges khi offscreen dùng
software. Không chạy QtTest song song. FluentWinUI3/offscreen đầy đủ chạy
sau khi Fusion kết thúc, không có QT_QPA_FONTDIR
(`.native-build/w1-final-fluent.txt`), exit 2:

```text
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
Totals: 173 passed, 2 failed, 1 skipped, 0 blacklisted, 1113308ms
```

Hai FAIL trùng hai ca thư viện có vấn đề font offscreen của W0, không có FAIL
mới. Toàn bộ ca W1 mới (lịch sử/Chat/ảnh/nghiên cứu/reset/So sánh, ba chiều
rộng và hai theme) PASS trong cả hai bộ. Chạy lại đúng hai ca với
`QT_QPA_FONTDIR=C:/Windows/Fonts`, vẫn FluentWinUI3/offscreen, exit 0
(`.native-build/w1-final-fluent-fontdir.txt`):

```text
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library)
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 6790ms
```

GPU chạy sau hai bộ đầy đủ và kiểm fontdir: QPA `windows`, FluentWinUI3,
bỏ offscreen/software/backend override/fontdir/scale override, `QSG_INFO=1`.
Log `.native-build/w1-final-gpu.txt` xác nhận `Creating QRhi with backend D3D11`,
adapter NVIDIA RTX A1000 6GB Laptop GPU. Nguyên văn:

```text
PASS   : WorkbenchBridgeTests::acceleratedGlassSurfacesSurviveAppearanceChanges()
PASS   : WorkbenchBridgeTests::glassComposerKeepsEditorAndModelOwnership(dark)
PASS   : WorkbenchBridgeTests::glassHistoryActions(820-dark)
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 59510ms
```

Ngoài test accelerated bắt buộc, chạy composer/model/công cụ/hướng dẫn và
lịch sử trên GPU để kiểm panel mới, đổi appearance, focus và hành động.
Không crash, không cảnh báo QML. Có cảnh báo không tạo được pipeline-cache
lock file dưới AppData của test do sandbox (cũng đã gặp ở W0); không phải
cảnh báo texture `t1` hoặc fallback software.

### Live acceptance

App Release thật chạy sau khi test GPU đóng, dùng hồ sơ
`ViezanNativePreview/ViezanNativeQt` đã được xác nhận là preview không có dữ
liệu cá nhân ở W0. Không đọc/chỉnh nội dung hồ sơ, không gửi yêu cầu AI hay
ghi âm. Dùng harness W0 có sẵn, không thêm/sửa script nguồn:

```powershell
& ./.native-build/w0-gpu-run.ps1 -Label 'w1-app-final-d3d' -Style 'FluentWinUI3' -Seconds 20 -HoldAfterWindow
```

Không đặt QPA/backend/fontdir/scale override. Log xác nhận QRhi **D3D11**
mặc định và NVIDIA RTX A1000; không có lỗi/cảnh báo QML hoặc crash. Tổng
quan sát 24,21 s, cửa sổ xuất hiện sau 4,19 s, giữ thêm **20,02 s**; sau đó
harness đóng tiến trình. JSON `.native-build/w1-app-final-d3d.result.json`
nguyên văn:

```json
{
  "label": "w1-app-final-d3d",
  "style": "FluentWinUI3",
  "backend": "",
  "quickBackend": "",
  "platform": "",
  "exited": false,
  "firstWindowSeconds": 4.19,
  "holdAfterWindow": true,
  "observedSeconds": 24.21,
  "windowHandle": 8064034,
  "windowTitle": "",
  "exitCode": null
}
```

`exited: false` là app còn sống hết khoảng quan sát, trước khi harness đóng.
Log stderr/stdout cùng prefix `.native-build/w1-app-final-d3d.*`. Không còn
tiến trình app/test của các lượt kiểm đang chạy khi kết thúc.

Chưa chụp ảnh và chưa chạy Narrator. Các kiểm IME, focus, native disabled,
trạng thái và hình học hiện là QtTest; không thay cho nghiệm thu thị giác.
Không thử AI/micro thật trong phiên này.

### Kiểm lại sau phản hồi ảnh lớp nổi

Release build PASS, exit 0 (`.native-build/w1-overlays-build.log`). Các ca
tập trung bắt được và đã sửa vị trí neo popup lúc layout chưa ổn định, độ
rộng tối thiểu toolbar, và Accessible gắn trực tiếp vào Popup (Qt yêu cầu
Item/Action; chuyển tên/vai trò dialog sang nội dung).

Fusion/offscreen, các ca overlay sáng/tối và lịch sử 1280 sáng
(`.native-build/w1-overlays-targeted-fusion2.txt`):

```text
Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 51744ms
```

FluentWinUI3/offscreen, thêm rim disabled, lịch sử 820 tối và assertion
empty history (`.native-build/w1-overlays-targeted-fluent.txt`):

```text
Totals: 7 passed, 0 failed, 0 skipped, 0 blacklisted, 75588ms
```

`npm run resources` rồi `npm run check:resources`:

```text
Native resources verified: 3 locales, 78 metrics.
```

Hai bundle giống nhau từng byte, SHA256 mới:
`A372044B8B41C15F95355AD855353DB6CE1BACD28C5C43294B8E9E7B8B53C89B`.
Không báo stale sau khi sinh; Git vẫn cảnh báo LF → CRLF do core.autocrlf.
Không đổi cấu hình Git hay generator. `git diff --check` và check:docs qua.

Node domain + resource generator tests:

```text
ℹ tests 13
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 3842.6851
```

Một SKIP là test symlink cần Windows Developer Mode/elevation. Không cài
phụ thuộc hoặc thay quyền máy để chạy test này.

Fusion/CTest đầy đủ PASS, exit 0, log
`.native-build/w1-overlays-full-fusion.log` và
`.native-build/w1-overlays-full-fusion.txt`, nguyên văn:

```text
Totals: 184 passed, 0 failed, 1 skipped, 0 blacklisted, 1434394ms
1/1 Test #1: native-qt-bridge .................   Passed  1434.49 sec
100% tests passed, 0 tests failed out of 1
Total Test time (real) = 1434.49 sec
```

SKIP duy nhất là acceleratedGlassSurfacesSurviveAppearanceChanges trên
software/offscreen. Bộ đầy đủ bao gồm các ca ảnh/nghiên cứu/reset/So sánh,
lịch sử và Chat ở 640/820/1200/1280, sáng/tối. Không chạy QtTest song song.
FluentWinUI3/offscreen đầy đủ chạy sau Fusion, không đặt QT_QPA_FONTDIR,
exit 2 (`.native-build/w1-overlays-full-fluent.txt`), nguyên văn:

```text
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
FAIL!  : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library) 'bottomRight.x() <= root->property("width").toDouble()' returned FALSE. ()
Totals: 182 passed, 2 failed, 1 skipped, 0 blacklisted, 1375513ms
```

Đúng hai FAIL font offscreen đã biết từ W0; không có FAIL mới. SKIP vẫn là
nhánh accelerated trên software. Chạy lại đúng hai ca thư viện với
`QT_QPA_FONTDIR=C:/Windows/Fonts`, FluentWinUI3/offscreen, exit 0
(`.native-build/w1-overlays-fontdir.txt`):

```text
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(chat-library)
PASS   : WorkbenchBridgeTests::qmlLoadsWithRealBridge(translation-library)
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 7546ms
```

GPU chạy sau hai bộ đầy đủ và kiểm fontdir: QPA `windows`, FluentWinUI3,
bỏ offscreen/software/backend/fontdir/scale override, `QSG_INFO=1`.
Log `.native-build/w1-overlays-gpu.txt` xác nhận `Creating QRhi with backend
D3D11`, adapter NVIDIA RTX A1000 6GB Laptop GPU. Exit 0, nguyên văn:

```text
PASS   : WorkbenchBridgeTests::acceleratedGlassSurfacesSurviveAppearanceChanges()
PASS   : WorkbenchBridgeTests::glassDisabledControlRim()
PASS   : WorkbenchBridgeTests::glassOverlayLayout(light)
PASS   : WorkbenchBridgeTests::glassOverlayLayout(dark)
PASS   : WorkbenchBridgeTests::glassHistoryActions(1280-dark)
PASS   : WorkbenchBridgeTests::glassHistoryActions(820-light)
Totals: 8 passed, 0 failed, 0 skipped, 0 blacklisted, 93574ms
```

Không crash khi đổi preset/mode/disabled; không cảnh báo QML hay texture
provider không hợp lệ. Còn cảnh báo Qt không tạo được pipeline-cache lock
trong thư mục cache ngoài phạm vi ghi của sandbox, như W0; không phải FAIL.

App Release thật dùng namespace `ViezanNativePreview`, FluentWinUI3,
D3D11 mặc định; không dùng dữ liệu cá nhân và không chụp ảnh. Dùng harness
W0 với `-Seconds 20 -HoldAfterWindow`. Bằng chứng
`.native-build/w1-overlays-app-d3d.result.json` và `.stderr.txt`:

```text
"exited": false,
"firstWindowSeconds": 4.63,
"holdAfterWindow": true,
"observedSeconds": 24.652,
```

App giữ thêm 20,022 s sau khi cửa sổ xuất hiện, không tự thoát; harness
đóng app sau kiểm. Log xác nhận D3D11 trên NVIDIA, không dùng software device.
Đây là kiểm liveness/GPU, không phải xác nhận pixel khớp board; phần ảnh giữ
cho Claude. Không sửa nguồn app/test sau khi bắt đầu hai bộ đầy đủ.

## Chênh lệch còn lại và đề xuất

### Vòng tiếp theo: bốn điểm sau ảnh GPU

Claude xác nhận các sửa về Activity/Nav/provider/history/archive/disabled rim và
chính tả đã đạt trong phản hồi mới nhất. Không sửa lại các phần đó. Thứ tự
palette nay giữ nguyên catalog; menu +/model/palette có thanh cuộn native luôn
hiện lúc tràn. Chấm ở gốc menu là thumb của ScrollBar bị thiếu parent/hình học;
đã khôi phục vị trí mép phải và chiều cao viewport. Fluent đặt padding từng cạnh
riêng nên chiều cao popup cần cộng topPadding + bottomPadding, không padding × 2.
Menu + không dùng checked để biểu thị mở; màu icon vẫn biểu thị cấu hình,
visualFocus vẫn hiện khi dùng bàn phím. Tooltip bị chặn trong suốt lúc menu mở.

Ảnh overlay trong repo là lượt trước; phản hồi mới nhất của Claude là căn cứ cho
bốn sửa này. Không chụp lại và không xác nhận pixel/DPI bằng QtTest. Cần Claude
nghiệm thu ảnh mới của menu + và Chọn model ở sáng/tối. Không đề xuất C++ mới.

### Vòng sửa ảnh lớp nổi (2026-11-07)

Đối chiếu các ảnh `glass2-win-W1/overlay-*.png` Claude cung cấp với
Overlays, Nav-Overlay, History và History-States. Không chụp ảnh mới, không
sửa phần nghiệm thu bằng ảnh bên dưới của Claude.

- Bundle hiện tại không xuất riêng `overlay-material`; `surface-raised`
  trong Glass có **đúng cùng giá trị** ở cả light (`rgba(255,255,255,.88)`)
  và dark (`rgba(38,34,38,.9)`). ReadingPanelSurface dùng giá trị đó ghép lên
  token `app-bg`, không thêm màu literal hay sửa generator/C++. Đây là mặt
  đặc thay cho backdrop blur 40 px của board: chữ bên dưới không còn xuyên
  qua. Không tuyên bố Qt có blur nền như macOS.
- Palette không hiển thị chân gợi ý tiền tố, vì Qt W1 chỉ hỗ trợ command
  hiện có. Không thêm logic dịch/tra từ/hỏi/tính vào QML; phần đó vẫn là W5.
- Menu + cuộn khi khoảng phía trên composer không đủ. Thanh cuộn native
  luôn hiện khi cần cuộn; focus bàn phím tự được đưa vào vùng nhìn thấy.
  Không giảm chiều cao hàng để nhồi mục và không đè lên nút mở.
- Thư viện giữ một hàng thao tác. Khi bề rộng nhãn không vừa hoặc cửa sổ
  compact, chuyển sang icon có accessible name và tooltip. Giữ trạng thái
  disabled và primary của Mở lại trong kho lưu trữ như quyết định W1.
- Rim dark/disabled đã đổi sang một viền antialias dùng token, thay hai
  vòng Shape chồng nhau. Mức sáng thực tế trên GPU và DPI 100/150% cần
  Claude đối chiếu lại; QtTest kiểm cấu trúc/ràng buộc và crash, không thay
  cho nghiệm thu ảnh. Chưa kiểm Narrator.
- Không cần đề xuất C++ mới. Diff WorkbenchDomain.cpp vẫn chỉ là điều kiện
  navigate đã được người dùng duyệt trước vòng sửa ảnh; không sửa Swift.

### Smart Reset: chặn đã được duyệt sửa

Vị trí: `apps/desktop-qt/WorkbenchDomain.cpp`, `applySmartReset` (dòng 308),
nhánh `navigate` gọi nó (dòng 531), cùng đoạn cuối `sessions[index] = item`
(dòng 732). Assertion ở `tests/WorkbenchBridgeTests.cpp:343`.

Tái hiện bằng test hiện có `glassBackendSmartReset`, bổ sung một assertion
`validate(later)` ngay sau `navigate` quá hai giờ. Fixture chỉ dùng dữ liệu
giả: tạo `c/t`, hoàn tất một bản dịch, sang Chat, quay về Dịch sau khoảng nghỉ.
Test cũ chỉ kiểm `active.translate == "fresh"` và `_resetNotice`, nên không
phát hiện danh sách phiên đã hỏng.

1. `index` và `item` được lấy trước navigation (phiên đang dùng ở tính năng cũ).
2. `applySmartReset` prepend phiên mới và cập nhật active sang ID mới.
3. Nhánh navigate lấy lại sessions/active, nhưng đi tiếp xuống đoạn cuối.
4. Đoạn cuối vẫn ghi `item` vào **index trước khi prepend**. Trong fixture,
   nó đè phiên `fresh` ở vị trí 0 bằng phiên `c`, tạo ID trùng và để active trỏ
   đến ID không tồn tại. `validate(later)` trả false.
5. Test UI ảnh/nghiên cứu chuyển sang Dịch tái hiện hàng loạt cảnh báo
   `Cannot read property ... of undefined`: binding session không tìm thấy
   active. Đây không phải thiếu font/offscreen hay thay đổi vật liệu.

**Bản sửa được người dùng duyệt và đã thực hiện:** thêm `name != "navigate"`
vào điều kiện ghi `sessions[index] = item`. Nhánh navigate chỉ cập nhật feature,
featureLeft và state qua applySmartReset; không sửa item. Danh sách lệnh chỉnh
item/updated cũng không có navigate. Vì vậy không cần ghi lại bản sao item cũ.
Không thêm phiên giả hoặc viết lại Smart Reset trong QML.

Giữ assertion validate(later). Test mới kiểm đúng trước và tại ngưỡng Dịch
7200 s/Từ điển 1800 s; xoay thứ tự để phiên nguồn nằm ở cả ba index; kiểm
mọi ID duy nhất, mọi active có phiên tương ứng, phiên mới đứng đầu và toàn bộ
phiên cũ giữ nguyên. Test bridge kiểm persist/reload không lưu resetNotice,
dismiss không đổi state, reopen trả đúng nội dung và bỏ phiên thay thế rỗng.

**Đối chiếu Swift (chỉ đọc): không có cùng lỗi.**
`apps/macos/Sources/ViezanDomain/WorkbenchStore.swift:136` gọi markLeft,
đặt feature, applySmartReset rồi save. applySmartReset (dòng 146) insert
trực tiếp vào workspace.sessions, cập nhật active và resetNotice; không
ghi lại item theo index chụp trước khi insert. reopenPrevious (dòng 156)
xoá phiên thay thế rỗng rồi select previousID; dismiss (dòng 165) chỉ xoá
notice. Không sửa Swift; không chạy Swift test trên Windows.
Khác biệt có sẵn được giữ: Swift chọn preferredModel cho phiên reset nếu có;
Qt sao chép model/source/target của phiên trước. Bản sửa được duyệt chỉ xử lý
ghi đè index, không thay chính sách chọn model này.

### Khác biệt trình bày và phần cần nghiệm thu tiếp

- Giữ **Ctrl+Enter gửi, Enter xuống dòng** của Qt hiện tại theo yêu cầu không
  đổi phím tắt. Board/macOS dùng Enter gửi, Shift+Enter xuống dòng.
- Thời gian tương đối dùng chuỗi EN/VI/JA bổ sung và Qt locale; cách làm tròn
  có thể khác RelativeDateTimeFormatter của macOS.
- Undo xoá prompt dùng savePrompt(name, text), vì API hiện có không khôi phục
  ID prompt cũ. Không ghi đè nếu tên đã được dùng lại. Nếu cần giữ ID/thứ tự
  tuyệt đối, đề xuất backend restorePrompt; chưa sửa C++.
- Bảng lệnh W1 chỉ trình bày các command hiện có. Dòng tính toán/hỏi/dịch/tra
  từ paletteQuery thuộc W5 theo WINDOWS-HANDOFF; không đưa vào W1.
- Đối chiếu kích thước/màu/rim tối trên GPU và DPI 100/150% còn chờ Claude.
  Software không vẽ cùng bóng MultiEffect với GPU; không suy kết quả hình ảnh
  từ QtTest offscreen. Khung/titlebar Windows giữ native như W0.
- Không thay README/spec ngoài phạm vi file cho phép. Không có thay đổi cài
  đặt hay cách dựng; báo cáo này ghi phần UI W1 và giới hạn để nghiệm thu.

## Nghiệm thu bằng ảnh

Claude kiểm lại ngày 2026-11-07 trên source cuối, ngoài sandbox Codex: build
Release PASS; `glassBackendSmartReset` **3 pass, 0 fail**; test GPU
`acceleratedGlassSurfacesSurviveAppearanceChanges` với FluentWinUI3 **3 pass**
cả D3D11 và OpenGL; app thật chạy >20 s không crash ở D3D11 và OpenGL. Bản
sửa C++ chỉ là một điều kiện ở `WorkbenchDomain.cpp:732` (loại `navigate`
khỏi bước ghi lại `item`), đúng phạm vi người dùng đã duyệt.

Ảnh chụp app Release thật với hồ sơ preview (sao lưu trước, trả lại nguyên
byte sau), không dữ liệu cá nhân hay provider thật, nên không có phiên trong
"Tiếp tục" và hiện thông báo "Chưa có AI nào dùng được". Ảnh trong
[`glass2-win-W1/`](glass2-win-W1/), thu nhỏ 50 %. Hậu tố `-sw` là renderer phần
mềm (không có bóng MultiEffect), dùng khi máy bị khoá màn hình làm D3D không
xuất khung hình để chụp; bố cục giống nhánh GPU.

| Ảnh | So với board | Kết quả |
| --- | --- | --- |
| [chat-1280-light](glass2-win-W1/chat-1280-light.png) (GPU) | Chat-Empty | Đạt bố cục: header "AI Chat / Chat mới" với Lịch sử · Chat mới (tint) · vạch · Hoạt động; mark + "Chúng ta bắt đầu từ đâu?"; composer capsule trắng với "+", nhóm model + mic là một kính, nút gửi tròn. Thông báo provider rỗng có nút "Mở Model AI local" đúng thứ tự ưu tiên. |
| [chat-1280-dark](glass2-win-W1/chat-1280-dark.png) (GPU) | Chat-Dark | Bố cục đạt. **Chưa đạt vật liệu:** viền/phản sáng của pill kính (Lịch sử, Chat mới, Hoạt động, nhóm model) vẫn sáng và dày hơn board, dù W1 đã chỉnh alpha. |
| [chat-820-light](glass2-win-W1/chat-820-light.png) (GPU), [chat-820-dark-sw](glass2-win-W1/chat-820-dark-sw.png) | Chat-Compact | Đạt: rail, header icon-only, tên model rút gọn "llama…", composer co theo cột. |
| [chat-1280-dark-150-sw](glass2-win-W1/chat-1280-dark-150-sw.png) | Chat-Dark, 150 % | Đạt: không cắt chữ hay tràn ở 1,5×. |

Nút gửi hiện xám (disabled) thay vì nền nhấn như Chat-Empty.png vì không có
provider nào dùng được và nháp trống — đúng trạng thái native disabled.

### Lớp nổi và Thư viện lịch sử (GPU, sau khi mở khoá màn hình)

Chụp lần 1 (ảnh `overlay-*.png`, trước sửa) bằng Ctrl+K, Ctrl+Shift+A,
Ctrl+Shift+H, Ctrl+\ và bấm chuột vào chip model, nút "+", "Xem tất cả lịch sử",
nút Lưu trữ; so với Overlays.png, Nav-Overlay.png, History.png,
History-States.png. Tìm thấy 12 chênh lệch, gửi lại Codex (vòng W1c):

1. Mặt lớp nổi trong suốt, chữ phía sau lộ qua Bảng lệnh, menu "+", Hoạt động.
2. Hoạt động cao cố định khi trống.
3. Bảng lệnh có hàng tiêu đề + nút đóng, neo giữa, không có Esc trong ô tìm.
4. Nav-Overlay ở 820 có hai lớp khung.
5. Menu "+": icon sai nghĩa, thiếu Switch "Suy luận cẩn thận", thiếu giá trị
   "Hướng dẫn cho phiên", bị cắt "Dừng đọc", che nút "+".
6. Chọn model hiện ID thô "Thiết lập openai/claude/gemini…".
7. Thư viện chưa chọn mục vẫn hiện hàng nút (disabled trông như bật), xuống 2 dòng.
8. Thư viện tối: nút disabled vẽ mảnh viền trắng răng cưa.
9. Nút lọc Lưu trữ khi bật: chữ trắng trên nền sáng, gần như mất.
10. Pill "Khôi phục", "Xóa vĩnh viễn" bị cắt mép phải.
11. Chính tả "Xóa" lẫn "Xoá" trong vi.
12. Thư viện trống hoàn toàn hiện "Không có kết quả phù hợp".

Chụp lần 2 (ảnh `*-fixed.png`) sau W1c: **đạt** 1, 2, 4, 6, 7, 8, 9, 10, 11, 12
— [Hoạt động](glass2-win-W1/overlay-activity-light-fixed.png) ôm nội dung,
[Nav-Overlay](glass2-win-W1/overlay-navoverlay-820-fixed.png) một thẻ,
[Chọn model](glass2-win-W1/overlay-model-light-fixed.png) "Thiết lập OpenAI…",
[Thư viện sáng](glass2-win-W1/overlay-library-light-fixed.png) /
[tối](glass2-win-W1/overlay-library-dark-fixed.png) chỉ "Chọn một phiên để xem
trước" và "Chưa có phiên nào trong lịch sử", có vạch chia cột, nút Lưu trữ có
icon. Lần 2 còn thấy 3 lỗi, gửi Codex (vòng W1d):

- Bảng lệnh xáo thứ tự trang (Dịch mọi nơi, Ứng dụng, … Trang chủ) do `sort`
  của QV4 không ổn định; test cũ không bắt được.
- [Menu "+"](glass2-win-W1/overlay-plus-light-fixed.png) và danh sách Chọn model
  tràn nhưng thanh cuộn FluentWinUI3 tự ẩn, nên "Hướng dẫn cho phiên", "Nghe",
  "Dừng đọc" bị giấu không có dấu hiệu; chấm lạc ở góc menu.
- Tooltip nút "+" đè lên menu; vạch focus khi mở bằng chuột.

Sau W1d Claude kiểm mã: palette tách nhóm giữ thứ tự catalog
(`Main.qml:64`), thanh cuộn `AlwaysOn` khi tràn ở menu "+", Bảng lệnh, Chọn
model; test `glassOverlayLayout` so toàn bộ thứ tự với catalog thật (≥10 trang)
và chính sách thanh cuộn — Claude chạy lại **4 pass, 0 fail** cả Fusion và
FluentWinUI3 offscreen. **Chụp lần 3 NOT RUN:** máy lại khoá màn hình
(LogonUI chạy, không cửa sổ nào ở foreground) nên phím và chuột không tới app;
cần chụp lại Ctrl+K và menu "+" khi mở khoá.

Toast Hoàn tác không chụp: cần xoá một phiên có thật, hồ sơ preview không có
phiên và không giả lập dữ liệu. Đã có QtTest.

**Chưa chụp vì cần AI thật (không giả lập dữ liệu):** Chat-Active, Chat-States
(đang trả lời, lỗi, ảnh, nghiên cứu), History có dữ liệu. Chưa kiểm Narrator.

## Chụp lại bảng lệnh trên GPU (Claude, 2026-11-08 12:55)

App thật, Direct3D 11, 100 % DPI: `glass2-win-W1/overlay-palette-{light,dark}-gpu.png`.
Bảng Ctrl+K gần như đặc, không viền đôi, thanh cuộn luôn hiện khi tràn, nhóm Trang theo đúng
thứ tự catalog, đủ biểu tượng và keycap. Đóng mục NOT RUN của bảng lệnh. Menu "+" vẫn chưa
chụp trên GPU.
