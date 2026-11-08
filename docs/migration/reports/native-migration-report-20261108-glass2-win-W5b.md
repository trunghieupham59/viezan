# Liquid Glass 2.0 · Windows W5b: cửa sổ phụ và cập nhật

Ngày: 2026-11-08. Worktree `D:/PPP/viezan-wt-w5b`, nhánh
`feat/qt-glass2-w5b`. Không commit/push. Không thao tác worktree W5a.

## Nguồn và phạm vi

- `AGENTS.md`, `.claude/rules/ui-ux.md`, `docs/design/direction.md`;
  `WINDOWS-HANDOFF.md` mục 4, 5 W5, 6; `HANDOFF.md` mục 2–4,
  Cửa sổ phụ và Bổ sung sau Đợt 1–7.
- Đã đọc HTML và PNG của Launcher, Launcher-States, QuickChat,
  QuickTranslate, UpdateSheet, UpdateSheet-States; spec Launcher, Quick Chat,
  phần cập nhật của Settings; báo cáo macOS Đợt 6/8 và Qt W1–W4.
- Workflow: `docs/agents/workflow/native-migration/native-migration.json`;
  rule native-migration và viezan-product-engineering; skill
  viezan-native-migration, viezan-native-ux và UI UX Pro Max.
  Sync-docs giới hạn vào báo cáo bước này theo phạm vi người dùng giao.
- Tra cứu UI UX Pro Max: `keyboard focus modal --domain ux -n 2`.
  Áp dụng Focus States (All) qua focus native/visualFocus và trả focus khi
  đóng popup. Kết quả Focus Not Obscured (Web) chỉ dùng làm mục tiêu giữ
  control trong vùng nhìn, không chép CSS/ARIA hoặc lấy làm bằng chứng Qt.

Không đổi C++ sản phẩm, Kit.qml, token, phiên bản, lockfile hoặc changelog.
CMake chỉ thêm một `list(APPEND NATIVE_RESOURCES ...)` riêng cho ba file mới.
Main.qml chỉ có một khối `// W5b update sheet` ngay trước dấu `}` cuối;
khối này nối UpdateSheet, route cửa sổ phụ và quickSessionID. Không sửa shell.

## Đã triển khai

| Phần | Hành vi và trình bày |
| --- | --- |
| Launcher | Rộng 720 từ metrics; ô tìm 60, hàng 44, nhóm Gợi ý/Gần đây. Gọi `launcherHome(quickSessionID)`, lấy trang theo module và phân nhóm tiếp tục phiên theo `fresh`; làm mới khi mở lại. Chân có tiền tố t/d/?/=. Tiền tố t/d/? đi qua `paletteQuery`; phép tính đi qua `calculate`, dấu `=` chỉ là tiền tố điều hướng. Tên file thay ID đường dẫn thô. Giữ chọn bằng ID khi kết quả bất đồng bộ thêm vào, không sort QV4. Chặn kết quả file/tiền tệ cũ trong thời gian debounce. |
| Launcher trạng thái | Chip tải ứng dụng, lỗi mở + Thử lại; kết quả máy tính/tiền tệ từ dịch vụ. Giữ vị trí 22%, ẩn khi mất focus, ↑↓/Enter/Tab/Ctrl+Enter/Shift+Enter/Escape; mọi phím xử lý riêng bỏ qua IME composition. |
| Chat nhanh / Quick AI | Một composer cho mỗi cửa sổ, nằm trên transcript ở Quick AI và dưới ở Chat nhanh; nút Dừng thay Gửi khi chạy, trạng thái nghĩ/lỗi/chưa có AI, Sao chép có phản hồi, thử lại theo task/phiên/revision. Model có tên ngắn và popup chọn dùng `modelSections`/`applyModelTier`; không nhập ID thô. Phiên, draft và model được giữ khi mở sang cửa sổ chính hoặc đổi route. |
| Dịch nhanh | Rộng 352; tiêu đề ngôn ngữ, văn bản, meta và hàng nút riêng; hiển thị `errorCode`, `selectionUnavailable`, `providersEmpty`. Vượt 5.000 ký tự hiện `sourceTooLong`, vô hiệu Gửi và không submit. Lỗi có Thử lại. Sao chép/Dán thay vùng chọn/Hoàn tác theo khả năng backend; không dùng câu yêu cầu quyền Trợ năng macOS. |
| Cập nhật | File `UpdateSheet.qml` độc lập, popup giữa cửa sổ rộng 520, nền Kit, không nền Popup mặc định. `updatePrompt` rỗng thì ẩn; đủ ba trạng thái có bản mới/đang tải/đã tải; ghi chú, phiên bản, dung lượng, tiến độ, thời gian còn lại, lỗi xác minh. Nhắc sau gọi `snoozeUpdate`, đóng/Escape gọi `dismissUpdatePrompt`; không tự cài. Kiểm tra thủ công gọi `presentUpdateIfAvailable` sau hoàn tất, kể cả khi đã rời trang Settings. |

