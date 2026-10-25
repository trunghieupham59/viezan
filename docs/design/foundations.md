# Nền tảng thiết kế Viezan

Tài liệu này là luật chung cho mọi màn hình. Đặc tả từng màn hình trong `screens/` chỉ ghi phần riêng của màn hình đó và dẫn về đây cho phần chung.

Nguồn sự thật duy nhất cho mọi giá trị hình ảnh là `src/styles/tokens.css`. Tài liệu này nêu tên token và vai trò của chúng, không lặp lại con số trừ khi cần để đọc bản vẽ. Nếu con số ở đây lệch với `tokens.css`, `tokens.css` đúng.

## 1. Tinh thần: "bàn làm việc yên tĩnh"

- **Nền trung tính, màu chỉ để báo trạng thái.** Canvas xám rất nhạt (tối: gần đen), thẻ trắng (tối: than chì). Màu nhấn xanh chỉ dùng cho hành động chính, mục đang chọn, link và tiêu điểm. Xanh lá, vàng, đỏ chỉ dùng cho trạng thái (sẵn sàng, cảnh báo, lỗi).
- **Một hành động chính trên mỗi vùng.** Nút `solid` chỉ có một trong mỗi header, footer hoặc thẻ. Các nút còn lại là `outline`, `soft` hoặc `ghost`.
- **Mật độ đọc được.** Chữ thân 13–14 px, hàng cài đặt cao khoảng 48 px, điều khiển 32–36 px. Không nhồi, không để trống quá mức trên màn hình rộng: cột đọc được giới hạn bề rộng.
- **Không giả tính năng.** Bản vẽ chỉ được đề xuất điều app làm được, hoặc ghi rõ "đề xuất" trong mục "Chênh lệch" của đặc tả.

## 2. Ba trục chủ đề

| Trục | Thuộc tính | Lựa chọn | Mặc định |
| --- | --- | --- | --- |
| Chế độ | `html.dark` (từ `theme`) | Sáng · Tối · Theo hệ thống | Theo hệ thống |
| Phong cách (persona) | `html[data-theme]` (từ `themePreset`) | Graphite · Glass · Paper · Corporate · Midnight | Graphite |
| Màu nhấn | `html[data-accent]` (từ `themeAccent`) | Tự động · Tím · Hồng · Xanh ngọc · Xanh lá · Hổ phách · Đỏ | Tự động |

- Mọi bản vẽ trong `boards/` và `specs/` vẽ ở **Graphite + Tự động** (nhấn xanh). Một persona khác đổi bề mặt, bo góc, bóng, chữ đọc; không đổi bố cục hay hành động.
- Midnight luôn tối. Glass để lộ vật liệu cửa sổ macOS (vibrancy) ở mọi chế độ.
- Màu nhấn chỉ thay họ màu `--vzn-action-*`, không đổi bề mặt.

## 3. Bậc bề mặt (Graphite)

| Vai trò | Token | Sáng | Tối |
| --- | --- | --- | --- |
| Canvas trang | `--vzn-bg` | xám rất nhạt | gần đen |
| Thanh tiêu đề, thanh điều hướng | `--vzn-titlebar-bg`, `--vzn-sidebar-bg` | xám đậm hơn canvas | than chì |
| Sidebar lịch sử chat | `--vzn-chat-sidebar-bg` | trắng | than chì |
| Header trang, thẻ, ô soạn tin | `--vzn-surface` | trắng | than chì sáng hơn canvas một bậc |
| Ô phụ trong thẻ (bước, chỉ số) | `--vzn-surface-muted` | xám rất nhạt | một bậc trên thẻ |
| Popover, menu, dialog | `--vzn-surface-raised` + `--vzn-shadow-md` | trắng | một bậc trên thẻ |
| Viền thẻ / đường kẻ trong thẻ | `--vzn-border` / `--vzn-divider` | | |

