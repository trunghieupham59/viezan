# Từ điển

> Bản vẽ gốc: `boards/Dictionary.dc.html` (cùng `boards/Histories.dc.html`, `boards/States.dc.html`, `boards/Popovers.dc.html`) · Board chi tiết: `specs/dictionary.html` · Mã nguồn: `src/pages/DictionaryPage.tsx`

Luật chung (token, hợp đồng Button, bậc bề mặt, responsive, trạng thái chung) nằm ở [`foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của màn hình Từ điển.

## 1. Mục đích

Từ điển tra một từ hoặc cụm từ bằng AI theo cặp ngôn ngữ đang chọn, có thể kèm ngữ cảnh (câu chứa từ, lĩnh vực, sắc thái) để AI chọn nghĩa đúng. Người dùng đến đây khi gặp một từ lạ trong lúc đọc, dịch hoặc chat, hoặc gõ `d <từ>` trong bảng lệnh. Thành công là: gõ từ, bấm **Tra cứu** (hoặc Enter), thấy mục từ như một trang từ điển — từ chính, phiên âm, từ loại, nghĩa, các bản dịch dạng chip, sắc thái, ví dụ, ghi chú — rồi đánh dấu yêu thích, sao chép hoặc mang sang AI Dịch. Mỗi lượt tra được lưu vào "Gần đây" để mở lại không tốn lượt gọi AI.

Mã: trang `src/pages/DictionaryPage.tsx`, logic `src/hooks/useDictionaryLookup.ts`, dịch vụ `src/services/dictionaryService.ts`, template `src/components/templates/DictionaryWorkbenchTemplate.tsx`, organism `src/components/organisms/dictionary/*.tsx`, molecule `src/components/ui/molecules/DictionaryEntrySections.tsx`, CSS `src/styles/dictionary.css`.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng | Nhóm NGÔN NGỮ › mục "Từ điển" (`nav_dictionary`) | Module `dictionary` trong `src/modules/catalog.ts`, icon sách |
| Bảng lệnh ⌘K | Lệnh "Từ điển" · "Tra cứu từ và định nghĩa" | Từ khoá: dictionary, lookup, word, definition, meaning |
| Bảng lệnh ⌘K, tiền tố | Gõ `d <từ>` → hàng "Tra cứu “{text}”" | `src/utils/paletteQuery.ts`; mở trang và **tự tra** từ đó (`setPendingDictionaryTerm` → handoff trong `useDictionaryLookup.ts`) |
| Launcher | Lệnh "Tra từ điển" (`launcher_dictionary`), có thể kèm chữ đang gõ | `quickChat.openFeature({ feature: 'dictionary', text })`; có chữ thì tự tra (`src/App.tsx`) |
| Trang chủ | Thẻ bắt đầu nhanh "Từ điển"; hàng gần đây loại "Từ điển" | Trang mở trên mục mới nhất (`selectedEntryId` mặc định là `dictionaryEntries[0]`) |
| Phím tắt | Không có phím tắt riêng | |
| Ra | "Dùng trong AI Dịch" | Đặt cặp ngôn ngữ và văn bản nguồn của AI Dịch rồi chuyển sang trang Dịch (`reuseInTranslate`) |

## 3. Bố cục

Bố cục mặc định (vùng nội dung ≥ 760 px, có mục đang xem):

```
┌ PageHeader (.page-header.dictionary-page-header) ───────────────────────────────────────┐
│ Từ điển  [Tiếng Anh ▾ ⇄ Tiếng Việt ▾]                                              [⚙] │
├ .dictionary-workbench-content (grid 336 px | 1fr, gap 16, padding 16) ─────────────────┤
│ ┌ .dictionary-lookup-region (thẻ) ─┐ ┌ .dictionary-result-region (thẻ) ──────────────┐ │
│ │ Từ hoặc cụm từ                   │ │ serendipity  /ˌser.ənˈdɪp.ə.ti/  NOUN  …   ☆ ⧉ ↻│ │
│ │ [🔍 serendipity      11/120 ✕]   │ ├ .dictionary-result-body (tối đa 768 px) ──────┤ │
│ │ Ngữ cảnh (không bắt buộc)        │ │ NGHĨA                                          │ │
│ │ [câu ví dụ, lĩnh vực…        ]   │ │ │ Sự tình cờ may mắn…                          │ │
│ │                        42/500    │ │ BẢN DỊCH                                       │ │
│ │ [📖        Tra cứu            ]  │ │ (sự tình cờ) (duyên may) (vận may bất ngờ)     │ │
│ │ ──────────────────────────────── │ │ SẮC THÁI · SỰ TÌNH CỜ                          │ │
│ │ [ Gần đây 12 | Yêu thích 3 ]     │ │ …                                              │ │
│ │ [🔍 Tìm trong lịch sử...]        │ │ VÍ DỤ                                          │ │
│ │ ▌serendipity /…/       2 phút    │ │ 1 It was pure serendipity…                     │ │
│ │   Sự tình cờ may mắn…         ★  │ │   Đó hoàn toàn là tình cờ…                     │ │
│ │  ubiquitous /…/        1 giờ     │ │ GHI CHÚ                                        │ │
│ │ ──────────────────────────────── │ │ • …                                            │ │
│ │ (🗑 Xoá lịch sử)     (🗑 Xoá)    │ │                                                │ │
│ └──────────────────────────────────┘ └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header trang | `PageHeader` với `LanguagePairBar scope="dictionary"` ở vùng đầu, `DictionaryAIConfiguration` ở vùng hành động | `--vzn-page-header-min-height` (56), nền `--vzn-surface` | Không |
| Khung làm việc | `.dictionary-workbench` (container `dictionary-workbench`) | `.app-workspace` bỏ padding, header sát mép | Không (trừ cửa sổ thấp) |
| Lưới nội dung | `.dictionary-workbench-content` | cột trái `--vzn-dictionary-lookup-width` (336), cột phải `minmax(0,1fr)`, gap `--vzn-space-4`, padding `--vzn-space-4` | Không |
| Cột tra cứu | `aside.dictionary-lookup-region` (`aria-label="Tra cứu"`) | thẻ `--vzn-surface`, viền `--vzn-border`, bo `--vzn-radius-md`, padding và gap `--vzn-space-3` | Không, chỉ danh sách bên trong cuộn |
| Ô tra cứu | `DictionarySearchPanel` (`form.dictionary-search`) | gap `--vzn-space-2`; ô từ `FilterInput size="md"` (36); ô ngữ cảnh `Textarea` cao tối đa `--vzn-dictionary-context-max-block` (3 × 36); nút `md` rộng 100 % | Ô ngữ cảnh tự cuộn |
| Lịch sử | `DictionaryHistoryPanel` (`.dictionary-history`) | cao tối thiểu `--vzn-dictionary-pane-min-block`; thanh công cụ có vạch trên `--vzn-divider`; chân `.dictionary-panel-footer` nền `--vzn-surface-muted` | `.dictionary-history-list` cuộn |
| Hàng lịch sử | `li.dictionary-history-row` | padding `--vzn-space-2` × `--vzn-space-3`; từ chính `--vzn-font-size-lg` semibold; phiên âm mono `--vzn-font-size-caption`; nghĩa 2 dòng `--vzn-font-size-sm`; hàng chọn nền `--vzn-surface-selected` + vạch nhấn `--vzn-action` bên trái | — |
| Kết quả | `section.dictionary-result-region` (`aria-label="Từ điển"`) + `DictionaryResultPanel` | thẻ `--vzn-surface`, cao tối thiểu `--vzn-dictionary-pane-min-block` | — |
| Header mục từ | `header.dictionary-result-header` | padding `--vzn-space-4` `--vzn-space-5` `--vzn-space-3`; từ chính `--vzn-font-display` cỡ `--vzn-dictionary-headword-size` (= `--vzn-font-size-heading`, 22); phiên âm mono `--vzn-font-size-lg`; từ loại `.dictionary-pos` viết hoa `--vzn-font-size-micro` trên `--vzn-surface-muted` | Không |
| Thân mục từ | `.dictionary-result-body` > `DictionaryEntrySections` | padding `--vzn-space-4` × `--vzn-space-5`; cột đọc tối đa `--vzn-dictionary-reading-max` (768) | Có |
| Nút tra phần chọn | `.dictionary-selection-action` | nút `lg` icon, `position: fixed`, lớp `--vzn-layer-picker`, `--vzn-shadow-md` | — |
| Hộp thoại chi tiết bản dịch / tra phần chọn | `DialogShell size="lg"` | xem `DialogShell` | Thân cuộn |
| Popover Cấu hình AI | `DictionaryAIConfiguration` → `AIConfigurationPopover` | rộng `--vzn-ai-configuration-inline` (420) | Thân cuộn |

## 4. Thành phần và hành động

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Ngôn ngữ nguồn ▾ / đích ▾ | `LanguagePairBar scope="dictionary" size="sm"`, kiểu chung của header trang: hai nút có khung riêng (`--vzn-border-strong`, bo `--vzn-radius-sm`), ô giữa đứng tách giữa hai nút | Click / Enter | Chọn ngôn ngữ; ghi cặp vào phạm vi `translate` (dùng chung với AI Dịch, `onPairChange` → `setLanguagePair('translate', …)`) | Bộ chọn có chip cặp gần đây / đã ghim | — |
| 2 | Đảo chiều ⇄ | Nút đảo của `LanguagePairBar` | Click | Hoán đổi nguồn và đích | Hai nhãn đổi chỗ | Khi nguồn là "Tự động" thay bằng mũi tên → tĩnh; `disabled` khi nguồn = đích ("Chọn ngôn ngữ nguồn và đích khác nhau để đảo chiều.") |
| 3 | Cấu hình AI | `md · neutral · ghost` icon bánh răng (mở: `primary · soft`), `aria-expanded`, `aria-haspopup="dialog"` | Click | Mở popover "Cấu hình AI" — "Áp dụng cho lượt tra cứu tiếp theo.", một mục "Mô hình" chứa danh sách model nội tuyến | Nút chuyển soft xanh | Luôn bật |
| 4 | Popover › chọn model | `ModelSelector embedded inline directModelList` | Click một model | Đổi model cho lượt tra sau; popover **tự đóng** khi chọn | Popover đóng, focus về bánh răng | — |
| 5 | Ô "Từ hoặc cụm từ" | `FilterInput size="md"` có icon tìm, bộ đếm `n/120` và nút xoá | Gõ; Enter gửi form | Cập nhật `term`; gõ thì xoá lỗi kiểm tra cũ | Bộ đếm hiện khi có chữ; > 120 ký tự: ô `invalid`, bộ đếm `data-invalid` đỏ | — |
| 6 | Xoá ô từ (✕) | Nút xoá của `FilterInput`, `aria-label="Xoá tìm kiếm"` | Click | Xoá chữ, focus về ô | — | Ẩn khi trống |
| 7 | Ô "Ngữ cảnh (không bắt buộc)" | `Textarea` | Gõ | Cập nhật `context`; có ngữ cảnh thì nhãn nghĩa đổi thành "Nghĩa trong ngữ cảnh này" | Bộ đếm `n/500` khi có chữ, đỏ khi vượt | — |
| 8 | Tra cứu | `md · primary · solid`, rộng 100 %, icon sách, `type="submit"` | Click / Enter trong ô từ | `runLookup`: kiểm tra (trống, quá dài, ngữ cảnh quá dài, nguồn = đích) → dùng bộ nhớ đệm nếu cùng từ + cặp + ngữ cảnh + model → nếu không, gọi `lookupPreview` rồi `lookupDetails` | Đang chạy: icon xoay + "Đang tra…" (`aria-label` đổi theo) | `disabled` khi đang tra hoặc chưa chọn model (`title` "Chọn model trong Cấu hình AI để tra cứu.") |
| 9 | Chip gợi ý (trạng thái trống) | `xs · neutral · outline`, `shape="pill"`, icon + chữ mono | Click | Điền từ vào ô (không tự tra) | Ô từ có chữ, bộ đếm hiện | — |
| 10 | Đánh dấu / Bỏ đánh dấu | `sm · neutral · ghost` icon sao (đã đánh dấu: `primary · soft`), `aria-pressed` | Click | Bật/tắt yêu thích của mục đang xem | Sao tô xanh; số đếm tab Yêu thích đổi | — |
| 11 | Sao chép | `sm · neutral · ghost` icon (sau khi chép: `primary · soft`, icon ✓) | Click | Chép mục từ đã định dạng (`formatDictionaryEntry`) | ✓ và `aria-label` "Đã sao chép" trong 1,2 s | — |
| 12 | Dùng trong AI Dịch | `sm · neutral · ghost` icon, `aria-label`/`title` "Dùng trong AI Dịch" | Click | Đặt cặp và văn bản nguồn cho AI Dịch, xoá bản dịch cũ, chuyển trang | Trang Dịch mở với từ đã điền | — |
| 13 | Chip bản dịch | `sm · neutral · outline`, `shape="pill"` (đang mở: `primary · soft`), `aria-pressed`, `aria-label="Chi tiết bản dịch: …"` | Click | Mở hộp thoại "Chi tiết bản dịch": nghĩa, cách dùng, sắc thái, ví dụ, cụm thường dùng, ghi chú; bấm lại chip thì đóng | Hộp thoại mở | — |
| 14 | Bôi đen chữ trong thân mục từ | Chọn chuột hoặc bàn phím (≤ 80 ký tự được giữ) | mouseup / keyup | Hiện nút nổi "Tra phần đã chọn" `lg · neutral · outline` icon kính lúp gần vùng chọn | Nút nổi có bóng `--vzn-shadow-md` | Chỉ khi vùng chọn nằm trong `.dictionary-result-body` |
| 15 | Tra phần đã chọn | Nút nổi ở #14, `aria-label="Tra phần đã chọn: <chữ>"` | Click | Mở hộp thoại tra phụ: skeleton → kết quả (nghĩa, bản dịch, ví dụ, ghi chú); không đổi mục đang xem | Phụ đề hộp thoại "Đang tra phần đã chọn…" có chấm suy nghĩ | — |
| 16 | Đóng hộp thoại chi tiết / tra phụ | Nút ✕ của `DialogShell`, `aria-label="Đóng chi tiết bản dịch"` | Click / Esc / bấm nền | Đóng; tra phụ đang chạy thì huỷ (`abort`) | Focus về chỗ mở | — |
| 17 | Tab Gần đây / Yêu thích | `TabBar` (`role="tablist"`), kèm số đếm | Click / ← → / Home / End | Đổi danh sách | Tab chọn có `aria-selected` | — |
| 18 | Tìm trong lịch sử | `FilterInput size="sm"` | Gõ | Lọc theo từ chính, nghĩa, từ đã gõ | Không có kết quả: "Không có mục phù hợp" | Chỉ hiện khi tab hiện tại > 4 mục |
| 19 | Hàng lịch sử | Nút gốc `.dictionary-history-select` (ngoại lệ có ghi chú trong mã), `aria-current` khi đang xem | Click / Enter | Hiện mục đó ở cột kết quả (không gọi AI) | Hàng có nền chọn + vạch xanh | — |
| 20 | Sao trên hàng | `xs · neutral · ghost` icon (đã đánh dấu: `primary · soft`), `aria-pressed` | Click | Bật/tắt yêu thích của hàng đó | Sao luôn hiện khi đã đánh dấu; còn lại chỉ hiện khi rê chuột hoặc focus bàn phím | — |
| 21 | Xoá lịch sử | `sm · danger` (appearance mặc định `soft`), `shape="pill"`, `aria-haspopup="dialog"` | Click | Mở hộp thoại xác nhận "Xoá tất cả mục lịch sử không yêu thích? Không thể hoàn tác." | — | `disabled` khi mọi mục đều là yêu thích; ẩn khi chưa có mục |
| 22 | Xác nhận › Huỷ / Xoá lịch sử | `md · neutral · outline` / `md · danger · solid` | Click | Huỷ, hoặc xoá mọi mục không yêu thích | Danh sách chỉ còn mục yêu thích | — |
| 23 | Xoá (mục đang xem) | `sm · danger` (`soft`), `shape="pill"` | Click | Xoá mục đang xem, không xác nhận | Cột kết quả về trạng thái trống (không tự nhảy sang mục khác) | Chỉ hiện khi có mục đang xem |
| 24 | Toast lỗi › Thử lại | Hành động trong toast | Click | Chạy lại `runLookup` với từ hiện tại | Nút Tra cứu vào trạng thái đang tra | `disabled` khi ô từ trống, chưa có model hoặc đang tra |
| 25 | Toast lỗi › Chọn model khác | Hành động trong toast | Click | Mở popover Cấu hình AI | Popover mở | — |
| 26 | Toast lỗi › Mở Cài đặt | Hành động trong toast | Click | `openSettings()` | Cài đặt mở | — |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống | Chưa có mục nào, hoặc vừa xoá mục đang xem | Cột kết quả: `DictionaryEmptyState` — icon sách, "Chưa chọn mục nào", "Tra một từ để xem nghĩa, bản dịch, ví dụ và ghi chú.", ba chip gợi ý (sắc thái · 工夫 · kintsugi). Lịch sử: "Chưa có lịch sử tra" / "Chưa có mục yêu thích"; không có chân danh sách khi chưa có mục | Gõ từ, chip gợi ý, Tra cứu |
| Đang tải | Đang chờ `lookupPreview` | Nút Tra cứu `disabled`, icon xoay, "Đang tra…". Cột kết quả thay bằng skeleton đúng hình mục từ (`.dictionary-skeleton`, `aria-busy`, chữ ẩn "Đang tra…") | Gõ tiếp; chọn mục lịch sử |
| Đang bổ sung chi tiết | Đã có bản xem trước, đang chờ `lookupDetails` | Mục từ hiện ngay ở đầu "Gần đây"; cạnh từ chính có chấm suy nghĩ `role="img"` "Đang bổ sung chi tiết…"; sau đó chip, sắc thái, ví dụ đầy đủ thay vào | Mọi hành động trên mục |
| Có dữ liệu | Có mục đang xem | Header mục từ + các phần Nghĩa, Bản dịch, Sắc thái (tối đa 3), Ví dụ (đánh số, câu gốc + câu dịch), Ghi chú | #10–#23 |
| Bộ nhớ đệm | Tra lại cùng từ + cặp + ngữ cảnh + model đã có chi tiết | Mục đưa lên đầu "Gần đây" ngay, không gọi AI, chuyển về tab Gần đây | — |
| Lỗi kiểm tra | Bấm Tra cứu khi trống / > 120 ký tự / ngữ cảnh > 500 / nguồn = đích | Trống / quá dài: thông điệp dưới ô tương ứng (`role="alert"`, ô có `aria-invalid` + `aria-describedby`): "Nhập từ cần tra." / "Từ khoá quá dài." / "Ngữ cảnh quá dài."; gõ lại thì thông điệp tắt. Nguồn = đích: toast lỗi "Ngôn ngữ nguồn và đích phải khác nhau." | Sửa nội dung |
| Lỗi nhà cung cấp | Gọi AI thất bại, phản hồi không hợp lệ hoặc bị cắt | Toast lỗi có dòng phụ "Provider · model" và ba nút Thử lại / Chọn model khác / Mở Cài đặt. Từ đã gõ được giữ. Lỗi ở pha chi tiết sau khi đã có bản xem trước: bản xem trước giữ nguyên, chỉ báo lỗi khi không phải lỗi phản hồi không hợp lệ/bị cắt | #24–#26 |
| Thiếu khoá / model | `selectedModels[selectedProvider]` rỗng | Nút Tra cứu `disabled`, tooltip "Chọn model trong Cấu hình AI để tra cứu."; `CapabilityNotice` vàng "Chưa chọn model" phía trên nút, có nút "Mở Mô hình AI" (`openSettingsAt('api')`) | Cấu hình AI, Mở Mô hình AI |
| Đã đánh dấu | `entry.favorite` | Sao `primary · soft` ở header và trên hàng; mục giữ lại khi Xoá lịch sử | Bỏ đánh dấu |
| Module tắt | `enabledModules.dictionary === false` | Mục điều hướng, lệnh ⌘K và thẻ Trang chủ ẩn (foundations §12) | — |

## 6. Luồng tương tác chính

**A. Tra một từ có ngữ cảnh**

1. Mở trang: focus sẵn ở ô "Từ hoặc cụm từ" (`inputRef.current.focus()` khi mount). Cột kết quả hiện mục mới nhất, hoặc trạng thái trống nếu chưa tra lần nào.
2. Gõ `bank`, bộ đếm hiện `4/120`. Dán câu "We sat on the river bank." vào ô Ngữ cảnh, bộ đếm `25/500`.
3. Nhấn Enter. Nút thành "Đang tra…" có icon xoay.
4. Bản xem trước về: mục mới đứng đầu "Gần đây" và được chọn; header hiện `bank /bæŋk/ NOUN` cùng chấm "Đang bổ sung chi tiết…"; phần nghĩa có nhãn "Nghĩa trong ngữ cảnh này".
5. Chi tiết về: chip bản dịch đầy đủ, đoạn "Sắc thái · bờ sông", ví dụ, ghi chú; chấm suy nghĩ biến mất.

**B. Tìm hiểu một bản dịch**

1. Bấm chip "bờ sông" → chip chuyển `primary · soft`, hộp thoại "Chi tiết bản dịch" mở với tiêu đề là bản dịch + phiên âm + từ loại.
2. Đọc Nghĩa, Cách dùng, Sắc thái, Ví dụ, Cụm thường dùng, Ghi chú. Esc hoặc ✕ để đóng; chip trở lại `outline`.

**C. Tra một chữ trong kết quả**

1. Bôi đen "embankment" trong phần ví dụ → nút kính lúp nổi hiện phía trên vùng chọn.
2. Bấm nút → vùng chọn bị bỏ, hộp thoại tra phụ mở với skeleton (dòng nghĩa + ba chip) và phụ đề "Đang tra phần đã chọn…".
3. Kết quả mờ dần vào (`.dictionary-fade-in`). Đóng hộp thoại để quay lại mục chính; mục phụ không thay mục đang xem.

**D. Lưu và mang sang AI Dịch**

1. Bấm sao ở header → đã đánh dấu; tab "Yêu thích" tăng 1.
2. Bấm "Dùng trong AI Dịch" → trang Dịch mở với cặp ngôn ngữ và từ đã điền.

**E. Dọn lịch sử**

1. Bấm "Xoá lịch sử" ở chân danh sách → hộp thoại xác nhận.
2. Bấm "Xoá lịch sử" (đỏ đặc) → chỉ còn mục yêu thích. Nếu mọi mục đều yêu thích, nút ở chân bị `disabled`.

**F. Lỗi nhà cung cấp**

1. Tra khi khoá API hết hạn → toast lỗi "… · Provider · model" với Thử lại / Chọn model khác / Mở Cài đặt; từ đã gõ vẫn còn.
2. Bấm "Chọn model khác" → popover Cấu hình AI mở; chọn model → popover tự đóng.
3. Bấm Tra cứu lại → thành công, toast tự tắt.

## 7. Responsive

Ngưỡng theo container `dictionary-workbench` (`src/styles/dictionary.css`), trừ chỗ ghi khác.

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 760 px | Hai cột: cột tra cứu 336 px (`--vzn-dictionary-lookup-width`) + kết quả. Mỗi cột tự quản cuộn; khung không cuộn |
| < 760 px | Một cột: cột tra cứu (ô tìm + lịch sử) nằm trên, kết quả bên dưới; mỗi vùng giữ chiều cao tự nhiên, lịch sử cao tối thiểu `--vzn-dictionary-pane-min-block`, **cả vùng nội dung cuộn** |
| < 560 px | Header giảm lề trong còn `--vzn-space-4` (`.page-header`, `src/styles/codex.css`); cặp ngôn ngữ và bánh răng có thể xuống dòng |
| Cửa sổ cao ≤ 600 px | Cả khung `.dictionary-workbench` cuộn, header không co, vùng nội dung giữ cao tối thiểu |
| Cửa sổ ≤ 720 px rộng hoặc ≤ 600 px cao | Popover Cấu hình AI thành hộp thoại giữa cửa sổ dưới thanh tiêu đề |
| Cửa sổ < 900 px | Điều hướng chính thành rail 60 px (foundations §8) |

## 8. Bàn phím và trợ năng

- **Focus đầu**: ô "Từ hoặc cụm từ" khi trang mở.
- **Thứ tự Tab**: cặp ngôn ngữ (nguồn → đảo → đích) → Cấu hình AI → ô từ → nút xoá ô → ô ngữ cảnh → Tra cứu → tab Gần đây/Yêu thích (một điểm dừng, ← → Home End để chuyển) → ô tìm lịch sử → từng hàng (nút chọn → sao) → Xoá lịch sử → Xoá → header mục từ (sao, sao chép, dùng trong AI Dịch) → chip bản dịch.

  Lưu ý: trong DOM cột tra cứu đứng trước cột kết quả (`DictionaryWorkbenchTemplate`), nên Tab đi qua lịch sử trước khi tới kết quả.
- **Enter** trong ô từ gửi form. Esc đóng popover và hộp thoại, trả focus về nút mở. Tra xong (không lỗi), focus chuyển tới tiêu đề mục từ (`h2 tabIndex=-1`).
- **Nhãn**: ô từ `aria-labelledby` = "Từ hoặc cụm từ"; ô từ và ô ngữ cảnh có `aria-invalid` + `aria-describedby` trỏ tới thông điệp lỗi dưới ô; nút Tra cứu đổi `aria-label` khi đang tra; các nút icon (sao, sao chép, dùng trong AI Dịch, sao trên hàng) đều có `aria-label`; sao dùng `aria-pressed`; chip bản dịch có `aria-pressed` + `aria-label` "Chi tiết bản dịch: …".
- **Vùng**: cột tra cứu là `aside aria-label="Tra cứu"`, kết quả là `section aria-label="Từ điển"`, lịch sử có `role="tablist"` (nhãn "Lịch sử tra cứu") và `role="tabpanel"`.
- **Live**: skeleton tra phụ có `aria-busy` + `aria-live="polite"`; chỉ báo "Đang bổ sung chi tiết…" là `role="img"` có `aria-label`; toast lỗi `role="alert"`. Cột kết quả chính có vùng ẩn `aria-live="polite"` đọc tiêu đề mục từ mới.
- **Nút tra phần chọn** dùng `onMouseDown preventDefault` để không làm mất vùng chọn; có `aria-label` gồm chữ được chọn.
- Không có phím tắt riêng ngoài Enter.

## 9. Nội dung chữ (vi)

Nguồn: `src/i18n/locales/vi.ts`.

| Khoá | vi |
| --- | --- |
| `dictionary_title` / `nav_dictionary` | Từ điển |
| `command_palette_dictionary_description` | Tra cứu từ và định nghĩa |
| `command_palette_dictionary_text_description` | Tra cứu “{text}” |
| `dictionary_lookup_region` | Tra cứu |
| `dictionary_term_label` / `dictionary_term_placeholder` | Từ hoặc cụm từ / Nhập từ hoặc cụm từ… |
| `dictionary_context_label` / `dictionary_context_optional` | Ngữ cảnh / (không bắt buộc) |
| `dictionary_context_placeholder` | Câu ví dụ, lĩnh vực hoặc sắc thái… |
| `dictionary_lookup` / `dictionary_lookup_loading` | Tra cứu / Đang tra… |
| `dictionary_lookup_needs_model` | Chọn model trong Cấu hình AI để tra cứu. |
| `ai_configuration_title` / `ai_configuration_dictionary_scope` | Cấu hình AI / Áp dụng cho lượt tra cứu tiếp theo. |
| `ai_configuration_models_section` | Mô hình |
| `dictionary_empty_title` / `dictionary_empty_desc` | Chưa chọn mục nào / Tra một từ để xem nghĩa, bản dịch, ví dụ và ghi chú. |
| `dictionary_empty_hints` | sắc thái · 工夫 · kintsugi |
| `dictionary_meaning` / `dictionary_meaning_in_context` | Nghĩa / Nghĩa trong ngữ cảnh này |
| `dictionary_translations` / `dictionary_translation_detail` | Bản dịch / Chi tiết bản dịch |
| `dictionary_translation_usage` / `dictionary_translation_nuance` / `dictionary_translation_nuance_of` | Cách dùng / Sắc thái / Sắc thái · {text} |
| `dictionary_translation_example` / `dictionary_translation_collocations` | Ví dụ / Cụm thường dùng |
| `dictionary_translation_close` | Đóng chi tiết bản dịch |
| `dictionary_examples` / `dictionary_notes` | Ví dụ / Ghi chú |
| `dictionary_enriching` | Đang bổ sung chi tiết… |
| `dictionary_selection_lookup` / `dictionary_selection_lookup_loading` | Tra phần đã chọn / Đang tra phần đã chọn… |
| `dictionary_favorite` / `dictionary_unfavorite` | Đánh dấu / Bỏ đánh dấu |
| `dictionary_copy` / `dictionary_copied` | Sao chép / Đã sao chép |
| `dictionary_reuse_translate` | Dùng trong AI Dịch |
| `dictionary_history_label` | Lịch sử tra cứu |
| `dictionary_recent` / `dictionary_favorites` | Gần đây / Yêu thích |
| `dictionary_no_recent` / `dictionary_no_favorites` / `dictionary_no_matches` | Chưa có lịch sử tra / Chưa có mục yêu thích / Không có mục phù hợp |
| `history_search_placeholder` / `history_search_clear` | Tìm trong lịch sử... / Xoá tìm kiếm |
| `dictionary_delete` / `dictionary_clear_history` | Xoá / Xoá lịch sử |
| `dictionary_clear_history_confirm` / `dictionary_clear_history_cancel` | Xoá tất cả mục lịch sử không yêu thích? Không thể hoàn tác. / Huỷ |
| `dictionary_error_required` / `dictionary_error_too_long` / `dictionary_error_context_too_long` | Nhập từ cần tra. / Từ khoá quá dài. / Ngữ cảnh quá dài. |
| `dictionary_error_same_lang` | Ngôn ngữ nguồn và đích phải khác nhau. |
| `dictionary_error_failed` / `dictionary_error_invalid_response` / `dictionary_error_truncated` | Tra từ thất bại. / Provider trả về mục từ không hợp lệ. / Phản hồi bị cắt ngắn. Vui lòng thử lại hoặc rút gọn ngữ cảnh. |
| `dictionary_error_retry` / `translate_error_choose_model` / `translate_error_open_settings` | Thử lại / Chọn model khác / Mở Cài đặt |

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ (`boards/Dictionary.dc.html`, `States`, `Histories`, `Popovers`) so với mã:

1. **Phát âm (nút loa) — đề xuất.** Bản vẽ có nút "Phát âm" ở header mục từ; app không có chức năng đọc to trong Từ điển.
2. **"Dùng trong Dịch" là nút chữ** trong bản vẽ; mã là nút icon `sm · ghost` có `aria-label`. Giữ mã (cùng hàng với sao và sao chép, cùng kích thước).
3. **"Các nghĩa khác" (danh sách nghĩa đánh số) — đề xuất.** `DictionaryResult` chỉ có một `meaning`; nghĩa khác thể hiện qua chip bản dịch và đoạn sắc thái.
4. **"Bản dịch và sắc thái" dạng lưới thẻ** trong bản vẽ; mã dùng chip + tối đa 3 đoạn "Sắc thái · …" + hộp thoại chi tiết. Ví dụ trong bản vẽ là ô nền xám; mã là danh sách đánh số với câu gốc/câu dịch.
5. **Gần đây / Yêu thích** là segmented control trong bản vẽ; mã dùng `TabBar` có số đếm và ô tìm (khi > 4 mục), hàng có nghĩa 2 dòng, phiên âm, chi phí (`UsageCostBadge`), nút sao. Mã giàu hơn bản vẽ; giữ mã.
6. **Trạng thái trống (States)**: bản vẽ có tiêu đề "Chưa tra từ nào", câu hướng dẫn về ô bên trái và gợi ý "Trong bộ nhớ tạm · [từ vừa sao chép] · Tra từ này" — **đề xuất** (app không đọc clipboard ở trang này). Mã: "Chưa chọn mục nào" + ba chip mẫu.
7. **Xoá mục đang xem không có xác nhận** và cùng mức nhấn với "Xoá lịch sử" (cả hai `danger · soft` pill). Đề xuất toast Hoàn tác, hoặc hạ "Xoá" xuống `ghost`.
8. **Thứ tự đọc**: lịch sử đứng trước kết quả trong DOM. Sau khi tra, focus đã chuyển tới tiêu đề mục từ, nhưng chưa có liên kết bỏ qua danh sách lịch sử — **đề xuất**.
9. **Cặp ngôn ngữ dùng chung với AI Dịch** (`scope="dictionary"` ghi vào phạm vi `translate`). Bản vẽ không nói rõ; đặc tả theo mã.
10. **Nợ token nhỏ**: `.dictionary-skeleton-wide/-narrow` dùng phần trăm `90%`/`75%` cố định trong `src/styles/dictionary.css`; nút tra phần chọn đặt vị trí bằng `style` inline (có chú thích, là toạ độ tính toán, chấp nhận được).
