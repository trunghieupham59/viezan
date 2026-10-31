# Launcher (cửa sổ nổi)

> Bản vẽ gốc: `boards/Launcher.dc.html`, `boards/LauncherStates.dc.html`, `boards/SmallSurfaces.dc.html` · Board chi tiết: `specs/launcher.html` · Mã nguồn: `src/pages/QuickLauncher.tsx`, `src/components/AIChatPopup.tsx` (chế độ Hỏi AI), `src/components/ui/molecules/LauncherResultRow.tsx` (`LauncherResultRow`, `LauncherIconTile`), `FilterInput`, `OptionPicker`, `src/utils/quickCalc.ts`, `src/utils/currencyQuery.ts`, `src/styles/launcher.css`; cửa sổ: `electron/main.ts` (`createQuickChatWindow`), `electron/ipc/quickChat.ts`, `electron/ipc/launcher.ts`

Luật chung ở [`../foundations.md`](../foundations.md). Cách đặt phím mở Launcher ở [`utilities.md`](utilities.md).

## 1. Mục đích

Launcher là **một cửa sổ nổi riêng** (không nằm trong cửa sổ chính), mở bằng phím tắt toàn cục (⌘Space hoặc ⌥Space trên macOS, Alt+Space nơi khác). Người dùng gõ một dòng để: mở ứng dụng, mở tệp/thư mục, tính nhanh, đổi tiền, đưa chữ sang Dịch / Từ điển / Phiên dịch của Viezan, tìm web, hoặc hỏi AI ngay trong cửa sổ đó. Thành công là: từ lúc nhấn phím đến lúc mở được thứ cần chỉ mất vài phím, không cần chuột, và cửa sổ tự biến mất khi xong hoặc khi bấm ra ngoài.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Phím tắt toàn cục | Phím Launcher (`hotkey.chat`) | Nhấn lần nữa khi đang hiện thì ẩn (`toggleQuickChatWindow`) |
| Khay hệ thống (Windows/Linux) | Mục "Launcher Alt+Space" (board SmallSurfaces) | Theo board; chưa kiểm tra trong đặc tả này |
| Điểm ra | Esc (ô trống), bấm ra ngoài (cửa sổ `blur` → ẩn), mở một mục (ứng dụng, tệp, web) | Sao chép kết quả tính/đổi tiền cũng ẩn cửa sổ |
| Sang app chính | "Dịch", "Tra từ điển" (kèm chữ đang gõ), "Phiên dịch AI", "Mở trong Chat", "Mở Cài đặt" | Qua `quickChat.openFeature` / `openInChat` / `openSettings` |
| Sang chế độ Hỏi AI | Tab, ⌘/Ctrl+↵, hoặc chọn "Hỏi AI" / "Tiếp tục Quick AI" | Cùng cửa sổ, `mode = 'chat'` |

## 3. Bố cục

Cửa sổ: rộng cố định **760 px** (`QUICK_CHAT_WIDTH`), không viền hệ thống, luôn trên cùng, đặt giữa ngang màn hình có con trỏ và cách đỉnh vùng làm việc **22 %**. Chiều cao do renderer báo theo nội dung, kẹp trong **62–540 px** (`QUICK_CHAT_COMPACT_HEIGHT`, `QUICK_CHAT_EXPANDED_HEIGHT`). macOS: cửa sổ kiểu `panel`, nền trong suốt, vibrancy `popover`; Windows: nền đặc, bo `--vzn-radius-sm`.

