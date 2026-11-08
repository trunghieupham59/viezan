# Liquid Glass 2.0 · Windows W5a — Shell

Ngày: 2026-11-08 (Asia/Saigon). Worktree `D:/PPP/viezan-wt-w5a`, nhánh
`feat/qt-glass2-w5a`. Không commit/push, không cài dependency. Không thao tác
`D:/PPP/viezan` hoặc `D:/PPP/viezan-wt-w5b`.

## Nguồn và phạm vi

Đã đọc AGENTS, capability contract, native-migration agent/workflow/rule,
viezan-product-engineering, skill viezan-native-migration, viezan-native-ux
và reference UI UX Pro Max. Theo `.claude/rules/ui-ux.md`, CONTRIBUTING,
design direction, spec Shell/Home/Chat/Translate; WINDOWS-HANDOFF mục 4/5 W5/6,
HANDOFF mục 2–4, Cửa sổ phụ, Bổ sung sau Đợt 1–7; báo cáo macOS Đợt 6/8/9
và Qt W1–W4. Đối chiếu HTML/PNG Home-Compact, Chat-Compact,
Translate-Compact, Shell-Minimum, Shell-Solid.

Tra cứu UI UX Pro Max `icon button accessible label --domain ux -n 2`:
áp dụng Content / Compact Label Overflow / All (giữ pill một hàng, tên đầy đủ
qua trợ năng và thao tác mở); bỏ kết quả Back Button / Mobile không phù hợp.
Không nhập kích thước mobile hoặc CSS/ARIA vào control Qt.

Workflow sync-docs giới hạn vào báo cáo này theo phạm vi người dùng giao.
Không đổi README/spec, version/lockfile/changelog, C++ sản phẩm, Swift,
Launcher.qml, DesktopPanels.qml hoặc UpdateSettings.qml.

## Triển khai

| Phần | Thay đổi |
| --- | --- |
| Home compact | Intro theo trung bình hai token title/heading (20 trên thang 13), pill tên model ngắn + trạng thái + mở Quản lý, Bắt đầu nhanh 2×2. Ở 640, Tạo mới rút còn biểu tượng có tên trợ năng. |
| Chat compact/minimum | Giữ một ô soạn và cột nội dung theo mặt đọc; intro nhỏ theo container. Dưới 760, breadcrumb giữ tên phiên, model là nút tròn; thu âm chuyển vào menu công cụ, vẫn có dải trạng thái/dừng. Resize không ghi lại preference hoặc thay phiên. |
| Translate compact | Hai chip chỉ hiện tên ngôn ngữ, giữ nhãn hướng trong accessible name; nút model ✦ cùng hàng. Thẻ Bản dịch có nền, viền và chân riêng ngay khi trống; tên ngôn ngữ, So sánh, Nghe, Sao chép vẫn hiện. |
| Shell-Solid | `SurfaceAppearance.qml` đọc hai cờ độc lập với `typeof` guard, binding theo NOTIFY. Kính chuyển mặt đặc, tắt phản sáng/bóng kính ở pane/control/lens; áp cho sidebar, mặt đọc, composer, lớp nổi, search/filter/card/primary control. Viền thường dùng token `border`; High Contrast và focus ô tìm kiếm dùng `border-strong`. |
| Ctrl+K | `desktopIntegration.paletteQuery` cung cấp dòng tính/Hỏi AI/Dịch/Tra trước các nhóm lệnh. Chuỗi palette có sẵn qua `tpl()`. Tính toán chép kết quả và toast; ba hành động còn lại mở phiên mới, gửi vào đúng ID chủ phiên như macOS. Kiểm module/loadBlocked trước khi thực thi; giữ IME, phím mũi tên/Enter/Escape. |

Màu mặt đặc được ghép từ `themePalettes` hiện có trên base đục: navigation
từ titlebar/sidebar, control từ navigation/surface, mặt đọc sáng từ surface,
mặt đọc tối từ app/canvas, overlay tối từ app/surface-raised. Token thắng
các swatch sáng literal của board; không thêm màu hex hoặc sửa preset khác.
Nền cảnh gradient giữ theo Shell-Solid; không tuyên bố blur desktop.

CMake chỉ thêm `SurfaceAppearance.qml` bằng một `list(APPEND NATIVE_RESOURCES ...)`
riêng. Không thêm Loader/delegate trong imported inline component.
Không thêm chuỗi; dùng lại bốn khoá palette và các khoá hiện có.

## Kiểm chứng

Build riêng `.native-build/qt`, Qt `D:/Qt/6.8.3/msvc2022_64`, generator
Visual Studio 17 2022, Release. Build nền đạt; không chạy toàn suite trước sửa
theo yêu cầu. Build tuần tự, `MSBUILDDISABLENODEREUSE=1`, `/nodeReuse:false`.

