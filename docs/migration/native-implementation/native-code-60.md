# Native code 60 — Menu chọn model: mục đích, gần đây, dòng mới nhất (2026-11-02)

Người dùng thấy menu liệt kê nguyên danh sách API trả về (14 dòng Claude, OpenAI có cả babbage, davinci,
computer-use) và yêu cầu thiết kế lại: chỉ model mới nhất đang hỗ trợ, có ba nhà cung cấp cloud và
runtime local. Hướng chọn: menu nhóm (D) ghép ba mức mục đích. Quyết định ghi ở
[direction.md](../../design/direction.md) mục "Chọn model". Không chạy QA; người dùng review tay.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanDomain/ModelLineup.swift` (mới) | `family(_:)` đọc ID thành dòng + hạng + phiên bản (Claude haiku<sonnet<opus<fable; OpenAI nano<mini<gpt<pro và dòng o; Gemini flash-lite<flash<pro, nhận preview/exp); `isChatModel` loại embed/tts/whisper/audio/realtime/image/computer-use/moderation/babbage/davinci/instruct/latest…; `featured` giữ bản mới nhất mỗi dòng, mạnh nhất trước, tối đa 4, bản có ngày thua bản không ngày, ID không đọc được thì lấy vài tên đầu; `shortName`; `tiers(for:listing:)` (Nhanh = hạng thấp nhất, Cân bằng = sonnet/gpt/flash, Kỹ = hạng cao nhất; nil khi local hoặc < 2 dòng); `recent(_:)` ba ID chat khác nhau. |
| `WorkbenchStore` | `modelTiers(_:)`, `applyModelTier(_:_:)` (đặt model, bật suy luận kỹ chỉ với Kỹ), `recentPicks` (model của các phiên có nội dung, mới nhất trước, từ `recentModels` sẵn có). Không thêm trường lưu. |
| `ModelPicker` compact | Menu: Mục đích (Toggle có dấu chọn khi đúng model và cờ suy luận) · Gần đây · nhóm Claude/OpenAI/Gemini (`featured` + submenu "Tất cả …" ID thô; chưa có listing thì "Thiết lập …" mở Cài đặt › Nhà cung cấp) · Trên máy (model local hoặc "Thiết lập model local…"). Nút đọc `shortName`, help và accessibility giữ ID. Picker đầy đủ (`full`) không đổi. |
| Chuỗi | `tierFast/Balanced/Careful`, `purposeSection`, `recentModels`, `allModelsOf`, `setupProvider`, `localSection`, `setupLocal` VI/EN/JA. |
| Test | `ModelLineupTests`: danh sách trong ảnh rút còn Fable 5.1 · Opus 5.5 · Sonnet 5.5 · Haiku 5.5; OpenAI bỏ babbage/davinci/computer-use/chat-latest; Gemini preview và embedding; snapshot có ngày; local và ID lạ; tên ngắn; ba mức theo từng nhà cung cấp và trường hợp ẩn; gần đây. |

Sự cố trong lúc làm: file `ModelCatalog.swift` (hàm liệt kê model của provider) bị ghi đè nhầm, đã khôi
phục từ HEAD; code mới nằm ở `ModelLineup.swift`.

## Vòng 2 — sau ảnh submenu "Tất cả OpenAI…" trên dev-13

| Nhận xét | Sửa |
| --- | --- |
| Submenu lộ danh sách thô, gpt-4o lặp bốn lần, có tts/transcribe. | Bỏ submenu. "Model khác…" mở popover (`ModelPicker.modelSearch`): ô tìm, `ModelLineup.search` lọc model chat, gộp snapshot có ngày vào tên (chỉ snapshot thì lấy bản mới nhất), tối đa tám, Enter chọn kết quả đầu; ID gõ tay hợp lệ (`NativeModel.valid`) hiện nút "Dùng ID …". |
| OpenAI ưu tiên o3 hơn GPT-5.5 mini. | `featured` chọn một model mỗi cỡ (hạng), dòng chính thắng dòng o cùng cỡ, o chỉ lấp cỡ trống. |
| Gần đây lặp ba lần cùng model, tên dài. | Gần đây dùng `shortName` và bỏ model đã nằm trong Mục đích. |

Chuỗi: `otherModels`, `searchModels`, `useModelID`, `noModelMatch`; bỏ `allModelsOf`. Test thêm
`searchFoldsSnapshotsAndDropsNonChatModels`, cập nhật kỳ vọng OpenAI.

## Vòng 3 — sau ảnh dev-14: thanh cuộn ở một dòng, GPT-6 vắng, menu hệ thống mặc định

| Nhận xét | Sửa |
| --- | --- |
| Một dòng mà có thanh cuộn. | Inset dọc làm tròn khiến nội dung 41 pt trong khung 40 pt. `ComposerEditor` bật `hasVerticalScroller` chỉ khi số dòng vượt trần; dưới trần tắt hẳn. |
| GPT-6 không hiện dù listing có `gpt-6-astra`. | Regex dòng GPT và Claude nhận hậu tố tên mã (`Family.suffix`), `shortName` thành "GPT-6 Astra"; thứ tự vẫn theo phiên bản. Test `codenamedReleasesLeadTheirSize`. |
| Dropdown là NSMenu mặc định, không theo ngôn ngữ app. | `ModelPanel` (file mới) là lớp nổi `ShellOverlay.models` vẽ trong ZStack của `WorkbenchView` như Lịch sử nhanh: `ReadingPanelSurface`, rộng `sidebar + editor`, cao tối đa `editor × 3`, neo trên chip (nếu thiếu chỗ thì dưới). Ô tìm `HistorySearch` (↑↓, Return, Escape), nhóm theo `ModelLineup.sections` (Mục đích · Gần đây · từng nhà cung cấp · Trên máy; có query thì kết quả mỗi nhà cung cấp, local, và ID gõ tay), hàng lặng có hover/highlight, dấu chọn, hàng Thiết lập mờ; chân: Tải lại model, Cấu hình model (mở popover cấu hình của `ModelPicker` qua `.viezanConfigureModel`). Chip là `ShellToolbarButton` quiet/small với `frameAction` gửi khung qua `.viezanOpenModels`; `expanded` qua environment `modelPanelOpen`. Bỏ menu cũ, popover "Model khác…" và chuỗi `otherModels`. Test `panelSectionsFollowTheQuery`. |

Canvas: artboard "AI Chat · chọn model · 1400" (bản 14).

## Vòng 4 — "kiểm tra các dropdown trong AI Chat, không dùng mặc định"

Rà AI Chat: Lịch sử, Hoạt động, ⌘K, chọn model đã là lớp nổi; còn menu "+" (NSMenu với hai submenu) và
submenu "Tải lại model" trong panel model. Ảnh cũng cho thấy chip model xuống dòng "GPT-5.\n5 pro".

| Phần | Thay đổi |
| --- | --- |
| Chip model xuống dòng | `FocusButton.intrinsicContentSize` cộng inset vẽ của cell (nút quiet có nhãn không được tính), `lineBreakMode = .byTruncatingTail`. |
| Menu "+" | `ComposerToolsPanel` (`ComposerPanels.swift`): lớp `ShellOverlay.tools`, neo như panel model; nhóm từ `ComposerTools.sections` (Đính kèm · Chế độ Chat · Suy luận · Giọng nói) với hàng mờ khi không dùng được; ↑↓/Return/Escape; hành động ảnh gửi `.viezanComposerAction` cho `ImageControls` đang mounted (giữ nguyên `pick`/`capture`/`busy`), nhà cung cấp nhận dạng mở Cài đặt › Giọng nói. `ImageControls` compact: "+" là `ShellToolbarButton` với `frameAction`; bỏ `extraMenu`/`composerModes`. |
| Submenu Tải lại model | Một nút gọi `discoverProviders()`. |
| Dùng chung | `PanelRow` (dấu chọn hoặc icon, tiêu đề, chi tiết, hover/highlight, mờ) cho cả hai panel; environment `shellLayer` thay `modelPanelOpen`. |
| Chuỗi | `attachSection`, `reasoningSection`, `chatModeHint_text/web/research/image`, `carefulReasoningHint`. |
| Test | `composerToolsFollowTheSession`. |

## Vòng 5 — ba nhận xét trên dev-16

| Nhận xét | Sửa |
| --- | --- |
| Astra viết hoa, pro/mini không. | `shortName` viết hoa chữ đầu mọi từ sau phiên bản ("GPT-5.5 Pro", "o4 Mini"); "GPT-6" giữ gạch nối theo OpenAI. |
| Đang dùng GPT-6 Astra mà Kỹ là 5.5 Pro. | `tiers` xếp thế hệ trước cỡ, theo hạng dòng chính của từng nhà (`mainRank`: Sonnet 1, GPT 2, Flash 1): Kỹ = mới nhất trong các cỡ ≥ dòng chính; Cân bằng = dòng chính mới nhất; Nhanh = cỡ nhỏ mới nhất, cùng thế hệ thì nhỏ nhất. Test với đúng listing trong ảnh: Nhanh 5.4 Nano · Cân bằng 6.1 Sol · Kỹ 6.1 Sol. |
| Chip "Suy luận cẩn thận ✕" chen vào hàng. | Bỏ `modeChip`. Chế độ khác mặc định: placeholder đổi (`promptMode_web/research/image`) và "+" ở trạng thái `soft`; suy luận kỹ: chip model đọc "Kỹ · …"; hàng Tạo ảnh trong panel ghi nhà cung cấp sẽ vẽ. |
| Tam giác cảnh báo cạnh "+". | Lỗi đính kèm/chụp/OCR thành toast (`onChange(of: error)`), không còn biểu tượng trong hàng. |

## Vòng 6 — panel "+" khó dùng (dev-17)

Ảnh: panel rộng 284 pt nên tiêu đề và mô tả bị cắt ("Tìm kiếm trê…", "Suy luận cần…"), bốn tiêu đề nhóm
đẩy chiều cao quá slot nên có thanh cuộn, hàng icon lẫn hàng dấu chọn, hàng nhà cung cấp nhận dạng là
việc của Cài đặt.

| Sửa | |
| --- | --- |
| Bề rộng | Cả hai lớp dùng `sidebar + editor` (376 pt). |
| Cấu trúc | Bỏ `Eyebrow`, nhóm ngăn bằng `Divider`; Suy luận cẩn thận là `PanelRow(toggle:)` có công tắc mini (cả hàng bấm được); bỏ hàng `speechProvider`. |
| Chiều cao | Panel `fixedSize(vertical:)` ôm nội dung trong slot cao tối đa `editor × 3`; slot căn `.bottom` khi mở lên trên và `.top` khi mở xuống nên mép panel luôn tựa vào nút. Áp dụng cho cả panel model. |
| Test | `composerToolsFollowTheSession` cập nhật (hai hàng giọng nói). |

## Vòng 7 — thanh cuộn to, vòng focus xanh (dev-18)

| Nhận xét | Sửa |
| --- | --- |
| Thanh cuộn dày có rãnh trong panel model và Lịch sử. | macOS đang "luôn hiện thanh cuộn" (có chuột) nên ScrollView vẽ scroller kiểu cũ. Lớp nổi (models/tools và history/activity/commands) và danh sách sidebar đặt `scrollIndicators(.hidden)`; `ComposerEditor` đặt `scrollerStyle = .overlay`. Nội dung dài (bản ghi, Cài đặt, thư viện) giữ thanh cuộn. |
| Ô tìm viền xanh. | `HistorySearch.focusRingType = .none` (áp dụng cho mọi ô tìm dùng chung: Lịch sử, model, ⌘K, Cài đặt). |

## Vòng 8 — "UI các thanh tìm kiếm chưa tốt" (dev-19)

Ô tìm là `NSSearchField` với bezel hệ thống (hộp xám, kính lúp hệ thống), lạc với ô "Tìm ⌘K" bo tròn ở
sidebar. `HistorySearch` giữ logic phím nhưng bỏ bezel/viền/nền/kính lúp và báo focus qua `onFocus`;
`SearchBox` (cùng file) bọc nó bằng kính lúp của app, nền `surface-subtle`, bo `controlRadius`, viền
hairline đậm lên khi nhập, cao `control` (header: `compactControl`). Sáu nơi dùng chuyển sang `SearchBox`:
Lịch sử nhanh, thư viện, lịch sử Phiên dịch, panel model, ⌘K, ô tìm Cài đặt. Test `HistorySearch`
hiện có không đổi.

## Vòng 9 — vòng focus trên nút mở, panel Lịch sử (dev-20)

| Nhận xét | Sửa |
| --- | --- |
| Nút "Lịch sử" viền xanh sau khi đóng panel. | `ShellPresentation.openedByKeyboard` ghi lúc mở lớp đầu tiên (sự kiện hiện tại là phím, hoặc không có sự kiện = trợ năng/test); `dismiss(returnFocus:)` chỉ trả focus và bơm `focusEpochs` khi đó. Chuột mở → đóng xong không ring. |
| Lịch sử liệt kê phiên trống, hàng chọn ba tín hiệu, hàng cao không đều, thiếu thời gian, chân là link. | `QuickHistory.records` lọc phiên có nội dung; `SessionRow` hai dòng cố định (tiêu đề + `relativeTime`, dòng mờ: trao đổi gần nhất / bản nháp / tên model / Đang xử lý), phiên hiện tại dấu chọn mảnh + semibold, highlight `surface-hover`; chân "Xem tất cả lịch sử →" là `vznQuiet` với `TrailingIconLabelStyle`. Thư viện dùng cùng `SessionRow`. |

## Vòng 10 — popover "Cấu hình model" (dev-27)

NSPopover hệ thống gộp ô nhập ID model (thừa từ khi ô tìm panel model nhận ID gõ tay) với hướng dẫn phiên
và thư viện chỉ dẫn (ô một dòng, picker hệ thống, hai nút xám, tiêu đề lặp).

| Phần | Thay đổi |
| --- | --- |
| `InstructionsPanel` (ComposerPanels.swift) | Lớp `ShellOverlay.instructions`, neo tại "+" (mở từ hàng "Chỉ dẫn cho phiên" nhóm Suy luận của panel "+", qua `.viezanOpenInstructions`). `ComposerEditor` tới 8 dòng, áp dụng tức thì qua `setSystemPrompt`; danh sách `SavedPrompt` bằng `PanelRow` (dấu chọn khi text trùng chỉ dẫn đang dùng), "Lưu thành chỉ dẫn mới…" mở ô tên tại chỗ (Return lưu, Escape huỷ), "Xoá chỉ dẫn đã lưu" có Hoàn tác (lưu lại). |
| Panel "+" | Hàng `instructions` (icon text.quote) ghi tên chỉ dẫn đang dùng hoặc "Không"; "+" `soft` khi phiên có chỉ dẫn. |
| Bỏ | `ModelPicker.configuration`/`full`, nút "Cấu hình model" ở chân panel model, `PromptLibrary` (picker hệ thống), chuỗi `modelIDHint`, `selectPrompt`; `configureModel` giữ cho panel nổi Launcher. |
| Chuỗi | `noInstruction`, `instructionsHint`, `savePromptAs`, `promptSaved`, `promptDeleted`. |
| Test | `composerToolsFollowTheSession` thêm hàng chỉ dẫn. |

## Còn lại

Ghim model; phím tắt mở panel; huy hiệu khả năng (ảnh, suy luận) trên hàng; menu hệ thống còn ở Dịch
(ngôn ngữ, loa) và panel nổi Launcher (DisclosureGroup "Cấu hình model"). Chưa kiểm chứng bằng mắt: lớp
Chỉ dẫn neo tại "+", ô soạn nở theo dòng, focus vào ô tên khi Lưu thành chỉ dẫn mới. Chưa kiểm chứng bằng mắt: menu với ba nhà cung cấp cùng lúc, nhóm thiếu khoá, VoiceOver đọc
Section.

## Kiểm tra

`swift build` PASS; `swift test` 39 + 59 PASS; `generate-resources --check` (3 locale, 53 metric),
`native.json` hai bản giống nhau; `documentation.mjs` PASS.