```
┌ .launcher-panel (bo --vzn-radius-lg, viền --vzn-border-strong, nền --vzn-surface / --vzn-overlay-material) ┐
│ .launcher-search (FilterInput bare lg, cao --vzn-control-height-xl = 48)                                   │
│ 🔍 Tìm ứng dụng, dịch, tra từ hoặc hỏi AI…                                    Hỏi AI [Tab]   [✕]           │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ .launcher-results (listbox, cuộn)                                                                          │
│  MÁY TÍNH                                                                                                  │
│  [▣] 12*7 = 84                                                                           Máy tính         │
│  ỨNG DỤNG                                                                                                  │
│  [A] Arc                                                                                 Ứng dụng         │
│  TỆP                                                                                                       │
│  [📄] report.pdf   ~/Documents                                                           Tệp              │
│  DÙNG "…" VỚI…                                                                                             │
│  [✦] Hỏi AI   …   │ [文] Dịch   … │ [📖] Tra từ điển  … │ [🔍] Tìm trên Google  …         Lệnh             │
├ (.launcher-notice: Đang tải ứng dụng… / Chưa tải được ứng dụng… [Thử lại] / lỗi mở) ───────────────────────┤
├ .launcher-footer (nền --vzn-surface-muted) ────────────────────────────────────────────────────────────────┤
│ [icon] Mục đang chọn                                         Mở ↵  │  Hỏi AI ⌘ ↵  (tệp: Mở thư mục chứa ⇧ ↵) │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Khung | `.launcher-panel` | Bo `--vzn-radius-lg`, viền `--vzn-border-strong`; macOS trong suốt: `--vzn-overlay-material` | — |
| Ô tìm | `FilterInput` (`bare`, `size="lg"`, `maxLength=500`) trong `.launcher-search` (kéo được cửa sổ) | Cao `--vzn-control-height-xl` (48), chữ `--vzn-font-size-title-lg`, icon `--vzn-icon-lg`; gợi ý cuối "Hỏi AI" + `KeyCap` Tab | — |
| Danh sách | `.launcher-results` (`role="listbox"`) › nhóm `role="group"` | Padding `--vzn-space-1` `--vzn-space-2`; tiêu đề nhóm `--vzn-font-size-caption` semibold `--vzn-text-soft` | Có |
| Hàng kết quả | `LauncherResultRow` = `Button lg · neutral · ghost` (đang chọn: `soft`), `role="option"` | Cao 40; icon `LauncherIconTile`; tên, chi tiết, loại bên phải | — |
| Ô icon | `LauncherIconTile` | `tone="app"` cho icon thật; chữ cái đầu tô `blue/violet/green/orange` cố định theo tên | — |
| Bộ chọn tiền | `OptionPicker` (`aria-haspopup="dialog"`) đặt cạnh hàng tiền tệ, thay chữ loại | | Danh sách tìm được |
| Thông báo | `.launcher-notice` | `--vzn-font-size-sm`, `--vzn-text-muted` | — |
| Footer | `.launcher-footer` | Nền `--vzn-surface-muted`, kẻ trên `--vzn-divider`, chữ `--vzn-font-size-sm` | — |

### Chế độ Hỏi AI (`AIChatPopup`, cùng cửa sổ, cao 540)

```
┌ .quick-chat-header ─────────────────────────────────────────────────────────────────┐
│ [Tìm kiếm]  [logo/+]  ┌ textarea "Hỏi bất cứ điều gì…" ───────────── [✕] ┐  [➤]     │
├ .quick-chat-body (cuộn) ────────────────────────────────────────────────────────────┤
│ (các cặp hỏi–đáp cũ, mờ, cuộn lên mới thấy)                                         │
│ ┌ ActiveQACard ───────────────────────────────────────────────────────────────────┐ │
│ │ [Q] Câu hỏi                                                                      │ │
│ │ Đang suy nghĩ… / Smart Thinking  ▒▒▒▒▒▒  → câu trả lời Markdown đang chảy về     │ │
│ │                                                       [Sao chép] [Tạo lại]       │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
├ .quick-chat-footer ─────────────────────────────────────────────────────────────────┤
│ [● Provider / model · Smart Thinking · 2 lượt]     [Dừng] [Sao chép] │ [Mở trong Chat ⌘↵] │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 4. Thành phần và hành động

