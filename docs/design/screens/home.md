# Trang chủ

> Bản vẽ gốc: `boards/Home.dc.html`, `boards/HomeDark.dc.html` (tham khảo thêm `boards/Main.dc.html`, `boards/Narrow.dc.html`, `boards/States.dc.html`) · Board chi tiết: [`specs/home.html`](../specs/home.html) · Mã nguồn: `src/pages/HomePage.tsx`

Luật chung (token, hợp đồng Button, bậc bề mặt, responsive, trạng thái chung) nằm ở [`foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của Trang chủ.

## 1. Mục đích

Trang chủ là trang mặc định khi mở Viezan (`activePage: 'home'` trong `src/store/slices/coreSlice.ts`). Nó trả lời ba câu hỏi trong một lần nhìn: *bắt đầu việc mới ở đâu* (thẻ Bắt đầu nhanh), *đang dở việc gì* (danh sách Tiếp tục), và *máy, model AI, phím tắt có ổn không* (cột thẻ trạng thái). Trang chỉ đọc dữ liệu đã có trong store và các hook chỉ-đọc; nó không khởi động model hay quét gì thêm (chú thích đầu `HomePage`). Thành công là người dùng bấm một lần để vào đúng việc: một chat mới, một tính năng, hoặc đúng mục vừa làm dở.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Khởi động app | Trang mặc định | `coreSlice.ts` đặt `activePage: 'home'`; lần sau app mở lại trang dùng gần nhất, riêng Cài đặt được lưu thành Trang chủ (`partialize` trong `src/store/useAppStore.ts`). |
| Thanh điều hướng | Mục "Trang chủ" (đầu danh sách, không thuộc nhóm) | Trang hệ thống, luôn có, không bật/tắt được (`SYSTEM_PAGES` trong `src/modules/catalog.ts`). |
| Bảng lệnh ⌘K | Lệnh "Trang chủ" · mô tả "Lối tắt, việc đang dở và trạng thái máy" | Từ khoá tìm: home, start, overview, recent, continue. |
| Tắt một module | Tự động | Trang của module bị tắt nhường chỗ cho Trang chủ (`resolveActivePage` trong `src/modules/enabled.ts`, gọi từ `src/App.tsx`). |
| Phím tắt | Không có | Chưa có phím riêng để về Trang chủ (xem mục 10). |

| Điểm ra | Điều khiển | Đích |
| --- | --- | --- |
| Chat mới | Nút header, thẻ "AI Chat" | AI Chat, phiên trống |
| Tính năng | Thẻ Dịch / Phiên dịch / Từ điển | Trang tính năng tương ứng |
| Việc dở | Hàng trong "Tiếp tục" | Đúng phiên / bản dịch / phiên dịch / từ điển |
| Nhiệt độ & quạt | "Mở" trên thẻ Hệ thống | Trang `thermal` |
| Mô hình AI | "Quản lý mô hình" | Cài đặt › Mô hình AI (`openSettingsAt('api')`) |
| Phím tắt | "Sửa" trên thẻ Phím tắt | Launcher & phím tắt (`utilities`) |

## 3. Bố cục

Sơ đồ ở cửa sổ 1200 px, điều hướng chính mở rộng 236 px, vùng nội dung khoảng 964 px.

```
┌ PageHeader (.page-header, 56 px) ────────────────────────────────────────────────┐
│ Trang chủ                                                         [+ Chat mới]   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ .home-body (cuộn, lề 24)                                                          │
│ Bắt đầu nhanh (.home-section-title)                                               │
│ ┌QuickStartCard┐ ┌QuickStartCard┐ ┌QuickStartCard┐ ┌QuickStartCard┐  .home-quick-  │
│ │[icon] AI Chat│ │[icon] Dịch   │ │[icon] Phiên  │ │[icon] Từ điển│   start__cards │
│ │mô tả 1–2 dòng│ │              │ │      dịch    │ │              │                │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                │
│                                  (24)                                             │
│ .home-columns                                                                     │
│ ┌ SectionCard list: .home-resume ─────────────┐ ┌ .home-side (320) ─────────────┐ │
│ │ Tiếp tục   Chat, bản dịch, phiên dịch, …    │ │ HomeSystemCard   Hệ thống  Mở │ │
│ ├─────────────────────────────────────────────┤ │ 58°  Cảm biến nóng nhất · Tải │ │
│ │[Nghiên cứu] Phiên đang dừng        Tiếp tục │ │ Quạt trái ▬▬▬───── 2.250 RPM  │ │
│ │[Chat]  Tiêu đề phiên            5 phút trước│ │ Profile quạt: Mát             │ │
│ │[Dịch]  Good morning · EN → JA   1h trước    │ ├───────────────────────────────┤ │
│ │[Phiên dịch] … · có tóm tắt      2 ngày trước│ │ Mô hình AI          ● Sẵn sàng│ │
│ │[Từ điển] serendipity · EN → VI  …           │ │ Ollama · qwen3:4b · Chạy trên │ │
│ └─────────────────────────────────────────────┘ │ Quản lý mô hình               │ │
│                                                 ├───────────────────────────────┤ │
│                                                 │ Phím tắt                  Sửa │ │
│                                                 │ Launcher            ⌘ Space   │ │
│                                                 │ Dịch nhanh vùng chọn   ⌥ T    │ │
│                                                 │ Bảng lệnh              ⌘ K    │ │
│                                                 └───────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Khung trang | `.app-page` › `.app-workspace` › `.glass-panel` | Full-bleed: `.glass-panel` có `.page-header` thì bỏ viền, nền trong suốt (`src/styles/codex.css`), thân nằm trên canvas `--vzn-bg` | Không |
| Header | `PageHeader` (`src/components/templates/PageHeader.tsx`) | `--vzn-page-header-min-height` (56), lề ngang `--vzn-space-6`, nền `--vzn-surface`; tiêu đề `--vzn-font-size-title-lg` | Không |
| Thân | `.home-body` (`src/styles/home.css`) | Cột flex, khoảng cách `--vzn-space-6`, lề `--vzn-space-6` | Cuộn dọc (`overflow: auto`) |
| Bắt đầu nhanh | `section.home-quick-start` + `QuickStartCard` | Lưới `auto-fit`, cột tối thiểu `--vzn-quick-card-min` (200), khe `--vzn-space-3`; thẻ lề `--vzn-space-4`, bo `--vzn-radius-md`, ô icon `--vzn-control-height-sm` (32) nền `--vzn-action-soft` | Theo thân |
| Hai cột | `.home-columns` | Flex wrap, khe `--vzn-space-4` | Theo thân |
| Tiếp tục | `SectionCard variant="list"` + `ActivityRow` | Cơ sở `--vzn-overview-resume-basis` (460), co giãn 999; header riêng có đường kẻ `--vzn-divider`; hàng cao tối thiểu `--vzn-control-height-lg` (40), lề `--vzn-space-2` × `--vzn-space-4` | Theo thân |
| Cột phụ | `.home-side` | Cơ sở `--vzn-overview-side` (320), các thẻ cách `--vzn-space-4` | Theo thân |
| Hệ thống | `HomeSystemCard` (`src/components/organisms/home/HomeSystemCard.tsx`) | Số nhiệt `--vzn-font-size-heading-lg` (28) chữ số đều cột; tên quạt `--vzn-overview-fan-label` (72), số RPM `--vzn-overview-fan-value` (76); `Meter` nhấn `action` | Theo thân |
| Mô hình AI | `SectionCard` `.home-ai-card` | Chấm trạng thái `--vzn-space-1-5`; mã model `--vzn-font-mono` | Theo thân |
| Phím tắt | `SectionCard` + `ShortcutOverview compact` → `ShortcutList` | Một hàng mỗi phím: nhãn trái, `KeyCap` phải | Theo thân |

Mọi thẻ dùng `SectionCard` (`src/components/ui/molecules/SectionCard.tsx`): viền `--vzn-border`, bo `--vzn-radius-md`, không bóng, lề `--vzn-space-4`, tiêu đề `--vzn-font-size-subtitle` semibold.

## 4. Thành phần và hành động

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | "Chat mới" (header, icon `PlusIcon`) | `sm` · `primary` · `solid`, `shape="rect"` | Click, Enter/Space khi focus | `setActiveChatSession(null)` rồi `setActivePage('chat')`: mở AI Chat với phiên trống | Chuyển trang ngay sang Chat, ô soạn trống | Không bao giờ `disabled`; **ẩn** khi module Chat tắt (`chatOn`) |
| 2 | Thẻ "AI Chat" | `QuickStartCard`: `lg` · `neutral` · `outline`, `shape="rect"`, cao tự do | Click, Enter/Space | Như #1 (`startFeature('chat')`) | Hover: viền chuyển `--vzn-action-border`; chuyển trang | Ẩn khi module tắt |
| 3 | Thẻ "Dịch" | như #2 | như #2 | `clearTranslation()` (vì `navigateEffect: 'clearTranslation'`; "bắt đầu nhanh" nghĩa là việc mới) rồi mở trang Dịch với ô nguồn trống. Điều hướng bằng sidebar/bảng lệnh thì giữ bản nháp | như #2 | Ẩn khi module tắt |
| 4 | Thẻ "Phiên dịch" | như #2 | như #2 | Mở trang Phiên dịch (`live`) | như #2 | Ẩn khi module tắt |
| 5 | Thẻ "Từ điển" | như #2 | như #2 | Mở trang Từ điển | như #2 | Ẩn khi module tắt; nếu cả bốn module tắt, cả mục "Bắt đầu nhanh" ẩn |
| 6 | Hàng "Nghiên cứu" (Deep Research đang dừng) | `ActivityRow`: `lg` · `neutral` · `ghost`, cả hàng là một nút; `data-pending="true"` | Click, Enter/Space | `setActiveChatSession(id)` + mở Chat; việc chạy tiếp do nút tiếp tục trong khung nghiên cứu của Chat (`handleResumeDeepResearch`, `src/pages/ChatPage.tsx`) | Thay vì thời gian, cuối hàng hiện chữ "Tiếp tục" màu `--vzn-warning`; hover nền `--vzn-surface-raised` | Không có; chỉ hiện khi Chat bật và có phiên mang `deepResearchResumeState` |
| 7 | Hàng "Chat" | như #6, không `data-pending` | như #6 | Mở đúng phiên chat gần nhất có tin nhắn | Chuyển trang | Chỉ hiện khi Chat bật |
| 8 | Hàng "Dịch" | như #7 | như #6 | `reuseTranslationHistory(item)`: nạp văn bản nguồn, cặp ngôn ngữ, model, kiểu dịch; bản dịch đơn được khôi phục, bản so sánh để trống | Chuyển sang trang Dịch đã điền sẵn | Chỉ hiện khi Dịch bật |
| 9 | Hàng "Phiên dịch" | như #7 | như #6 | `setViewingLiveSession(id)` + mở trang Phiên dịch ở phiên đó | Chuyển trang | Chỉ hiện khi Phiên dịch bật |
| 10 | Hàng "Từ điển" | như #7 | như #6 | Mở trang Từ điển; trang mở sẵn mục mới nhất, chính là mục này | Chuyển trang | Chỉ hiện khi Từ điển bật |
| 11 | "Mở" (thẻ Hệ thống) | `xs` · `primary` · `ghost`, kiểu link (`.ui-section-card__action`: gạch chân, không nền) | Click, Enter/Space | `setActivePage('thermal')` | Chuyển trang | Cả thẻ ẩn khi module Nhiệt độ tắt |
| 12 | Thanh đo quạt | `Meter` (thẻ `<meter>` gốc), không tương tác | — | Tốc độ quạt trong khoảng `minRpm`…`maxRpm` | Cập nhật theo snapshot mỗi 2 giây (`THERMAL_SAMPLE_INTERVAL_MS`) | — |
| 13 | "Quản lý mô hình" (thẻ Mô hình AI) | `xs` · `primary` · `ghost`, kiểu link, căn đầu dòng dưới nội dung | Click, Enter/Space | `openSettingsAt('api')`: Cài đặt mở ở mục "Mô hình AI" | Chuyển trang | Luôn có |
| 14 | "Sửa" (thẻ Phím tắt) | `xs` · `primary` · `ghost`, kiểu link | Click, Enter/Space | `setActivePage('utilities')` | Chuyển trang | Luôn có |
| 15 | Hàng phím tắt | `ShortcutList` chỉ đọc, `KeyCap` | — | Hiện phím của Launcher, Dịch nhanh vùng chọn, Bảng lệnh | Đọc lại khi cửa sổ được focus hoặc khi một phím được lưu (`SHORTCUTS_CHANGED_EVENT`) | Hàng Launcher ẩn khi module Launcher tắt; phím đang tắt hiện mờ (`--vzn-opacity-disabled`) kèm chữ "· đang tắt"; trùng phím hiện chip "Trùng phím" |

Trang chủ không có nút `danger`, không có hành động xoá. Thứ tự hàng "Tiếp tục": phiên Nghiên cứu đang dừng luôn đứng đầu, sau đó tối đa một mục mới nhất của mỗi tính năng, mới nhất trước (`recentActivity` trong `src/utils/homeActivity.ts`). Danh sách có tối đa 5 hàng.

Nội dung hàng (`row()` trong `HomePage.tsx`):

| Loại | Thẻ loại | Tiêu đề | Phần phụ (`meta`) |
| --- | --- | --- | --- |
| Nghiên cứu | "Nghiên cứu" | Tiêu đề phiên | — (thay thời gian bằng "Tiếp tục") |
| Chat | "Chat" | Tiêu đề phiên | — |
| Dịch | "Dịch" | 80 ký tự đầu văn bản nguồn, gộp khoảng trắng, thêm "…" | `EN → JA` |
| Phiên dịch | "Phiên dịch" | 80 ký tự đầu bản dịch, hoặc bản ghi gốc, hoặc "Phiên dịch" nếu trống | "có tóm tắt" nếu có tóm tắt, ngược lại cặp ngôn ngữ |
| Từ điển | "Từ điển" | Từ đã tra | Cặp ngôn ngữ |

Thời gian: "Vừa xong", "{n} phút trước", "{n} giờ trước", "{n} ngày trước", sau 7 ngày là ngày theo ngôn ngữ app (`formatDateForLocale`) (`formatTimeAgo`, `src/utils/relativeTime.ts`). Tiêu đề dài bị cắt bằng dấu "…"; phần phụ và thời gian không bao giờ xuống dòng.

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Đang tải trang | Lần đầu tải chunk của Trang chủ (trang được `lazy` trong `src/modules/pages.ts`) | `FeatureLoadingState` bố cục `list`: skeleton tiêu đề, một dòng, một nút, rồi một panel skeleton; `role="status"` với nhãn "Đang tải Trang chủ…" | Không |
| Có dữ liệu | Có ít nhất một hoạt động | Như sơ đồ mục 3 | #1–#15 |
| Trống (Tiếp tục) | Chưa có chat có tin nhắn, bản dịch, phiên dịch, tra từ nào (hoặc các module đó tắt) | Header thẻ giữ nguyên; thân là câu "Chưa có gì. Việc bạn làm trong Viezan sẽ hiện ở đây để mở lại nhanh." màu `--vzn-text-muted`, lề `--vzn-space-4` | Thẻ Bắt đầu nhanh và nút Chat mới là lối mở đầu |
| Đang đọc cảm biến | Module Nhiệt độ bật, chưa có snapshot | Thẻ Hệ thống: "Đang đọc cảm biến…" (`aria-live="polite"`) | "Mở" |
| Không có cảm biến | `support.reason === 'no-sensors'`, hoặc máy hỗ trợ và snapshot trả về không có cảm biến nào | "Không tìm thấy cảm biến nhiệt độ nào." | "Mở" |
| Lỗi cảm biến | `error` của `useThermalMonitor` và chưa có số đo nào | `role="alert"`: "Không đọc được cảm biến: {lỗi}" + nút "Thử lại" (`xs` · `neutral` · `outline`, gọi `retry`) | "Thử lại", "Mở" |
| Không đọc được cảm biến | `support.supported === false` (nền tảng không hỗ trợ, hoặc thiếu `window.api.thermal`) | "Không đọc được cảm biến trên máy này." | "Mở" |
| Đang ấm / đang nóng | Cảm biến nóng nhất ≥ 70 °C / ≥ 90 °C (`thermalTone`, `src/utils/thermalSensorRows.ts`) | Số nhiệt đổi màu `--vzn-warning` / `--vzn-danger`, kèm `StatusChip` "Đang ấm" / "Đang nóng" (chữ mang nghĩa, không chỉ màu) | "Mở" |
| Không có quạt | Snapshot có cảm biến nhưng `fans` rỗng | Ẩn danh sách quạt; chỉ còn số nhiệt và chú thích | "Mở" |
| Profile quạt | Helper điều khiển quạt `ready` (`useBackgroundStatus`) | "Profile quạt: {tên}" hoặc "Quạt: tốc độ tuỳ chỉnh" khi không có profile; ẩn dòng này khi helper chưa sẵn sàng | — |
| Thiếu khoá | Nhà cung cấp đang chọn là đám mây và `keyStatus[provider]` là `false` | Thẻ Mô hình AI: chấm + "Cần API key" màu `--vzn-warning` | "Quản lý mô hình" dẫn tới Cài đặt › Mô hình AI |
| Sẵn sàng | Nhà cung cấp là `local`, hoặc đã có khoá | Chấm + "Sẵn sàng" màu `--vzn-success`; với `local` thêm " · Chạy trên máy này" | "Quản lý mô hình" |
| Lỗi | Trang không có lỗi chặn riêng; lỗi monitor nhiệt hiện trong thẻ Hệ thống (hàng "Lỗi cảm biến") | — | — |
| Module tắt | Chat / Dịch / Phiên dịch / Từ điển / Nhiệt độ / Launcher tắt | Ẩn thẻ bắt đầu nhanh, hàng hoạt động, nút Chat mới, thẻ Hệ thống, hàng phím Launcher tương ứng. Thẻ Mô hình AI và Phím tắt luôn còn | Phần còn lại |

Thẻ Hệ thống chỉ được mount khi module Nhiệt độ bật, nên cảm biến không bị đọc cho một module người dùng đã tắt. Khi cửa sổ bị ẩn, `useThermalMonitor` tạm dừng monitor.

## 6. Luồng tương tác chính

**A. Bắt đầu một chat mới**
1. Người dùng ở Trang chủ; nút "Chat mới" là nút `solid` duy nhất của header.
2. Bấm nút (hoặc Tab tới rồi Enter). Store bỏ phiên đang chọn và chuyển `activePage` sang `chat`.
3. Trang AI Chat hiện với ô soạn trống; lịch sử chat giữ trạng thái thu gọn đã lưu.

**B. Mở lại việc dở**
1. Thẻ "Tiếp tục" liệt kê mục mới nhất của mỗi tính năng; phiên nghiên cứu đang dừng đứng đầu với chữ "Tiếp tục" màu cảnh báo.
2. Hover một hàng: nền `--vzn-surface-raised`. Bấm hàng.
3. Theo loại: Chat/Nghiên cứu mở đúng phiên; Dịch điền lại văn bản, cặp ngôn ngữ và model; Phiên dịch mở xem phiên đó; Từ điển mở mục mới nhất.
4. Với Nghiên cứu, người dùng bấm tiếp tục trong khung nghiên cứu của Chat; pipeline chạy tiếp từ bước còn thiếu.

**C. Kiểm tra máy**
1. Thẻ Hệ thống ban đầu "Đang đọc cảm biến…".
2. Khi snapshot đầu tiên về (khoảng 2 giây), hiện nhiệt độ nóng nhất, tải CPU, các quạt và profile.
3. Nếu ≥ 70 °C: số chuyển vàng và có chip "Đang ấm"; ≥ 90 °C: đỏ và "Đang nóng".
4. Bấm "Mở" để sang trang Nhiệt độ & quạt.

**D. Sửa thiếu khoá**
1. Thẻ Mô hình AI báo "Cần API key".
2. Bấm "Quản lý mô hình": Cài đặt mở thẳng mục "Mô hình AI".
3. Lưu khoá xong, quay lại Trang chủ: `keyStatus` đã cập nhật, thẻ hiện "Sẵn sàng".

**E. Xem / sửa phím tắt**
1. Thẻ Phím tắt hiện ba phím chính đọc trực tiếp từ main.
2. Nếu hai phím trùng nhau, hàng có chip "Trùng phím".
3. Bấm "Sửa" để sang Launcher & phím tắt; lưu xong, quay lại thì danh sách tự đọc lại.

## 7. Responsive

Bố cục dùng container query trên `app-main` (`src/styles/home.css`). Khi cửa sổ < 900 px, điều hướng chính thành rail 60 px (xem foundations §8), nên vùng nội dung rộng thêm.

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 900 px | Bắt đầu nhanh: lưới `auto-fit` (4 thẻ khi đủ 4 module; 3 module thì 3 cột). Hai cột: Tiếp tục (co giãn) + cột phụ 320 px |
| 560–899 px | Hai cột xếp thành một cột (`.home-columns` đổi `flex-direction: column` trong `@container app-main (max-width: 899px)`): Tiếp tục ở trên, rồi Hệ thống, Mô hình AI, Phím tắt. Bắt đầu nhanh thành lưới 2 × 2 |
| < 560 px | Lề thân giảm còn `--vzn-space-4` (16 px); lề header còn `--vzn-space-4`; nút "Chat mới" có thể xuống dòng dưới tiêu đề (header `flex-wrap`) |


## 8. Bàn phím và trợ năng

- Thứ tự Tab: "Chat mới" → bốn thẻ Bắt đầu nhanh → từng hàng Tiếp tục → "Mở" (Hệ thống) → "Quản lý mô hình" → "Sửa" (Phím tắt). Thanh đo và hàng phím tắt không nhận focus.
- Mọi điều khiển là `Button` atom, nên Enter/Space kích hoạt và vòng focus dùng `--vzn-focus-ring`.
- Landmark: tiêu đề trang là `h1` (`PageHeader`). Mục Bắt đầu nhanh là `section` có `aria-labelledby` trỏ tới `h2` "Bắt đầu nhanh". Mỗi `SectionCard` là `section` có `aria-labelledby` trỏ tới `h2` của nó, nên trình đọc màn hình thấy các vùng "Tiếp tục", "Hệ thống", "Mô hình AI", "Phím tắt".
- Thẻ bắt đầu nhanh và hàng hoạt động là một nút duy nhất; tên truy cập là chữ hiển thị theo thứ tự (ví dụ "Dịch Good morning · EN → JA 1h trước"). Icon trong thẻ có `aria-hidden`.
- Thanh đo quạt là `<meter>` có `aria-label` (tên quạt) và `aria-valuetext` ("2.250 RPM").
- "Đang đọc cảm biến…" có `aria-live="polite"`.
- Trạng thái không dựa riêng vào màu: "Sẵn sàng" / "Cần API key", "Đang ấm" / "Đang nóng", "Trùng phím" đều có chữ. Phím tắt đang tắt hiện mờ kèm chữ "· đang tắt", kể cả trong bản `compact`.
- Danh sách phím tắt có `aria-label` "Tất cả phím tắt".
- Trang không mở lớp phủ nào nên không có quản lý focus riêng.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `nav_home` | Trang chủ |
| `home_new_chat` | Chat mới |
| `home_quick_start` | Bắt đầu nhanh |
| `nav_chat` · `command_palette_chat_description` | AI Chat · Trò chuyện với AI local và đám mây |
| `nav_translate` · `command_palette_translate_description` | Dịch · Dịch văn bản, hình ảnh và giọng nói |
| `nav_live_translate` · `command_palette_live_description` | Phiên dịch · Phiên dịch giọng nói theo thời gian thực |
| `nav_dictionary` · `command_palette_dictionary_description` | Từ điển · Tra cứu từ và định nghĩa |
| `home_resume_title` | Tiếp tục |
| `home_resume_description` | Chat, bản dịch, phiên dịch, tra từ gần đây |
| `home_resume_empty` | Chưa có gì. Việc bạn làm trong Viezan sẽ hiện ở đây để mở lại nhanh. |
| `home_resume_action` | Tiếp tục |
| `home_kind_chat` / `home_kind_research` / `home_kind_translate` / `home_kind_live` / `home_kind_dictionary` | Chat / Nghiên cứu / Dịch / Phiên dịch / Từ điển |
| `home_live_with_summary` | có tóm tắt |
| `home_live_untitled` | Phiên dịch |
| `time_just_now` / `time_m_ago` / `time_h_ago` / `time_d_ago` | Vừa xong / {n} phút trước / {n} giờ trước / {n} ngày trước |
| `home_open` | Mở |
| `home_edit` | Sửa |
| `home_system_title` | Hệ thống |
| `thermal_hottest` | Cảm biến nóng nhất |
| `home_system_load` | Tải CPU {n}% |
| `home_system_warm` / `home_system_hot` | Đang ấm / Đang nóng |
| `home_system_loading` | Đang đọc cảm biến… |
| `home_system_unavailable` | Không đọc được cảm biến trên máy này. |
| `home_system_profile` | Profile quạt: {name} |
| `home_system_profile_custom` | Quạt: tốc độ tuỳ chỉnh |
| `thermal_fan_label_left` / `thermal_fan_label_right` / `thermal_fan_name` | Quạt trái / Quạt phải / Quạt {n} |
| `home_ai_title` | Mô hình AI |
| `home_ai_ready` / `home_ai_missing_key` | Sẵn sàng / Cần API key |
| `home_ai_local` | Chạy trên máy này |
| `home_ai_manage` | Quản lý mô hình |
| `home_shortcuts_title` | Phím tắt |
| `shortcut_launcher` / `shortcut_quick_translate` / `shortcut_command_palette` | Launcher / Dịch nhanh vùng chọn / Bảng lệnh |
| `shortcut_conflict` / `shortcut_unset` | Trùng phím / Chưa đặt |
| `shortcuts_all_title` | Tất cả phím tắt (nhãn ARIA của danh sách) |
| `route_loading` | Đang tải {tính năng}… |
| `home_subtitle` | Tiếp tục việc dở hoặc bắt đầu việc mới (có khoá nhưng chưa dùng) |

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ so với mã:

1. **Chữ thẻ Bắt đầu nhanh.** Board ghi "Hỏi AI", "Phiên dịch trực tiếp", "Tra từ" kèm mô tả riêng ("Chat với model local hoặc đám mây, kèm web và ảnh."). Mã dùng nhãn điều hướng và mô tả của bảng lệnh (`labelKey`, `descriptionKey` trong `src/modules/catalog.ts`): "AI Chat", "Phiên dịch", "Từ điển". Nếu muốn chữ của board cần thêm khoá `home_quick_*` riêng: **đề xuất**.
2. **Thẻ AI.** Board vẽ "AI local · Đang chạy · Ollama · qwen3:4b · chế độ GPU". Mã chỉ có "Mô hình AI" với hai trạng thái "Sẵn sàng" / "Cần API key" theo `keyStatus`; không kiểm tra runtime local có đang chạy, model đã cài hay chế độ GPU. Hiện trạng runtime thật và chế độ tăng tốc: **đề xuất**.
3. **Không có model.** Với `local`, thẻ luôn báo "Sẵn sàng" kể cả khi chưa cài runtime hay model; nếu chưa chọn model (`selectedModels[provider]` rỗng) thì dòng chỉ còn "Ollama · " (`modelName` rỗng). Trạng thái "chưa có model" kiểu `boards/States.dc.html` (Chọn cách chạy AI: Cài AI local / Thêm khoá) chưa có ở Trang chủ: **đề xuất**.
4. **Nháy "Cần API key" lúc khởi động.** `keyStatus` khởi tạo toàn `false` (`settingsSlice.ts`) và chỉ được cập nhật bất đồng bộ trong `App.tsx` (`keychain.hasKey`), nên với nhà cung cấp đám mây thẻ có thể hiện "Cần API key" thoáng qua trước khi đúng. Cần một trạng thái "đang kiểm tra": **đề xuất**.
5. **Chú thích thẻ Hệ thống.** Board: "CPU nóng nhất · tải 17%" và "Profile Mát · helper đã kết nối". Mã: "Cảm biến nóng nhất · Tải CPU 17%" và "Profile quạt: Mát"; không có chữ "helper đã kết nối". HomeDark ghi "· đang ấm" nối trong chú thích; mã dùng `StatusChip` riêng, đúng luật màu-không-là-tín-hiệu-duy-nhất hơn.
6. **Thứ tự hàng Nghiên cứu.** Board đặt hàng Nghiên cứu thứ hai; mã luôn đặt nó đầu tiên vì nó chờ người dùng. Giữ theo mã.
7. **Nghĩa của "Tiếp tục".** Hàng Nghiên cứu ghi "Tiếp tục" nhưng chỉ mở phiên; người dùng phải bấm tiếp tục lần nữa trong Chat. Hoặc đổi chữ thành "Mở để tiếp tục", hoặc truyền ý định tiếp tục sang Chat: **đề xuất**.
8. **Icon hàng hoạt động.** `row()` tính icon cho từng loại nhưng `HomePage` không truyền `icon` vào `ActivityRow`; board cũng không vẽ icon. Mã thừa, không ảnh hưởng giao diện.
9. **Board tối bỏ thẻ AI** và chỉ có 4 hàng Tiếp tục; đó là lược bớt của bản vẽ, không phải hành vi. Trong app, chế độ tối giữ đủ các thẻ.
10. **Ba thẻ và một thẻ lẻ.** Chú thích trong `home.css` ghi "never three and an orphan", nhưng khi chỉ ba module bật và vùng nội dung < 900 px, lưới 2 cột cho ra 2 + 1.
11. **Phím tắt lúc mới mount.** Launcher và Dịch nhanh hiện "Chưa đặt" cho tới khi main trả lời.
12. **Phím tắt về Trang chủ, mô tả header.** Không có phím tắt riêng để về Trang chủ, và khoá `home_subtitle` có nhưng `PageHeader` không nhận `description`. Board cũng không vẽ mô tả, nên giữ như mã; phím tắt riêng: **đề xuất**.
13. **Tải nhiều mục mỗi tính năng.** Board và mã đều chỉ một mục mới nhất mỗi tính năng; không có "Xem tất cả". Danh sách đầy đủ thuộc lịch sử từng trang (xem `boards/Histories.dc.html`).
