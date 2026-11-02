# Native code 58 — Nút thu gọn neo một chỗ, rail một loại hình (2026-11-02)

Sửa sau khi người dùng loại trạng thái thu gọn/mở rộng sidebar ("hoàn toàn không được"). Hướng chọn
(A trong ba hướng đề xuất): giữ hợp đồng cột 60/236 pt, áp quy tắc Finder cho nút thu gọn. Board
Shell-Chat và Compact trên canvas Quiet Workbench đã sửa theo; [direction.md](../../design/direction.md)
có mục mới "Nút thu gọn". Chạy thật bản `.native-build/dev-03/Viezan.app`; ảnh ở `evidence/native-shell-58/`.

## Lỗi đã thấy (ảnh `before-*.jpg`, 1400×860)

| Lỗi | Nguyên nhân |
| --- | --- |
| Nút thu gọn nhảy từ góc phải sidebar sang đầu header nội dung khi thu gọn. | Rail 60 pt không chứa nổi đèn cửa sổ (80 pt) + nút 32 pt, `railChrome` đẩy nút sang header. |
| Rail có ba hình dạng chồng nhau ở đầu cột: logo vuông 28 pt, ô tìm kiếm viền pill, icon trần. | Ô tìm kiếm giữ nền và viền của trạng thái mở rộng. |
| Chân rail chỉ còn một chấm xanh không nhãn. | Dải "Đang chạy nền" rút thành `StatusDot` đơn. |
| Đổi trạng thái không có chuyển động, nhãn cắt phụt. | `setNavigationCollapsed` ngoài `withAnimation`. |

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Shell (`ViezanApp.swift`) | Nút thu gọn là overlay `topLeading` của ZStack tại `WorkbenchView.toggleLeading = trafficLights + gap`, cao `headerHeight`; `sidebarTop` chỉ còn vùng kéo cửa sổ; header lùi trái `max(gutter, toggleTrailing + small − navigationWidth − hairline)`; bỏ `railChrome`. Ở bề rộng hẹp, bấm nút khi lớp nổi đang mở sẽ đóng nó; lớp nổi chừa `titlebarHeight` phía trên. Đổi trạng thái chạy trong `withAnimation(.easeOut(durationNormal))`, `accessibilityReduceMotion` thì không animation. |
| Rail (`NativeNavigation`) | Tìm kiếm là icon lặng, nền hover như các mục, không viền; dải chạy nền chỉ hiện khi mở rộng, rail gắn `StatusDot` lên icon của route (nhãn và tooltip ghi nội dung); nhãn, tiêu đề nhóm và chữ "viezan" có `transition(.opacity)`. |
| Token | `generate-resources.mjs` đọc `--vzn-duration-fast/normal` (ms → giây) thành `durationFast`, `durationNormal`; 52 metric. |
| Canvas | Shell-Chat: nút ngay sau đèn, `aria-expanded`. Compact: header lùi 31 px cho nút ở cùng x, logo 20 px, tìm kiếm không viền, chấm trên icon Launcher, bỏ chấm lẻ. |
| Test | `navigationToggleKeepsItsWindowPositionWhenTheColumnCollapses`: cùng x/y trước, trong và sau khi thu gọn, nằm trong cột 236 khi mở và vượt rail 60 khi thu. |

## Chạy thật (macOS, dev-03)

Vị trí nút qua Accessibility (toạ độ trong cửa sổ) ở sáu trạng thái: 1400 mở, 1400 thu, 1400 mở lại,
820 rail, 820 lớp nổi, 820 đóng lớp nổi — đều `x=94 y=8 w=32 h=32`. Ảnh `after-expanded.jpg`,
`after-collapsed.jpg`, `after-820-rail.jpg`, `after-820-overlay.jpg`. Khởi động không còn vòng focus trên
nút. Chưa chạy thật: Reduce Motion, chế độ tối (chỉ test đơn vị), 640 pt.

## Vòng 2 — sau nhận xét trên bản dev-03

| Nhận xét | Sửa |
| --- | --- |
| Nền sidebar sát ba nút đèn ở rail. | `--vzn-sidebar-width` 60 → 68 px (đèn kết thúc ở 59 pt, còn 9 pt); lề mục mở rộng đổi `gap` → `inset` để trục icon (34 pt) trùng tâm rail; AGENTS.md ghi 68px/236px. |
| Bấm nút không đổi hình thái. | Biểu tượng theo trạng thái (`WorkbenchView.navigationSymbol`): mở → `rectangle.leadinghalf.inset.filled`, thu → `sidebar.leading`; `ShellToolbarButton` cross-fade `durationFast` khi đổi glyph (tắt theo Reduce Motion); `FocusButton.highlight` tô nền `chrome-item-active` và chữ `chrome-fg-strong` khi giữ chuột. |
| Luôn có vòng viền quanh nút. | Hai nguồn: `Coordinator.activate` đặt first responder cả khi bấm chuột, và AppKit tự chọn control đầu vòng key view khi cửa sổ thành key (thấy lại vòng sau khi script đổi cỡ cửa sổ). `FocusButton.becomeFirstResponder` giờ chỉ nhận khi có `focusGranted` (trả focus, kích hoạt không phải chuột), sự kiện `keyDown` (Tab) hoặc VoiceOver bật. |
| Tên app "viezan" in thường. | "Viezan" (khớp direction.md và canvas). |
| "Tìm kiếm mọi thứ" dài. | Khoá `searchEverything` = "Tìm" / "Search" / "検索"; accessibility label thêm " · Bảng lệnh", tooltip giữ ⌘K. |
| Logo đổi cỡ và lệch khi đóng/mở. | Logo giữ 28 pt ở cả hai trạng thái; hàng logo lùi `gap` 12 pt để tâm logo (34 pt) trùng trục icon và tâm rail 68. |
| Cột đổi bề rộng không thấy chuyển động. | Thêm `.animation(navigationAnimation, value: navigationCollapsed)` trên cột (ngoài `withAnimation`); đo với 1200 ms tạm thời thấy 5 khung trung gian (337→569 px, easeOut) nên cơ chế chạy; ở 180 ms gọn trong ~2 khung chụp 10 fps. |

Ảnh `final-1400-a.jpg` / `final-1400-b.jpg` (trước và sau một click chuột thật, không vòng focus),
`final-820-rail.jpg` (rail 68, đèn có chỗ), `toggle-glyph-zoom.jpg` (hai glyph). Canvas: bốn board sửa
"Tìm", lề 16 px, rail 68 px, glyph nửa trái tô đầy ở trạng thái mở (bản 10).

## Kiểm tra

`swift build` PASS; `swift test` 35 + 46 PASS; `generate-resources --check` (3 locale, 52 metric) PASS,
`native.json` hai bản giống nhau; `documentation.mjs`, `domain.test.mjs` 11 PASS. Theo yêu cầu người dùng, vòng 2 chỉ có build và test; người dùng tự review tay (trạng thái giữ chuột, vòng
focus sau khi kích hoạt cửa sổ, chế độ tối, Reduce Motion).