### Chế độ tìm

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Ô tìm | `FilterInput` `role="combobox"` | Gõ | Lọc lại các nhóm; chọn về hàng 0; xoá lỗi | Danh sách và chiều cao cửa sổ đổi ngay (ResizeObserver → `setLayout('expanded', h)`) | — |
| K2 | Xoá chữ (✕ trong ô) | Nút xoá của `FilterInput`, nhãn "Xoá" | Click | Ô trống | Quay về danh sách mặc định | Chỉ hiện khi có chữ |
| K3 | Hàng kết quả | `lg · neutral · ghost` → `soft` khi chọn | Click; Enter khi đang chọn; di chuột **có di chuyển thật** để chọn | Theo loại, xem bảng dưới | Trong lúc chờ main, `aria-busy` và mọi hàng disabled | Disabled khi `busy` |
| K4 | ↑ / ↓ | Phím | Trong ô tìm | Chọn hàng trước/sau, **vòng** đầu–cuối; hàng chọn tự cuộn vào vùng nhìn | Hàng `soft`; footer đổi theo hàng | Bỏ qua khi đang gõ IME |
| K5 | ↵ | Phím | Trong ô tìm | Chạy hàng đang chọn | | |
| K6 | ⌘↵ / Ctrl↵ | Phím | Trong ô tìm | Hỏi AI với chữ đang gõ | Chuyển chế độ Hỏi AI | |
| K7 | ⇧↵ | Phím | Khi hàng chọn là tệp/thư mục | `revealFile` — mở thư mục chứa (Finder/Explorer) | | Chỉ với tệp/thư mục |
| K8 | Tab | Phím | Trong ô tìm | Hỏi AI với chữ đang gõ (kể cả ô trống) | Chuyển chế độ Hỏi AI | ⇧Tab giữ hành vi mặc định |
| K9 | Esc | Phím | Bất kỳ | Có chữ → xoá chữ; ô trống → ẩn cửa sổ | | |
| K10 | Bộ chọn tiền đích | `OptionPicker`, nhãn "Đổi sang: {mã}" | Click, gõ để lọc ("Tìm loại tiền…") | Lưu tiền đích (main nhớ qua `setCurrencyTarget`), chọn lại hàng 0 | Hàng tiền tệ tính lại; focus trả về ô tìm | Disabled khi người dùng đã gõ tiền đích trong câu ("100 usd to jpy") |
| K11 | "Thử lại" (tải ứng dụng lỗi) | `sm · neutral · ghost` | Click | Tải lại danh mục ứng dụng | Notice "Đang tải ứng dụng…" | Chỉ khi lỗi |

Hành động theo loại hàng (`execute` trong `QuickLauncher.tsx`):

| Loại | Nhóm | Chữ loại | Footer ↵ | Kết quả |
| --- | --- | --- | --- | --- |
| Ứng dụng | Gần đây / Ứng dụng | Ứng dụng | Mở | `launcher.openApp(id)` |
| Tệp / Thư mục | Tệp | Tệp / Thư mục | Mở (+ "Mở thư mục chứa ⇧↵") | `openFile(id)`; ⇧↵ `revealFile(id)` |
| Máy tính | Máy tính | Máy tính | Sao chép | Chép số đã định dạng theo ngôn ngữ app, ẩn cửa sổ |
| Tiền tệ | Tiền tệ | (bộ chọn thay chữ loại) | Sao chép | Chép số tiền đã đổi, ẩn cửa sổ. Đang tải: ↵ không làm gì. Không có tỷ giá: ↵ **thử lại** |
| Hỏi AI / Hỏi tiếp AI | Dùng "…" với… | Lệnh | "Hỏi AI" | Chế độ Hỏi AI, gửi chữ. "Hỏi tiếp AI" khi phiên Quick AI < 30 phút |
| Tiếp tục Quick AI | Viezan (phiên mới) hoặc Gần đây (phiên cũ) | Lệnh | Mở | Mở lại phiên đã lưu, không gửi gì |
| Dịch / Tra từ điển | Viezan (ô trống) hoặc Dùng "…" với… | Lệnh | Mở | `openFeature({ feature, text })` — mở trang trong app chính với chữ đã gõ |
| Phiên dịch AI | Viezan | Lệnh | Mở | `openFeature({ feature: 'live' })` |
| Tìm trên Google | Dùng "…" với… | Lệnh | Mở | `searchWeb(query)` → `https://www.google.com/search` |
| Mở trong Chat / Mở Cài đặt | Viezan | Lệnh | Mở | `openInChat()` / `openSettings()` |