`AuxiliaryWindow.qml` dùng palette từ tài nguyên và `Kit.ReadingPanelSurface`;
`PanelNotice.qml` dùng màu ngữ nghĩa và tên/role trợ năng. Các lớp cuộn bật
AlwaysOn khi tràn. Model popup giữ ownerID, đóng khi đổi phiên và trả focus.
Các component có delegate đều nằm trong file QML độc lập, tránh lỗi Qt 6.8.3
với inline component được import.

## Chuỗi · chỉnh sau review Claude

Claude đã duyệt hành vi và test W5b; lượt này chỉ chỉnh tên khoá và dòng
mô tả UpdateSheet theo yêu cầu:

- `launcher_suggestions` → `launcher_section_suggestions`.
- `quick_keyboard_hint` → `quickKeyboardHint`.
- Bỏ `update_current_version`; dùng `updateSheetSummary` và
  `updateSheetSummaryNoSize`. Cả VI/EN/JA dùng một câu mẫu hoàn chỉnh qua
  `tpl()` với phiên bản mới, dung lượng và phiên bản đang dùng.
- Trạng thái `available` chỉ có một nhãn `update-sheet-status` dưới tiêu đề:
  `Viezan {version} · {size} · bạn đang dùng {current}`. Khi `packageSize ≤ 0`,
  chọn mẫu không có dung lượng và không để dấu phân cách thừa. Giữ cách định
  dạng MB theo locale hiện có; downloading/ready giữ nội dung và nhãn dung
  lượng riêng như trước.
- Các khoá bổ sung cuối cùng so với nền trước W5b: `launcher_section_suggestions`,
  `launcher_prefix_hint`, `quickKeyboardHint`, `updateSheetSummary`,
  `updateSheetSummaryNoSize`. Không còn ba tên cũ trong QML hoặc bundle.

Đã chạy `npm run resources`, `npm run check:resources`, build Release trong
`.native-build/qt` (Qt 6.8.3 / Visual Studio 17 2022, timeout build 900 giây).
Hai bundle native khớp từng byte; các chuỗi ngoài phạm vi giữ nguyên.
Main.qml, Kit.qml, dịch vụ C++ và CMake không thay đổi trong lượt chỉnh này.

Test `w5bUpdateSheet` kiểm VI/EN/JA với dung lượng dương, bằng 0 và âm;
chỉ còn tiêu đề + một nhãn tóm tắt đang hiển thị; kiểm lại nội dung
`downloading`/`ready`. Chạy riêng `w5bLauncher`, `w5bQuickPanels`,
`w5bUpdateSheet`, Fusion rồi FluentWinUI3, tuần tự, mỗi tiến trình timeout
900 giây; `QT_QPA_PLATFORM=offscreen`, `QT_QUICK_BACKEND=software`,
`QT_QPA_FONTDIR=C:/Windows/Fonts`, `QTEST_FUNCTION_TIMEOUT=600000`, Qt bin trên
PATH và `QT_QUICK_CONTROLS_STYLE` tường minh.

Fusion (`.native-build/w5b-strings-fusion.txt`):

```text
Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 16133ms
```

FluentWinUI3 (`.native-build/w5b-strings-fluent.txt`):

```text
Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 17601ms
```

Mỗi lượt có 24 cảnh báo `This plugin does not support raise()` của nền
offscreen; không có cảnh báo QML, FAIL hoặc SKIP. `git diff --check` đạt.
Không chạy lại toàn suite theo yêu cầu; các tổng kết đầy đủ phía dưới là
bằng chứng **trước lượt chỉnh chuỗi**, không phải chạy lại trên bản mới.
Không commit. Ảnh, Narrator, 150 % DPI: **Claude nghiệm thu sau**.

