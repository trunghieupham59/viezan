# Dịch (AI Translate)

> Bản vẽ gốc: `boards/Translate.dc.html`, `boards/TranslateModes.dc.html` (ảnh, giọng nói, so sánh theo câu), `boards/Popovers.dc.html` (Tuỳ chọn Dịch, chọn model so sánh), `boards/Histories.dc.html` (Lịch sử dịch), `boards/States.dc.html` (Dịch · đang tải), `boards/Narrow.dc.html` · Board chi tiết: `specs/translate.html` · Mã nguồn: `src/pages/TranslatePage.tsx`

Luật chung (token, Button, bề mặt, responsive, trạng thái chung) nằm ở [`../foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của trang Dịch. Mọi khẳng định đều dẫn về mã; điều mã chưa có được ghi "đề xuất" trong mục 10.

## 1. Mục đích

Trang Dịch là bàn làm việc song ngữ: người dùng gõ, dán, kéo ảnh hoặc đọc vào ô **Nguồn**, chọn cặp ngôn ngữ ở header và nhận bản dịch ở ô **Kết quả**, bằng một model AI hoặc so sánh tối đa 3 model cạnh nhau (`MAX_TRANSLATION_MODELS = 3`, `src/constants/providers.ts`). Người dùng đến đây khi cần một bản dịch có kiểm soát hơn Dịch nhanh: chọn phong cách, mức suy luận, cách đọc (furigana/phiên âm), so model, ghép bản dịch theo từng câu và mở lại bản dịch cũ. Thành công là: bản dịch hiện ra (tự động sau khi ngừng gõ hoặc khi bấm Dịch), có thể sao chép/đọc to/viết lại/dùng làm nguồn, và được lưu vào Lịch sử.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng, bảng lệnh | Mục "Dịch" (nhóm NGÔN NGỮ) | Mở trang Dịch và **giữ** nguồn, bản dịch đang có. Chỉ thẻ "Dịch" ở Bắt đầu nhanh của Trang chủ mới xoá bản nháp (`navigateEffect: 'clearTranslation'`, `src/modules/catalog.ts`). |
| Bảng lệnh ⌘K | Lệnh "Dịch" | Cũng xoá bản nháp như trên (`CommandPalette.tsx`). |
| Bảng lệnh ⌘K | Gõ `t <văn bản>` | Hàng "Dịch" mở trang với `<văn bản>` làm nguồn (`paletteQuery.ts`, `openTranslate` trong `CommandPalette.tsx`). |
| Trang chủ | Bấm một bản dịch gần đây | `reuseTranslationHistory` + `setActivePage('translate')` (`src/pages/HomePage.tsx`). Mở lại cả bộ so sánh nếu mục có nhiều model. |
| Từ điển | Hành động "dịch" mục đang xem | `reuseInTranslate` đặt cặp ngôn ngữ của mục, đưa từ vào nguồn (`src/hooks/useDictionaryLookup.ts`). |
| Phím tắt | Không có phím tắt riêng mở trang này | Phím tắt toàn cục của module Dịch dùng cho Dịch mọi nơi (`HotkeySection.tsx`). |
| Module tắt | Cài đặt › Module tắt "Dịch" | Mục điều hướng và lệnh ẩn (xem `foundations.md` §12). |
| Ra | Mở Cài đặt từ toast lỗi, từ bộ chọn model ("Mở Cài đặt" ở nhà cung cấp chưa có khoá) | `openSettings` |

## 3. Bố cục

Bề rộng mặc định 1200 px (vùng nội dung ≈ 964 px khi điều hướng mở 236 px). Trang toàn khung: header sát mép, thân trên canvas `--vzn-bg`.

```
┌ PageHeader .translate-page-header (min 56 px, --vzn-surface) ────────────────────────────────┐
│ Dịch  [Tự nhận diện ▾] [⇄] [Tiếng Việt ▾]  [Văn bản|Ảnh|Giọng nói]          [🕘] [⚙]        │
├─ .translate-workspace (max --vzn-translate-workspace-max = 1440, padding --vzn-space-6) ─────┤
│ .translate-stage (flex, gap --vzn-panel-gap)                                                 │
│ ┌ .translate-workbench-single (grid 1fr 1fr, gap --vzn-space-4) ──────┐ ┌ history-panel ───┐ │
│ │┌ TranslationSourcePane ────────┐┌ TranslationResultPane ──────────┐│ │ Lịch sử · 12 mục │ │
│ ││ Nguồn                    48px ││ Kết quả        [▤ So sánh model]││ │ [Tìm…]           │ │
│ │├───────────────────────────────┤├─────────────────────────────────┤│ │ ▸ nguồn          │ │
│ ││ textarea (font-reading,       ││ MarkdownText / FuriganaText     ││ │   bản dịch       │ │
│ ││ --vzn-font-size-title)        ││ (font-reading)                  ││ │   model·cặp·giờ 🗑│ │
│ ││                               ││                                 ││ │ …                │ │
│ │├───────────────────────────────┤├─────────────────────────────────┤│ ├──────────────────┤ │
│ ││ [🎤][🖼][🗑][✎][🔊]  120 ký tự · ││ [←][⧉][✎][🔊]           86 ký tự││ │ [🗑 Xoá lịch sử] │ │
│ ││ Phong cách: … · Enter… [Dịch] ││                                 ││ └──────────────────┘ │
│ │└───────────────────────────────┘└─────────────────────────────────┘│   288 px            │
│ └─────────────────────────────────────────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Chế độ so sánh (`layout="comparison"`, khi chọn ≥ 2 model): nguồn thành dải trên cùng (cao tối đa `--vzn-translate-compare-source-max-block` = 24rem, có thể thu gọn thành một dòng), kết quả chiếm toàn bộ phần dưới, mỗi model một cột.

```
┌ Nguồn (dải, ▾ thu gọn được) ─────────────────────────────────────────────────────────────────┐
│ ▸ [đoạn nguồn một dòng…]                                       240 ký tự  [Dịch · 3 mô hình] │
├ .translate-comparison-toolbar ───────────────────────────────────────────────────────────────┤
│ 3/3 đã hoàn tất                          [Theo cột|Theo câu]  [Tô khác biệt]                 │
├ .translate-comparison-list (một cột / model) ────────────────────────────────────────────────┤
│ ┌ Claude · 1,4 giây [✓ Đã chọn] ┐┌ GPT · 2,0 giây [Chọn bản này] ┐                            │
│ │ bản dịch, <mark>khác biệt</mark>││ bản dịch …                    │                          │
│ │ [⧉][🔊][↑]                     ││ [⧉][🔊][↑]                    │                          │
│ └───────────────────────────────┘└───────────────────────────────┘                          │
│ ┌ Gemini · Không thể kết nối tới Gemini…   [↻ Thử lại mô hình này] [×] ┐ (hàng lỗi gập)      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header | `PageHeader` + `LanguagePairBar scope="translate"` + `ButtonGroup` + `TranslationOptions` | `--vzn-page-header-min-height`; nút `sm` 32 px; cặp ngôn ngữ dùng `LanguagePairBar size="sm"` (32 px), cùng cỡ với các nút header; kiểu chung của header trang: hai nút có khung riêng (`--vzn-border-strong`, bo `--vzn-radius-sm`), ô giữa đứng tách giữa hai nút (giống Phiên dịch và Từ điển) | Không; từ 640 px vùng chứa giữ một hàng (cụm cặp ngôn ngữ co trước, nhãn cắt bằng dấu ba chấm); hẹp hơn thì xuống dòng (`flex-wrap`) |
| Khung làm việc | `TranslateWorkbenchTemplate` (`.translate-workspace`, `.translate-stage`) | max `--vzn-translate-workspace-max`, padding `--vzn-space-6` (24 px; < 560 px: `--vzn-space-3`, 12 px) | Không (≥ 900); cả trang cuộn (< 900) |
| Ô Nguồn | `TranslationSourcePane` | Thẻ `--vzn-surface`, viền `--vzn-border`, bo `--vzn-radius-md`; header `--vzn-control-height-xl` (48); footer `--vzn-control-height-lg` + `--vzn-space-1` | Textarea tự cuộn |
| Ô Kết quả | `TranslationResultPane` | Như ô Nguồn; chữ `--vzn-font-reading`, `--vzn-font-size-title` | Thân tự cuộn |
| Kết quả so sánh | `TranslationComparisonPane`, `TranslationSentenceGrid` | Cột `minmax(0,1fr)`; thân thẻ tối thiểu 8rem; nguồn câu `--vzn-translate-compare-sentence-source-inline` (30%); bản ghép tối đa `--vzn-translate-compare-assembly-max-block` | Từng thẻ cuộn; bảng câu cuộn, bản ghép đứng yên ở đáy |
| Lịch sử (cạnh) | `TranslationHistoryPanel variant="panel"` trong `.translate-history-region` | `--vzn-translate-history-width` (288 px); chỉ hiện khi vùng chứa ≥ 900 px | Danh sách cuộn |
| Lịch sử (phủ) | `DialogShell size="md"` + `TranslationHistoryPanel variant="overlay"` | Hộp thoại giữa, khi trang < 900 px (`TRANSLATE_HISTORY_INLINE_MIN_WIDTH`, `src/constants/ui.ts`) | Danh sách cuộn |
| Cấu hình AI | `AIConfigurationPopover` | `--vzn-ai-configuration-inline` (= `--vzn-popover-wide`, 420 px); neo vào nút ⚙ | Thân cuộn |
| Chọn model | `TranslationModelDialog` + `TranslationModelPicker` | Hộp thoại modal; < 760 px thành sheet đáy (`translate.css`) | Danh sách model cuộn, tiêu đề nhà cung cấp dính |
| Toast | `NotificationViewport` (khoá `translate-error`, `translate-voice-error`, `translate-image-model-switched`) | `--vzn-notification-max-inline`, góc trên phải | — |

## 4. Thành phần và hành động

Ký hiệu loại: `size · variant · appearance`. "Chọn" = trạng thái đang chọn/đang mở chuyển sang `primary · soft`.

### 4.1 Header

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Nửa nguồn "Tự nhận diện / Tiếng X ▾" | `md · neutral · ghost` (mở: `primary · soft`), `aria-haspopup="dialog"`, `aria-expanded` | Bấm, Enter/Space | Mở `OptionPickerPanel` (portal): ô tìm, chip cặp đã ghim + 3 cặp gần đây, danh sách `LANGUAGES` | Panel mở neo dưới nút, focus vào ô tìm; khi `auto` đang nhận diện hiện spinner + "Đang nhận diện ngôn ngữ…", nhận diện xong hiện tên ngôn ngữ + tag "Tự động" | Chỉ khoá ở Phiên dịch (`locked`); ở Dịch luôn bật |
| H2 | Nút hoán đổi ⇄ | `md · neutral · ghost` icon, `aria-label="Hoán đổi ngôn ngữ"` | Bấm | Đổi `source ↔ target`; nguồn `auto` dùng ngôn ngữ đã nhận diện. Không chuyển bản dịch sang ô nguồn (test "swaps languages without moving the translated result into the draft") | Nhãn hai nửa đổi chỗ; nếu tự động dịch bật thì dịch lại; nếu đang dịch thì khởi động lại với cặp mới | Native `disabled` trong `fieldset` có `tabIndex=0` + tooltip: "Chọn ngôn ngữ nguồn hoặc chờ nhận dạng nội dung hiện tại để đảo chiều." (nguồn `auto` chưa nhận diện) hoặc "Chọn ngôn ngữ nguồn và đích khác nhau để đảo chiều." |
| H3 | Nửa đích "Tiếng Y ▾" | Như H1 | Bấm | Panel `TARGET_LANGUAGES` (không có `auto`) | Như H1 | — |
| H4 | Chip cặp trong panel | chip `aria-pressed` (đang dùng) + nút ghim `aria-pressed` | Bấm chip / bấm ghim | Chọn cả cặp (giữ chiều đã dùng gần nhất) / ghim hoặc bỏ ghim, panel vẫn mở | Chip đang dùng tô chọn; ghim chuyển `primary` | — |
| H5 | Kiểu nhập "Văn bản · Ảnh · Giọng nói" | `ButtonGroup` `sm`, mỗi nút `primary · soft` khi chọn, `neutral · ghost` khi không, `aria-pressed` | Bấm | Đổi thứ ô Nguồn mời nhập. Rời "Ảnh" khi đã có ảnh sẽ **gỡ ảnh** (`handleInputModeChange`). Có ảnh thì luôn hiện "Ảnh" | Ô Nguồn đổi ngay (xem 4.2) | — |
| H6 | Lịch sử 🕘 | `sm · neutral · ghost` icon (mở: `primary · soft`), `aria-expanded`, nhãn "Hiện/Ẩn lịch sử dịch" | Bấm | ≥ 900 px: bật/tắt cột lịch sử và **lưu** lựa chọn (`translateHistoryCollapsed`). < 900 px: mở/đóng hộp thoại tạm, không ghi đè lựa chọn đã lưu | Cột trượt ra/vào; hoặc hộp thoại mở | — |
| H7 | Cấu hình AI ⚙ | `sm · neutral · ghost` icon (mở: `primary · soft`), `aria-haspopup="dialog"`, `aria-expanded`, `aria-label="Cấu hình AI, N mô hình"`, `title` kèm tóm tắt tuỳ chọn khác mặc định | Bấm | Mở `AIConfigurationPopover` (đóng hộp thoại model nếu đang mở) | Popover neo nút; Esc/đóng trả focus về ⚙ | — |

### 4.2 Ô Nguồn

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Ô nhập văn bản | `textarea` có nhãn ẩn "Nguồn"; placeholder "Nhập hoặc dán văn bản…" (Giọng nói: "Bấm micro bên dưới rồi nói…") | Gõ / dán | Huỷ lượt dịch đang chạy, cập nhật nguồn; xoá hết chữ thì xoá kết quả. Tự động dịch: chạy sau `autoTranslateDelay` (mặc định 800 ms; Cài đặt chọn 500/800/1500) | Kết quả cũ hiện mờ + băng "Nội dung đã thay đổi…" (xem §5) | — |
| S2 | `Enter` trong ô nhập | Phím | `Enter` (không Shift, không đang gõ IME) | Dịch ngay (cả khi tự động dịch bật) | Nút Dịch chuyển "Đang dịch…" | Bỏ qua khi trống hoặc đang dịch; `Shift+Enter` xuống dòng |
| S3 | Dán ảnh / kéo thả ảnh | Sự kiện `paste`, `drop` trên cả ô | ⌘V ảnh, thả file | Nén ảnh (`MAX_TRANSLATE_IMAGE_DIMENSION` 1500 px) rồi gắn; chuyển sang hiển thị ảnh | Khi kéo qua: `DragOverlay` "Kéo ảnh vào đây hoặc nhấn để chọn" | File không phải ảnh: lỗi "Vui lòng tải lên file ảnh (JPEG, PNG, WebP, GIF)" |
| S4 | Mic "Thu âm giọng nói" | `VoiceRecorder` `md`; nghỉ: `neutral · ghost` (có nhãn chữ khi ô trống); đang thu: `danger · soft` icon ■; đang xử lý: `primary · soft` spinner, `disabled` | Bấm (chỉ ở kiểu Giọng nói) | Thu → dừng → chuyển văn bản (STT trong Cài đặt) → chép vào ô nguồn | Trạng thái `role="status"`: "● Đang thu âm… 0:07" / "Đang chuẩn bị microphone…" / "Đang chuyển văn bản…" | Có ảnh thì ẩn |
| S5 | Huỷ thu âm × | `md · neutral · ghost` icon | Bấm khi đang thu/xử lý | Huỷ, không chép gì | Về trạng thái nghỉ | — |
| S6 | Thêm ảnh | `ImageTranslateButton` `md · neutral · ghost` (rect có nhãn khi trống, icon khi có chữ) | Bấm (kiểu Ảnh, chưa có ảnh) | Mở hộp chọn file `accept="image/jpeg,image/png,image/webp,image/gif"` | Hộp thoại hệ thống | — |
| S7 | "Chọn ảnh" trong trạng thái trống của kiểu Ảnh | `md · primary · soft` | Bấm | Như S6 | — | — |
| S8 | "Đổi ảnh" | `sm · neutral · outline` | Bấm | Chọn ảnh khác thay ảnh hiện tại | — | — |
| S9 | Gỡ ảnh × trên thumbnail | Nút của `ImagePreviewThumbnail` (hiện khi hover) | Bấm | Gỡ ảnh, huỷ lượt dịch, xoá kết quả | Ô về trạng thái trống kiểu Ảnh | — |
| S10 | Xoá 🗑 | `ClearButton` `md · danger · ghost` icon, "Xoá" | Bấm | Xoá nguồn, ảnh, kết quả, kết quả so sánh, lỗi, mục lịch sử đang đánh dấu | Ô trống; không hỏi xác nhận (đảo ngược bằng Lịch sử nếu đã dịch) | Ẩn khi ô trống hoặc đang thu âm |
| S11 | Viết lại ✎ (nguồn) | `RewriteButton` `md · neutral · ghost` icon | Bấm | Gửi nguồn cho model viết lại tự nhiên hơn, thay nội dung ô nguồn | Nhãn "Đang viết lại…" | Ẩn khi có ảnh, trống hoặc đang thu âm |
| S12 | Đọc to 🔊 (nguồn) | `SpeakButton` `md`; đang đọc: `danger · ghost` "Dừng đọc" | Bấm | TTS theo ngôn ngữ nguồn (nguồn `auto` dùng `DEFAULT_TTS_FALLBACK_LANG`) | Icon đổi ■ / spinner khi tải | Như S11 |
| S13 | Bộ đếm "N ký tự" | Chữ `--vzn-font-size-sm` | — | > 5000 ký tự (`TRANSLATE_INPUT_WARNING_CHARS`): thêm ⓘ "· Có thể dịch lâu hơn", title giải thích | — | Ẩn khi có ảnh hoặc đang thu |
| S14 | Tóm tắt "Phong cách: …" | Chữ muted | — | Chỉ hiện khi phong cách khác mặc định ("Chung") | — | — |
| S15 | Gợi ý "Enter để dịch" | Chữ muted, `aria-hidden` | — | Chỉ khi tự động dịch tắt; ẩn khi ô nguồn hẹp hơn 680 px. Nút Dịch luôn mang gợi ý này trong `title` | — | — |
| S16 | Dịch | `TranslateButton` `md · primary · solid`, `aria-busy`; so sánh: "Dịch · N mô hình" | Bấm / Enter | Chạy dịch (1 model hoặc N model song song) | Spinner + "Đang dịch…" / "Đang tạo N bản dịch…" | Chỉ hiện khi tự động dịch tắt (luôn tắt khi so sánh). Native `disabled` khi chưa có chữ/ảnh |
| S17 | Thu gọn / mở rộng nguồn (so sánh) | Tiêu đề "Nguồn" thành nút `md · neutral · ghost` có chevron, `aria-expanded` | Bấm | Nguồn gập thành một dòng (đoạn đầu, số ký tự, nút Dịch) / mở lại để sửa | Tự gập khi có kết quả thành công đầu tiên; lượt chạy mới gập lại | Chỉ có khi so sánh và đã có kết quả |

### 4.3 Ô Kết quả (một model)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | "So sánh model" | `sm · neutral · ghost` rect + icon lớp (nhãn ẩn < 760 px) | Bấm | Mở hộp thoại Mô hình dịch để thêm tối đa 2 model | Hộp thoại mở, focus ô tìm | Ẩn khi đang có ảnh |
| R2 | Dùng làm nội dung gốc ← | `md · neutral · ghost` icon | Bấm | Bản dịch thành nguồn, cặp ngôn ngữ đảo (đích → nguồn), kết quả xoá | Hai ô đổi nội dung | Ẩn khi có ảnh; footer chỉ hiện khi có kết quả, không đang dịch, không cũ, không lỗi |
| R3 | Sao chép ⧉ | `CopyButton` `md`; sau khi chép: `primary · soft` ✓ "Đã sao chép!" trong `COPY_FEEDBACK_DURATION_MS` | Bấm | Chép bản dịch (có cách đọc thì chép bản có cách đọc) | Icon ✓, vùng `aria-live` đọc "Đã sao chép!" | Ẩn với ảnh đã sửa |
| R4 | Viết lại ✎ | `RewriteButton` `md · neutral · ghost` | Bấm | Viết lại bản dịch; cách đọc chạy lại nếu đang bật | "Đang viết lại…" | Như R3 |
| R5 | Đọc to 🔊 | `SpeakButton` `md` | Bấm | TTS theo ngôn ngữ đích | ■ / spinner | Như R3 |
| R6 | Tải xuống ⤓ | `DownloadImageButton` `md · neutral · ghost` | Bấm | Tải ảnh đã sửa (Gemini) hoặc ảnh đã dịch theo vùng chữ | Hộp lưu file; lỗi: "Không thể tải ảnh xuống." | Chỉ với kết quả ảnh |
| R7 | Bộ đếm "N ký tự" (kết quả) | Chữ, tabular | — | Độ dài bản dịch | — | Trống với ảnh đã sửa |

### 4.4 Cấu hình AI (popover) và Mô hình dịch (hộp thoại)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Ô "Mô hình" (`AIModelField`) | Hàng chọn có icon nhà cung cấp; nhiều model hiện "N mô hình" | Bấm | Đóng popover, mở hộp thoại Mô hình dịch | — | — |
| P2 | Phong cách | `SelectField` 6 lựa chọn có mô tả: Thông thường, Trang trọng, Thân mật, Công sở, Kỹ thuật, Tự nhiên | Chọn | Lưu; tự động dịch thì dịch lại; đang dịch thì chạy lại | Tóm tắt "Phong cách: …" ở footer nguồn đổi | — |
| P3 | Cách đọc | `SelectField`: Không hiển thị · Kèm cách đọc · Chỉ phiên âm | Chọn | Chạy lượt phụ tạo cách đọc cho bản dịch hiện tại | Ô chọn `busy` khi đang tạo | `disabled` khi so sánh, gợi ý "Không có phiên âm khi so sánh nhiều mô hình" |
| P4 | Mức suy luận | `SelectField`: Tự động · Thấp · Trung bình · Cao | Chọn | Như P2 | — | `disabled` "Không thể tuỳ chỉnh" khi model không hỗ trợ |
| P5 | Dịch tự động | `AutoTranslateToggle` `md`; bật `primary · soft`, tắt `neutral · outline`, `aria-pressed`, nhãn cố định "Dịch tự động" | Bấm | Bật/tắt dịch tự động (lưu) | Nút Dịch ở footer nguồn ẩn/hiện | Native `disabled` khi so sánh, title "Chế độ so sánh chạy thủ công…"; lựa chọn đã lưu giữ nguyên |
| P6 | Đặt lại mặc định | `sm · neutral · ghost` ở footer | Bấm | Phong cách Thông thường, suy luận Tự động, cách đọc tắt | — | Chỉ hiện khi có tuỳ chọn khác mặc định |
| M1 | Ô tìm model | `Input md type="search"` | Gõ | Lọc theo tên model, id, tên nhà cung cấp | "Không tìm thấy model" | — |
| M2 | Hàng model (`ModelSelectionRow`) | Hàng chọn được, nhãn trạng thái "Chọn mô hình / Đã chọn / Cần API key / Đã đạt giới hạn lựa chọn" | Bấm | Thêm/bỏ khỏi bản nháp (chưa áp dụng) | Chip xuất hiện ở "Đã chọn N/3" | `disabled` khi nhà cung cấp thiếu khoá hoặc đã đủ 3 |
| M3 | Chip đã chọn × (`SelectedModelChip`) | Chip có nút bỏ, nhãn "Kết quả 1/2/3" | Bấm × | Bỏ khỏi bản nháp | Đủ 3: thông báo "Đã chọn đủ 3 mô hình. Hãy bỏ một mô hình để chọn mô hình khác." | — |
| M4 | Tải lại danh sách ↻ (mỗi nhà cung cấp) | `xs · neutral · ghost` icon | Bấm | Tải danh mục model trực tiếp | Spinner; lỗi "Tải thất bại" `role="alert"` | `disabled` khi đang tải |
| M5 | "Mở Cài đặt" (nhà cung cấp chưa có khoá) | `xs · neutral · ghost` pill | Bấm | Đóng hộp thoại, mở Cài đặt | — | — |
| M6 | Huỷ / × | `md · neutral · outline`; × `sm · neutral · ghost` | Bấm, Esc, bấm nền | Bỏ bản nháp | Focus về nút đã mở | — |
| M7 | "Áp dụng N mô hình" | `md · primary · solid` | Bấm | Ghi lựa chọn; ≥ 2 model chuyển sang so sánh (thủ công); kết quả cũ của đúng model được giữ | Bố cục đổi sang so sánh | Native `disabled` khi chưa chọn gì hoặc không đổi gì |

### 4.5 So sánh

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Tiến độ "N/M đã hoàn tất" / "So sánh M bản dịch" | Chữ, `role="status"` `aria-live` | — | — | Đếm khi từng model xong | — |
| C2 | "Theo cột · Theo câu" | Hai `xs` rect, chọn `primary · soft`, `aria-pressed`, trong `fieldset` | Bấm | Đổi cách xem; lưu (`translateComparisonView`) | Bảng câu thay cột | Chỉ hiện khi ≥ 2 model thành công; ẩn < 900 px |
| C3 | "Tô khác biệt" | `xs` bật/tắt, `aria-pressed` | Bấm | Đánh dấu đoạn khác nhau bằng `<mark>` (`--vzn-warning-soft`) | — | Thay bằng chữ "Các bản dịch giống nhau" khi mọi bản giống hệt |
| C4 | "Chọn bản này / Đã chọn" (mỗi cột) | `sm`; chưa chọn `neutral · outline`, đã chọn `primary · soft` ✓, `aria-pressed`; cột hẹp < 360 px rút thành "Chọn" | Bấm | Ghi bản được chọn vào **một** mục lịch sử của lượt so sánh này | Viền/nền cột chọn | `disabled` khi đang dịch hoặc kết quả cũ |
| C5 | Sao chép / Đọc to / Dùng làm nguồn ↑ (mỗi cột) | `sm` icon, `neutral · ghost` (chép xong `primary · soft`; đang đọc `danger`) | Bấm | Như R2–R5 cho model đó | — | "Dùng làm nguồn" `disabled` khi đang dịch hoặc cũ |
| C6 | Hàng lỗi: "Thử lại mô hình này" / "Đổi model" / "Mở Cài đặt" / Ẩn × | `xs` (thẻ lỗi trong cột: `sm`); thử lại & đổi model `neutral · ghost`; Mở Cài đặt `primary · soft` | Bấm | Chạy lại riêng model đó (nếu nguồn chưa đổi) / mở hộp thoại model / mở Cài đặt / ẩn hàng | Hàng `role="alert"` | Thử lại `disabled` khi nguồn trống hoặc đang chạy; ẩn với lỗi khoá/model không còn |
| C7 | Tab model (< 900 px) | `TranslationResultTab`, `role="tablist"`, ←/→/Home/End | Bấm / phím | Hiện một cột tại một thời điểm | Tab chọn tô | — |
| G1 | "Dùng câu này / Đang dùng" (mỗi ô câu) | `xs`, `aria-pressed` | Bấm | Chọn câu cho hàng đó trong bản ghép | Ô được tô | Cột lệch số câu: không có nút, ghi "N câu thay vì M; hiển thị nguyên khối…" |
| G2 | "Chọn bản này" ở đầu cột (bảng câu) | `xs`, `aria-pressed` | Bấm | Như C4 | — | Như C4 |
| G3 | Bản dịch ghép: Sao chép / "Chọn bản này" | `sm` icon `neutral · ghost`; `sm · neutral · outline` → `primary · soft` | Bấm | Chép / ghi bản ghép vào lịch sử dưới model đóng góp nhiều nhất | Tóm tắt "Ghép từ 2 mô hình, chủ yếu …" | Ẩn khi không cột nào khớp số câu |

### 4.6 Lịch sử

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | Ô lọc "Tìm trong lịch sử..." | `FilterInput sm` có nút xoá | Gõ | Lọc theo nguồn, bản dịch, nhà cung cấp, model (kể cả các model trong mục so sánh) | "Không tìm thấy kết quả" | Chỉ hiện khi > 4 mục |
| L2 | Hàng mục | `<button>` gốc (ngoại lệ có ghi chú: hàng nhiều dòng), `aria-current` cho mục đang mở | Bấm | Mở lại: nguồn, cặp ngôn ngữ, phong cách, model; mục so sánh khôi phục mọi bản và bản đã chọn. Đóng lớp phủ nếu đang ở chế độ hẹp | Hàng tô `data-active` | — |
| L3 | Xoá 🗑 (mỗi hàng) | `xs · danger · ghost` icon | Bấm | Xoá mục ngay | Hàng biến mất; toast "Đã xoá bản dịch" (khoá chủ `translate-history-deleted`) có nút Hoàn tác đưa mục về đúng vị trí cũ | — |
| L4 | "Xoá lịch sử dịch" | `sm · danger · outline` pill, `aria-haspopup="dialog"` | Bấm | Mở hộp xác nhận "Thao tác này xoá toàn bộ bản dịch đã lưu và không thể hoàn tác." | — | Ẩn khi trống |
| L5 | Xác nhận xoá / Huỷ | `md · danger · solid` / `md · neutral · outline` | Bấm | Xoá toàn bộ / đóng | — | — |
| L6 | Đóng lịch sử (lớp phủ) | Nút đóng của `DialogShell`, "Đóng lịch sử"; Esc; bấm nền | Bấm | Đóng lớp phủ | — | — |

### 4.7 Toast

| Khoá | Khi nào | Nội dung | Hành động |
| --- | --- | --- | --- |
| `translate-error` | `translateError` khác rỗng | Thông báo lỗi đã bản địa hoá + chi tiết "Nhà cung cấp · model" | "Thử lại" (`disabled` khi nguồn trống), "Chọn model khác", "Mở Cài đặt" (chỉ lỗi khoá); đóng toast xoá lỗi |
| `translate-voice-error` | Lỗi STT (trừ `CANCELLED`) | Tiêu đề "Không thể hoàn tất nhập liệu bằng giọng nói" + câu theo mã lỗi | "Mở Cài đặt" khi lỗi sửa được trong Cài đặt |
| `translate-image-model-switched` | Main báo đã đổi model/nhà cung cấp cho ảnh | "Đã chuyển model" · "Đang dùng {model} (nhà cung cấp). … không hỗ trợ nhận ảnh làm đầu vào." | Đóng |

Toast của trang tự đóng khi rời trang (`TranslatePage.tsx`).

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống (tự động) | Chưa có nguồn, dịch tự động bật | Nguồn: placeholder. Kết quả: "Bản dịch sẽ xuất hiện sau khi bạn ngừng nhập." Footer kết quả trống | Gõ, dán, đổi kiểu nhập, ngôn ngữ, lịch sử |
| Trống (thủ công) | Dịch tự động tắt | Kết quả: "Bản dịch sẽ xuất hiện ở đây sau khi bạn chọn Dịch." Nút Dịch `disabled` | Như trên |
| Trống kiểu Ảnh | Kiểu Ảnh, chưa có ảnh | `EmptyPanelState`: icon ảnh, "Kéo ảnh vào đây", "hoặc dán bằng ⌘V. JPEG, PNG, WebP hoặc GIF.", nút "Chọn ảnh" | Chọn/dán/thả ảnh |
| Trống kiểu Giọng nói | Kiểu Giọng nói | Placeholder "Bấm micro bên dưới rồi nói…", mic có nhãn "Thu âm giọng nói" | Thu âm hoặc gõ |
| Đang dịch (chưa có kết quả) | Lượt đầu | Kết quả: spinner + "Đang dịch…" + 3 dòng skeleton; `aria-busy` | Sửa nguồn (huỷ lượt cũ), đổi ngôn ngữ (chạy lại) |
| Đang dịch (đã có kết quả) | Lượt sau | Kết quả cũ mờ (`.translate-result-pending`) + băng spinner "Đang dịch…"; nút hành động ẩn | Như trên |
| Kết quả cũ | Nguồn, cặp, model, phong cách hoặc suy luận đổi so với lần dịch | Băng ⓘ "Nội dung đã thay đổi. Bản dịch sẽ tự cập nhật." (tự động) hoặc "…Hãy dịch lại để cập nhật kết quả." (thủ công); kết quả mờ, nút hành động ẩn | Dịch lại |
| Có dữ liệu | Dịch xong | Bản dịch (Markdown; có cách đọc thì Furigana/Markdown), footer đủ hành động, vùng live "Bản dịch đã sẵn sàng" | Mọi hành động R1–R7 |
| Đang nhận diện ngôn ngữ | Sau khi dịch xong với nguồn `auto` | Nửa nguồn: spinner + "Đang nhận diện ngôn ngữ…", rồi "Tiếng X · Tự động" | Hoán đổi bật sau khi nhận diện |
| Đang thu âm / xử lý | Kiểu Giọng nói | Footer nguồn: "● Đang thu âm… 0:07" + × + ■; rồi spinner "Đang chuyển văn bản…"; textarea `aria-busy`; dịch tự động tạm dừng | Dừng, huỷ |
| Ảnh đã gắn | Có ảnh | Thumbnail + tên file + "Đổi ảnh"; tự động dịch sau `IMAGE_AUTO_TRANSLATE_DELAY_MS` (300 ms); bộ đếm ẩn | Đổi/gỡ ảnh, Dịch |
| Kết quả ảnh | Ảnh dịch xong | Gemini sửa ảnh: ảnh đã dịch + Tải xuống. Model khác: văn bản ghép từ các vùng chữ + Tải xuống ảnh có chữ dịch | Tải xuống; sao chép/đọc/viết lại chỉ với dạng văn bản |
| So sánh chưa chạy | ≥ 2 model, chưa bấm Dịch | "So sánh N bản dịch"; mỗi cột "Chọn Dịch để chạy mô hình này." | Dịch · N mô hình |
| So sánh đang chạy | Sau Dịch | Mỗi cột: trạng thái "Đang chạy" + skeleton; tiến độ "1/3 đã hoàn tất" | Sửa nguồn |
| So sánh xong | ≥ 1 thành công | Cột có thời gian "1,4 giây", nút chọn; nguồn tự gập | C2–C5 |
| So sánh lỗi một phần | Một model lỗi | ≥ 900 px: cột lỗi ẩn, thay bằng hàng lỗi gập dưới danh sách. < 900 px: thẻ lỗi trong tab | C6 |
| Lỗi chung | Lỗi nhà cung cấp, mạng, phản hồi rỗng, bị chặn… | Toast `translate-error` (mục 4.7), ô kết quả trở về trống hoặc giữ kết quả cũ, footer kết quả ẩn hành động | Thử lại, Chọn model khác |
| Thiếu khoá / model | Nhà cung cấp chưa có API key | Toast "Chưa có API key. Vào Cài đặt để thêm." + "Mở Cài đặt". Trong hộp thoại model: nhóm nhà cung cấp ghi "Chưa có key", hàng model `disabled` "Cần API key". So sánh: cột lỗi "Thêm API key cho X trước khi thử lại." | Mở Cài đặt, Chọn model khác |
| Ảnh không đọc được | Không có chữ / lỗi xử lý | Toast "Không tìm thấy văn bản trong ảnh" hoặc "Không thể xử lý ảnh" | Thử lại, đổi ảnh |
| Ảnh: đổi nhà cung cấp dự phòng | Bật Cài đặt › "Dự phòng khi dịch ảnh" (`imageProviderFallback`, mặc định tắt) và nhà cung cấp chọn không đọc được ảnh | Kết quả bình thường + toast cảnh báo "Đã chuyển model" | Đóng toast. Tắt cài đặt thì ảnh chỉ gửi tới nhà cung cấp đã chọn và lỗi hiện như "Lỗi chung" |
| Văn bản dài | > 5000 ký tự | Bộ đếm ⓘ "· Có thể dịch lâu hơn"; vẫn gửi toàn bộ (không có giới hạn cứng) | Dịch |
| Lịch sử trống / lọc trống | Chưa có mục / không khớp | "Các bản dịch bạn chạy sẽ hiện ở đây." / "Không tìm thấy kết quả" | — |
| Module tắt | Cài đặt › Module | Trang và lệnh ẩn (`foundations.md` §12) | Bật lại trong Cài đặt |

## 6. Luồng tương tác chính

### 6.1 Gõ và dịch tự động

1. Người dùng vào từ điều hướng: bản nháp cũ bị xoá, ô nguồn trống, kết quả "Bản dịch sẽ xuất hiện sau khi bạn ngừng nhập."
2. Gõ chữ: bộ đếm tăng; mỗi phím gõ huỷ hẹn giờ cũ.
3. Ngừng gõ `autoTranslateDelay` (mặc định 800 ms): bắt đầu dịch. Kết quả hiện spinner + skeleton "Đang dịch…".
4. Có kết quả: bản dịch hiện một lần (không stream), footer hiện ← ⧉ ✎ 🔊 và số ký tự; vùng live đọc "Bản dịch đã sẵn sàng". Nếu cách đọc đang bật, lượt phụ chạy tiếp và thay chữ bằng bản có cách đọc.
5. Nguồn `auto`: nhận diện ngôn ngữ chạy nền, nửa nguồn hiện "Tiếng Anh · Tự động".
6. Lịch sử: lượt tự động ghi/ cập nhật **một** mục nháp cho cùng đoạn đang gõ (`autoHistoryDraftRef`); mục mới hiện đầu danh sách và được đánh dấu đang mở.
7. Gõ tiếp: kết quả mờ + băng "Nội dung đã thay đổi. Bản dịch sẽ tự cập nhật.", quay về bước 3.

Chế độ thủ công: bước 3 thay bằng bấm "Dịch" hoặc `Enter`; băng cũ ghi "…Hãy dịch lại để cập nhật kết quả."

### 6.2 Hoán đổi ngôn ngữ

1. Cặp "Tự nhận diện → Tiếng Việt", chưa dịch: nút ⇄ `disabled`; Tab tới nhóm ⇄ đọc lý do "Chọn ngôn ngữ nguồn hoặc chờ nhận dạng…".
2. Dịch xong, nhận diện ra Tiếng Anh: ⇄ bật.
3. Bấm ⇄: cặp thành "Tiếng Việt → Tiếng Anh". Ô nguồn **giữ nguyên** văn bản; kết quả cũ thành "cũ" và dịch lại nếu tự động bật (đang dịch thì khởi động lại với cặp mới).
4. Muốn dịch ngược bản dịch: dùng "Dùng làm nội dung gốc" (←), không phải ⇄: bản dịch vào nguồn, cặp tự đảo, kết quả xoá.

### 6.3 Dịch một ảnh

1. Chọn "Ảnh" ở header: ô nguồn thành vùng thả "Kéo ảnh vào đây" + "Chọn ảnh"; footer có nút "Thêm ảnh".
2. Dán ⌘V, thả file hoặc chọn file: ảnh được nén (cạnh dài ≤ 1500 px) rồi hiện thumbnail + tên file + "Đổi ảnh". Nếu không phải ảnh: lỗi "Vui lòng tải lên file ảnh…".
3. Tự động dịch bật: sau 300 ms gửi ảnh (thủ công: bấm Dịch). Kết quả: spinner "Đang dịch…".
4. Gemini sửa ảnh trực tiếp: ô kết quả hiện ảnh đã dịch + ⤓. Nhà cung cấp khác: văn bản ghép từ các vùng chữ, có ⧉ ✎ 🔊 và ⤓ tải ảnh có chữ dịch.
5. Nếu dự phòng ảnh bật và nhà cung cấp phải đổi: toast cảnh báo "Đã chuyển model · Đang dùng …".
6. Không có chữ: toast "Không tìm thấy văn bản trong ảnh". Gỡ ảnh (× trên thumbnail, Xoá, hoặc đổi sang Văn bản/Giọng nói) xoá luôn kết quả.

### 6.4 Nhập bằng giọng nói

1. Chọn "Giọng nói": placeholder "Bấm micro bên dưới rồi nói…", mic có nhãn.
2. Bấm mic: "Đang chuẩn bị microphone…" rồi "● Đang thu âm… 0:00" đếm giây, nút ■ đỏ và ×. Dịch tự động tạm dừng.
3. Bấm ■: "Đang hoàn tất bản ghi…" → "Đang chuyển văn bản…" (spinner, mic `disabled`).
4. Bản chép hiện trong ô nguồn (một lần, sau khi xử lý xong); dịch tự động chạy sau độ trễ, hoặc bấm Dịch.
5. Lỗi (ví dụ quyền micro bị chặn): toast "Không thể hoàn tất nhập liệu bằng giọng nói" + câu theo mã lỗi + "Mở Cài đặt" khi phù hợp. × huỷ không tạo toast.

### 6.5 So sánh model

1. Bấm "So sánh model" ở ô kết quả (hoặc ⚙ › Mô hình): hộp thoại "Mô hình dịch", focus vào ô tìm.
2. Chọn thêm 1–2 model; chip "Kết quả 1/2/3" hiện ở "Đã chọn N/3". Nhà cung cấp chưa có khoá: hàng `disabled` "Cần API key" + "Mở Cài đặt". Đủ 3: các hàng còn lại `disabled`.
3. "Áp dụng N mô hình": bố cục đổi sang so sánh, nguồn thành dải trên. Bản dịch sẵn có của model cũ được giữ làm cột đầu. Dịch tự động tắt tạm (lưu lựa chọn), cách đọc khoá.
4. Bấm "Dịch · N mô hình": các cột chạy song song, tiến độ "1/3 đã hoàn tất".
5. Có kết quả: nguồn tự gập thành một dòng; cột có thời gian, "Chọn bản này", ⧉ 🔊 ↑. Bật "Tô khác biệt" để thấy chỗ khác.
6. Bấm "Chọn bản này": bản đó ghi vào **một** mục lịch sử của lượt so sánh (chọn lại cập nhật cùng mục).
7. "Theo câu": bảng mỗi hàng một câu nguồn, mỗi ô một model; "Dùng câu này" từng hàng; bản ghép ở đáy, "Chọn bản này" ghi bản ghép.
8. Model lỗi: hàng lỗi gập với "Thử lại mô hình này" (chỉ chạy lại model đó nếu nguồn chưa đổi) hoặc "Đổi model".
9. Quay về một model: mở hộp thoại, bỏ model thừa, Áp dụng.

### 6.6 Mở lại từ lịch sử

1. Bấm 🕘: ≥ 900 px cột lịch sử 288 px mở bên phải (lựa chọn được lưu); < 900 px hộp thoại "Lịch sử · N mục".
2. > 4 mục: gõ vào "Tìm trong lịch sử..." để lọc.
3. Bấm một hàng: nguồn, cặp, phong cách, model được khôi phục; kết quả hiện ngay như mới dịch (không gọi lại model). Mục so sánh khôi phục mọi cột và bản đã chọn. Hàng được đánh dấu `aria-current`; lớp phủ (nếu có) đóng.
4. Xoá một mục: 🗑 trên hàng (xoá ngay, toast có Hoàn tác). Xoá hết: "Xoá lịch sử dịch" → hộp xác nhận đỏ.

## 7. Responsive

Tính theo container `app-main` (`translate.css`, `language-pair-bar.css`).

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 900 px | Hai ô cạnh nhau, padding `--vzn-space-6`. Gợi ý "Enter để dịch" cạnh nút Dịch ẩn khi ô nguồn hẹp hơn 680 px. Lịch sử là cột cạnh khung làm việc |
| 760–899 px | Hai ô **xếp chồng** (nguồn trên, kết quả dưới, tối thiểu `--vzn-translate-source-min-block` / `--vzn-translate-result-min-block`), cả trang cuộn. Lịch sử thành hộp thoại tạm. So sánh: tab model thay cột, ẩn "Theo cột/Theo câu" và bảng câu, ẩn hàng lỗi (lỗi hiện trong tab); thẻ cột tối thiểu 16rem, thân tối đa 28rem tự cuộn |
| 640–759 px | Hộp thoại model thành sheet đáy; "So sánh model" chỉ còn icon; popover cấu hình trải hết bề rộng |
| 560–639 px | Cặp ngôn ngữ chiếm trọn một dòng (hai nửa chia đều), hành động header xuống dòng dưới, căn phải. Từ 640 px trở lên header giữ một hàng |
| < 560 px | Padding `--vzn-space-3` |
| ≤ 520 px | Footer ô xếp dọc; hàng nút nguồn xuống dòng; dòng gửi trải hết bề rộng |
| Cột so sánh < 360 px | Ẩn tên nhà cung cấp (giữ icon), nút chọn rút thành "Chọn" |
| Cửa sổ ≤ 720 × 600 | Popover cấu hình thành hộp thoại giữa cửa sổ (`foundations.md` §8) |

## 8. Bàn phím và trợ năng

- Thứ tự Tab: điều hướng → cặp ngôn ngữ (nửa nguồn → ⇄ hoặc nhóm ⇄ bị tắt → nửa đích) → Văn bản/Ảnh/Giọng nói → 🕘 → ⚙ → ô Nguồn (textarea) → nút footer nguồn → Dịch → "So sánh model" → nút footer kết quả → lịch sử (lọc → hàng → 🗑 → Xoá lịch sử).
- `Enter` dịch, `Shift+Enter` xuống dòng, bỏ qua khi đang gõ IME (`isComposing`). Gợi ý đọc cho trình đọc màn hình qua `aria-describedby`: "Nhấn Enter để dịch hoặc Shift+Enter để xuống dòng…" và bộ đếm ký tự.
- Vùng kết quả có `lang` theo ngôn ngữ đích; ô nguồn có `lang` theo ngôn ngữ nguồn, hoặc ngôn ngữ đã nhận diện khi đang Tự động (chưa nhận diện thì không đặt).
- Panel ngôn ngữ: mở focus vào ô tìm; ↓ vào danh sách; ↑/↓/Home/End di chuyển; Enter chọn; Esc đóng và trả focus về nửa đã mở (`OptionPickerPanel`). `role="dialog"` + `role="listbox"`/`option` `aria-selected`.
- Nút ⇄ bị tắt: nhóm `fieldset` có `tabIndex=0`, `aria-disabled`, `aria-describedby` trỏ tooltip lý do.
- Hộp thoại model: `role="dialog"` `aria-modal`, focus vào ô tìm, bẫy Tab (`trapTabFocus`), Esc/bấm nền huỷ, đóng trả focus về nút đã mở. Hàng model đang focus được cuộn tránh tiêu đề dính.
- Kết quả: `aria-busy` khi dịch; vùng `role="status"` `aria-live="polite"` đọc "Đang dịch…", "Đã sao chép!", "Bản dịch đã sẵn sàng", trạng thái cũ. So sánh: tiến độ `aria-live`; thẻ lỗi và hàng lỗi `role="alert"`; tab model `role="tablist"` với ←/→/Home/End.
- Nút bật/tắt dùng `aria-pressed` (kiểu nhập, dịch tự động, Theo cột/Theo câu, Tô khác biệt, Chọn bản này, Dùng câu này); nút mở lớp phủ dùng `aria-expanded` + `aria-haspopup`.
- Mọi nút chỉ có icon có `aria-label` gắn tên model khi ở so sánh ("Sao chép: Claude … · Anthropic").
- Giảm chuyển động: tắt hoạt ảnh popover, spinner băng trạng thái, chuyển mờ kết quả.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `nav_translate` | Dịch |
| `translate_from_label` / `translate_to_label` | Dịch từ / Dịch sang |
| `lang_auto` | Tự động nhận dạng |
| `translate_auto_indicator` | Tự động |
| `translate_detecting_language` | Đang nhận diện ngôn ngữ… |
| `translate_swap` | Hoán đổi ngôn ngữ |
| `translate_swap_disabled_auto` | Chọn ngôn ngữ nguồn hoặc chờ nhận dạng nội dung hiện tại để đảo chiều. |
| `language_pairs_same` | Chọn ngôn ngữ nguồn và đích khác nhau để đảo chiều. |
| `language_pairs_recent` / `language_pairs_pin` | Cặp gần đây / Ghim cặp |
| `translate_input_mode_label` | Kiểu nhập |
| `translate_input_mode_text` / `_image` / `_voice` | Văn bản / Ảnh / Giọng nói |
| `translate_history_toggle_show` / `_hide` | Hiện lịch sử dịch / Ẩn lịch sử dịch |
| `ai_configuration_title` | Cấu hình AI |
| `ai_configuration_translate_scope` | Áp dụng cho lượt dịch hiện tại. Lượt dịch mới kế thừa các tuỳ chọn này. |
| `translate_source_content_label` / `translate_result_content_label` | Nguồn / Kết quả |
| `translate_placeholder` | Nhập hoặc dán văn bản… |
| `translate_voice_hint` | Bấm micro bên dưới rồi nói. Lời nói hiện ở đây rồi được dịch. |
| `translate_image_drop_title` / `translate_image_drop_hint` | Kéo ảnh vào đây / hoặc dán bằng {shortcut}. JPEG, PNG, WebP hoặc GIF. |
| `translate_image_choose` / `translate_image_change` | Chọn ảnh / Đổi ảnh |
| `translate_add_image` | Thêm ảnh |
| `translate_char_count` | {count} ký tự |
| `translate_long_text_label` | Có thể dịch lâu hơn |
| `translate_manual_shortcut` | Enter để dịch |
| `translate_btn` / `translate_btn_loading` | Dịch / Đang dịch… |
| `translate_empty_auto_hint` | Bản dịch sẽ xuất hiện sau khi bạn ngừng nhập. |
| `translate_empty_manual_hint` | Bản dịch sẽ xuất hiện ở đây sau khi bạn chọn Dịch. |
| `translate_result_stale_auto` / `_manual` | Nội dung đã thay đổi. Bản dịch sẽ tự cập nhật. / Nội dung đã thay đổi. Hãy dịch lại để cập nhật kết quả. |
| `translate_result_ready` | Bản dịch đã sẵn sàng |
| `translate_copy` / `translate_copied` | Sao chép / Đã sao chép! |
| `translate_speak` / `translate_speak_stop` | Đọc to / Dừng đọc |
| `translate_rewrite` / `translate_rewriting` | Viết lại / Đang viết lại… |
| `translate_use_as_source` | Dùng làm nội dung gốc |
| `translate_clear` | Xoá |
| `translate_compare_models` | So sánh model |
| `translate_style_label` | Phong cách |
| `translate_phonetic` | Cách đọc |
| `translate_reasoning_label` | Mức suy luận |
| `translate_mode_auto` | Dịch tự động |
| `translate_settings_reset` | Đặt lại mặc định |
| `translate_models_title` / `translate_models_description` | Mô hình dịch / Chọn tối đa 3 mô hình. Thay đổi chỉ có hiệu lực sau khi bạn xác nhận. |
| `translate_models_manual_notice` | Chế độ so sánh chạy thủ công. Mỗi mô hình gửi một yêu cầu riêng tới nhà cung cấp. |
| `translate_models_apply` | Áp dụng {n} mô hình |
| `translate_compare_submit` / `_submitting` | Dịch · {n} mô hình / Đang tạo {n} bản dịch… |
| `translate_compare_progress` | {a}/{b} đã hoàn tất |
| `translate_compare_view_columns` / `_sentences` | Theo cột / Theo câu |
| `translate_compare_highlight` | Tô khác biệt |
| `translate_compare_pick` / `_picked` | Chọn bản này / Đã chọn |
| `translate_compare_sentence_use` / `_used` | Dùng câu này / Đang dùng |
| `translate_compare_assembly_label` | Bản dịch ghép |
| `translate_compare_retry` / `translate_compare_change_model` | Thử lại mô hình này / Đổi model |
| `translate_history_title` / `translate_history_empty` | Lịch sử / Các bản dịch bạn chạy sẽ hiện ở đây. |
| `history_search_placeholder` | Tìm trong lịch sử... |
| `translate_history_clear` / `translate_history_clear_confirm` | Xoá lịch sử dịch / Thao tác này xoá toàn bộ bản dịch đã lưu và không thể hoàn tác. |
| `translate_history_deleted` / `translate_history_deleted_undo` | Đã xoá bản dịch / Hoàn tác |
| `translate_error_no_key` | Chưa có API key. Vào Cài đặt để thêm. |
| `translate_error_retry` / `translate_error_choose_model` / `translate_error_open_settings` | Thử lại / Chọn model khác / Mở Cài đặt |
| `image_translate_no_text` | Không tìm thấy văn bản trong ảnh |
| `image_translate_type_error` | Vui lòng tải lên file ảnh (JPEG, PNG, WebP, GIF) |
| `image_model_switched_title` / `image_model_switched_message` | Đã chuyển model / Đang dùng {model} vì {previous} không đọc được ảnh. |
| `settings_image_provider_fallback` | Dự phòng khi dịch ảnh |
| `voice_recording` / `voice_transcribing` | Đang thu âm… / Đang chuyển văn bản… |
| `voice_transcription_error_title` | Không thể hoàn tất nhập liệu bằng giọng nói |

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ gốc đề xuất mà mã chưa có (tất cả là **đề xuất**):

1. **Kết quả stream và nút Dừng** (`States.dc.html` "Dịch · đang tải": phần bản dịch đã về hiện ngay, nút "Dừng"). Mã gọi `translationService.translate` và hiện bản dịch một lần (`useTranslate.ts`); không có nút huỷ lượt dịch, chỉ huỷ ngầm khi sửa nguồn/đổi ngôn ngữ. Đề xuất: stream + nút "Dừng" `sm · danger · ghost` trong băng "Đang dịch…".
2. **Nút Dán** trong header ô Nguồn (`Translate.dc.html`). Chưa có; chỉ dán bằng phím.
3. **Ngôn ngữ nhận diện ghi trong header ô Nguồn** ("Tiếng Anh (tự nhận diện)"). Mã chỉ hiện trên nửa nguồn của cặp ngôn ngữ.
4. **So sánh trong bố cục hai cột** (`Translate.dc.html` để nguồn bên trái, ứng viên xếp dọc bên phải, hành động chung ở footer). Mã chuyển nguồn thành dải trên cùng và mỗi model một cột có hành động riêng. Bản dựng hiện tại hợp lý hơn cho 3 model; giữ mã, cập nhật bản vẽ.
5. **"Chụp vùng màn hình"** và **bấm vào vùng chữ để dịch riêng đoạn đó** (`TranslateModes.dc.html`). Chưa có.
6. **Giọng nói chép theo thời gian thực, tên STT ("Whisper local") và nút "Dừng và dịch"** (`TranslateModes.dc.html`). Mã chép một lần sau khi dừng (`VoiceRecorder`), nút dừng là icon ■; dịch chạy theo chế độ tự động/thủ công.
7. **Lịch sử nhóm theo ngày ("Hôm nay", "Hôm qua")**, nhãn "ảnh" cho mục dịch ảnh (`Histories.dc.html`). Mã liệt kê phẳng với thời gian tương đối; bản dịch ảnh đã được lưu (cột nguồn là tên tệp) nhưng không có nhãn "ảnh".
8. **Giới hạn ký tự cứng**: không có; chỉ cảnh báo mềm ở 5000 ký tự. Bản vẽ không yêu cầu thêm.