Thứ tự nhóm khi có chữ: **Máy tính hoặc Tiền tệ** (chỉ một) → **Ứng dụng** (tối đa 8, xếp theo: khớp đúng → viết tắt "vsc"/"vs code" → bắt đầu bằng → từ bắt đầu bằng → chứa; tên hiển thị bản địa và tên gói đều tìm được, bỏ dấu tiếng Việt) → **Tệp** (≥ 2 ký tự, chờ 150 ms, chỉ macOS/Windows) → **Viezan** (chỉ lệnh điều hướng khớp tên) → **Dùng "…" với…** (luôn có 4 mục).

Khi ô trống: **Gần đây** (tối đa 5 ứng dụng + "Tiếp tục Quick AI" nếu phiên đã cũ) → **Viezan** ("Tiếp tục Quick AI" nếu phiên mới, Dịch, Tra từ điển, Phiên dịch AI, Mở trong Chat, Mở Cài đặt).

Máy tính (`evaluateQuickCalc`) chỉ trả lời khi câu rõ ràng là phép tính: có ít nhất một phép toán; số, `+ - * / ^ %`, `×`, `÷`, ngoặc, `pi`, `e`, hàm `sqrt abs round floor ceil sin cos tan log ln`; `100 + 10%` nghĩa là cộng 10 % của 100; dấu `.`/`,` hiểu theo ngôn ngữ app; ngày tháng và số điện thoại bị bỏ qua; tối đa 200 ký tự. Đổi tiền (`parseCurrencyQuery`): `2$`, `$2`, `2 usd`, `500k vnd`, `2tr`, `100 usd to jpy`, `100 usd sang vnd`, hơn 30 loại tiền có bí danh tiếng Việt/Nhật.