Quy tắc: chỉ `.app-shell` và `.app-main` tô nền; các lớp bọc trung gian (`.app-body`, `.app-page`, `.app-workspace`) trong suốt. Không bao giờ đặt một lớp nền góc vuông sau một bề mặt bo góc (lỗi "khung đôi").

## 4. Chữ

| Vai trò | Token cỡ | Độ đậm |
| --- | --- | --- |
| Tiêu đề trang (header) | `--vzn-font-size-title-lg` (18) | semibold |
| Tiêu đề mục trong trang | `--vzn-font-size-title-lg` | semibold |
| Tiêu đề thẻ | `--vzn-font-size-subtitle` (15) | semibold |
| Nhãn hàng, mục điều hướng | `--vzn-font-size-lg` (14) | regular; mục đang chọn semibold |
| Thân chữ, nút | `--vzn-font-size-md` (13) | regular / medium |
| Mô tả, chú thích | `--vzn-font-size-sm` (12) | regular, màu `--vzn-text-muted` |
| Nhãn nhóm viết hoa | `--vzn-font-size-caption` (11) | medium, `--vzn-tracking-caps` |
| Mã model, phím tắt, phiên bản | `--vzn-font-mono` | |

Cỡ trong bảng là cỡ "Vừa". Cài đặt › Giao diện › Cỡ chữ nhân mọi token `--vzn-font-size-*` với `--vzn-text-scale` (Nhỏ 0,9 · Vừa 1 · Lớn 1,15; `html[data-text-size]`, đặt trong `App.tsx`). Chiều cao điều khiển, khoảng cách và `rem` (cố định `--vzn-root-font-size`, 15 px) không đổi, nên bố cục giữ nhịp. Vì vậy mọi cỡ chữ trong CSS phải dùng token; cỡ viết cứng bằng px sẽ không theo cài đặt.

Nội dung đọc dài (tin nhắn chat, bản dịch) dùng `--vzn-font-reading` và `--vzn-line-reading` để persona Paper đổi sang chữ serif.

## 5. Khoảng cách, bo góc, bóng

- Thang khoảng cách `--vzn-space-*`: 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 px.
- Lề trong trang: 24 px (`--vzn-space-6`); lề trong thẻ: 16 px; khoảng cách giữa thẻ: 16 px; giữa nhóm lớn: 24 px.
- Bo góc: thẻ `--vzn-radius-md` (12), điều khiển `--vzn-radius-control` (10), ô nhỏ trong thẻ `--vzn-radius-sm` (8), chip/tag `--vzn-radius-xs` (6).
- Bóng: thẻ không bóng (chỉ viền); popover `--vzn-shadow-md`; dialog và lớp phủ `--vzn-shadow-lg` hoặc `--vzn-shadow-overlay`.

## 6. Điều khiển

### Button

| Kích thước | Cao | Dùng cho |
| --- | --- | --- |
| `xs` | 28 | Hành động nhỏ trong tin nhắn, link dạng nút trong header thẻ |
| `sm` | 32 | Thanh công cụ, hàng cài đặt, điều hướng, chip model |
| `md` | 36 | Form, ô soạn tin (mọi điều khiển chính của composer) |
| `lg` | 40 | Thẻ bắt đầu nhanh, hành động lớn hiếm hoi |

| Variant (nghĩa) | Dùng cho |
| --- | --- |
| `neutral` | Tiện ích đảo ngược được: sao chép, tải về, đóng, làm mới |
| `primary` (xanh) | Đang chọn, tạo, mới, gửi, áp dụng |
| `danger` (đỏ) | Xoá, dọn, đặt lại, dừng, cảnh báo |

| Appearance (mức nhấn) | Dùng cho |
| --- | --- |
| `solid` | Hành động chính duy nhất của vùng |
| `soft` | Trạng thái đang chọn / đang mở |
| `outline` | Hành động phụ có viền |
| `ghost` | Tiện ích thanh công cụ yên lặng |