Test mới ở cuối slots và cuối file trong khối `// ---- W5a Shell ----`.
Assertion cũ W2 cập nhật theo yêu cầu mới: chân bản dịch trống vẫn hiện.
Assertion W3 về thứ tự composer kiểm nút thu âm ẩn tại 640, model đứng trước
Gửi; tại 820/1200 vẫn kiểm thứ tự model → thu âm → Gửi.
Fixture chỉ dùng QTemporaryDir và bridge không thực thi provider thật.

Mọi lượt test: `QT_QPA_PLATFORM=offscreen`, `QT_QUICK_BACKEND=software`,
`QT_QPA_FONTDIR=C:/Windows/Fonts`, `QTEST_FUNCTION_TIMEOUT=600000`, style
tường minh. Wrapper Python giới hạn tiến trình; hai suite cuối chạy CTest
`--timeout 5400 -j 1`, tuần tự Fusion rồi FluentWinUI3. Danh sách lấy từ
`-functions`, loại duy nhất bài GPU `acceleratedGlassSurfacesSurviveAppearanceChanges`.
Chỉ sửa CTestTestfile trong build cho từng lượt, khôi phục bytes gốc sau chạy;
không đổi đăng ký test trong CMake nguồn.

### Kiểm nguồn/build và các lượt tập trung

- Build nền và build Release cuối: PASS (`.native-build/w5a-baseline-build.log`,
  `w5a-final-build.log`, `w5a-final2-build.log`). Không mở executable ứng dụng.
- `npm run check:resources`: PASS, 3 locales / 78 metrics. Lượt đầu báo stale
  vì checkout CRLF; `npm run resources` chuẩn hoá xuống dòng. So với HEAD:
  hai bundle chỉ đổi xuống dòng, không đổi JSON; chúng byte-identical.
- `npm run check:docs`: PASS, version 2.4.2.
- Node domain: 11 passed / 0 failed. Python: 7 skipped (chỉ dành macOS).
- `git diff --check`: PASS; chỉ cảnh báo Git sẽ chuyển LF/CRLF của bundle.
- Hash 109 file QML/C++/test/CMake/bundle lưu trước hai suite tại
  `.native-build/w5a-final-hashes.json`.

Test W5a bao phủ 640/820/900/1280, sáng/tối, VI/EN/JA; geometry của pill,
ngôn ngữ/model cùng hàng, footer kết quả trống, giữ cùng TextArea và ID/draft
khi resize. Fake `systemAppearance` dùng QtObject có NOTIFY, chuyển
00 → 10 → 11 → 01 → 00 ở cả hai mode, kiểm độ đục/viền, phản sáng ẩn,
không ảnh hưởng Graphite. Ctrl+K kiểm chuỗi ba locale, thứ tự, clipboard,
IME, Enter, mũi tên, Escape, ID phiên mới và chặn module đã tắt.

Trong triển khai, test đầu phát hiện viền sidebar gán trùng, đã sửa. Hai lượt
tiếp thoát bất thường khi test tìm popup theo tên trên toàn cửa sổ sau chuyển
Chat → Dịch: popup Chat cùng tên đang chờ huỷ. Trace xác nhận các assertion
bố cục trước đó đã qua; sửa test tìm trong đúng picker của Dịch. Đây không
phải bằng chứng lỗi GPU/QQmlObjectCreator. Một assertion mặt đặc tìm vào
control menu ẩn được đổi sang nút navigation đang hiện; assertion mép cột
Chat giới hạn ở compact vì desktop căn cột đọc bên trong transcript rộng.

FluentWinUI3, W5a trước sửa assertion desktop (`w5a-focused4.txt`):

```text
Totals: 9 passed, 1 failed, 0 skipped, 0 blacklisted, 214800ms
```

FluentWinUI3, desktop + palette + hồi quy W2 (`w5a-focused5.txt`):

```text
Totals: 10 passed, 0 failed, 0 skipped, 0 blacklisted, 644313ms
```

FluentWinUI3, bản nguồn cuối, mốc 900 px (`w5a-breakpoint.txt`):

```text
Totals: 3 passed, 0 failed, 0 skipped, 0 blacklisted, 20698ms
```

Hai lượt đạt trên không có QWARN. Kiểm 900 xác nhận sidebar mở theo preference,
trong khi chip rút gọn theo bề rộng **container**, không chỉ cửa sổ.

### Các suite đầy đủ trước sửa token viền

Lượt Fusion đầu phát hiện hai assertion W3 vẫn đo hình học nút thu âm đã ẩn
tại 640. Không đổi UI để khôi phục bố cục cũ; cập nhật assertion theo
Shell-Minimum như trên. Kết quả lượt đầu (`w5a-final-fusion.txt`):

