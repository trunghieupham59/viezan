# Liquid Glass 2.0 · Đợt 7a: Qt, kiểm trên Qt macOS

Ngày 2026-11-03, nhánh `develop`, làm tiếp trên Đợt 1–6 (chưa commit). Đợt này không commit.

Nguồn đọc: [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và bảng ánh xạ ở mục 3; board theo thứ tự các Đợt 1 → 6.

## Điều kiện và phạm vi

Đã kiểm điều kiện của đợt:

- Có báo cáo Đợt 1–6.
- **Chưa có máy Windows hoặc Linux.**

Vì chưa có máy, đợt này làm theo phương án 7a đã thống nhất:

- Sửa QML trong `apps/desktop-qt/qml/`.
- Dựng app và chạy QtTest bằng Qt 6.12 (Homebrew) trên máy Mac này, style Fusion như CI.
- Chụp bản Qt chạy trên macOS để đặt cạnh board.

Bước 7b vẫn còn: dựng lại, chạy QtTest và chụp nghiệm thu trên Windows hoặc Linux. Bước đó chỉ sửa thêm nếu gặp lỗi riêng của nền tảng.

Kính trong Qt là mặt bán trong kèm phản sáng, vẽ ngay trong scene. Nó không lấy mẫu desktop, nên không có blur desktop.

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| Nền `.win` | `Kit.AppBackdrop`: gradient 150° qua 4 điểm màu, cộng 2 quầng elip, đọc role `backdrop-*` và metric `backdropAngle`, `backdropStop1/2`, `backdropGlow*`. Áp dụng cho cả chế độ sáng lẫn tối. | `Kit.qml`, `Main.qml` |
| `.pane` | `Kit.GlassPane`: mặt gradient (`primary-nav-material` → `sidebar-bg`), viền `material-border`, vệt sáng 1 pt ở cạnh trên, bóng ngoài làm mờ bằng `MultiEffect`. Sidebar cách mép trái 8 pt, bắt đầu dưới hàng header 48 pt, bo 22, rộng 236 / rail 68 cộng thêm lề. | `Kit.qml`, `PrimaryNavigation.qml`, `Main.qml` |
| `.lens` | `Kit.GlassLens`: mục đang chọn tô `chrome-item-active` có viền sáng; khi hover dùng `chrome-item-hover` phẳng. Hàng điều hướng bo 12, cao 32. Ô "Tìm" là capsule lõm kèm keycap ⌘K; ở rail là nút tròn bằng kính. | `Kit.qml`, `PrimaryNavigation.qml` |
| `.content` | Mặt đọc dùng `GlassPane` với nền `canvas`, cách sidebar và mép cửa sổ 12 pt, cách header và đáy 8 pt, bo 22. Cả chế độ tối cũng vậy. | `Main.qml` |
| Header | Không còn dải nền riêng. Nút header là pill kính 32, chữ medium. Nút "Tạo mới" chỉ tô màu nhấn cho chữ. Vạch ngăn cao 18, màu `border-strong`. Breadcrumb đặt ở mép mặt đọc + 16. Tiêu đề trang tính năng tách thành "Tính năng" (mờ) / "Phiên" (đậm). | `Main.qml` |
| `.float` | `ReadingPanelSurface` (Lịch sử nhanh, Hoạt động, ⌘K, hộp thoại) chuyển sang `surface-raised`, bo 20, bóng lớn. | `Kit.qml` |
| `.card`, `.srow` | Card và CardBox dùng `FlatCard`: mặt `surface`, viền hairline, bo 16. Hàng CardRow cao tối thiểu 48, nhãn 14 medium, mô tả 12. | `Kit.qml` |
| `.seg` | FilterGroup có rãnh lõm `surface-muted` cao 32. Đoạn đang chọn là lens, đoạn còn lại chữ mờ. Mỗi đoạn rộng theo nhãn, nên không còn bị cắt chữ ("AI C…"). | `Kit.qml` |
| `.field` | SearchField trên Glass: nền `surface-subtle`, viền `border`, đổi sang `border-strong` khi đang gõ, không có vòng nhấn. | `Kit.qml` |
| `.btn.primary` | PrimaryButton: pill gradient `action-fill-top` → `action-fill-bottom`; vòng focus là viền 2 pt riêng. | `Kit.qml` |
| `.kbd`, `.chip` | KeyCap cao 20, chữ mono 11, nền trắng nổi. StatusBadge cao 24. | `Kit.qml` |
| Trang chủ | Hàng giới thiệu có dải model bằng kính (chấm trạng thái · model · trạng thái · Quản lý) và nút "Tạo mới". Bốn ô kính cao 56, ô icon tô màu theo `tone-*`. Gần đây là danh sách phẳng có `.seg`, rê chuột vào hàng thì hiện lens. Các preset khác giữ bố cục cũ. | `HomeWorkspace.qml` |
| Cài đặt | Thêm hàng "Phím tắt toàn cục" trong mục Chung. Mô tả liệt kê các phím đang bật; nút "Launcher & phím tắt" mở trang sidebar qua tín hiệu mới `routeRequested`. Gỡ `desktopCard` vì mục `desktop` đã bỏ khỏi `settingsSections` từ Đợt 5. | `SettingsWorkspace.qml`, `Main.qml` |
| Sửa lỗi chung | `ControlGlassSurface`: `MultiEffect` giờ bám kích thước của nút. Trước đây, khi nút rộng ra, mặt kính để lại một hình chữ nhật sáng hơn bên trong. | `Kit.qml` |

Các thay đổi trên chỉ áp dụng khi preset là Glass. Graphite, Paper, Corporate và Midnight vẫn đi nhánh cũ.

Không thêm chuỗi mới. Không sửa test.

## Kiểm chứng

QtTest, chạy theo CONTRIBUTING.md (Fusion, offscreen, theo cấu hình CTest):

```
$ cmake -S apps/desktop-qt -B .native-build/qt-glass2 -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
$ cmake --build .native-build/qt-glass2 --config Release
$ ctest --test-dir .native-build/qt-glass2 -C Release --output-on-failure
1/1 Test #1: native-qt-bridge .................   Passed
100% tests passed out of 1
(ViezanQtTests: Totals: 142 passed, 0 failed, 0 skipped)
```

Trong quá trình sửa có hai lỗi làm QtTest đỏ, cả hai đã sửa:

- Vòng binding trên `palette.buttonText` của FilterButton.
- Vòng binding trên `height` của KeyCap.

macOS:

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ swift build            (apps/macos)
Build complete! (0,33 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.110 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.078 seconds.
```

## Nghiệm thu bằng ảnh (Qt chạy trên macOS)

Ảnh nằm ở [`glass2-dot7/`](glass2-dot7/), thu nhỏ 50 %:

- **Board đặt cạnh app:**
  - `compare-home-1280-light.png`
  - `compare-chat-1280-dark.png`
  - `compare-settings-general-1280-light.png` (phần đầu board)
  - `compare-translate-820-light.png`
- **Ảnh app:**
  - Sáng 1280: Trang chủ, AI Chat, Dịch, Cài đặt, Nhiệt độ.
  - Sáng 820: Trang chủ, Dịch.
  - Tối 1280: Trang chủ, AI Chat, Cài đặt.
  - Tối 820: Trang chủ.

Dữ liệu của bản Qt preview lúc đầu là Graphite / Hệ thống. Để chụp, tôi làm như sau:

1. Chép file `workbench.json` của bản Qt vào scratchpad.
2. Đặt tạm preset Glass (sáng, rồi tối) và chụp.
3. Thoát app rồi chép trả file gốc.

Checksum sau khi chép trả trùng với bản gốc: `f6a8b15d…`. Dữ liệu bản macOS không bị đụng tới.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Chưa nghiệm thu trên Windows hoặc Linux. Chưa kiểm FluentWinUI3, DPI, font và khung cửa sổ của từng nền tảng. | Chưa có máy. Việc này để lại cho bước 7b. |
| Bố cục bên trong AI Chat, Dịch, Từ điển, Phiên dịch, Lịch sử, các trang hệ thống, Cài đặt (ngoài hàng phím tắt) và các cửa sổ phụ vẫn như cũ. Các màn này chỉ đổi vật liệu qua Kit. Ví dụ: composer chưa có nút Gửi tròn, ngôn ngữ vẫn dùng ComboBox, chưa có So sánh hai bước, chưa có hộp thoại chặn ở giữa cửa sổ. | 7a ưu tiên Kit và shell, là phần mọi màn dùng chung. Riêng phần bố cục từng màn, Qt cần khối việc tương đương Đợt 2–6 của macOS (khoảng 4 000 dòng QML). Đề xuất làm tiếp theo từng nhóm màn như bên macOS. |
| Bản Qt trên macOS có thanh tiêu đề hệ thống, nên khung app chỉ còn 1280×772. Nút thu gọn nằm trên vùng header chứ không nằm trong hàng đèn giao thông. | Qt dùng cửa sổ hệ thống; trên Windows/Linux bố cục thanh tiêu đề sẽ khác. |
| Hàng "Phím tắt toàn cục" có mô tả trống trên macOS. | Bản Qt trên macOS không đăng ký phím tắt toàn cục (danh sách rỗng). Trên Windows hàng sẽ liệt kê các phím. |
| Ô Bắt đầu nhanh dùng mặt pane, không dùng `ControlGlassSurface`. Ô icon tô màu tone × 0,15. | Tránh dùng `MultiEffect` trên mặt rộng; cách tính màu giống bên macOS. |
| Bóng của pane và mặt đọc làm bằng `MultiEffect`. Ở chế độ render phần mềm, pane không có bóng. | Qt không có `box-shadow`. Bản render phần mềm giữ viền và mặt pane, chỉ thiếu bóng. |
| Reduce Transparency / Increase Contrast chưa có nhánh mặt đặc riêng trong Qt. | QML không nhận được tuỳ chọn này một cách nhất quán trên mọi nền tảng. Mặt kính Qt vốn khá đục nên vẫn đọc được. |

## Chưa kiểm

- VoiceOver / Narrator, ba cỡ chữ, EN/JA, cửa sổ 640×480 trên app Qt chạy thật. Test fixture đã chạy các bề rộng 640 / 820 / 1200 / 1440 và đạt.
- Toàn bộ phần chạy thật trên Windows/Linux (bước 7b).