## Kiểm nguồn và build

- Build trước sửa: PASS, không chạy toàn suite trước sửa theo chỉ dẫn.
- CMake: Visual Studio 17 2022, x64, Qt `D:/Qt/6.8.3/msvc2022_64`;
  `.native-build/qt`, Release, BUILD_TESTING=ON. Build giới hạn 900 giây.
  CMAKE_BUILD_TYPE không được generator nhiều cấu hình dùng; `--config Release`
  là cấu hình thực tế.
- `npm run check:resources`: PASS, 3 locales / 78 metrics.
- `npm run check:docs`: PASS.
- `node --test scripts/native/__tests__/domain.test.mjs`: 11 pass, 0 fail.
- `git diff --check`: PASS (Git nhắc LF/CRLF cho bundle sinh tự động).
- Kiểm W5b được thêm cuối danh sách slot và cuối file test trong một khối
  `// ---- W5b Panels ----` ở mỗi vị trí. Fixture dùng trạng thái tổng hợp,
  QTemporaryDir và provider demo; không đọc hồ sơ/credential cá nhân, không
  gọi AI hay mở ứng dụng/cài cập nhật thật.

## QtTest · trước lượt chỉnh chuỗi

Nhóm W5b cuối, Fusion (log `.native-build/w5b-targeted.txt`):

```text
Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 15368ms
```

Ca kiểm bao gồm Launcher home/module/continue, tiền tố, ID chọn ổn định,
IME, lỗi mở; Dịch nhanh quá giới hạn, lỗi vùng chọn, thiếu provider,
retry đúng task/phiên; Quick AI thiếu model/đang nghĩ/lỗi; ba locale sáng/tối,
352/480 px; popup cập nhật đủ ba trạng thái, snooze/đóng/Escape/cancel/cài
chủ động và hoàn tất kiểm tra sau khi view Settings bị huỷ.

Các lỗi đã bắt và sửa trước bộ cuối: vòng binding palette, Accessible gắn
vào Popup thay vì content Item, sourceSize tự tham chiếu, composer bị giãn
418px khi chuyển hai neo dọc. Kiểm chuyển chế độ được giữ làm hồi quy.
Không có cảnh báo QQmlEngine ở nhóm W5b cuối. Cảnh báo `This plugin does not
support raise()` là giới hạn của nền offscreen; không dùng nó để khẳng định
focus/hide trên desktop thật đạt.

Hai bộ cuối chạy tuần tự qua CTest, `--timeout 5400 -j 1`, cùng mã nguồn,
`QT_QPA_PLATFORM=offscreen`, `QT_QUICK_BACKEND=software`,
`QTEST_FUNCTION_TIMEOUT=600000`, `QT_QPA_FONTDIR=C:/Windows/Fonts`, style
đặt tường minh. Script `.native-build/run-w5b-suite.ps1` lấy danh sách
`-functions`, chọn đủ 75/76 hàm; chỉ loại
`acceleratedGlassSurfacesSurviveAppearanceChanges` theo yêu cầu không chạy
GPU có cửa sổ. Sửa CTestTestfile **trong build** để truyền danh sách và style,
khôi phục bằng finally sau mỗi bộ; không đổi đăng ký test CMake trong nguồn.
Backend suite vẫn chạy đầy đủ ở mỗi bộ.

Fusion, tổng kết nguyên văn:

```text
Internal ctest changing into directory: D:/PPP/viezan-wt-w5b/.native-build/qt
Test project D:/PPP/viezan-wt-w5b/.native-build/qt
    Start 1: native-qt-bridge
1/2 Test #1: native-qt-bridge .................   Passed  3597.72 sec
    Start 2: native-qt-backend
2/2 Test #2: native-qt-backend ................   Passed    0.67 sec

100% tests passed, 0 tests failed out of 2

Total Test time (real) = 3598.39 sec
Totals: 225 passed, 0 failed, 0 skipped, 0 blacklisted, 3597611ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 516ms
```

Log: `.native-build/w5b-fusion-ctest.log`, `w5b-fusion-qt.txt`,
`w5b-fusion-backend.txt`. Hash 75 file nguồn trước/sau Fusion không đổi.

FluentWinUI3, tổng kết nguyên văn:

