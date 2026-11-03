# Liquid Glass 2.0 · Đợt 3 — Dịch, Từ điển, Phiên dịch (macOS)

Ngày 2026-11-03 · nhánh `develop`, trên Đợt 1–2 (chưa commit) · không commit.
Nguồn: [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Dịch",
"Phiên dịch", "Từ điển"; board Translate, Translate-Compact, Dictionary,
Interpret, Interpret-Summary, Overlays-Language, Overlays-Interpret.

## Kiểm tra trước

- Báo cáo Đợt 2 có: [native-migration-report-20261103-glass2-dot2.md](native-migration-report-20261103-glass2-dot2.md).
- Bề mặt lớp nổi (`ReadingPanelSurface`, `.float`) và `PanelRow` của Đợt 2 dùng
  được cho picker. Đợt này dùng lại cả hai.

## Cách làm lớp nổi

Picker ngôn ngữ, Tuỳ chọn dịch, menu Nghe, So sánh mô hình, thiết lập phiên
dịch, menu ✦, Xuất bản ghi và Các phiên trước giờ là lớp nổi `.float` neo vào
nút mở. Chúng dùng cùng bề mặt và hàng với ModelPanel, có các hành vi sau:

- Bấm ra ngoài hoặc nhấn Escape thì đóng.
- Panel tự lật lên trên nút khi phía trên còn nhiều chỗ hơn.

Lớp nổi do chính workspace vẽ, qua `floatingLayers` và `layerAnchor` trong
`Workspaces.swift`. Không thêm case vào `ShellOverlay` và không sửa
`ViezanApp.swift`, nên đợt này không phải đụng file ngoài danh sách.

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| Hàng ngôn ngữ | Pill kính 32 dạng `Đầu vào · Tiếng Anh ▾`, nút đảo là vòng kính, chip model ở bên phải. Picker có ô tìm (không phân biệt dấu); các nhóm Tự động nhận dạng (chỉ ở đầu vào) · Gần đây (lấy từ các phiên gần nhất) · Tất cả; cột phải là tên bản ngữ (English, 日本語…); mục đang chọn là lens kèm ✓; ↑↓ ↩ dùng được. Dùng chung cho Dịch, Từ điển và Phiên dịch. | `Workspaces.swift`, `InterpretationWorkspace.swift` |
| Dịch | Pane nguyên bản là `.field` bo 16; pane bản dịch phẳng; ở cửa sổ hẹp hai pane xếp dọc và bản dịch thành thẻ. Footer nguồn có đếm ký tự, Xoá và "Dịch văn bản" chính kèm keycap ⌘↩. Footer bản dịch có ngôn ngữ, "← Dùng làm nội dung gốc", rồi So sánh, Nghe và Sao chép là kính. Nút "Thông thường ▾" mở Tuỳ chọn dịch dạng hàng cài đặt: tự động dịch, thời gian chờ, mức suy luận (seg), văn phong, thao tác. | `Workspaces.swift` |
| So sánh mô hình | Bước 1 chọn model: model đang dùng khoá làm "Cột đầu"; các model còn lại nhóm theo nhà cung cấp, có checkbox và mã model mono; có ô lọc; chân ghi "Đã chọn n / 3", Huỷ, "So sánh n model". Lần sau nhớ bộ đã chọn (`@AppStorage`). Bước 2 kết quả: tiến độ, chip từng model, "Đổi model" quay về bước 1, seg Theo cột / Theo câu; mỗi cột có chip trạng thái, chữ khác cột đầu được tô nhạt, "Chọn bản dịch này", sao chép, Dừng hoặc Thử lại; dòng Bản dịch ghép ở chân. | `ComparisonPane.swift` |
| Từ điển | Ô tra 36 (kính lúp, chữ căn giữa) xếp trên ô ngữ cảnh 32, "Tra từ" chính đứng bên phải, rồi một vạch. Kết quả theo cột 760: headword 28 kèm "Lưu từ"; dòng phiên âm mono, chip "ngôn ngữ · từ loại", loa, nút kính Dịch / AI Chat; seg Ý nghĩa / Ví dụ; nghĩa đánh số `01 02` mono, ngăn bằng vạch, có "Chi tiết và ví dụ"; thẻ Ví dụ phẳng. | `Workspaces.swift`, `HomeWorkspace.swift` (`DictionaryResultView`) |
| Phiên dịch | Thanh phiên: chip "Đang nghe · mm:ss", nút "Microphone ▾" mở lớp thiết lập (seg nguồn âm, chọn thiết bị), level meter 7 vạch, "Phụ đề nổi" kính, Dừng đỏ hoặc "Bắt đầu phiên dịch" chính; bên dưới là một vạch. Bản ghi: "Bản ghi" + seg + ✦ (lớp nổi) + "Xuất bản ghi ▾" (lớp nổi: Sao chép, TXT…, SRT…, Dừng đọc). Mỗi hàng có giờ mono, người nói, nguyên bản 13 mờ, bản dịch 14, các hàng ngăn bằng vạch. Thẻ Tổng hợp có tab ở đầu cột bản ghi. Panel phải 280: Phiên này (nút Tổng hợp rộng hết thẻ), Bản ghi của bạn (TXT / SRT chia đôi), Các phiên trước (lớp nổi có tìm, hàng lens, nút xoá đỏ, Hoàn tác). Nút Lịch sử ở header mở cùng lớp đó. | `InterpretationWorkspace.swift` |
| Phụ đề nổi | Cửa sổ không viền, kéo được bằng nền: thẻ tối bo 20 gồm "người nói · giờ", Dừng, Đóng, nguyên bản mờ và bản dịch 18 semibold. | `InterpretationWorkspace.swift` |
| Nút "+" composer Chat | Lens trắng nổi trong capsule, khớp Chat-Active (còn treo từ Đợt 2). | `ImageControls.swift` |
| Chuỗi mới | `languageSearch`, `compareChooseTitle`, `compareChooseHint`, `compareInUse`, `compareFirstColumn`, `compareSelected`, `compareRun`, `compareChange` (VI/EN/JA). | `resources/locales/*.json`, 2 × `native.json` |

Preset Graphite / Paper / Corporate / Midnight giữ nguyên nhánh cũ: `LanguageMenu`,
popover hệ thống, ComparisonPane một màn, bố cục Phiên dịch cũ.

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ node --test scripts/native/__tests__/generate-resources.test.mjs
ℹ pass 2 · ℹ fail 0
$ swift build            (apps/macos)
Build complete! (0,29 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.279 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.096 seconds.
```

Hai `native.json` giống hệt nhau. Không phải sửa test nào.

## Nghiệm thu bằng ảnh

Bản dev, macOS (Darwin 27.2), dữ liệu thật. Đã đổi Sáng → Tối rồi trả lại
Sáng. Ảnh nằm ở [`glass2-dot3/`](glass2-dot3/), thu 50 %:

- `compare-translate-1280-light.png`, `compare-translate-820-light.png`,
  `compare-dictionary-1280-light.png`, `compare-interpret-1280-light.png`: board | app.
- Lớp nổi: `app-light-1280-{lang-source,options,compare,interp-history,interp-setup,interp-export}.png`.
- `app-{light,dark}-820-*`, `app-dark-1280-{translate,dictionary,interpret,lang-source}.png`.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Chưa chụp: kết quả Từ điển có mục từ, bảng kết quả So sánh, thẻ Tổng hợp khi đang tạo, phiên đang nghe, phụ đề nổi. | Muốn có các trạng thái này phải gọi AI hoặc micro thật. Phiên Dịch / Từ điển đang mở trên máy chưa có kết quả; tôi không chạy tác vụ để chụp. Code đã build, test xanh. |
| So sánh tối đa 3 model (board ghi 4); chưa có nhóm "Gợi ý"; danh sách gồm mọi model chat đã phát hiện. | `WorkbenchStore.compare` chỉ nhận 2–3 model; không đổi dịch vụ. Nhóm gợi ý cần quy tắc chọn mới. |
| Tuỳ chọn dịch: thời gian chờ dùng stepper (board là seg 500 / 800 / 1,5 s); hàng Mức suy luận xuống dòng vì nhãn "Trung bình" dài. | Giữ khoảng 100–5000 ms hiện có; nhãn lấy từ chuỗi đã có. |
| Menu Nghe chỉ có Nghe, Dừng đọc, nhà cung cấp; chưa có nghe nguyên bản, tốc độ, giọng. | Đó là chức năng mới, không thuộc đợt này. |
| Chip model của Phiên dịch vẫn là menu hệ thống (bên trong có danh sách model và "Tuỳ chọn ghi âm"). | Phiên dịch giữ model riêng cho phiên; `ModelPanel` gắn với phiên Chat / Dịch. |
| Lớp nổi do workspace vẽ, không phải `ShellOverlay`; đóng xong chưa trả focus về nút mở. | Để không phải sửa `ViezanApp` / `NativeFoundation`. Có thể chuyển sang shell ở một đợt sau nếu anh/chị muốn. |
| Phiên dịch chưa có chip "Đã dừng · mm:ss" khi không ghi âm; header "Tổng hợp" chưa mở menu ✦. | Cần chuỗi mới / sửa header ngoài danh sách; menu ✦ nằm ở thanh bản ghi. |
| Thẻ "Phiên này" vẫn dùng tiêu đề ngày 15 đậm và nhãn đầy đủ của model. | Giữ nội dung và chuỗi hiện có. |
| Phụ đề nổi rộng 760 (board 640) và nền là surface-raised tối 90 % (board 78 %). | Không có token 640 / 78 %; dùng cột đọc và màu lớp nổi tối. |
| `LanguageMenu` (NativeKit) không còn được Glass dùng. | Các preset khác vẫn dùng; để nguyên. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, 640×480, Reduce Transparency / Increase Contrast
  trong app đang chạy; IME trong ô tra Từ điển.
- QtTest (Đợt 7).

## Ghi chú vận hành

- Trong lúc chụp Đợt 2 / 3, cột sidebar đã bị chuyển sang thu gọn; tôi đã mở lại
  (`navigationCollapsed = false`, như lúc bắt đầu).
- Chế độ Sáng đã được khôi phục. App dev được thoát êm rồi dựng lại vài lần.
- Một lệnh xoá ảnh tạm trong scratchpad bị bộ kiểm tra an toàn chặn; không có gì
  bị xoá.