### Chế độ Hỏi AI (`AIChatPopup.tsx`)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | "Tìm kiếm" (quay lại) | `md · neutral · ghost` | Click | Về chế độ tìm, giữ phiên | Ô tìm nhận focus | — |
| A2 | Logo / Cuộc trò chuyện mới | `md · neutral · ghost`, icon vuông | Click; ⌘N / Ctrl+N | Huỷ luồng đang chạy, xoá lịch sử và phiên | Thân về trạng thái trống | Disabled (hiện logo) khi chưa có lượt nào |
| A3 | Ô hỏi (`textarea`) | Placeholder "Hỏi bất cứ điều gì…" / "Hỏi tiếp..." | Gõ; Enter gửi (hoặc ⌘↵ nếu người dùng chọn kiểu gửi đó), ⇧Enter xuống dòng | | | Disabled khi đang gửi |
| A4 | Xoá chữ (✕) | `xs · neutral · ghost`, nhãn "Xoá" | Click | Ô trống, focus lại | | Ẩn khi trống hoặc đang gửi |
| A5 | Gửi | `md · primary · solid`, icon, nhãn "Gửi" | Click | Gửi câu hỏi | Icon thành spinner | Disabled khi trống, quá dài, đang gửi hoặc thiếu khoá |
| A6 | Chip model (footer) | `xs · neutral · ghost`: chấm (`--vzn-success` có khoá / `--vzn-warning` thiếu khoá, kèm chữ ẩn) + icon nhà cung cấp + "/ model" + "Smart Thinking" + "· {n} lượt" | Click | Mở Cài đặt ở app chính | | — |
| A7 | Dừng | `xs · danger · ghost` | Click | Dừng luồng (giữ phần đã nhận) | Nút biến mất | Chỉ khi đang gửi |
| A8 | Sao chép (footer) | `xs · neutral · ghost` | Click | Chép câu trả lời hiện tại | "Đã sao chép!" + dấu tích 1,2 s | Disabled khi chưa có chữ |
| A9 | Mở trong Chat | `xs · neutral · ghost`, kèm `KeyCap` ⌘↵ | Click; ⌘↵ / Ctrl+↵ | Chuyển cả cuộc hỏi–đáp (và nháp chưa gửi) sang AI Chat của app chính; popup bắt đầu mới lần sau | | — |
| A10 | Sao chép / Tạo lại trong thẻ | `xs · neutral · ghost` (`CardActions`) | Click | Chép câu trả lời / hỏi lại | | Chỉ hiện khi đã có câu trả lời hoặc lỗi và không đang gửi |
| A11 | "Mở Cài đặt" (thiếu khoá) | `sm · neutral · outline` | Click | Mở Cài đặt | | Chỉ khi thiếu khoá |
| A12 | Esc | Phím | Bất kỳ | **Ẩn cửa sổ** (không quay về chế độ tìm) | | |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống (mới mở) | Ô trống | Gần đây + Viezan; footer: mục đầu, "Mở ↵ · Hỏi AI ⌘↵" | ↑↓, ↵, gõ, Tab |
| Đang tải ứng dụng | Lần đầu, danh mục chưa về | Notice "Đang tải ứng dụng…" (`role="status"`); lệnh Viezan vẫn dùng được | Gõ, Hỏi AI |
| Đang gõ | Có chữ | Các nhóm như §4; tiêu đề "Dùng "{query}" với…" | Tất cả |
| Không khớp gì | Chữ không trùng ứng dụng/tệp | Chỉ nhóm "Dùng "…" với…" (Hỏi AI, Dịch, Tra từ điển, Tìm trên Google) — không bao giờ rỗng | ↵ = Hỏi AI |
| Tính nhanh | Câu là phép tính | Hàng đầu "12*7 = 84", footer "Sao chép ↵" | ↵ chép + ẩn |
| Đổi tiền · đang tải | Câu là số tiền, chưa có tỷ giá | "100 USD → VND" + "Đang tải tỷ giá…" | Đổi tiền đích |
| Đổi tiền · sẵn sàng | Có tỷ giá | "[100 USD] = [số tiền] VND" + "1 USD = … VND · Tỷ giá ngày …" | ↵ chép |
| Đổi tiền · không có tỷ giá | Ngoại tuyến / lỗi | Chi tiết "Không có tỷ giá khi ngoại tuyến. Hãy kết nối mạng rồi thử lại." | ↵ thử lại |
| Lỗi danh mục | `listApps` lỗi | Notice "Chưa tải được ứng dụng. Bạn vẫn có thể hỏi AI và tìm web." + "Thử lại" | K11 |
| Lỗi mở mục | Main trả lỗi khi mở | Notice đỏ `role="alert"` "Không mở được mục này. Hãy thử lại." (mất khi gõ tiếp) | Chọn lại |
| Đang mở | Chờ main | Danh sách `aria-busy`, mọi hàng disabled | — |
| Hỏi AI · trống | Vào chế độ AI không có chữ | Logo, "AI NHANH", "Hỏi AI", mô tả và bảng phím ↵ Gửi · ⇧↵ Xuống dòng · ⌘↵ Mở trong Chat · Esc Đóng | A3 |
| Hỏi AI · đang nghĩ | Đã gửi, chưa có chữ | Thẻ có câu hỏi + "Đang suy nghĩ…" (hoặc nhãn "Smart Thinking" khi đang tìm web) + 3 dòng skeleton | Dừng |
| Hỏi AI · đang chảy | Có chữ về | Markdown hiện dần; "Dừng" ở footer | Dừng |
| Hỏi AI · xong | Kết thúc | Sao chép / Tạo lại trong thẻ; footer "· n lượt" | A8–A10, hỏi tiếp |
| Hỏi AI · lỗi | Lỗi nhà cung cấp | Ô lỗi (`ui-error-box`) với thông điệp bản địa hoá | Tạo lại |
| Thiếu khoá / model | Nhà cung cấp đang chọn chưa có khoá (trừ `local`) | Thân: logo + "Chưa có API key. Vào Cài đặt để thêm." + "Mở Cài đặt"; nút Gửi disabled | A11 |
| Nội dung quá dài | Vượt `MAX_CHAT_INPUT_CHARS` | "{n} / {max}" + "Nội dung quá dài. Rút gọn để gửi." | Sửa chữ |
| Module tắt | Module Launcher tắt | Phím không được đăng ký nên cửa sổ không mở (xem utilities.md) | — |
| Không có quyền hệ thống | Không áp dụng; tìm tệp không có trên Linux (trả `UNAVAILABLE`, nhóm Tệp không xuất hiện) | — | — |

