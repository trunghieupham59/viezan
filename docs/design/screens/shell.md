# Khung ứng dụng và bề mặt toàn cục

> Bản vẽ gốc: `boards/Main.dc.html`, `boards/Sidebar.dc.html`, `boards/Narrow.dc.html`, `boards/CommandPalette.dc.html`, `boards/Toasts.dc.html`, `boards/UpdatePopup.dc.html`, `boards/Welcome.dc.html`, `boards/WelcomeSteps.dc.html`, `boards/SmallSurfaces.dc.html`, `boards/Launcher.dc.html` · Board chi tiết: `specs/shell.html` · Mã nguồn: `src/App.tsx`, `src/components/templates/AppShell.tsx`, `src/components/templates/PageHeader.tsx`, `src/components/organisms/PrimaryNavigationSidebar.tsx`, `src/components/organisms/CommandPalette.tsx`, `src/components/organisms/NotificationViewport.tsx`, `src/components/organisms/UpdateNotification.tsx`, `src/pages/UpdatePopupPage.tsx`, `electron/updateNotification.ts`, `electron/trayManager.ts`

Luật chung (token, Button, bậc bề mặt, z-index, responsive, trạng thái chung) nằm ở [`foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của khung cửa sổ và các bề mặt dùng chung cho mọi trang.

## 1. Mục đích

Khung ứng dụng là phần luôn có mặt quanh mọi trang: thanh tiêu đề kéo được, thanh điều hướng chính, header trang, bảng lệnh ⌘K, chồng toast thông báo, thông báo cập nhật (cửa sổ popup riêng do main process quản lý) và các bề mặt ngoài cửa sổ (khay hệ thống Windows/Linux, mục thanh menu macOS của module Nhiệt độ). Người dùng chạm vào khung mỗi khi chuyển trang, tìm lệnh, đọc kết quả của một hành động hoặc được báo có bản mới. Thành công nghĩa là: luôn biết mình đang ở trang nào, tới mọi trang trong một cú bấm hoặc một lần gõ ⌘K, thấy việc gì đang chạy nền, và nhận phản hồi của mọi hành động ở cùng một chỗ (góc dưới phải) mà không bao giờ che ô soạn Chat.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Khởi động app | Cửa sổ chính 1200 × 700 (tối thiểu 640 × 480, `electron/mainWindowGeometry.ts`) | Trang mở lại là `activePage` đã lưu; nếu module của trang đó đã tắt thì về Trang chủ (`resolveActivePage`, `src/App.tsx`). |
| Thanh điều hướng | Bấm một mục trang | `setActivePage`; mục Dịch còn xoá bản dịch cũ (`navigateEffect: 'clearTranslation'`, `src/modules/catalog.ts`). |
| Bảng lệnh | `⌘K` (macOS) / `Ctrl K` (Windows, Linux), hoặc nút "Tìm hoặc chạy lệnh" trên thanh bên | Phím tắt là bật/tắt (toggle); mở bảng lệnh sẽ đóng mọi lớp phủ điều hướng trước (`src/App.tsx:128-151`). |
| Dải "Đang chạy nền" | Bấm một hàng | Quạt → Nhiệt độ & quạt; Phím tắt toàn cục → Launcher & phím tắt; Tiện ích Chrome → Dịch mọi nơi. |
| Popup cập nhật | Cửa sổ riêng do main mở khi lần kiểm tra nền tìm thấy bản mới | Không lấy focus (`showInactive`). |
| Khay hệ thống (Windows, Linux) | Bấm / bấm đúp biểu tượng, hoặc menu "Mở Viezan" | Đóng cửa sổ bằng X / Alt+F4 chỉ ẩn cửa sổ, app vẫn chạy (`electron/trayManager.ts`). |
| Thanh menu macOS | Menu của số đo nhiệt độ › "Mở Viezan" | Chỉ có khi người dùng bật số đo thanh menu trong module Nhiệt độ. |
| Launcher, Quick Chat | "Mở trong Chat", "Mở Cài đặt", mở tính năng | Main gửi sự kiện, `App.tsx` chuyển trang và gieo nội dung (Chat, Dịch, Từ điển). |

Điểm ra: chọn một trang (khung giữ nguyên, chỉ vùng `app-main` đổi), đóng cửa sổ (macOS: app vẫn ở Dock; Windows/Linux: app vào khay), hoặc "Thoát Viezan" từ khay.

## 3. Bố cục

Sơ đồ ở 1200 × 760, thanh bên mở rộng, trang không có sidebar ngữ cảnh:

```
┌ .app-titlebar-drag 40 px ── [● ● ●] 80 px ┬ .app-header-navigation 60 px [▣] ┬──── vùng kéo cửa sổ ───────┐
├ .app-titlebar-divider (1 px, --vzn-divider) ───────────────────────────────────────────────────────────┤
├ nav.primary-navigation-sidebar 236 px ─┬ main.app-main ─────────────────────────────────────────────────┤
│ .sidebar-brand-row  [V] Viezan         │ header.page-header ≥ 56 px                                     │
│ [🔍 Tìm hoặc chạy lệnh         ⌘K]    │  Tiêu đề 18 · mô tả 12          [trạng thái] [hành động chính] │
│ ───────────── .app-sidebar-divider ─── ├────────────────────────────────────────────────────────────────┤
│ .sidebar-nav-scroll (cuộn được)        │                                                                │
│   Trang chủ                            │   Nội dung trang trên canvas --vzn-bg                          │
│   AI        · AI Chat                  │   (thẻ --vzn-surface, lề 24 px)                                │
│   NGÔN NGỮ  · Dịch · Phiên dịch        │                                                                │
│             · Từ điển · Dịch mọi nơi   │                                                                │
│   HỆ THỐNG  · Nhiệt độ & quạt          │                                                                │
│   TIỆN ÍCH  · Launcher & phím tắt      │                                                                │
│ .sidebar-bottom-group (ghim đáy)       │                                                                │
│   ● Quạt · Cân bằng                    │                                                  ┌ toast ──┐ │
│   ● Phím tắt toàn cục            2     │                                                  │ ≤ 400px │ │
│   ───────                              │                                                  └─────────┘ │
│   ⚙ Cài đặt        • Chưa có key      │                                         16 px từ mép phải/dưới │
└────────────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

Trang AI Chat chèn sidebar lịch sử (organism riêng, `AIChatSidebar`) giữa thanh điều hướng chính và cột trang; khi đó header trang chỉ phủ cột tính năng (`.app-feature-workspace` › `.app-feature-body`, `AppShell.tsx:66-75`).

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Thanh tiêu đề | `AppShell` (`.app-titlebar-drag`) | Cao `--vzn-titlebar-height` (40); nền `--vzn-titlebar-bg` (Glass/hệ thống trên macOS: `--vzn-titlebar-material`); macOS chừa `--vzn-titlebar-mac-controls-width` (80) cho đèn giao thông đặt ở (16, 14) | Không; toàn dải là vùng kéo, nút có `titlebar-no-drag` |
| Ô nút thu gọn | `.app-header-navigation` (host portal) | Rộng `--vzn-sidebar-width` (60), căn giữa nút `sm` 32 | Không |
| Điều hướng chính | `PrimaryNavigationSidebar` (`nav.primary-navigation-sidebar` › `.primary-navigation-panel`) | Mở rộng `--vzn-sidebar-expanded-width` (236; 208 khi cửa sổ < 900 px), rail `--vzn-sidebar-width` (60); nền `--vzn-sidebar-bg`, viền phải `--vzn-chrome-divider`; chữ đọc `--vzn-chrome-*` | Chỉ `.sidebar-nav-scroll` cuộn (`overscroll-behavior: contain`) |
| Hàng thương hiệu | `.sidebar-brand-row` | Cao tối thiểu 40; logo `AppLogoIcon size="sm"`; chữ "Viezan" chỉ khi mở rộng | Không |
| Nút tìm | `.sidebar-search-trigger` | Button `sm` 32, chip phím `.sidebar-shortcut` | Không |
| Nhóm trang | `.sidebar-space` (một `section` mỗi nhóm) | Nhãn nhóm `--vzn-font-size-caption`, viết hoa, `--vzn-tracking-caps`; khi rail: nhãn ẩn, thay bằng đường kẻ `--vzn-divider` | Trong vùng cuộn |
| Dải chạy nền | `.sidebar-background` | Hàng Button `xs` 28, chấm `StatusDot tone="ok"`, chữ `--vzn-font-size-sm`, số phụ `--vzn-font-size-caption` | Không (ghim đáy) |
| Cài đặt | mục cuối `.sidebar-bottom-group` | Button `sm` 32; huy hiệu `.sidebar-nav-badge` `--vzn-space-1-5` | Không (ghim đáy) |
| Header trang | `PageHeader` (`header.page-header`) | Cao tối thiểu `--vzn-page-header-min-height` (40 + 2 × 8 = 56); lề ngang `--vzn-space-6` (16 khi `app-main` < 560); nền `--vzn-surface`, viền dưới `--vzn-border`; tiêu đề `--vzn-font-size-title-lg`, `--vzn-font-display`; mô tả `--vzn-font-size-sm` `--vzn-text-soft` | Không |
| Cột trang | `main.app-main` | Container `app-main` (mọi container query của trang đọc bề rộng này) | Do trang quyết định |
| Bảng lệnh | `CommandPalette` (`.cmd-palette-panel`) | Rộng tối đa 560, cao tối đa 480; nền `--vzn-overlay-material`, bóng `--vzn-shadow-overlay`, bo `--vzn-radius-lg`; scrim `--vzn-scrim` bắt đầu dưới thanh tiêu đề | Danh sách `.cmd-palette-list` cuộn |
| Chồng toast | `NotificationViewport` (`.notification-viewport--app`) | Cố định góc dưới phải, cách mép `--vzn-space-4`; rộng `min(--vzn-notification-max-inline (400), 100% − 32)`; lớp `--vzn-layer-notification` | Không |
| Popup cập nhật | `UpdatePopupPage` trong `BrowserWindow` riêng | Cửa sổ 440 × 320 DIP, không viền, không đổi cỡ; lề `--vzn-space-6`; tiêu đề `--vzn-font-size-heading` | Không |
| Hộp thoại cập nhật trong app (dự phòng) | `UpdateNotification` (`.update-notification`) | Rộng tối đa `--vzn-update-dialog-max-inline` (560), cao tối đa `--vzn-modal-viewport-block`; lề `--vzn-space-6` | Thân cuộn khi thấp |

Lớp chồng (thấp → cao): lớp phủ ngữ cảnh 60 → nền bắt bấm của điều hướng phủ 65 → điều hướng phủ 70 → hộp thoại/bảng lệnh 80 → bộ chọn 90 → toast 100 (`--vzn-layer-*`, `src/styles/tokens.css:269-276`). Scrim của mọi hộp thoại bắt đầu dưới thanh tiêu đề (`.app-shell[data-titlebar="app"] .modal-backdrop`) vì nút cửa sổ do hệ điều hành vẽ không làm mờ được.

## 4. Thành phần và hành động

### 4.1 Thanh tiêu đề và điều hướng chính

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nút thu gọn / mở rộng thanh bên (`.primary-navigation-toggle`) | `sm` · `neutral` · `ghost`, vuông, icon `SidebarPanelIcon` | Bấm; Enter/Space khi có focus | ≥ 900 px: đảo `sidebarCollapsed` (được lưu). < 900 px: mở/đóng lớp phủ tạm, không đổi lựa chọn đã lưu, đồng thời đóng sidebar lịch sử chat | Thanh bên co/giãn (chuyển động `width` 180 ms); icon đổi chiều; `aria-expanded` đổi; nhãn đổi "Thu nhỏ thanh bên" ↔ "Mở rộng thanh bên" | Không bao giờ tắt |
| 2 | Logo + "Viezan" | Không tương tác | — | — | `title="Viezan"` | — |
| 3 | "Tìm hoặc chạy lệnh" + chip `⌘K` / `Ctrl K` | `sm` · `neutral` · `outline`, hình chữ nhật; rail: chỉ icon | Bấm; phím `⌘K`/`Ctrl K` ở bất kỳ đâu trong cửa sổ | Đóng lớp phủ điều hướng, mở bảng lệnh (sự kiện `viezan:open-command-palette`) | Bảng lệnh hiện, focus vào ô tìm | Không tắt |
| 4 | Mục trang (Trang chủ, AI Chat, Dịch, Phiên dịch, Từ điển, Dịch mọi nơi, Nhiệt độ & quạt, Launcher & phím tắt) | `sm` · mục đang mở `primary` · `soft` (nổi lên bằng `--vzn-shadow-xs`, chữ semibold); mục khác `neutral` · `ghost` | Bấm | Chuyển trang; Dịch còn xoá bản dịch đang có; đóng lớp phủ nếu đang mở | Mục được tô `--vzn-chrome-item-active`, `aria-current="page"`; vùng `app-main` hiện skeleton "Đang tải {trang}…" trong lúc nạp chunk | Mục của module tắt không được vẽ (không có trạng thái xám) |
| 5 | Hàng "Đang chạy nền": "Quạt · {profile}" / "Quạt · tuỳ chỉnh" | `xs` · `neutral` · `ghost`, chấm xanh lá | Bấm | Tới Nhiệt độ & quạt | Chuyển trang | Hàng chỉ có khi helper quạt `ready` và module Nhiệt độ bật |
| 6 | Hàng "Phím tắt toàn cục" + số | như #5 | Bấm | Tới Launcher & phím tắt | Chuyển trang | Chỉ có khi ít nhất một trong hai phím (Dịch nhanh, Launcher) đang bật |
| 7 | Hàng "Tiện ích Chrome" + "sẵn sàng" | như #5 | Bấm | Tới Dịch mọi nơi | Chuyển trang | Chỉ có khi module browser-bridge bật và có ít nhất một token tiện ích |
| 8 | Tóm tắt chạy nền khi rail | `StatusDot` (không phải nút) | Rê chuột | Tooltip liệt kê các hàng | `aria-label` "Đang chạy nền: {count} mục" | Ẩn khi không có hàng nào |
| 9 | Cài đặt | `sm` · như #4; huy hiệu chấm + "Chưa có key" khi provider đang chọn cần khoá mà chưa có (`selectedProviderMissingKey`, AI local không bao giờ bị báo) | Bấm | Tới trang Cài đặt | Như #4; `aria-label` thành "Cài đặt: Chưa có key" khi có huy hiệu | Luôn hiện, luôn ghim đáy |
| 10 | Nền bắt bấm của lớp phủ (`.primary-navigation-backdrop`) | Trong suốt, không phải nút | Bấm ra ngoài lớp phủ | Đóng lớp phủ | Lớp phủ biến mất | Chỉ có khi lớp phủ mở |

### 4.2 Bảng lệnh ⌘K

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | Ô tìm (`Input size="lg"`, `role="combobox"`) | Input `lg` | Gõ | Lọc lệnh (không phân biệt dấu, "đ" = "d"); nhận tiền tố `?`, `??`, `t `, `d `; nếu đang ở chế độ câu trả lời thì quay lại danh sách | Danh sách cập nhật, mục đầu được tô | — |
| 12 | Nút đóng (X) | `lg` · `neutral` · `ghost`, vuông, `aria-label` "Đóng" | Bấm; `Esc`; bấm nền mờ; `⌘K` lần nữa | Đóng bảng lệnh, trả focus về phần tử trước đó | Bảng lệnh biến mất | — |
| 13 | Hàng lệnh trang | `lg` · mục tô `primary` · `soft`, mục khác `neutral` · `ghost`; `role="option"` | Bấm; `↑`/`↓` rồi `Enter`; rê chuột để tô | Chuyển tới trang, đóng bảng lệnh | Trang đổi | Lệnh của module tắt không có trong danh sách |
| 14 | Hàng máy tính "= {kết quả}" | như #13, tên dùng chữ số đều cột | `Enter` / bấm | Chép kết quả vào bộ nhớ tạm và đóng | Bảng lệnh đóng (không có toast) | Chỉ có khi truy vấn là biểu thức số học hợp lệ |
| 15 | "Hỏi AI" — "Trả lời nhanh cho “{query}”" | như #13 | `Enter` / bấm; tiền tố `?` | Chuyển sang chế độ câu trả lời và gửi câu hỏi tới model đang chọn | Câu hỏi hiện trên đầu, spinner "Đang suy nghĩ…", rồi câu trả lời Markdown chảy dần | Luôn có khi có chữ; thiếu khoá thì vẫn vào chế độ trả lời nhưng hiện lỗi (xem §5) |
| 16 | "Hỏi AI và tra cứu web" — "Kiểm chứng “{query}” với nguồn trên web" | như #13 | `Enter` / bấm; tiền tố `??` | Như #15 nhưng có tìm web | Spinner "Đang tìm web…" | Chỉ có khi đã cấu hình API tìm web (`hasWebSearchApi`) |
| 17 | "Dịch" — "Dịch “{text}”" | như #13 | Tiền tố `t ` + chữ, `Enter` | Mở Dịch với chữ đó làm nguồn (xoá bản dịch cũ) | Trang Dịch mở | — |
| 18 | "Từ điển" — "Tra cứu “{text}”" | như #13 | Tiền tố `d ` + từ, `Enter` | Mở Từ điển và tra từ | Trang Từ điển mở | — |
| 19 | "Sao chép" (chế độ trả lời) | `sm` · `neutral` · `ghost`, icon | Bấm | Chép câu trả lời | Nhãn thành "Đã sao chép!" trong 1,2 giây | `disabled` khi chưa có chữ |
| 20 | "Mở trong Chat ⌘↵" | `sm` · `neutral` · `ghost`, chip `⌘` `↵` | Bấm; `⌘/Ctrl + Enter` | Tạo cuộc trò chuyện mới với câu hỏi và câu trả lời, mở AI Chat | Trang AI Chat mở với 2 tin nhắn | `disabled` cho tới khi câu trả lời xong (`status === 'done'`) |
| 21 | "Mở Cài đặt" (trong hộp lỗi thiếu khoá) | `sm` · `neutral` · `outline` | Bấm | Đóng bảng lệnh, mở Cài đặt | Trang Cài đặt mở | — |

### 4.3 Toast

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 22 | Nút hành động đầu tiên của toast (vd. "Thử lại", "Mở Cài đặt") | `sm` · `primary` · `outline`, dạng viên thuốc | Bấm | Do nơi gọi `notify` quyết định | Thường là toast mới thay toast cũ cùng `key` | `disabled` nếu nơi gọi truyền `disabled: true` |
| 23 | Nút hành động thứ hai trở đi | `sm` · `neutral` · `ghost`, viên thuốc | Bấm | Như trên | Như trên | Như trên |
| 24 | Nút đóng toast | `sm` · `neutral` · `ghost`, vuông, `aria-label` "Đóng" | Bấm | Gỡ toast và chạy `onDismiss` của nó | Toast biến mất; toast cũ hơn còn mở (nếu có) hiện lại | Không vẽ khi toast `dismissible: false` |
| 25 | Cả chồng toast | Vùng `section aria-label="Thông báo"` | Rê chuột vào / focus vào | Tạm dừng mọi đếm ngược; rời ra thì chạy tiếp phần thời gian còn lại | Toast đứng yên | — |

### 4.4 Cập nhật

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | Popup › "Thu nhỏ" | `md` · `neutral` · `ghost`, vuông | Bấm | Thu nhỏ cửa sổ popup xuống Dock/thanh tác vụ | Cửa sổ thu nhỏ | — |
| 27 | Popup › "Đóng" (X), hoặc đóng cửa sổ bằng phím hệ thống | `md` · `neutral` · `ghost`, vuông, `aria-label` và tooltip "Đóng và nhắc sau 24 giờ" | Bấm | Như "Nhắc sau 24 giờ": hoãn phiên bản này 24 giờ rồi ẩn | Popup ẩn | — |
| 28 | Popup › "Nhắc sau 24 giờ" | `md` · `neutral` · `outline` | Bấm | Ghi hoãn vào `update-notifications.json`, ẩn popup | Popup ẩn; nếu ghi thất bại, popup ở lại và hiện lỗi | — |
| 29 | Popup › "Tải cập nhật" / "Cài đặt & khởi động lại" | `md` · `primary` · `solid` | Bấm | `available` → tải; `downloaded` → cài và khởi động lại | Dòng "Đang tải… {percent}%" (`role="status"`); xong thì tiêu đề thành "Sẵn sàng cài đặt" | `disabled` khi đang chạy hoặc đang tải |
| 30 | Hộp thoại trong app › "Xem thay đổi" | `md` · `neutral` · `ghost` | Bấm | Mở trang phát hành `v{version}` trên GitHub bằng trình duyệt | — | `disabled` khi đang chạy thao tác |
| 31 | Hộp thoại trong app › "Để sau" | `md` · `neutral` · `outline` (nhận focus đầu tiên) | Bấm; `Esc` | Hoãn phiên bản này 24 giờ (lưu `localStorage`) | Hộp thoại đóng, focus trả về chỗ cũ | — |
| 32 | Hộp thoại trong app › "Tải bản cập nhật" / "Cài đặt & khởi động lại" | `md` · `primary` · `solid` | Bấm | Như #29 | Dòng tiến độ; lỗi đi ra toast lỗi (khoá `update-notification-action`) | `disabled` khi đang chạy hoặc đang tải |

### 4.5 Khay và thanh menu (menu gốc của hệ điều hành)

| # | Mục | Nền tảng | Kết quả |
| --- | --- | --- | --- |
| 33 | Bấm / bấm đúp biểu tượng khay | Windows, Linux | Hiện cửa sổ chính |
| 34 | "Mở Viezan" | Windows, Linux (khay); macOS (menu của số đo) | Hiện cửa sổ chính |
| 35 | "Thoát Viezan" | Windows, Linux | Thoát thật (cửa sổ X chỉ ẩn vào khay) |
| 36 | "Ẩn nhiệt độ khỏi thanh menu" | macOS | Tắt số đo thanh menu (huỷ status item) |

Nhãn khay theo **ngôn ngữ hệ điều hành** (`app.getLocale()`), không theo ngôn ngữ đã chọn trong app (`electron/trayManager.ts:16-32`). Trên Windows/Linux, số đo nhiệt độ đi vào tooltip của biểu tượng khay (`electron/thermal/tray.ts`).

## 5. Trạng thái

### Điều hướng chính

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Mở rộng | Cửa sổ ≥ 900 px và `sidebarCollapsed = false` | Cột 236 px, có nhãn, nhãn nhóm viết hoa, chip ⌘K, dải chạy nền đầy đủ | Mọi mục #1–#9 |
| Rail | Cửa sổ ≥ 900 px và `sidebarCollapsed = true`, hoặc cửa sổ < 900 px (mặc định) | Cột 60 px chỉ icon (nút 40 px căn giữa); nhóm cách nhau bằng đường kẻ; dải chạy nền thu thành một chấm có tooltip; huy hiệu Cài đặt chỉ còn chấm | Như trên; tên trang qua `title`/`aria-label` |
| Lớp phủ tạm | Cửa sổ < 900 px, bấm nút mở rộng | Bảng 236 px (208 px khi < 900 px) được portal ra `body`, neo đúng vị trí rail, cao bằng rail, bóng `--vzn-shadow-lg`; nền bắt bấm trong suốt phía sau | Chọn trang (tự đóng), `Esc`, bấm ra ngoài, `⌘K`; kéo cửa sổ rộng ≥ 900 px cũng tự đóng |
| Cửa sổ thấp | Chiều cao không đủ cho mọi mục | Chỉ `.sidebar-nav-scroll` cuộn; dải chạy nền và Cài đặt luôn hiện ở đáy | Cuộn bằng con lăn / bàn di chuột |
| Không có việc chạy nền | Cả ba nguồn đều tắt | Không có dải, chỉ còn đường kẻ và Cài đặt | — |
| Thiếu khoá | Provider đang chọn cần khoá mà Keychain chưa có (`keyStatus`) | Huy hiệu chấm + "Chưa có key" cạnh Cài đặt | Bấm Cài đặt |
| Module tắt | Người dùng tắt module trong Cài đặt › Module | Mục của module biến mất; nhóm không còn mục nào cũng biến mất; nếu đang ở trang đó thì về Trang chủ | — |
| Đang tải trang | Chunk trang đang nạp (`Suspense`) | `FeatureLoadingState` theo `loadingLayout` của trang (`list`/`split`), nhãn "Đang tải {trang}…"; AI Chat và Dịch dùng `blank` (trống) | Vẫn điều hướng được |

### Bảng lệnh

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống (mở mới) | Ô tìm rỗng | Danh sách mọi trang theo thứ tự thanh bên, mục đầu được tô; chân trang "↑↓ Di chuyển · ↵ Mở · esc Đóng" | #11–#13 |
| Có kết quả | Có chữ | [Máy tính] + lệnh khớp + "Hỏi AI" (+ "Hỏi AI và tra cứu web") | #13–#16 |
| Không có lệnh khớp | Chữ không khớp lệnh nào, không phải phép tính | Dòng "Không tìm thấy lệnh phù hợp" (`role="status"`), bên dưới vẫn còn hàng Hỏi AI | #15, #16 |
| Tiền tố | `?`, `??`, `t `, `d ` | Chỉ còn hàng tương ứng | #15–#18 |
| Đang trả lời | Sau #15/#16 | Câu hỏi, spinner "Đang suy nghĩ…" / "Đang tìm web…", `aria-busy` | `Esc` để quay lại |
| Có câu trả lời | Câu trả lời đang chảy hoặc xong | Markdown, chân "AI có thể trả lời sai…", Sao chép, Mở trong Chat; chân trang "esc Quay lại" | #19, #20 |
| Lỗi | Model trả lỗi | Hộp `ui-error-box` `role="alert"` với thông điệp lỗi; nếu đã có một phần câu trả lời thì giữ phần đó và thêm hộp lỗi bên dưới | `Esc`, Sao chép phần đã có |
| Thiếu khoá | Provider đang chọn không phải `local` và chưa có khoá | Hộp lỗi "Chưa có API key. Vào Cài đặt để thêm." + "Mở Cài đặt" | #21 |
| Quá dài | Câu hỏi dài hơn `MAX_CHAT_INPUT_CHARS` | Hộp lỗi "Nội dung quá dài. Rút gọn để gửi." (không gửi) | `Esc`, sửa chữ |
| Module tắt | — | Lệnh của module tắt không có trong danh sách | — |

### Toast

| Tông | Biểu tượng / màu | `role` / `aria-live` | Tự tắt |
| --- | --- | --- | --- |
| `info` | Vòng tròn "i", `--vzn-action-text`, viền `--vzn-action-border` | `status` / `polite` | 4 giây; 8 giây nếu có hành động |
| `success` | Dấu tích, `--vzn-success`, viền `--vzn-success-border` | `status` / `polite` | 4 giây; 8 giây nếu có hành động |
| `warning` | Tam giác, `--vzn-warning`, viền `--vzn-warning-border` | `status` / `polite` | Không, chờ người dùng đóng |
| `error` | Tam giác, `--vzn-danger`, viền `--vzn-danger-border` | `alert` / `assertive` | Không, chờ người dùng đóng |

Nơi gọi có thể đặt `durationMs` riêng. Tối đa 3 toast hiện cùng lúc (mới nhất ở dưới cùng); toast cùng `key` thay thế nhau thay vì chồng (`src/store/useNotificationStore.ts`). Khi ô soạn Chat nằm cùng cột và sẽ bị che, chồng toast nâng lên trên mép trên của ô soạn (`data-lifted`).

### Popup cập nhật

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Có bản mới | Kiểm tra nền thấy `available`, thông báo đang bật, chưa hoãn | "Có bản cập nhật mới" · "Phiên bản {version}" · mô tả | #26–#29 |
| Đang tải | `downloading` | Thêm "Đang tải… {percent}%"; nút chính tắt | #26–#28 |
| Sẵn sàng | `downloaded` | "Sẵn sàng cài đặt" · mô tả khởi động lại · "Cài đặt & khởi động lại" | #26–#29 |
| Lỗi | Tải/cài thất bại, hoặc không ghi được lựa chọn hoãn | Thêm dòng `role="alert"` "Thao tác thất bại. Hãy thử lại hoặc kiểm tra mục Cập nhật trong Cài đặt." | Thử lại #29, hoặc #28 |
| Ẩn | Đã hoãn, thông báo bị tắt trong Cài đặt › Cập nhật, hoặc người dùng tự bấm "Kiểm tra" trong Cài đặt (Cài đặt nhận luồng) | Không có cửa sổ | — |

## 6. Luồng tương tác chính

**A. Thu gọn và mở rộng thanh bên (cửa sổ ≥ 900 px)**

1. Cửa sổ 1200 px, thanh bên 236 px. Nút ▣ ở thanh tiêu đề, ngay sau đèn giao thông, `aria-expanded="true"`.
2. Bấm ▣ → `toggleSidebar()` lưu `sidebarCollapsed = true`; cột co về 60 px trong 180 ms; nhãn, nhãn nhóm, chip ⌘K ẩn; dải chạy nền thành một chấm.
3. Chuyển sang AI Chat → thanh bên vẫn là rail; sidebar lịch sử chat giữ trạng thái riêng của nó.
4. Bấm ▣ lần nữa → về 236 px.

**B. Cửa sổ hẹp (< 900 px) — lớp phủ tạm**

1. Kéo cửa sổ còn 820 px → thanh bên tự thành rail 60 px; `sidebarCollapsed` đã lưu **không** bị ghi đè (`data-user-collapsed` giữ giá trị cũ).
2. Bấm ▣ → đo vị trí rail, đóng sidebar lịch sử chat nếu đang mở, portal bảng 208 px ra `body`, phủ lên nội dung với bóng lớn; ô rail để trống bên dưới.
3. Bấm "Từ điển" → chuyển trang, lớp phủ tự đóng. Hoặc `Esc` → đóng và focus trả về nút ▣. Hoặc bấm ra ngoài → đóng.
4. Kéo cửa sổ rộng lại ≥ 900 px → lớp phủ đóng, thanh bên trở lại đúng trạng thái đã lưu.

**C. Tìm và chạy lệnh**

1. Nhấn `⌘K` ở bất kỳ trang nào → lớp phủ điều hướng (nếu có) đóng; scrim phủ dưới thanh tiêu đề; bảng lệnh 560 px hiện cách đỉnh khoảng 12 % chiều cao; focus vào ô tìm; "Trang chủ" được tô.
2. Gõ "tu dien" → hàng "Từ điển" khớp (bỏ dấu); hàng "Hỏi AI" ở cuối.
3. `↓` tô hàng kế tiếp (vòng lại đầu khi hết); `Enter` → mở Từ điển, bảng lệnh đóng, focus trả về chỗ cũ.

**D. Tính nhanh**

1. Gõ `1250*1.9885` → hàng đầu "= 2.485,625" (định dạng theo ngôn ngữ app), mô tả "1250*1.9885 · Sao chép kết quả".
2. `Enter` → chép vào bộ nhớ tạm, bảng lệnh đóng.

**E. Hỏi AI ngay trong bảng lệnh**

1. Gõ `? local model nào dịch tốt` → chỉ còn hàng "Hỏi AI".
2. `Enter` → danh sách được thay bằng vùng trả lời: câu hỏi in đậm ở trên, spinner "Đang suy nghĩ…".
3. Câu trả lời chảy dần (`aria-live="polite"`). Khi xong, "Mở trong Chat ⌘↵" bật.
4. `⌘↵` → tạo cuộc trò chuyện mới với provider/model đang chọn, thêm câu hỏi và câu trả lời, mở AI Chat.
5. Hoặc `Esc` → huỷ yêu cầu, quay lại danh sách với chữ cũ; `Esc` lần nữa → đóng.

**F. Toast**

1. Một trang gọi `notify({ tone: 'success', message: 'Đã sao chép bản dịch' })` → toast hiện ở góc dưới phải, tự tắt sau 4 giây.
2. Ba toast nữa đến → chỉ 3 mới nhất hiện; toast cũ nhất còn mở bị đẩy ra khỏi khung nhìn và quay lại khi một toast mới hơn rời đi.
3. Rê chuột lên chồng → mọi đếm ngược dừng; rời chuột → chạy tiếp phần còn lại.
4. Toast lỗi ở lại cho tới khi người dùng bấm X hoặc bấm hành động sửa.

**G. Cập nhật**

1. Kiểm tra nền tìm thấy `available` → main tạo cửa sổ 440 × 320 ở giữa màn hình có con trỏ, hiện bằng `showInactive` (không lấy focus của app khác), theo chủ đề và ngôn ngữ app.
2. Bấm "Tải cập nhật" → nút chính tắt, dòng "Đang tải… 46%" cập nhật.
3. Tải xong → tiêu đề "Sẵn sàng cài đặt", nút "Cài đặt & khởi động lại".
4. Bấm "Nhắc sau 24 giờ" hoặc X → popup ẩn, không nhắc lại phiên bản này trong 24 giờ.
5. Nếu người dùng tự bấm kiểm tra trong Cài đặt › Cập nhật → popup ẩn, luồng chuyển sang Cài đặt.

## 7. Responsive

Các ngưỡng của khung tính theo **bề rộng cửa sổ** (`window.innerWidth` trong `PrimaryNavigationSidebar.tsx:28,81`) cho điều hướng; header trang tính theo container `app-main`.

| Bề rộng | Thay đổi |
| --- | --- |
| Cửa sổ ≥ 900 px | Thanh bên theo lựa chọn đã lưu (236 / 60). Bảng lệnh neo trên, cách đỉnh `clamp(64px, 12vh, 112px)`. |
| Cửa sổ < 900 px | CSS (`max-width: 899px`): `--vzn-sidebar-expanded-width` thành 208 px, `--vzn-chat-sidebar-width` thành 220 px. JS: thanh bên luôn là rail 60 px; mở rộng = lớp phủ tạm (portal); lịch sử chat và lớp phủ điều hướng loại trừ nhau. |
| Cửa sổ ≤ 720 px | Ép mọi `.app-sidebar[data-collapsed]` về 60 px, ẩn nhãn (an toàn cho mọi trạng thái); `--vzn-chat-sidebar-width` 200 px. |
| Cửa sổ ≤ 560 px | Bảng lệnh căn giữa theo chiều dọc, lề 16 px, ẩn dòng mô tả của từng hàng, chân trang căn giữa. |
| `app-main` < 560 px | Header trang giảm lề ngang còn 16 px; hành động xuống dòng dưới tiêu đề (`flex-wrap`). |
| Chiều cao thấp | Chỉ danh sách trang cuộn; Cài đặt và dải chạy nền luôn hiện. Bảng lệnh cao tối đa `100vh − 72px`. Hộp thoại cập nhật cao tối đa 90vh và cuộn bên trong. |
| Tối thiểu cửa sổ | 640 × 480 DIP: luôn ở chế độ rail. |

## 8. Bàn phím và trợ năng

- **Thứ tự Tab trong khung:** nút ▣ ở thanh tiêu đề → nút tìm → các mục trang theo thứ tự đọc → hàng chạy nền → Cài đặt → nội dung trang (header rồi thân).
- **Phím tắt:** `⌘K` / `Ctrl K` bật/tắt bảng lệnh ở mọi nơi trong cửa sổ (bỏ qua khi đang gõ IME hoặc giữ phím lặp). Nút tìm khai báo `aria-keyshortcuts="Meta+K"` / `"Control+K"`.
- **Điều hướng chính:** `nav aria-label="Điều hướng chính"`; mỗi nhóm là `section aria-label` theo tên nhóm (nhãn nhóm hiển thị `aria-hidden` để không đọc hai lần); mục đang mở có `aria-current="page"`; mọi mục có `title` và `aria-label` nên rail vẫn đọc được tên. Nút ▣ có `aria-expanded` và `aria-controls` trỏ tới bảng; khi lớp phủ mở, `nav` dùng `aria-owns` để giữ bảng (đã portal) trong cây trợ năng. `Esc` đóng lớp phủ và trả focus về ▣.
- **Bảng lệnh:** `role="dialog" aria-modal="true" aria-label="Bảng lệnh"`; ô tìm `role="combobox"` + `aria-controls` + `aria-activedescendant`; danh sách `role="listbox"`, hàng `role="option"` + `aria-selected`, `tabIndex=-1` (di chuyển bằng mũi tên, không bằng Tab). `Tab` / `Shift+Tab` bị giữ trong bảng (vòng giữa ô tìm và các nút). `↑ ↓ Home End Enter Esc` như §6. Focus vào ô tìm khi mở, trả về phần tử trước khi đóng. Vùng trả lời `aria-live="polite"` + `aria-busy`; lỗi `role="alert"`.
- **Toast:** vùng `section aria-label="Thông báo"`; mỗi toast `role="status"` (lỗi: `role="alert"`, `aria-live="assertive"`). Focus vào chồng toast dừng đếm ngược.
- **Hộp thoại cập nhật trong app:** `role="dialog" aria-modal` với `aria-labelledby`/`aria-describedby`; focus đầu vào "Để sau"; Tab bị giữ (`trapTabFocus`); `Esc` = "Để sau".
- **Popup cập nhật:** `main aria-labelledby="update-title"`; tiến độ `role="status"`; lỗi `role="alert"`; nút cửa sổ có `aria-label` "Thu nhỏ", "Đóng và nhắc sau 24 giờ". Header là vùng kéo cửa sổ.
- **Chuyển động:** bảng lệnh tắt hiệu ứng `fadeSlideIn` khi `prefers-reduced-motion`; khi `prefers-reduced-transparency` / `prefers-contrast: more`, bảng lệnh, thanh tiêu đề và thanh bên bỏ vật liệu trong suốt và dùng bề mặt đặc.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `nav_primary_sidebar` | Điều hướng chính |
| `nav_collapse_sidebar` / `nav_expand_sidebar` | Thu nhỏ thanh bên / Mở rộng thanh bên |
| `nav_search_or_run` | Tìm hoặc chạy lệnh |
| `nav_home` | Trang chủ |
| `nav_space_ai` · `nav_space_language` · `nav_space_system` · `nav_space_tools` | AI · Ngôn ngữ · Hệ thống · Tiện ích |
| `nav_chat` · `nav_translate` · `nav_live_translate` · `nav_dictionary` · `nav_everywhere` | AI Chat · Dịch · Phiên dịch · Từ điển · Dịch mọi nơi |
| `nav_thermal` · `nav_utilities` · `nav_settings` | Nhiệt độ & quạt · Launcher & phím tắt · Cài đặt |
| `nav_background_title` | Đang chạy nền |
| `nav_background_fans_profile` / `nav_background_fans_custom` | Quạt · {profile} / Quạt · tuỳ chỉnh |
| `nav_background_hotkeys` | Phím tắt toàn cục |
| `nav_background_browser` · `nav_background_ready` | Tiện ích Chrome · sẵn sàng |
| `nav_background_summary` | Đang chạy nền: {count} mục |
| `model_no_key` | Chưa có key |
| `route_loading` | Đang tải {feature}… |
| `nav_command_palette` | Bảng lệnh |
| `command_palette_search_placeholder` | Tìm lệnh, tính toán hoặc hỏi AI… |
| `command_palette_no_results` | Không tìm thấy lệnh phù hợp |
| `command_palette_hint_navigate` · `_open` · `_close` · `_back` | Di chuyển · Mở · Đóng · Quay lại |
| `command_palette_home_description` | Lối tắt, việc đang dở và trạng thái máy |
| `command_palette_chat_description` | Trò chuyện với AI local và đám mây |
| `command_palette_translate_description` | Dịch văn bản, hình ảnh và giọng nói |
| `command_palette_live_description` | Phiên dịch giọng nói theo thời gian thực |
| `command_palette_dictionary_description` | Tra cứu từ và định nghĩa |
| `command_palette_everywhere_description` | Dịch nhanh vùng chọn và tiện ích Chrome |
| `command_palette_thermal_description` | Theo dõi nhiệt độ, tốc độ quạt và tải CPU |
| `command_palette_utilities_description` | Launcher và mọi phím tắt |
| `command_palette_settings_description` | API key, giao diện, mô hình và cập nhật |
| `command_palette_calc_description` | {expression} · Sao chép kết quả |
| `command_palette_ask_ai_label` / `_description` | Hỏi AI / Trả lời nhanh cho “{query}” |
| `command_palette_verify_label` / `_description` | Hỏi AI và tra cứu web / Kiểm chứng “{query}” với nguồn trên web |
| `command_palette_translate_text_description` | Dịch “{text}” |
| `command_palette_dictionary_text_description` | Tra cứu “{text}” |
| `command_palette_answer_disclaimer` | AI có thể trả lời sai. Hãy kiểm chứng thông tin quan trọng. |
| `chat_thinking` · `chat_smart_thinking_searching` | Đang suy nghĩ… · Đang tìm web… |
| `chat_copy` · `chat_copied` | Sao chép · Đã sao chép! |
| `ai_chat_popup_open_in_chat` | Mở trong Chat |
| `chat_error_no_key` · `chat_error_open_settings` | Chưa có API key. Vào Cài đặt để thêm. · Mở Cài đặt |
| `ai_chat_popup_input_too_long` | Nội dung quá dài. Rút gọn để gửi. |
| `notifications_region` | Thông báo |
| `translate_error_dismiss` | Đóng (nút đóng toast) |
| `update_popup_title` / `update_popup_ready_title` | Có bản cập nhật mới / Sẵn sàng cài đặt |
| `update_popup_version` | Phiên bản {version} |
| `update_popup_description` | Tải bản mới ngay. Bạn chọn thời điểm cài đặt và khởi động lại. |
| `update_popup_ready_description` | Bản cập nhật đã sẵn sàng. Viezan sẽ khởi động lại khi bạn chọn cài đặt. |
| `update_popup_later` · `update_popup_download` | Nhắc sau 24 giờ · Tải cập nhật |
| `update_popup_minimize` · `update_popup_close` | Thu nhỏ · Đóng và nhắc sau 24 giờ |
| `settings_update_available` / `settings_update_downloaded` | Có bản cập nhật: v{version} / Sẵn sàng cài đặt: v{version} |
| `settings_update_downloading` | Đang tải… {percent}% |
| `settings_update_download` · `settings_update_install` | Tải bản cập nhật · Cài đặt & khởi động lại |
| `update_notification_description` | Tải khi bạn sẵn sàng. Chỉ cài đặt và khởi động lại khi bạn chọn. Để sau sẽ tạm ngừng nhắc phiên bản này trong 24 giờ. |
| `update_notification_later` · `update_notification_release_notes` | Để sau · Xem thay đổi |
| `update_notification_action_error` | Thao tác thất bại. Hãy thử lại hoặc kiểm tra mục Cập nhật trong Cài đặt. |
| (main, `TRAY_LABELS`) | Mở Viezan · Thoát Viezan · Ẩn nhiệt độ khỏi thanh menu |

## 10. Chênh lệch với bản dựng hiện tại

**Điều hướng chính**

1. **Vị trí nút thu gọn.** `boards/Sidebar.dc.html` đặt nút ▣ ở cuối hàng logo trong thanh bên. Mã đặt nó trong thanh tiêu đề (portal vào `.app-header-navigation`), đúng với AGENTS.md ("logo và nút thu gọn ở hai ô bố cục riêng"). Giữ theo mã; bản vẽ cần sửa.
2. **Dải chạy nền thiếu hai nguồn.** Bản vẽ (`Sidebar`, `Main` nguyên tắc 06) có hàng "AI local · qwen3:4b" và "số đo thanh menu". Mã cố ý bỏ AI local vì `discoverLocalAi` có thể khởi động Ollama (`useBackgroundStatus.ts:32-34`); số đo thanh menu chưa có hàng. Cả hai: **đề xuất**, chờ main có lệnh đọc trạng thái chỉ-cache.
3. **Hàng quạt chưa có số đo.** Bản vẽ: "Quạt · Mát  58°". Mã: chỉ tên profile, không có `detail`. **Đề xuất.**
4. **Chữ trạng thái tiện ích Chrome.** Bản vẽ "đã kết nối"; mã "sẵn sàng" và chỉ biết đã có token, không biết tiện ích có đang kết nối. Giữ "sẵn sàng" cho tới khi có tín hiệu kết nối thật.
5. **Tóm tắt khi rail không bấm được.** Ở rail, dải chạy nền chỉ là một `StatusDot` có tooltip; không có cách tới các trang điều khiển ngoài việc mở rộng thanh bên. **Đề xuất:** biến chấm thành nút mở lớp phủ / mở rộng.
6. **Lớp phủ hẹp.** `SmallSurfaces` vẽ nút "Đóng thanh bên" riêng trong lớp phủ; mã dùng lại nút ▣ trên thanh tiêu đề (vẫn hiện phía trên lớp phủ) cùng `Esc` và bấm ra ngoài. Đủ dùng; không cần thêm nút.

**Bảng lệnh** (`boards/CommandPalette.dc.html`)

7. Bản vẽ chia danh sách thành nhóm có tiêu đề "Dùng với" / "Đi tới"; mã là một danh sách phẳng. **Đề xuất.**
8. Bản vẽ có lệnh đi sâu "Cài đặt › Mô hình AI"; mã chỉ có lệnh cấp trang. **Đề xuất** (Cài đặt đã có `openSettingsAt(section)`).
9. Bản vẽ ghi "⇥ hỏi AI" ở chân trang; trong mã `Tab` chỉ di chuyển focus trong bảng. **Đề xuất** hoặc sửa bản vẽ.
10. Vùng trả lời trong bản vẽ có chip model "Local · qwen3:4b" và nút "Kiểm chứng bằng web"; mã không hiện model đang dùng và "tra cứu web" chỉ là một hàng trước khi hỏi. **Đề xuất:** hiện `ModelChip` chỉ đọc trong vùng trả lời.
11. Dòng "Không tìm thấy lệnh phù hợp" hiện **phía trên** các hàng "Hỏi AI" vẫn còn — đúng ý (AI là lối thoát), nhưng chữ dễ đọc như "không có gì". Cân nhắc đổi thành gợi ý "Không có lệnh khớp — hỏi AI?".
12. Lệnh chưa hiện phím tắt cạnh tên (nguyên tắc 02 của `Main`). **Đề xuất.**

**Toast** (`boards/Toasts.dc.html`)

13. Bản vẽ có chỉ báo đếm ngược ("Còn 5 giây"); mã không có thanh đếm ngược. **Đề xuất.** (Toast "Đã xoá cuộc trò chuyện · Hoàn tác" đã có.)
14. Bản vẽ ghi "toast không bao giờ che ô soạn Chat" — mã đã làm (đo và nâng chồng toast).

**Cập nhật** (`boards/UpdatePopup.dc.html`, `boards/SmallSurfaces.dc.html`)

15. Popup trong mã không có: dòng "Bạn đang dùng [phiên bản hiện tại]", các điểm mới từ ghi chú phát hành + "Xem toàn bộ ghi chú", thanh tiến độ có dung lượng, "Ẩn" / "Huỷ tải" khi đang tải, cảnh báo phiên Phiên dịch đang chạy và quạt về tự động khi cài, lựa chọn "Khi thoát app". Tất cả: **đề xuất** (updater chưa có huỷ tải hay cài khi thoát).
16. Menu "Nhắc sau" nhiều lựa chọn (1 giờ, ngày mai, tuần sau, bỏ qua phiên bản) — mã cố định 24 giờ (`NOTIFICATION_SNOOZE_MS`). **Đề xuất.**
17. Main chấp nhận hành động `view` (mở Cài đặt › Cập nhật) và i18n có `update_popup_view` "Xem cập nhật", nhưng popup không có nút nào gọi nó. Hoặc thêm nút (ghost) "Xem cập nhật", hoặc dọn đường dẫn thừa.
18. Hộp thoại trong app (`UpdateNotification`) chỉ mở khi preload **không** có `getNotificationPreferences`, tức là trong Electron hiện tại nó không bao giờ hiện (popup riêng thay thế); nó chỉ còn là đường dự phòng và nơi nhận sự kiện "mở Cài đặt".

**Khay và thanh menu** (`boards/SmallSurfaces.dc.html`)

19. Menu khay Windows/Linux trong bản vẽ có "Launcher Alt+Space"; mã chỉ có "Mở Viezan" và "Thoát Viezan". **Đề xuất.**
20. Menu số đo macOS trong bản vẽ có "Mở Nhiệt độ & quạt" và "Ẩn số đo"; mã có "Mở Viezan" (mở cửa sổ, không chuyển trang) và "Ẩn nhiệt độ khỏi thanh menu". Thiếu dòng tóm tắt số đo đầy đủ trong menu. **Đề xuất.**
21. Nhãn khay theo ngôn ngữ hệ điều hành, không theo ngôn ngữ đã chọn trong app — lệch với nguyên tắc "cùng giọng văn với cửa sổ chính".

**Chào mừng lần đầu** (`boards/Welcome.dc.html`, `boards/WelcomeSteps.dc.html`)

22. App **chưa có** luồng chào mừng: không có component, store hay khoá i18n nào (`welcome`, `onboarding`). Toàn bộ là **đề xuất**: 3 bước — (1) Chọn cách chạy AI: AI local (khuyên dùng, tải Ollama + `qwen3:4b`, kèm đánh giá máy "Máy này chạy tốt AI local") hoặc khoá đám mây (Keychain), nút "Bỏ qua, thiết lập sau" (`outline`) và "Cài AI local và tiếp tục" (`primary` · `solid`); (2) Phím tắt và quyền: phím Launcher `⌘ Space`, Dịch nhanh `⌥ T`, quyền Trợ năng ("Cấp quyền"), quyền Ghi màn hình (không bắt buộc, "Để sau"), công tắc "Mở khi đăng nhập", nút "Quay lại" / "Tiếp tục"; (3) Chọn module (lưới công tắc AI Chat, Dịch, Phiên dịch, Từ điển, Nhiệt độ & quạt, Launcher, Tiện ích trình duyệt), nút "Bắt đầu dùng Viezan". Mỗi bước dùng lại thành phần sẵn có (`CredentialCard`, `CapabilityNotice`, `KeyCap`, công tắc module của Cài đặt › Module) và phải ghi rõ "Đổi lại mọi lựa chọn bất cứ lúc nào trong Cài đặt". Cần thêm cờ đã-xem được lưu, i18n EN/VI/JA, và điểm vào lại từ Cài đặt › Giới thiệu.

**Token và mã**

23. Một số giá trị của khung vẫn là số tay trong `src/styles/codex.css`: đệm thanh bên `10px 8px`, `gap: 2px`, chuyển động `180ms ease` của `.app-sidebar` (lặp `--vzn-duration-normal`), cỡ chữ chip phím `.sidebar-shortcut` `10px` (không có token), hàng thương hiệu 40 px, bảng lệnh `560px` / `480px` / `56px` / `clamp(64px, 12vh, 112px)`. Khi chạm vào các quy tắc này, chuyển sang token.
24. `codex.css` tắt viền focus toàn cục (`*:focus-visible { outline: none !important }`, đang sửa ở PR #153); khung dựa vào nền hover/tô để báo focus. Với người dùng bàn phím, nút ▣, mục điều hướng và nút toast cần dấu hiệu focus rõ hơn (vd. `--vzn-focus-ring`). Ghi nhận cho đợt trợ năng.
