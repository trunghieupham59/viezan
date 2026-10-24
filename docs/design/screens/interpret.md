# Phiên dịch

> Bản vẽ gốc: `boards/Interpret.dc.html` (cùng `boards/Histories.dc.html`, `boards/Popovers.dc.html`, `boards/States.dc.html`, `boards/SmallSurfaces.dc.html`) · Board chi tiết: `specs/interpret.html` · Mã nguồn: `src/pages/LiveTranslatePage.tsx`

Luật chung (token, hợp đồng Button, bậc bề mặt, responsive, trạng thái chung) nằm ở [`foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của màn hình Phiên dịch.

## 1. Mục đích

Phiên dịch nghe âm thanh trực tiếp (microphone, âm thanh hệ thống, hoặc cả hai), nhận dạng giọng nói (STT) thành bản ghi và dịch từng câu sang ngôn ngữ đích gần như theo thời gian thực. Người dùng đến đây khi đang họp, xem video hoặc nghe một người nói tiếng khác. Thành công là: bấm **Bắt đầu**, thấy từng câu gốc hiện ra cùng bản dịch ngay bên dưới (hoặc ở cột bên cạnh), có thể bật **Phụ đề nổi** đè lên ứng dụng khác, và khi dừng thì có bản ghi lưu lại, xuất TXT/SRT và tạo tóm tắt, việc cần làm, quyết định bằng AI.

Mã: trang `src/pages/LiveTranslatePage.tsx`, logic phiên `src/hooks/useLiveTranslate.ts`, organism `src/components/organisms/live/*.tsx`, hàng bản ghi `src/components/live/*.tsx`, CSS `src/styles/ai-configuration.css` (khối `live-*`, `ai-subtitle-*`), cửa sổ phụ đề `public/subtitle.html` + `electron/main.ts` (`createSubtitleWindow`).

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng | Nhóm NGÔN NGỮ › mục "Phiên dịch" (`nav_live_translate`) | Module `live` trong `src/modules/catalog.ts`; icon micro |
| Bảng lệnh ⌘K | Lệnh "Phiên dịch" · "Phiên dịch giọng nói theo thời gian thực" (`command_palette_live_description`) | Từ khoá tìm: live, speech, microphone, real-time, subtitle |
| Trang chủ | Thẻ bắt đầu nhanh "Phiên dịch"; hàng hoạt động gần đây loại "Phiên dịch" | Hàng gần đây gọi `setViewingLiveSession(id)` rồi mở trang, phiên cũ được nạp lại tại chỗ (`src/pages/HomePage.tsx`) |
| Launcher | Lệnh "Phiên dịch AI" (`launcher_live`) | `quickChat.openFeature({ feature: 'live' })` (`src/pages/QuickLauncher.tsx`) |
| Cửa sổ Phụ đề nổi | Nút Bắt đầu/Dừng, "Phiên mới" trong cửa sổ phụ đề | Điều khiển phiên ở trang chính qua IPC `subtitle.onStart/onStop/onClear` (`useLiveTranslate.ts`) |
| Phím tắt | Không có phím tắt riêng | Đề xuất ở mục 10 |
| Ra | Chuyển trang khác | Rời trang thì phiên dừng, cửa sổ phụ đề đóng, toast của trang bị gỡ (cleanup trong `useLiveTranslate.ts` và các `useEffect` notify của trang) |

## 3. Bố cục

Bố cục mặc định (vùng nội dung ≥ 1100 px, kiểu hiển thị **Song song**, đang có bản ghi):

```
┌ PageHeader (.page-header) ──────────────────────────────────────────────────────────────────┐
│ Phiên dịch  [Nhật → Việt ▾ │ →]  [Micro|Âm thanh hệ thống|Cả hai]                           │
│              ● Đang nghe… 12:04 ▮▮▮▯  [⏱] [⚙] [Phụ đề nổi] [■ Dừng]                        │
├─ .live-language-notice (chỉ khi xem phiên cũ có cặp ngôn ngữ khác) ─────────────────────────┤
├ .live-panels-body (padding 16, gap 8; grid 1fr | 280 px) ──────────────────────────────────┤
│ ┌ .live-paired-panel ─────────────────────────────────┐ ┌ .live-session-panel ─────────┐ │
│ │ Bản ghi │ [Groq (free)]          [Song song|Tách riêng]│ │ PHIÊN NÀY                    │ │
│ ├ .live-scroll-viewport ──────────────────────────────┤ │ ┌ Tóm tắt ────────────────┐ │ │
│ │ [Speaker 1] Câu gốc (màu chữ nhạt)                   │ │ │ đoạn trích / ghi chú     │ │ │
│ │             Bản dịch (đậm, 15 px)                    │ │ │ [💡 Tổng hợp nội dung]   │ │ │
│ │ [Speaker 2] Câu gốc …                                │ │ └──────────────────────────┘ │ │
│ │             Đang chờ đủ ý (nghiêng)                  │ │ ┌ Người nói ──────────────┐ │ │
│ │ [Speaker 2] câu đang nói… ▍ (mờ 50%)                 │ │ │ Speaker 1      12 câu   │ │ │
│ │              ( ⌄ Xem mới nhất )                      │ │ └──────────────────────────┘ │ │
│ ├ .surface-footer ────────────────────────────────────┤ │ ┌ Xuất ───────────────────┐ │ │
│ │ [⧉][🗑 Xóa]                 1.234 từ [⧉][Tổng hợp…] │ │ │ [⤓ TXT] [⤓ SRT]          │ │ │
│ └──────────────────────────────────────────────────────┘ │ └──────────────────────────┘ │ │
│                                                         │ Các phiên trước (8)          │ │
│                                                         └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header trang | `PageHeader` (`src/components/templates`), class `.page-header` | `--vzn-page-header-min-height` (56), padding `--vzn-space-2` × `--vzn-space-6`, nền `--vzn-surface`; xuống dòng (`flex-wrap`) khi chật | Không |
| Vùng đầu header | `.live-header-leading`: `LanguagePairBar scope="live"` + nhóm nguồn âm thanh `.live-audio-source-group` | gap `--vzn-space-2` × `--vzn-space-3` | Không |
| Hành động header | `.page-header__actions`: `LiveSessionStatus`, nút lịch sử, `InterpretAIConfiguration`, nút Phụ đề nổi, Bắt đầu/Dừng | Tất cả `md` (36), gap `--vzn-space-2` | Không |
| Thông báo cặp ngôn ngữ | `p.live-language-notice` | chữ `--vzn-font-size-caption`, màu `--vzn-text-muted`, đường kẻ dưới `--vzn-divider` | Không |
| Thân | `.live-panels-body` (`data-view-mode`, `data-session-panel`) | padding `--vzn-space-4`, gap `--vzn-space-2`; có "Phiên này" thì grid `minmax(0,1fr) var(--vzn-live-session-panel-width)` (280) | Thân không cuộn (Song song); < 900 px thân cuộn |
| Bảng Bản ghi (Song song) | `.glass-panel.live-paired-panel` | thẻ `--vzn-surface`, viền `--vzn-border`, bo `--vzn-radius-md` | Chỉ `.live-scroll-viewport` cuộn |
| Thanh công cụ bảng | `.live-panel-toolbar` | padding `--vzn-space-2` × `--vzn-space-3`, tiêu đề `.live-panel-title` 13 px semibold, vạch ngăn `--vzn-divider` | Không |
| Vùng cuộn bản ghi | `.live-scroll-region` > `.live-scroll-viewport` > `.live-scroll-content` | padding `--vzn-space-4`, khoảng giữa hàng `--vzn-space-1-5` | Có, tự bám cuối (`useFollowLatest`) |
| Hàng song ngữ | `BilingualSegmentRow` (`.live-bilingual-row`) | gốc `--vzn-font-size-md` màu `--vzn-text-soft`; dịch `--vzn-font-size-subtitle` màu `--vzn-text-strong`; dòng `--vzn-line-height-reading` (1.6) | — |
| Nút Xem mới nhất | `.live-jump-latest` | nổi giữa đáy, cách đáy `--vzn-space-3`, nền `--vzn-surface-raised`, `--vzn-shadow-sm`, lớp `--vzn-layer-local-toolbar` | — |
| Chân bảng | `.surface-footer` + `.live-transcript-actions` | nút `xs` (28), gap `--vzn-space-1` | Không |
| Hai bảng (Tách riêng) | `.app-panel-grid` với hai `.glass-panel`: "Nguyên bản" và "Bản dịch" | 2 cột khi cửa sổ ≥ 1024 px (`src/index.css`) và vùng nội dung ≥ 900 px | Mỗi bảng tự cuộn, mỗi bảng có nút Xem mới nhất riêng |
| Phiên này | `LiveSessionPanel` (`.live-session-panel`) gồm 3 `SectionCard` | rộng `--vzn-live-session-panel-width` (280), gap `--vzn-space-3`; tiêu đề viết hoa `--vzn-tracking-caps` | Có (tự cuộn) |
| Popover Cấu hình AI | `InterpretAIConfiguration` → `AIConfigurationPopover` | rộng `--vzn-ai-configuration-inline` (= `--vzn-popover-wide`, 420), cao tối đa `--vzn-ai-configuration-max-block`, `--vzn-shadow-md` | Thân popover cuộn |
| Hộp thoại Tóm tắt | `DialogShell size="lg"` | xem `DialogShell` | Nội dung tab cuộn |
| Hộp thoại Phiên đã lưu | `DialogShell size="md"` + `LiveSessionHistoryPanel` | `.history-panel[data-variant="overlay"]` | Danh sách cuộn |
| Hộp thoại quyền Screen Recording | `div.modal-surface` (tự dựng) | `max-w-sm`, padding 24 | Không |
| Cửa sổ Phụ đề nổi | Cửa sổ Electron riêng `public/subtitle.html` | 660 × 300 (tối thiểu 400 × 252), không viền, nền trong suốt, luôn nổi, cách đáy màn hình 40 | — |

## 4. Thành phần và hành động

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cặp ngôn ngữ (nguồn ▾ / đích ▾) | `LanguagePairBar scope="live"`, nút chọn `md` | Click / Enter | Mở bộ chọn ngôn ngữ có chip cặp gần đây và cặp đã ghim | Panel bộ chọn mở dưới nút | Khi phiên chạy hoặc đang xử lý âm thanh cuối (`liveLanguagesLocked`): giữa hai nút là ổ khoá, tooltip "Dừng phiên để đổi ngôn ngữ" |
| 2 | Ô giữa cặp ngôn ngữ | Mũi tên tĩnh `aria-hidden`; khi khoá là `Button md · neutral · ghost` icon khoá, `disabled` | — | Không đảo chiều ở trang này (test "shows a direction arrow instead of a dead swap") | — | — |
| 3 | Nguồn âm thanh: Micro / Âm thanh hệ thống / Cả hai | `fieldset.segmented-control`, mỗi nút `sm · neutral · ghost`, `aria-pressed` | Click | Đổi `audioMode` (mặc định "Âm thanh hệ thống"); với hệ thống/cả hai, kiểm tra quyền Screen Recording ngay và mỗi lần cửa sổ được focus | Nút chọn có `aria-pressed="true"` | `disabled` khi phiên đang chạy |
| 4 | Trạng thái phiên | `LiveSessionStatus`: `StatusChip tone="danger"` + `Meter` | Tự động khi phiên chạy | Hiện nhãn pipeline (Đang nghe … / Đang thu âm… / Đang chuyển văn bản… / Đang dịch…) và thời gian chạy `mm:ss` | Spinner thay chấm khi đang nhận dạng/dịch; thanh đo mức âm vào cập nhật mỗi 100 ms | Ẩn khi không có phiên |
| 5 | Lịch sử phiên | `md · neutral · ghost`, icon đồng hồ, `aria-label="Hiện lịch sử phiên"`, `aria-haspopup="dialog"`, `aria-expanded` | Click | Mở hộp thoại "Phiên đã lưu" | Hộp thoại mở, focus vào nút đóng | Luôn bật |
| 6 | Cấu hình AI | `md · neutral · ghost` (khi mở: `primary · soft`), icon bánh răng, `aria-expanded`, `aria-haspopup="dialog"` | Click (bấm lại để đóng) | Mở popover "Cấu hình AI" neo dưới nút | Nút chuyển sang soft xanh | Luôn bật; khi phiên chạy, phạm vi đổi thành "Phiên đang chạy giữ nguyên mô hình đã dùng khi bắt đầu." |
| 7 | Phụ đề nổi | `md · neutral · outline` ↔ `md · primary · soft`, `aria-pressed`, icon phụ đề | Click | Bật/tắt cửa sổ phụ đề OS (`window.api.subtitle.show/hide`) | Nút đổi sang soft xanh; cửa sổ phụ đề hiện ở đáy màn hình | Luôn bật; đóng cửa sổ phụ đề từ chính nó cũng tắt nút (`subtitle.onClosed`) |
| 8 | Bắt đầu | `md · primary · solid`, icon micro | Click | Hệ thống/cả hai trên macOS chưa có quyền → mở hộp thoại quyền; còn lại → `handleStart`: khoá ngôn ngữ, mở `getDisplayMedia`/`getUserMedia`, bắt đầu thu | Nút đổi thành "Dừng"; chip trạng thái xuất hiện; vùng trống đổi câu thành "Đang nghe …" | `disabled` + `title` giải thích khi: thiếu khoá STT (`live_no_stt_key`), thiếu khoá dịch (`live_no_translate_key`), hoặc ngôn ngữ còn khoá do phiên trước đang xử lý (`language_pairs_locked`) |
| 9 | Dừng | `md · danger · outline`, icon vuông | Click | `stopSession({ flush: true })`: dừng thu, xử lý hết phần âm thanh còn lại, lưu phiên vào lịch sử | Nút trở lại "Bắt đầu" sau khi xử lý xong; ngôn ngữ mở khoá | — |
| 10 | Kiểu hiển thị: Song song / Tách riêng | `fieldset.segmented-control.live-view-toggle`, `sm · neutral · ghost`, `aria-pressed` | Click | Đổi bố cục; lưu vào `localStorage` khoá `viezan.live.viewMode` (mặc định Song song) | Bố cục đổi ngay, vùng cuộn bám lại cuối | Luôn bật |
| 11 | Huy hiệu STT | `span.ui-badge-xs` (Whisper / Gemini / Groq (free) / "Không có key") | — | Cho biết nhà cung cấp nhận dạng đang chạy | — | Chỉ hiện khi phiên chạy |
| 12 | Nhãn người nói | `SpeakerBadge` (nút gốc trong thành phần live) | Click | Thành ô nhập tên; Enter hoặc rời ô lưu, Esc huỷ | Tên mới áp cho mọi hàng của người đó, cả trong "Phiên này" và SRT | Ở bảng "Bản dịch" (Tách riêng) nhãn chỉ đọc |
| 13 | Xem mới nhất | `sm · neutral · outline`, `shape="pill"`, icon ⌄ | Click | Cuộn xuống cuối và bật lại chế độ bám cuối | Nút biến mất | Chỉ hiện khi người đọc cuộn lên cách đáy > 48 px (`LIVE_FOLLOW_LATEST_THRESHOLD_PX`) |
| 14 | Sao chép nguyên bản | `xs · neutral · ghost` icon (sau khi chép: `primary`, icon ✓ trong 1,5 s), `aria-label="Sao chép nguyên bản"` | Click | Chép `rawTranscript` | Icon ✓ 1,5 s (`COPY_FEEDBACK_DURATION_MS`) | `disabled` khi chưa có bản ghi |
| 15 | Xóa | `xs · danger · soft`, icon thùng rác | Click | `handleClear`: xoá bản ghi, bản dịch, tóm tắt, người nói trên màn hình (phiên đã lưu trong lịch sử vẫn còn) | Bảng trở về trạng thái trống | `disabled` khi chưa có bản ghi. Không có xác nhận |
| 16 | TXT (chân bảng) | `xs · neutral · ghost`, icon tải về, `title="Xuất .txt"` | Click | Tải `meeting-<ngày giờ>.txt` gồm gốc, dịch, tóm tắt, việc, quyết định | Trình duyệt tải file | `disabled` khi chưa có bản ghi; ẩn ở vùng nội dung ≥ 1100 px khi "Phiên này" hiện |
| 17 | SRT (chân bảng) | `xs · neutral · ghost` | Click | Tải `meeting-<ngày giờ>.srt`, mỗi đoạn một khối có `[Tên người nói]` | Tải file | `disabled` khi chưa có đoạn; ẩn như #16 |
| 18 | Số từ | Chữ `text-xs`, số dạng bảng | — | `1.234 từ` | — | Ẩn khi 0 |
| 19 | Sao chép bản dịch | `xs · neutral · ghost` icon, `aria-label="Sao chép bản dịch"` | Click | Chép `translation` | Icon ✓ 1,5 s | `disabled` khi chưa có bản dịch |
| 20 | Tổng hợp nội dung (chân bảng) | `xs · primary · solid`, icon bóng đèn | Click | Mở hộp thoại Tóm tắt và tự chạy tóm tắt nếu chưa có | Hộp thoại mở với spinner "Đang tổng hợp…" | Chỉ hiện khi `showSummaryBtn` (đã có bản ghi sau khi dừng hoặc khi mở phiên cũ) |
| 21 | Phiên này › Tổng hợp nội dung / Mở tóm tắt | `sm · primary · soft` (chưa có tóm tắt) / `sm · primary · outline` (đã có) | Click | Như #20 | Như #20; trong thẻ hiện "Đang tổng hợp…" `role="status"` | `disabled` khi chưa thể tóm tắt hoặc đang tóm tắt |
| 22 | Phiên này › TXT / SRT | `sm · neutral · outline` | Click | Như #16/#17 | Tải file | Như #16/#17 |
| 23 | Các phiên trước (n) | `sm · neutral · ghost` | Click | Mở hộp thoại "Phiên đã lưu" | Như #5 | Luôn bật |
| 24 | Popover › Mô hình | `AIModelPickerField` (`AIModelField`) | Click | Mở danh sách model ngay trong popover (không lồng menu) | Danh sách có ô tìm | Phiên đang chạy giữ model đã chọn lúc bắt đầu |
| 25 | Popover › Phụ đề (công tắc) | `ToggleSwitch` có `aria-labelledby`/`aria-describedby` | Click / Space | Cùng trạng thái với #7 | Phần tuỳ chỉnh hình thức hiện/ẩn ngay dưới | — |
| 26 | Popover › Màu chữ (6 ô) | `sm · neutral · ghost` icon (chọn: `primary · soft`), `aria-pressed`, `aria-label` = tên màu | Click | Đổi `subtitleSettings.textColor` | Cửa sổ phụ đề đổi màu ngay | Chỉ hiện khi phụ đề bật |
| 27 | Popover › Kích cỡ chữ S/M/L/XL/2X | `sm · neutral · ghost`, `shape="pill"` (chọn: `primary · soft`), `aria-pressed` | Click | Cỡ 14/18/22/28/34 px; giá trị hiện cạnh nhãn | Phụ đề đổi cỡ | Như #26 |
| 28 | Popover › Độ mờ nền | `input type="range"` 0–100, bước 5 | Kéo / mũi tên | Đổi `bgOpacity`; nhãn "Trong suốt … Đục" | Giá trị `%` cập nhật | Như #26 |
| 29 | Popover › Đặt lại mặc định | `sm · neutral · ghost` | Click | Về `DEFAULT_SUBTITLE_SETTINGS` (trắng, 18 px, 84 %) | Các ô chọn đổi về mặc định | Như #26 |
| 30 | Popover › Đóng | Nút ✕ trong header popover, `aria-label="Đóng cài đặt"` | Click / Esc / bấm ra ngoài | Đóng popover, focus về nút bánh răng | — | — |
| 31 | Hộp thoại Tóm tắt › tab Tóm tắt / Việc cần làm / Quyết định | `md · neutral · ghost` (đang chọn: `primary · soft`) | Click | Đổi tab | Nội dung tab đổi | — |
| 32 | Hộp thoại Tóm tắt › Sao chép | `sm · neutral · outline` (sau khi chép: `primary · soft`, "Đã sao chép!") | Click | Chép nội dung tab | Nhãn đổi 1,5 s | Chỉ hiện khi tab có nội dung và không đang chạy |
| 33 | Hộp thoại Tóm tắt › Tổng hợp nội dung / Tạo lại; Trích xuất việc cần làm / Trích xuất lại; Trích xuất quyết định / Trích xuất lại | `sm · primary · solid` | Click | Gọi AI cho tab đang mở | Spinner + "Đang …" ở thân tab | Ẩn khi tab đang chạy |
| 34 | Quyền Screen Recording › Đóng | `sm · neutral · outline` | Click / Esc / bấm nền | Đóng hộp thoại, không bắt đầu | — | — |
| 35 | Quyền Screen Recording › Mở System Settings | `sm · primary · solid`, icon bánh răng | Click | Mở `MACOS_SCREEN_RECORDING_PREFS` qua `window.api.openExternal`, đóng hộp thoại | Cài đặt macOS mở | — |
| 36 | Phiên đã lưu › hàng phiên | Nút gốc `.history-panel-reopen` (ngoại lệ có ghi chú trong mã) | Click / Enter | `setViewingLiveSession(id)`, đóng hộp thoại, nạp lại bản ghi, bản dịch, tóm tắt, người nói tại chỗ | Hàng đang xem có `aria-current` | — |
| 37 | Phiên đã lưu › Xóa (từng hàng) | `xs · danger · ghost` icon, `aria-label="Xóa: <tiêu đề>"` | Click | Xoá phiên khỏi lịch sử | Hàng biến mất | Không có xác nhận |
| 38 | Phiên đã lưu › Tìm trong lịch sử | `FilterInput size="sm"` | Gõ | Lọc theo bản ghi, bản dịch, tóm tắt, việc, quyết định, provider, model | Danh sách lọc; không có kết quả → "Không tìm thấy kết quả" | Chỉ hiện khi > 4 phiên |
| 39 | Phiên đã lưu › Xoá phiên đã lưu | `sm · danger · outline`, `shape="pill"`, `aria-haspopup="dialog"` | Click | Mở hộp thoại xác nhận | — | Ẩn khi chưa có phiên |
| 40 | Xác nhận xoá › Hủy / Xoá phiên đã lưu | `md · neutral · outline` / `md · danger · solid` | Click | Huỷ hoặc xoá toàn bộ | Danh sách trống | — |
| 41 | Toast thiếu khoá › Mở Cài đặt | Hành động trong toast | Click | `openSettings()` | Cài đặt mở | Toast đóng được; hiện lại nếu khoá bị gỡ lần nữa |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống | Chưa có bản ghi, chưa chạy | `EmptyPanelState` trong bảng: icon theo nguồn (micro / màn hình / lớp), mô tả theo nguồn (`live_empty_desc` / `live_empty_system_desc` / `live_empty_both_desc`) và nút "Bắt đầu" trong thân. Không có chân bảng, không có "Phiên này". Tách riêng: bảng phải hiện "Bản dịch sẽ hiển thị ở đây…" | Bắt đầu (header và trong thân), đổi nguồn, đổi ngôn ngữ, Cấu hình AI, Phụ đề nổi, Lịch sử |
| Đang nghe (chưa có câu) | Phiên chạy, chưa nhận được đoạn nào | Thân trống đổi thành "Đang nghe microphone/âm thanh hệ thống/…", nút trong thân ẩn; con trỏ nhấp nháy; chip đỏ "Đang nghe … 00:03" + thanh mức âm | Dừng, Phụ đề nổi, Cấu hình AI |
| Đang thu một câu | `pendingText` có nội dung | Hàng cuối mờ 50 %: nhãn người nói + chữ nghiêng + con trỏ; chip đổi thành "Đang thu âm…" | Như trên |
| Đang nhận dạng / đang dịch | `isTranscribing` / `isTranslating` | Chip có spinner, nhãn "Đang chuyển văn bản…" / "Đang dịch…"; Song song: dòng dịch của câu cuối hiện "Đang dịch…" nghiêng; Tách riêng: dòng spinner "Đang dịch…" cuối bảng Bản dịch | Như trên |
| Câu tạm | Đoạn ở trạng thái `pending` / `provisional` / `incomplete` | Dòng nghiêng `role="status"`: "Đang chờ đủ ý" / "Tạm dịch. Có thể thay đổi" / "Đoạn có thể chưa đủ ý" | — |
| Có dữ liệu (đang chạy) | Có đoạn | Hàng song ngữ cuộn và bám cuối; chân bảng có Sao chép, Xóa, TXT, SRT, số từ; "Phiên này" ở bên phải khi đủ rộng | Mọi hành động #10–#23 |
| Đã dừng, có bản ghi | Sau Dừng | Như trên, không có chip trạng thái; nút "Tổng hợp nội dung" xuất hiện ở chân bảng | Tóm tắt, xuất, sao chép, Xóa, Bắt đầu phiên mới |
| Xem phiên đã lưu | Mở từ Lịch sử / Trang chủ | Bản ghi, bản dịch, tóm tắt được nạp; nếu cặp ngôn ngữ hiện tại khác phiên: dòng "Phiên đã ghi: Tiếng Nhật → Tiếng Việt" dưới header | Như "Đã dừng"; Bắt đầu sẽ xoá màn hình và mở phiên mới |
| Đang tóm tắt / trích xuất | `isSummarizing` / `isExtracting…` | Trong hộp thoại: spinner lớn + "Đang tổng hợp…"/"Đang trích xuất…"; trong "Phiên này": dòng spinner `role="status"` | Đổi tab, đóng hộp thoại |
| Lỗi chặn khi bắt đầu / trong phiên | `micError` | Toast lỗi (`role="alert"`) tiêu đề "Lỗi phiên dịch trực tiếp", nội dung là lý do: không có quyền micro, không có quyền Screen Recording, không có âm thanh hệ thống ("Share audio" chưa bật), xử lý không theo kịp, mọi STT provider thất bại | Đóng toast; sửa nguyên nhân rồi Bắt đầu lại |
| Lỗi thoáng qua | `pipelineError` | Toast cảnh báo không đóng được, tự tắt sau 4 s (ví dụ "Nhận dạng thất bại. Đang thử lại", "Không dịch được một đoạn. Nội dung gốc đã được giữ lại.") | Phiên tiếp tục |
| Thiếu khoá / model | Không có khoá STT hoặc không có khoá dịch | Toast cảnh báo có nút "Mở Cài đặt"; nút Bắt đầu `disabled` với `title` nêu lý do | Mở Cài đặt; đóng toast |
| Không có quyền hệ thống | macOS, nguồn hệ thống/cả hai, `screenPermission !== 'granted'`, bấm Bắt đầu | Hộp thoại "Cần cấp quyền Screen Recording" + gợi ý bật "Share audio" | Đóng; Mở System Settings |
| Ngôn ngữ đang khoá | Vừa Dừng, đang xử lý âm thanh cuối | Ổ khoá giữa cặp ngôn ngữ; Bắt đầu `disabled`, tooltip "Dừng phiên dịch và chờ xử lý xong âm thanh cuối để đổi ngôn ngữ." | Chờ |
| Lịch sử trống | Chưa lưu phiên nào | Trong hộp thoại: "Các phiên bạn ghi sẽ hiện ở đây.", không có nút xoá | Đóng |
| Module tắt | `enabledModules.live === false` | Mục điều hướng, lệnh ⌘K và thẻ Trang chủ ẩn (xem foundations §12) | — |

## 6. Luồng tương tác chính

**A. Phiên dịch bằng micro**

1. Mở trang: bảng Bản ghi trống, nguồn mặc định "Âm thanh hệ thống". Người dùng bấm "Micro".
2. Bấm **Bắt đầu**. Trình duyệt hỏi quyền micro (lần đầu). Cặp ngôn ngữ khoá, nguồn âm thanh tắt, nút thành **Dừng** (đỏ viền), chip "Đang nghe microphone 00:00" và thanh mức âm hiện.
3. Người dùng nói. Hàng tạm mờ hiện chữ đang thu → chip "Đang chuyển văn bản…" → hàng song ngữ xuất hiện, chữ gốc gõ dần, bản dịch hiện sau một nhịp (typewriter trễ 55 ms).
4. Cuộn lên đọc lại → bám cuối tắt, nút **Xem mới nhất** hiện; bấm để quay về cuối.
5. Bấm **Dừng**: phần âm thanh còn lại được xử lý, phiên lưu vào lịch sử, ngôn ngữ mở khoá, nút "Tổng hợp nội dung" xuất hiện.

**B. Âm thanh hệ thống trên macOS chưa cấp quyền**

1. Chọn "Âm thanh hệ thống" (hoặc "Cả hai"); app kiểm tra quyền ngay.
2. Bấm **Bắt đầu** → hộp thoại "Cần cấp quyền Screen Recording" thay vì bắt đầu.
3. Bấm **Mở System Settings** → cài đặt macOS mở, hộp thoại đóng. Khi quay lại cửa sổ Viezan, quyền được kiểm tra lại (sự kiện `focus`).
4. Bấm **Bắt đầu** lần nữa → hộp thoại chia sẻ màn hình của hệ thống; nếu không bật "Share audio", toast lỗi "Không có âm thanh hệ thống…" và phiên không bắt đầu.

**C. Phụ đề nổi**

1. Bấm **Phụ đề nổi** (hoặc bật công tắc trong Cấu hình AI › Đầu ra) → cửa sổ 660 × 300 nổi ở giữa đáy màn hình.
2. Trong Cấu hình AI chỉnh màu, cỡ, độ mờ nền → cửa sổ phụ đề áp ngay (`subtitle.setStyle`).
3. Từ cửa sổ phụ đề, người dùng có thể Bắt đầu/Dừng, đổi model, nguồn, ngôn ngữ đích, hoặc bấm "Phiên mới" (lưu phiên hiện tại rồi xoá màn hình, `handleNewSession`).
4. Đóng cửa sổ phụ đề → nút Phụ đề nổi trên trang tự về trạng thái tắt.

**D. Tóm tắt sau phiên**

1. Sau khi dừng, bấm **Tổng hợp nội dung** (chân bảng hoặc thẻ "Phiên này").
2. Hộp thoại "Tóm tắt buổi dịch" mở ở tab Tóm tắt, tự chạy: spinner "Đang tổng hợp…" → nội dung Markdown.
3. Chuyển tab Việc cần làm → bấm **Trích xuất việc cần làm** → kết quả; tương tự Quyết định.
4. **Sao chép** nội dung tab; **Tạo lại**/**Trích xuất lại** để chạy lại. Đóng bằng ✕ hoặc Esc; thẻ "Phiên này" hiện đoạn trích 220 ký tự và nút đổi thành "Mở tóm tắt".

**E. Mở lại phiên cũ**

1. Bấm nút đồng hồ (hoặc "Các phiên trước (n)").
2. Hộp thoại "Phiên đã lưu" liệt kê phiên: bản ghi, bản dịch, model, cặp ngôn ngữ, số từ, thời gian tương đối; có ô tìm khi > 4 phiên.
3. Bấm một hàng → hộp thoại đóng, màn hình nạp lại phiên đó; nếu cặp hiện tại khác, dòng "Phiên đã ghi: …" xuất hiện.

## 7. Responsive

Ngưỡng tính theo container `app-main` (`@container app-main` trong `src/styles/ai-configuration.css`), trừ chỗ ghi khác.

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 1100 px | "Phiên này" hiện thành cột 280 px bên phải (khi đã có bản ghi hoặc tóm tắt); nút TXT/SRT ở chân bảng ẩn vì đã có trong "Phiên này" |
| 900–1099 px | "Phiên này" ẩn; xuất TXT/SRT và Tổng hợp nội dung nằm ở chân bảng. Tách riêng: hai cột chỉ khi **cửa sổ** ≥ 1024 px (`.app-panel-grid` trong `src/index.css`), nếu không thì hai bảng chồng dọc mỗi bảng `1fr` |
| 560–899 px | Thân `.live-panels-body` tự cuộn; Tách riêng thành một cột, mỗi bảng cao `--vzn-live-panel-min-block` (16rem) và tự cuộn; thanh công cụ bảng Song song xếp dọc (tiêu đề trên, nút đổi kiểu dưới); header xuống dòng: cặp ngôn ngữ + nguồn âm ở dòng 1, hành động ở dòng 2 |
| < 560 px | Header giảm lề trong còn `--vzn-space-4` (`.page-header` trong `src/styles/codex.css`); các vùng khác như 560–899 px |
| Cửa sổ ≤ 720 px rộng hoặc ≤ 600 px cao | Popover Cấu hình AI thành hộp thoại giữa cửa sổ, ngay dưới thanh tiêu đề |
| Cửa sổ < 900 px | Điều hướng chính thành rail 60 px (foundations §8) |

## 8. Bàn phím và trợ năng

- **Thứ tự Tab**: cặp ngôn ngữ (nguồn → đích) → Micro / Âm thanh hệ thống / Cả hai → Lịch sử → Cấu hình AI → Phụ đề nổi → Bắt đầu/Dừng → Song song / Tách riêng → nhãn người nói trong bản ghi → Xem mới nhất (khi hiện) → chân bảng → "Phiên này".
- **Nhóm nút**: nguồn âm thanh và kiểu hiển thị là `fieldset` có `aria-label` ("Nguồn âm thanh", "Kiểu hiển thị"), mỗi nút có `aria-pressed`. Nguồn âm có `title` mô tả đầy đủ (ví dụ "Âm thanh hệ thống + microphone (cần quyền Screen Recording trên macOS)").
- **Nút icon**: Lịch sử, Cấu hình AI, Sao chép nguyên bản/bản dịch, Xóa phiên trong lịch sử đều có `aria-label`. Lịch sử và Cấu hình AI có `aria-haspopup="dialog"` + `aria-expanded`. Phụ đề nổi có `aria-pressed`.
- **Trạng thái phiên**: thời gian chạy có tiền tố ẩn "Thời gian đã chạy:" (`sr-only`); `Meter` có nhãn "Mức âm thanh đầu vào".
- **Vùng live**: dòng trạng thái câu (`Đang chờ đủ ý`…) dùng `role="status"`; toast lỗi dùng `role="alert"` + `aria-live="assertive"`, toast cảnh báo `role="status"` + `aria-live="polite"` (`NotificationToast`). Vùng bản ghi chưa có `aria-live` (xem mục 10).
- **Lớp phủ**: popover Cấu hình AI (`role="dialog"`, `aria-labelledby`, `aria-describedby` = câu phạm vi) focus vào điều khiển đầu tiên khi mở, Esc hoặc bấm ra ngoài thì đóng và trả focus về nút bánh răng. `DialogShell` (Tóm tắt, Phiên đã lưu, xác nhận xoá) giữ focus bên trong, Esc đóng, trả focus về nút mở. Hộp thoại quyền Screen Recording đóng bằng Esc (bộ nghe trên `document`) nhưng không bẫy focus.
- **Đổi tên người nói**: Enter lưu, Esc huỷ, rời ô lưu.
- Không có phím tắt riêng cho trang.

## 9. Nội dung chữ (vi)

Nguồn: `src/i18n/locales/vi.ts`.

| Khoá | vi |
| --- | --- |
| `nav_live_translate` | Phiên dịch |
| `command_palette_live_description` | Phiên dịch giọng nói theo thời gian thực |
| `live_audio_source_label` | Nguồn âm thanh |
| `live_audio_mode_mic` / `_system` / `_both` | Micro / Âm thanh hệ thống / Cả hai |
| `live_start` / `live_stop` | Bắt đầu / Dừng |
| `live_status_listening_mic` / `_system` / `_both` | Đang nghe microphone / Đang nghe âm thanh hệ thống / Đang nghe microphone và âm thanh hệ thống |
| `voice_recording` / `voice_transcribing` / `live_status_translating` | Đang thu âm… / Đang chuyển văn bản… / Đang dịch… |
| `live_elapsed` / `live_input_level` | Thời gian đã chạy / Mức âm thanh đầu vào |
| `live_history_toggle_show` | Hiện lịch sử phiên |
| `ai_configuration_title` | Cấu hình AI |
| `ai_configuration_interpret_scope` | Áp dụng khi phiên thông dịch tiếp theo bắt đầu. |
| `ai_configuration_interpret_active_scope` | Phiên đang chạy giữ nguyên mô hình đã dùng khi bắt đầu. |
| `ai_configuration_translation_section` / `ai_configuration_output_section` | Dịch và phân tích / Đầu ra |
| `live_subtitles_floating` | Phụ đề nổi |
| `live_subtitles` / `live_subtitles_show_title` / `live_subtitles_hide_title` | Phụ đề / Hiện phụ đề nổi trên màn hình / Ẩn phụ đề nổi |
| `live_subtitle_text_color` / `live_subtitle_font_size` / `live_subtitle_bg_opacity` | Màu chữ / Kích cỡ chữ / Độ mờ nền |
| `live_subtitle_transparent` / `live_subtitle_opaque` / `live_subtitle_reset` | Trong suốt / Đục / Đặt lại mặc định |
| `live_view_mode_label` / `live_view_paired` / `live_view_split` | Kiểu hiển thị / Song song / Tách riêng |
| `live_panel_transcript` / `live_panel_original` / `live_panel_translation` | Bản ghi / Nguyên bản / Bản dịch |
| `live_jump_latest` | Xem mới nhất |
| `live_empty_desc` | Nhấn Bắt đầu, rồi nói vào microphone. Viezan sẽ nhận dạng và dịch từng câu. |
| `live_empty_system_desc` | Nhấn Bắt đầu, rồi phát âm thanh trên thiết bị. Viezan sẽ nhận dạng và dịch âm thanh hệ thống. |
| `live_sentence_pending` / `_provisional` / `_incomplete` | Đang chờ đủ ý / Tạm dịch. Có thể thay đổi / Đoạn có thể chưa đủ ý |
| `live_copy_original` / `live_copy_translation` | Sao chép nguyên bản / Sao chép bản dịch |
| `live_clear` / `live_words` | Xóa / từ |
| `live_export_txt` / `live_export_srt` | Xuất .txt / Xuất .srt |
| `live_summarize` / `live_summarize_again` / `live_summarizing` | Tổng hợp nội dung / Tạo lại / Đang tổng hợp… |
| `live_summary_title` | Tóm tắt buổi dịch |
| `live_post_tab_summary` / `_actions` / `_decisions` | Tóm tắt / Việc cần làm / Quyết định |
| `live_action_items_extract` / `live_decisions_extract` | Trích xuất việc cần làm / Trích xuất quyết định |
| `live_session_panel_title` | Phiên này |
| `live_session_summary_empty` | Chưa có tóm tắt. Tóm tắt khi đã có bản ghi. |
| `live_session_open_summary` | Mở tóm tắt |
| `live_session_speakers` / `live_session_speakers_empty` | Người nói / Người nói hiện khi bản ghi phân biệt được giọng. |
| `live_session_speaker_lines` | {n} câu |
| `live_session_export` / `live_session_previous` | Xuất / Các phiên trước ({n}) |
| `live_history_title` / `history_live_count` | Phiên đã lưu / {n} phiên |
| `live_history_empty` | Các phiên bạn ghi sẽ hiện ở đây. |
| `live_history_clear` / `live_history_clear_confirm` | Xoá phiên đã lưu / Thao tác này xoá toàn bộ phiên đã lưu, kể cả tóm tắt và ghi chú, và không thể hoàn tác. |
| `language_pairs_previous_session` | Phiên đã ghi |
| `language_pairs_locked` / `language_pairs_locked_short` | Dừng phiên dịch và chờ xử lý xong âm thanh cuối để đổi ngôn ngữ. / Dừng phiên để đổi ngôn ngữ |
| `live_no_stt_key` | Thêm API key nhận dạng giọng nói (OpenAI, Gemini hoặc Groq) trong Cài đặt. |
| `live_no_translate_key` | Chưa cấu hình API key để dịch. |
| `live_error_title` | Lỗi phiên dịch trực tiếp |
| `live_error_mic_denied` | Không có quyền truy cập microphone. |
| `live_error_screen_permission_denied` | Không có quyền Screen Recording. Bật trong System Settings → Privacy → Screen Recording. |
| `live_error_system_audio_unavailable` | Không có âm thanh hệ thống. Vui lòng bật "Share audio" trong hộp thoại chia sẻ màn hình, rồi thử lại. |
| `live_screen_permission_title` / `live_open_system_settings` | Cần cấp quyền Screen Recording / Mở System Settings |
| `live_speakers_rename_hint` | Click vào nhãn Speaker để đổi tên |

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ (`boards/Interpret.dc.html`, `Histories`, `Popovers`, `States`) so với mã:

1. **Tạm dừng phiên — đề xuất.** App chỉ có Bắt đầu và Dừng (`handleStart`, `handleStop` trong `useLiveTranslate.ts`); không có trạng thái tạm dừng giữ nguyên phiên.
2. **Thứ tự hành động header.** Bản vẽ: chip trạng thái ngay sau tiêu đề, Phụ đề nổi → Dừng → bánh răng ở cuối. Mã: trạng thái, Lịch sử, Cấu hình AI, Phụ đề nổi, rồi Bắt đầu/Dừng ở cuối. Đặc tả này theo mã; nút chính ở cuối hàng là đúng hợp đồng "một hành động chính".
3. **Thanh mức âm 5 vạch màu xanh lá** trong bản vẽ; mã dùng `Meter` một thanh `emphasis="action"`. Giữ mã.
4. **"Phiên này"**: bản vẽ có mục "Phụ đề nổi" với ô xem trước phụ đề và link "Đổi tên" cạnh từng người nói — **đề xuất**. Mã: đổi tên bằng cách bấm nhãn trong bản ghi; xem trước phụ đề không có (cả trong popover, `boards/Popovers.dc.html` có "[Xem trước phụ đề]"). Bản vẽ đặt TXT/SRT ở header thẻ; mã đặt trong `SectionCard` "Xuất".
5. **Màu người nói.** Bản vẽ tô màu theo người (xanh, cam). `src/components/live/speakerColors.ts` trả cùng một lớp xám Tailwind cho mọi người, và dùng màu Tailwind thay vì token — nợ thiết kế.
6. **Lịch sử phiên (Histories)**: bản vẽ có tên phiên, thời lượng, số người nói, "có tóm tắt"; mã hiện bản ghi/bản dịch, model, cặp, số từ, thời gian tương đối. Tên phiên và thời lượng — **đề xuất**.
7. **Sau phiên (Histories)**: bản vẽ có một trang kết quả gộp Tóm tắt + Quyết định + Việc cần làm (ô tích) + tỉ lệ người nói. Mã: hộp thoại ba tab, nội dung Markdown, không có ô tích, không có tỉ lệ người nói trong hộp thoại. `useLiveTranslate` có `speakerAnalysis`/"Phân tích người nói" (`live_analyze_speakers`) nhưng trang không hiển thị — **đề xuất** nối lại.
8. **Thiếu quyền (States)**: bản vẽ là `CapabilityNotice` trong trang, câu "macOS chỉ cho nghe âm thanh hệ thống khi Viezan có quyền này. Viezan không ghi hình." và nút phụ "Dùng micro thay thế" — **đề xuất**. Mã: hộp thoại tự dựng chỉ hiện khi bấm Bắt đầu, có Đóng và Mở System Settings. Thiếu quyền micro chỉ báo bằng toast, không có trạng thái riêng.
9. **Hộp thoại quyền Screen Recording không dùng `DialogShell`**: dựng tay với lớp Tailwind màu cứng (`bg-black/40`, `text-gray-800`…), không bẫy focus, không trả focus. Nên chuyển sang `DialogShell` + token.
10. **Nợ token khác**: thân hộp thoại Tóm tắt dùng `text-gray-400 dark:text-gray-600`; huy hiệu STT và hàng tạm dùng `style={{…}}` inline; `.live-bilingual-translation` khai báo `font-weight: 500` thay vì `--vzn-weight-medium` (`src/styles/ai-configuration.css`); màu phụ đề là hex trong `LiveTranslatePage.tsx` (dữ liệu gửi sang cửa sổ phụ đề, chấp nhận được nhưng nên ghi chú). Cửa sổ `public/subtitle.html` có bộ style riêng ngoài `tokens.css`.
11. **Nhãn nguồn âm thanh ở cửa sổ hẹp.** CSS ẩn `.live-header-leading .live-audio-source-group .ui-button span` khi < 900 px, nhưng nút chỉ chứa chữ (không có `span`, icon trong `audioModes` không được render), nên quy tắc không có tác dụng; nhóm nguồn giữ nhãn đầy đủ và làm header xuống dòng. Hoặc render icon + `span` nhãn, hoặc bỏ quy tắc.
12. **Vùng `aria-live` cho bản ghi** chưa có (foundations §11 yêu cầu `aria-live="polite"` cho kết quả bất đồng bộ). Cần cân nhắc chỉ đọc câu đã chốt để không đọc từng ký tự typewriter.
13. **Xóa bản ghi không có xác nhận và nằm trong canvas** (nút `danger · soft` ở chân bảng). Không vi phạm luật Chat (chỉ áp cho Chat) và không xoá phiên đã lưu, nhưng nên ghi rõ trong tooltip rằng lịch sử vẫn giữ.
14. **Xoá từng phiên trong lịch sử không có xác nhận** (chỉ "Xoá phiên đã lưu" có). Giữ theo mã; đề xuất toast Hoàn tác.
15. **Phím tắt** Bắt đầu/Dừng (ví dụ `⌘⏎`) — **đề xuất**.
16. **Thông báo lỗi khi từ chối quyền ở chế độ "Cả hai"**: mã chọn `live_error_screen_permission_denied` chỉ khi `audioMode === 'system'`, nên "Cả hai" bị từ chối Screen Recording vẫn báo "Không có quyền truy cập microphone." (xem `useLiveTranslate.ts`, khối `catch` của `handleStart`).