## 6. Luồng tương tác chính

**A. Mở ứng dụng**
1. Nhấn ⌘Space → cửa sổ hiện ở 22 % chiều cao màn hình, focus trong ô tìm, danh sách Gần đây.
2. Gõ "vsc" → nhóm Ứng dụng: "Visual Studio Code" đứng đầu (khớp viết tắt), đã chọn.
3. ↵ → ứng dụng mở, cửa sổ ẩn (mất focus).

**B. Tính và đổi tiền**
1. Gõ "12*7" → hàng "12*7 = 84" ở đầu; footer "Sao chép ↵".
2. ↵ → "84" vào bộ nhớ tạm, cửa sổ ẩn.
3. Mở lại, gõ "100 usd" → "[100 USD] → VND · Đang tải tỷ giá…" rồi "[100 USD] = [số tiền] VND". Bấm bộ chọn "VND", gõ "yen", chọn JPY → hàng đổi sang JPY, lựa chọn được nhớ cho lần sau.

**C. Hỏi AI**
1. Gõ "giải thích REST ngắn gọn", nhấn Tab → chế độ AI, câu hỏi tự gửi.
2. Thẻ hiện "Đang suy nghĩ…" + skeleton → chữ chảy về; footer có "Dừng".
3. Xong: "Sao chép", "Tạo lại" trong thẻ; footer "· 1 lượt".
4. Gõ tiếp "ví dụ?" + Enter → lượt 1 lùi lên (mờ), lượt 2 chiếm khung.
5. ⌘↵ → mở AI Chat trong app chính với cả hai lượt; popup làm mới cho lần sau.
6. Hoặc bấm "Tìm kiếm" để quay lại tìm; trong 30 phút, mục "Hỏi tiếp AI" / "Tiếp tục Quick AI" nối vào cuộc này.

**D. Đưa chữ sang Viezan**
1. Gõ "serendipity" → nhóm "Dùng "serendipity" với…". ↓ tới "Tra từ điển", ↵.
2. Cửa sổ chính hiện trang Từ điển với từ đã điền.

**E. Mở tệp**
1. Gõ "report" → sau 150 ms, nhóm Tệp với icon và thư mục chứa.
2. ⇧↵ → mở thư mục chứa trong Finder; ↵ → mở tệp.

## 7. Responsive

Cửa sổ rộng cố định 760 px; không có ngưỡng bề rộng.

| Kích thước | Thay đổi |
| --- | --- |
| Chiều cao 62 px (tối thiểu) | Chỉ còn ô tìm (khi chưa đo được nội dung) |
| 62–540 px | Cửa sổ cao đúng bằng nội dung (ô tìm + danh sách + notice + footer) |
| Nội dung > 540 px | Kẹp 540; chỉ `.launcher-results` cuộn; hàng đang chọn được cuộn vào vùng nhìn |
| Chế độ Hỏi AI | Luôn 540 px (`setLayout('expanded')`) |
| Màn hình nhỏ | Vị trí theo vùng làm việc của màn hình có con trỏ |

## 8. Bàn phím và trợ năng

