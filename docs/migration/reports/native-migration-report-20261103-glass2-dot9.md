# Liquid Glass 2.0 · Đợt 9: Từ điển vẽ lại và lớp Nghe (macOS)

- **Ngày:** 2026-11-03
- **Nhánh:** `develop`, làm tiếp trên Đợt 1–8 (chưa commit). Không commit.
- **Nguồn:** [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4; mục 5 "Từ điển · bản vẽ lại" và "Lớp Nghe".
- **Board:** Dictionary-Empty, Dictionary-Entry, Dictionary-Redesign-States, Overlays-Listen.

## Kiểm tra trước

- Có báo cáo Đợt 8.
- Board `Dictionary` và `Dictionary-States` đã gỡ khỏi repo và canvas; đợt này không dùng chúng làm nguồn.

## Đã làm

Chỉ áp dụng cho preset Glass. Các preset khác giữ nhánh cũ.

| Phần | Thay đổi | File |
| --- | --- | --- |
| Ô tra | Capsule `.field` cao 52, còn 44 khi đã có mục từ hoặc đang tra; chữ `sectionScale`. Bên trong ô: kính lúp, nút ngữ cảnh tròn 36 (tô nhấn khi bật) và "Tra từ ↩" là nút chính (đang tra thì thành Dừng đỏ). Dòng ngữ cảnh 40 mở dưới ô: nhãn caps, ô nhập, đếm n / 500, nút ×. Lúc trống có câu hỏi "Bạn muốn tra từ gì?" và dòng gợi ý "↩ Tra từ · Từ cần tra tối đa 120 ký tự." | `Workspaces.swift` |
| Trạng thái trống | Hai danh sách phẳng kiểu Trang chủ: "Tra cứu gần đây" (5 mục) và "Từ đã lưu" (phiên được đánh dấu yêu thích). Mỗi danh sách có nhãn caps, liên kết "Xem tất cả lịch sử" / "Mở thư viện"; hàng 48 gồm từ đậm, cặp ngôn ngữ, nghĩa ngắn, rồi thời gian hoặc nút nghe; rê chuột thì hiện lens. Chỉ một danh sách có dữ liệu thì nó chiếm cả cột; cửa sổ hẹp còn một cột. | `Workspaces.swift`, `ViezanApp.swift` (thông báo `viezanOpenLibrary`) |
| Mục từ | Headword 30 kèm loa. Bên phải: Lưu từ (sao màu ấm khi đã lưu, có toast), Dịch, Hỏi AI. Dòng phiên âm mono 14, chip loại từ, chip cặp ngôn ngữ. Dòng "Theo ngữ cảnh: “…”" khi có ngữ cảnh. Seg có số đếm: "Ý nghĩa · n", "Ví dụ · m". Mỗi nghĩa: số mono, nghĩa 16 semibold, phiên âm, chip, loa, giải nghĩa; một ví dụ tách thành câu (14) và bản dịch mờ (13); dòng "SẮC THÁI"; cụm thường gặp. Tab Ví dụ có nghe và sao chép từng câu. Chân mục từ: model, Sao chép (toast), Tra lại. | `HomeWorkspace.swift` (`DictionaryResultView`) |
| Đang tra | Headword hiện ngay, chip "Đang tra…" và 4 vạch chờ. | `Workspaces.swift` |
| Lớp Nghe | `ListenPanel` dùng chung, rộng 360:<br>• Mỗi nguồn một hàng 48; hàng đầu là lens, ↩ để đọc.<br>• Đang đọc: sóng 4 vạch, "Đang đọc · n ký tự", Đọc lại, Dừng đỏ.<br>• Lỗi: khối đỏ nhạt kèm liên kết "Mở Cài đặt › Giọng nói".<br>• Chân: Giọng + "Đổi"; seg tốc độ 0,75–1,5× ghi vào `voiceRate`, mờ khi nhà cung cấp không hỗ trợ.<br>Đã bỏ mục "Nhà cung cấp nhận dạng giọng nói" khỏi lớp này. | `NativeKit.swift` |
| Nút loa | Dịch: nút loa ở chân mở lớp, khi đang đọc thành pill "Đang đọc" có sóng, bấm là dừng. `ListenSpeakerButton` cho Từ điển (headword), AI Chat (cùng hàng Sao chép) và Phiên dịch (từng câu, qua trình phát riêng của phiên dịch): bấm là đọc ngay; chuột phải hoặc ⌥-bấm mở lớp. | `Workspaces.swift`, `NativeKit.swift`, `InterpretationWorkspace.swift` |
| Sửa lỗi mất dữ liệu | Ô ngữ cảnh chỉ ghi khi giá trị thật sự đổi và chỉ ghi vào phiên đang hiện; khi đổi phiên thì bỏ focus. Xem mục Kiểm chứng. | `Workspaces.swift` |

Chuỗi mới (VI / EN / JA), `npm run resources` đã chạy, hai `native.json` đồng bộ:

- **Từ điển:** `dictionaryAsk`, `dictionaryAddContext`, `dictionaryContextLabel`, `dictionaryContextLine`, `dictionaryNuance`, `dictionaryRelated`, `dictionaryHeadword`, `dictionaryMeaningN`, `lookupAgain`, `openLibrary`.
- **Toast lưu từ:** `wordSavedToast`, `wordUnsavedToast`.
- **Lớp Nghe:** `readingNow`, `readingCount`, `readAgain`, `voiceShort`, `rateShort`, `changeVoice`, `openVoiceSettings`.

Không sửa domain, không sửa test.

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ swift build            (apps/macos)
Build complete! (0,29 giây)
$ swift test             (apps/macos)   — chạy sau thay đổi cuối cùng
✔ Test run with 49 tests in 7 suites passed after 19.415 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.094 seconds.
```

### Lỗi phát hiện khi nghiệm thu (đã sửa phía view)

Trong lượt chụp đầu, phiên tra "serendipity" bị mất kết quả: `revision` tăng từ 1 lên 8 và `output` thành rỗng.

- **Nguyên nhân:** `WorkbenchStore.setDictionaryContext` luôn tăng `revision` và xoá `output`, kể cả khi ngữ cảnh không đổi. Khi ô ngữ cảnh đang mở và có focus mà đổi sang phiên khác, ô ghi lại giá trị của nó vào phiên mới.
- **Cách sửa trong view:** thêm hàm `setContext`, chỉ ghi khi giá trị khác và đúng phiên đang hiện; bỏ focus khi đổi phiên.
- **Kiểm lại:** tái hiện đúng kịch bản cũ (bật ngữ cảnh rồi chọn phiên gần đây); `revision` giữ 1 và kết quả còn nguyên.
- **Phía domain:** cần thêm `guard` như `setDraft`. Đã ghi vào BACKEND-GAPS #21 vì đợt này không được sửa domain.
- **Dữ liệu:** dữ liệu preview đã được trả từ bản sao lưu chụp trước khi kiểm; checksum `98c72214…` khớp.

## Nghiệm thu bằng ảnh

Ảnh nằm ở [`glass2-dot9/`](glass2-dot9/):

- **Đặt cạnh board:**
  - `compare-dictionary-empty-1280-light.png`
  - `compare-dictionary-entry-1280-light.png`
  - `compare-listen-light.png`
- **Ảnh app, sáng và tối:**
  - Từ điển trống ở 1280 và 820.
  - Mục từ ở 1280 và 820.
  - Lớp Nghe ở Dịch.
  - Thêm `app-light-1280-dictionary-context.png`: dòng ngữ cảnh đang mở.

Cách chụp:

- Sao lưu `workbench.json` trước khi kiểm, rồi mở mục từ đã có bằng cách bấm vào danh sách "Tra cứu gần đây".
- Bản tối: đặt tạm chế độ tối, chụp xong chép trả bản sao lưu.
- Không gọi AI nào.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Chưa chụp: đang tra, không tìm thấy, tab Ví dụ, lớp Nghe đang đọc / lỗi, nút "Đang đọc", loa trong AI Chat và Phiên dịch. | Cần gọi AI hoặc phát âm thanh thật. Không giả lập dữ liệu. |
| Không có tab "Từ liên quan" và trạng thái "Không tìm thấy". Dòng ngữ cảnh chưa ghi "nghĩa 01 được xếp trước". | Schema từ điển chưa có các trường này (BACKEND-GAPS #1, #3, #4). Giao diện để chỗ sẵn; seg tự thêm tab khi có dữ liệu. |
| Chân mục từ chưa có thời gian tra ("1,4 giây") và "lưu trên thiết bị". | Task chưa lưu thời lượng (#5). |
| Lớp Nghe chưa có bước "Đang tạo giọng…". Hàng nguồn ghi tên nhà cung cấp giọng, chưa ghi tên giọng theo ngôn ngữ ("Kyoko"). Chưa có nút "Đọc bằng giọng hệ thống" khi lỗi. | #7, #8, #23. Nguồn đang đọc do view tự nhớ (#6). |
| Lớp Nghe ở Từ điển / AI Chat / Phiên dịch mở bằng popover hệ thống (có mũi tên); ở Dịch là lớp `.float` của workspace. | Chỉ màn Dịch có sẵn hệ thống lớp nổi của workspace. Popover vẫn chứa đúng nội dung `ListenPanel`. |
| AI Chat đọc câu trả lời theo ngôn ngữ giao diện. | Chưa có nhận dạng ngôn ngữ cho câu trả lời (#22). |
| Nút ngữ cảnh chưa có phím ⌘⇧C; dòng gợi ý phím không nhắc ⌘⇧C và "⌘V dán rồi tra ngay". | Thêm phím tắt mới là đổi hành vi; prompt không cho đổi phím tắt. |
| Ô tra dùng chữ 16 (`sectionScale`); board ghi 17. Nút "Dịch" giữ nhãn hiện có (board ghi "Dịch cả câu"). | Không có token 17. Không đổi chuỗi đã có. |
| Seg ghi "Ý nghĩa · n" (board "Nghĩa · n"). | Giữ chuỗi `dictionaryMeaning` hiện có. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, Reduce Transparency.
- Phát âm thanh thật qua lớp Nghe (hệ thống và đám mây), đổi tốc độ khi đang đọc.
- QtTest: đợt này không đụng tới Qt.