```text
Internal ctest changing into directory: D:/PPP/viezan-wt-w5b/.native-build/qt
Test project D:/PPP/viezan-wt-w5b/.native-build/qt
    Start 1: native-qt-bridge
1/2 Test #1: native-qt-bridge .................   Passed  2779.03 sec
    Start 2: native-qt-backend
2/2 Test #2: native-qt-backend ................   Passed    0.57 sec

100% tests passed, 0 tests failed out of 2

Total Test time (real) = 2779.62 sec
Totals: 225 passed, 0 failed, 0 skipped, 0 blacklisted, 2778894ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 510ms
```

Log: `.native-build/w5b-fluent-ctest.log`, `w5b-fluent-qt.txt`,
`w5b-fluent-backend.txt`.

Đối chiếu sau cả hai bộ: 75 file nguồn không đổi. Cả hai bộ chỉ có 24
cảnh báo `This plugin does not support raise()` ở fixture W5b; không có
cảnh báo QML, FAIL hoặc SKIP. Ca GPU được loại khỏi danh sách trước khi chạy,
không tính là QtTest SKIP. CTestTestfile trong build đã được khôi phục.

Kiểm phạm vi trước lượt chỉnh chuỗi: Main chỉ thay trong khối W5b; Kit và C++
sản phẩm không đổi; lúc đó locale thêm bốn khoá mỗi ngôn ngữ và hai native
bundle khớp từng byte. Tên khoá hiện hành và kiểm sau review ở mục Chuỗi.
Build/QtTest đạt; nghiệm thu hình ảnh và trợ năng vẫn để riêng bên dưới.

## Chênh lệch và nghiệm thu còn lại

- **Tiền tệ #44: Blocked ở phần backend.** `DesktopIntegration` chỉ expose
  chuỗi `currency`; không có API tiền đích, tỷ giá/ngày, trạng thái tải/lỗi
  chuyển đổi. UI hiện kết quả thật và sao chép; chưa có bộ chọn “Đổi sang”,
  dòng tỷ giá/ngày hoặc loading/error riêng như board. Không viết lại phép
  đổi tiền hay sửa C++ ngoài phạm vi. Các hàm/thuộc tính đã kiểm:
  `DesktopIntegration.h`, `DesktopIntegration::searchFiles`, `CurrencyRates`.
- Quick AI vẫn là cửa sổ phụ Qt tách khỏi cửa sổ tìm kiếm (hành vi native Qt
  hiện có), quay lại Launcher qua nút Tìm kiếm. Phím gửi vẫn Ctrl+Enter;
  Enter xuống dòng như Qt trước bước này, gợi ý phím ghi đúng hành vi.
- Dịch nhanh giữ khả năng sửa nguồn và chọn ngôn ngữ của Qt; không cố định
  chiều cao 196 như một thẻ kết quả macOS. Meta/nút vẫn tách hàng ở 352.
- **Ảnh, GPU, Narrator, 150 % DPI: Claude nghiệm thu sau.** Không mở app thật,
  không chạy test GPU có cửa sổ, không chụp màn hình. Chỉ đọc PNG board đã có.
- UX06/UX07 có bằng chứng fixture cho lỗi/retry/IME; UX08/UX09 chỉ có hình học
  offscreen, VI/EN/JA và sáng/tối. IME thật, screen reader (UX10), cỡ chữ hệ
  thống, độ tương phản và Windows DPI (OS02): NOT RUN, Claude nghiệm thu sau.
- Global hotkey/focus với ứng dụng khác, thay vùng chọn thật, AI thật,
  tải/checksum/chữ ký/cài bản cập nhật thật: NOT RUN. Fixture không thay cho
  nghiệm thu dịch vụ hay Windows desktop.
- Nhánh mặt đặc thuộc W5a; W5b dùng Kit để nhận thay đổi sau gộp. Nghiệm thu
  Reduce Transparency/High Contrast sau gộp: Claude nghiệm thu sau.
- Python native-script tests: NOT RUN vì không đổi script Python hoặc đóng gói.
- Swift build/test, Linux runtime, release/package: NOT RUN trên bước Windows
  này. Hai native bundle được đối chiếu nhưng không suy thành macOS pass.

Source, build, QtTest và nghiệm thu trực tiếp là các mức bằng chứng riêng.