- Mẫu combobox + listbox: ô tìm `role="combobox"`, `aria-expanded="true"`, `aria-controls="launcher-results"`, `aria-autocomplete="list"`, `aria-activedescendant` trỏ tới hàng đang chọn. Focus **luôn** ở ô tìm; hàng có `tabIndex={-1}`, `role="option"`, `aria-selected`, `aria-label` = "{tên} {loại}".
- Nhóm là `role="group"` với `aria-label`; tiêu đề nhìn thấy `aria-hidden` để không đọc hai lần.
- Bàn phím đầy đủ: ↑↓ (vòng), ↵, ⌘↵/Ctrl↵, ⇧↵, Tab, Esc. Bỏ qua khi đang soạn IME (`isComposing`, keyCode 229) và khi giữ phím lặp.
- Di chuột chỉ đổi lựa chọn khi con trỏ thực sự di chuyển (chống sự kiện giả sau khi đóng menu).
- Notice tải và lỗi danh mục `role="status"`; lỗi mở mục `role="alert"`.
- Chế độ AI: Esc ẩn cửa sổ; ⌘N mới; ⌘↵ mở trong Chat. Vùng câu trả lời có `aria-live="polite"` + `aria-busy` khi đang gửi; kết quả tính/đổi tiền được đọc qua một vùng ẩn `aria-live="polite"`.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `launcher_title` | Viezan Launcher |
| `launcher_placeholder` | Tìm ứng dụng, dịch, tra từ hoặc hỏi AI… |
| `launcher_ai_hint` | Hỏi AI (cạnh `KeyCap` Tab) |
| `launcher_results` | Ứng dụng và lệnh |
| `launcher_section_recent` / `_apps` / `_files` / `_viezan` | Gần đây / Ứng dụng / Tệp / Viezan |
| `launcher_section_use_with` | Dùng "{query}" với… |
| `launcher_ai` / `launcher_ai_followup` / `launcher_continue` | Hỏi AI / Hỏi tiếp AI / Tiếp tục Quick AI |
| `launcher_translate` / `launcher_dictionary` / `launcher_live` / `launcher_web` | Dịch / Tra từ điển / Phiên dịch AI / Tìm trên Google |
| `ai_chat_popup_open_in_chat` / `chat_error_open_settings` | Mở trong Chat / Mở Cài đặt |
| `launcher_app` / `launcher_file` / `launcher_folder` / `launcher_command` | Ứng dụng / Tệp / Thư mục / Lệnh |
| `launcher_calculator` / `launcher_currency` | Máy tính / Tiền tệ |
| `launcher_open` / `launcher_copy` / `launcher_reveal` | Mở / Sao chép / Mở thư mục chứa |
| `launcher_currency_rate` | 1 {from} = {rate} {to} · Tỷ giá ngày {date} |
| `launcher_currency_loading` / `_unavailable` | Đang tải tỷ giá… / Không có tỷ giá khi ngoại tuyến. Hãy kết nối mạng rồi thử lại. |
| `launcher_currency_target` / `_search` / `_no_results` | Đổi sang / Tìm loại tiền… / Không tìm thấy loại tiền |
| `launcher_loading` | Đang tải ứng dụng… |
| `launcher_apps_unavailable` / `launcher_retry` | Chưa tải được ứng dụng. Bạn vẫn có thể hỏi AI và tìm web. / Thử lại |
| `launcher_open_failed` | Không mở được mục này. Hãy thử lại. |
| `launcher_back` | Tìm kiếm |
| `ai_chat_popup_title` / `_short_label` | Hỏi AI / AI nhanh |
| `ai_chat_popup_placeholder` / `_followup_placeholder` | Hỏi bất cứ điều gì… / Hỏi tiếp... |
| `ai_chat_popup_empty_desc` | Nhập câu hỏi ngắn gọn hoặc dán ngữ cảnh cần AI hỗ trợ. |
| `ai_chat_popup_new_line` / `_close` / `_turns` | Xuống dòng / Đóng / {count} lượt |
| `ai_chat_popup_input_too_long` | Nội dung quá dài. Rút gọn để gửi. |
| `chat_thinking` / `chat_smart_thinking_badge` | Đang suy nghĩ… / Smart Thinking |
| `chat_send` / `chat_stop` / `chat_copy` / `chat_copied` / `chat_regenerate` | Gửi / Dừng / Sao chép / Đã sao chép! / Tạo lại phản hồi |
| `chat_error_no_key` | Chưa có API key. Vào Cài đặt để thêm. |

## 10. Chênh lệch với bản dựng hiện tại