- Các nút cạnh nhau trong một thanh công cụ dùng cùng một kích thước.
- Nút chỉ có icon là hình vuông và luôn có `aria-label`; nút bật/tắt có `aria-pressed`; nút mở menu có `aria-expanded` và `aria-haspopup`.
- `disabled` gốc của trình duyệt luôn ghi đè mọi variant: nền, viền, chữ xám. Màu không bao giờ là tín hiệu duy nhất.

### Các thành phần dùng lại

| Thành phần | Vai trò |
| --- | --- |
| `SettingsCard` / `SettingsRow` | Thẻ có header; hàng nhãn + mô tả bên trái, điều khiển bên phải, phần mở rộng bên dưới |
| `StepList` | Các bước đánh số trong ô xám (thiết lập Dịch nhanh, tiện ích Chrome) |
| `StatusLabel` | Chấm + chữ màu cho trạng thái (sẵn sàng, cần khoá, lỗi) |
| `SectionCard` | Thẻ Trang chủ có link hành động ở header |
| `QuickStartCard` | Thẻ bắt đầu nhanh có ô icon tô màu nhạt |
| `ModelChip` | Chip "Nhà cung cấp · model" mở popover cấu hình AI |
| `SelectField` | Ô chọn có menu nổi, neo vào chính nút của nó, không bị vùng cuộn cắt |
| `AIConfigurationPopover` | Popover cấu hình có header, thân cuộn, footer tuỳ chọn; mỗi popover neo vào nút mở của nó |
| `CredentialCard` | Hàng khoá API: tên, link lấy khoá, trạng thái, nút "Sửa/Thêm khoá" mở ô nhập |
| `CapabilityNotice` | Hàng giải thích quyền hệ thống còn thiếu và cách sửa |
| `KeyCap` | Chip phím tắt (monospace) |
| `Meter` | Thanh đo (quạt, tiến độ tải) |
| Toast (`NotificationViewport`) | Kết quả hành động; một khoá chủ cho mỗi nguồn để toast thay nhau thay vì chồng lên |

## 7. Khung cửa sổ và điều hướng

```
┌ Title bar 40 px (đèn macOS · nút thu gọn sidebar) ─────────────────────────┐
├ Primary nav 236 px (60 px khi thu gọn) ┬ [Sidebar ngữ cảnh, vd. lịch sử chat]┬ Page ┤
│ Logo Viezan                            │                                      │ Header 56 px │
│ [Tìm kiếm            ⌘K]               │                                      │ Nội dung     │
│ Trang chủ                              │                                      │              │
│ AI: AI Chat                            │                                      │              │
│ NGÔN NGỮ: Dịch · Phiên dịch · Từ điển  │                                      │              │
│           · Dịch mọi nơi               │                                      │              │
│ HỆ THỐNG: Nhiệt độ & quạt              │                                      │              │
│ TIỆN ÍCH: Launcher & phím tắt          │                                      │              │
│ (danh sách trên cuộn được)             │                                      │              │
│ ── việc chạy nền (khi có) ──           │                                      │              │
│ Cài đặt (luôn ghim đáy)                │                                      │              │
└────────────────────────────────────────┴──────────────────────────────────────┴──────────────┘
```

- Header trang: `--vzn-page-header-min-height` (56 px), nền `--vzn-surface`, đường kẻ dưới; tiêu đề 18 px, mô tả ngắn cùng dòng (nếu có), hành động ở bên phải.
- Trang toàn khung (full-bleed): header sát mép, thân trên canvas `--vzn-bg`, nội dung đặt trong thẻ.
- Thanh điều hướng chính và sidebar lịch sử chat là hai organism khác nhau, trạng thái thu gọn lưu riêng.

## 8. Responsive