```text
Totals: 224 passed, 2 failed, 0 skipped, 0 blacklisted, 4372713ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 439ms
50% tests passed, 1 tests failed out of 2
Total Test time (real) = 4373.46 sec
```

Fusion cuối (`w5a-final2-fusion.txt`, `w5a-final2-fusion-backend.txt`,
`w5a-final2-fusion.stdout`):

```text
Totals: 226 passed, 0 failed, 0 skipped, 0 blacklisted, 4995083ms
Totals: 36 passed, 0 failed, 0 skipped, 0 blacklisted, 503ms
1/2 Test #1: native-qt-bridge .................   Passed  4995.23 sec
2/2 Test #2: native-qt-backend ................   Passed    0.88 sec
100% tests passed, 0 tests failed out of 2
Total Test time (real) = 4996.19 sec
```

Fusion có tám cảnh báo `QUnifiedTimer::stopAnimationDriver: driver is not running`
trong `glassImageResearchAndReset` (640/820/1200/1280, sáng/tối); các ca này
đều PASS. Cùng tám cảnh báo đã ghi trong báo cáo Qt W4, mục suite Fusion.
Không có FAIL hoặc cảnh báo QML ở các ca W5a. Đối chiếu sau Fusion:
109 hash nguồn giữ nguyên trước khi bắt đầu FluentWinUI3.

FluentWinUI3 đầy đủ của W5a bị cắt do timeout phiên 4 giờ, chưa có tổng kết
PASS cho toàn suite (`w5a-final-fluent.*`, tiến trình trả `143`). Wrapper đọc
log sau đó gặp `PermissionError` ở file backend; không suy diễn kết quả backend.
Theo chỉ dẫn tiếp theo của người dùng, không chạy lại suite đầy đủ ở worktree
này; **Claude sẽ chạy trên bản gộp**. Kết quả Fusion 226/0 ở trên thuộc bản
trước sửa token viền.

Kiểm riêng composer sau cập nhật assertion, Fusion (`w5a-composer-final.txt`):

```text
Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 97739ms
```

### Sửa token viền sau review Claude

Theo phản hồi người dùng: Claude đã review đạt bố cục hẹp, breadcrumb,
composer gộp và Ctrl+K. Chỉ sửa viền: bỏ alpha tự đặt 0.14/0.24,
`SurfaceAppearance.edge` lấy trực tiếp `border` / `border-strong`; ô tìm kiếm
khi focus dùng `border-strong`. Không thêm token hoặc độ mờ mới.
Test mặt đặc so màu đầy đủ với theme palette ở cả sáng/tối và hai cờ độc lập,
đồng thời kiểm viền ô tìm kiếm khi nhận/mất focus.

Build Release: PASS (`.native-build/w5a-token-build.log`).
Chỉ chạy `w5aCompactShell`, `w5aSolidAppearance`, `w5aPaletteQueries`,
Fusion rồi FluentWinUI3, offscreen/software, Qt bin trên PATH,
`QT_QPA_FONTDIR=C:/Windows/Fonts`, `QTEST_FUNCTION_TIMEOUT=600000`,
timeout mỗi lượt tối đa 1800 giây.

Fusion (`.native-build/w5a-token-fusion.txt`), không có QWARN:

```text
Totals: 11 passed, 0 failed, 0 skipped, 0 blacklisted, 317226ms
```

FluentWinUI3 (`.native-build/w5a-token-fluent.txt`), không có QWARN:

```text
Totals: 11 passed, 0 failed, 0 skipped, 0 blacklisted, 269180ms
```

Hai lượt chạy tuần tự, cùng bản build. Đối chiếu 109 hash trong
`.native-build/w5a-token-hashes.json`: nguồn/resource không đổi trong hai lượt.
So với bản đã review, chỉ `SurfaceAppearance.qml`, `Kit.qml` và test mặt đặc
thay đổi; báo cáo này ghi bổ sung kết quả. `git diff --check`: PASS.
Không commit, không chạy lại suite đầy đủ; Claude kiểm suite trên bản gộp.

## Nghiệm thu sống

- Ảnh 1280×800, 820×640, 640×480 sáng/tối, đối chiếu board: **Claude nghiệm thu sau**.
- Narrator, bàn phím/IME trong app thật: **Claude nghiệm thu sau**.
- 150 % DPI: **Claude nghiệm thu sau**.
- Reduce Transparency / High Contrast thực của Windows và GPU: **Claude nghiệm thu sau**.
- Không mở app thật, không chụp màn hình, không chạy GPU có cửa sổ.
- Linux/macOS runtime, provider/micro thật, release: **Not run**, ngoài phạm vi.

Kiểm tự động không thay thế nghiệm thu hình ảnh hoặc screen reader.