1. **Phím hiện tệp trong Finder**: board Launcher ghi "⌘↩ hiện trong Finder"; mã dùng **⇧↵** ("Mở thư mục chứa") và ⌘↵ là Hỏi AI. Giữ mã; sửa board.
2. **Footer của board** ("↑↓ chọn · ↩ mở · ⇥ hỏi tiếp AI") khác footer mã (mục đang chọn bên trái; "Mở ↵ | Hỏi AI ⌘↵"). Gợi ý Tab nằm trong ô tìm. Giữ mã.
3. **Câu trả lời AI có nguồn trích dẫn** ("Đã tìm trên web · 2 nguồn", [1] [2]) — **đề xuất**. Mã chỉ hiện nhãn "Smart Thinking" trong lúc tìm web; nguồn chỉ có trong tooltip khi lỗi, không hiện trong câu trả lời.
4. **"Esc" ở chế độ AI ẩn cả cửa sổ**, trong khi board LauncherStates gợi ý quay về tìm kiếm. Đề xuất: Esc lần một về chế độ tìm (như nút "Tìm kiếm"), lần hai ẩn — nhất quán với chế độ tìm (Esc xoá chữ rồi mới ẩn).
5. **Board Launcher "Mở Viezan"** trong nhóm Viezan — mã có "Mở trong Chat" và "Mở Cài đặt", không có lệnh mở cửa sổ chính chung chung. **Đề xuất**.
6. **Tìm web cố định Google** (`launcher_web` = "Tìm trên Google", URL Google trong `electron/ipc/launcher.ts`); chọn công cụ tìm là **đề xuất**.
7. Kích thước nút trong header AI: "Tìm kiếm", logo và Gửi là `md`, nút xoá trong ô là `xs` (nằm trong ô nên chấp nhận được). Footer dùng `xs` thống nhất.
8. Khi Hỏi AI từ ô **trống** bằng Tab, chế độ AI mở với câu hỏi rỗng (không gửi) — đúng, nhưng footer chế độ tìm không nói Tab làm gì khi ô trống.
9. Tìm tệp chỉ có trên macOS và Windows; trên Linux nhóm Tệp không bao giờ xuất hiện và không có thông báo.

## Native implementation follow-up — 2026-10-28

SwiftUI (macOS), đã chạy thật: cửa sổ nổi không viền rộng 760, đặt giữa màn hình có con trỏ, cách
đỉnh 22%, nhận bàn phím mà không kích hoạt cửa sổ chính, ẩn khi mất focus; chiều cao theo nội dung.
Ô tìm lớn + gợi ý "Hỏi AI ⇥"; nhóm Máy tính / Tiền tệ / Gần đây (ô trống) hoặc Ứng dụng / Tệp /
"Dùng "{query}" với…" (Hỏi AI, Dịch, Tra từ điển, Tìm trên Google); footer: mục đang chọn + Mở ↵
(Sao chép cho máy tính/tiền tệ, Mở thư mục chứa ⇧↵ cho tệp) + Hỏi AI ⌘↵. ↑↓ chọn (giữ theo mục, không
theo vị trí, khi kết quả tệp về sau), Esc xoá chữ rồi ẩn. Xếp hạng ứng dụng: đầu tên → đầu từ → chứa,
ứng dụng mở gần đây trước. Tìm tệp chỉ qua Spotlight, bỏ thư mục phụ thuộc/build; không tự quét
Desktop/Documents/Downloads (tránh hộp thoại quyền thư mục giữa lúc gõ).

Chênh lệch còn lại: Hỏi AI mở panel Chat nhanh riêng (đã gửi câu hỏi) thay vì chế độ AI trong cùng cửa
sổ; không có bộ chọn loại tiền.

Qt: `Launcher.qml` là cửa sổ riêng cùng hành vi (không viền, 22%, ẩn khi mất focus, nhóm kết quả, ↑↓ ↵
Shift+↵ Ctrl/⌘+↵ Tab Esc, chọn theo id); `LauncherTools::rank` xếp ứng dụng, ứng dụng mở gần đây lưu trong
QSettings. Đã chạy trên Mac (máy tính, "Dùng … với", Dịch mở trang chính); danh sách ứng dụng Windows/Linux chưa
chạy thật.