| Ngưỡng | Áp dụng cho | Hành vi |
| --- | --- | --- |
| Cửa sổ ≥ 900 px | Điều hướng | Cả hai sidebar giữ trạng thái đã lưu khi chuyển trang |
| Cửa sổ < 900 px | Điều hướng | Điều hướng chính thành rail 60 px; mở rộng là lớp phủ tạm (portal); lịch sử chat ẩn cho đến khi bấm; hai lớp phủ loại trừ nhau; không ghi đè lựa chọn đã lưu |
| Vùng nội dung < 900 px | Dịch; lưới bắt đầu nhanh của Trang chủ | Hai cột thành một cột (Dịch); lưới thẻ dồn lại. Hai cột của Trang chủ xếp chồng khi không còn đủ chỗ cho cột "Tiếp tục" + cột bên (khoảng 844 px) |
| Vùng nội dung < 760 px | Cài đặt, Giao diện | Bản xem trước lên trên, danh sách mục thành tab |
| Vùng nội dung < 560 px | Thân các trang hệ thống, Cài đặt | Lề trong thân trang giảm còn 12 px (header trang giữ 16 px) |
| Chiều cao cửa sổ thấp | Điều hướng | Chỉ danh sách trang cuộn; Cài đặt luôn hiện |
| Cửa sổ ≤ 720 px rộng hoặc ≤ 600 px cao | Popover cấu hình | Thành hộp thoại giữa cửa sổ dưới thanh tiêu đề |

Mọi bố cục tính theo **bề rộng thực của vùng chứa** (container query trên `app-main`), không chỉ theo cửa sổ.

## 9. Chuyển động

- `--vzn-duration-fast` (120 ms) cho hover, nhấn; `--vzn-duration-normal` (180 ms) cho mở/đóng sidebar, popover; đường cong `--vzn-ease-standard`.
- Không có chuyển động trang trí. Tôn trọng `prefers-reduced-motion`.

## 10. Lớp chồng (z-index)

Theo thứ tự tăng dần: thanh công cụ cục bộ → lớp phủ ngữ cảnh (popover, menu) → nền mờ điều hướng → điều hướng phủ → hộp thoại → bộ chọn → thông báo (toast). Dùng token `--vzn-layer-*`, không đặt số tay.

## 11. Trợ năng và ngôn ngữ

- Mọi chữ hiển thị qua i18n (EN/VI/JA). Bản vẽ và đặc tả viết tiếng Việt; khoá i18n ghi kèm khi cần.
- Tab đi theo thứ tự đọc. Mở lớp phủ thì focus vào điều khiển đầu tiên (hoặc mục đang chọn); Esc đóng và trả focus về nút đã mở.
- Dấu hiệu focus: nút, liên kết, ô chọn và điều khiển khác dùng viền chung `--vzn-focus-ring` khi focus bằng bàn phím (`:focus-visible`, `tokens.css`). Ô nhập chữ (`input` dạng chữ, `textarea`, ô soạn tin Chat, ô lọc) **không** dùng viền màu nhấn: focus hiện bằng con trỏ nhập liệu và viền chuyển sang `--vzn-border-strong`. Test `src/styles/__tests__/focusRing.test.ts` giữ quy tắc này.
- Vùng kết quả bất đồng bộ (dịch, phiên dịch, kết quả kiểm tra) có `aria-live="polite"`; lỗi chặn dùng `role="alert"`.
- Độ tương phản chữ thân đạt WCAG AA trên cả hai chế độ.

## 12. Trạng thái chung

Mỗi màn hình phải vẽ và đặc tả đủ các trạng thái sau (xem `boards/States.dc.html` cho hình mẫu):

| Trạng thái | Hình thức |
| --- | --- |
| Trống | Câu ngắn nói chuyện gì sẽ xuất hiện ở đây + một hành động mở đầu (nếu có) |
| Đang tải | Skeleton đúng hình dạng nội dung; nút đang chạy có spinner và nhãn "Đang …" |
| Lỗi | Thông báo nêu nguyên nhân bằng lời thường + cách sửa (Thử lại, Mở Cài đặt) |
| Thiếu khoá / model | Hàng cảnh báo vàng + nút dẫn tới Cài đặt › Mô hình AI |
| Module tắt | Trang và lệnh ẩn; phím tắt của module được giữ nhưng không chạy |
| Không có quyền hệ thống | `CapabilityNotice` với nút mở đúng cài đặt hệ điều hành |
