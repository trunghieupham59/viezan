# Native code 44 — Dịch mọi nơi (Dịch nhanh) & Launcher (2026-10-28)

## Chạy thật trước khi sửa (macOS, v38)

- ⌥T có chạy nhưng **không đọc được vùng chọn**: bản ký mới chưa có quyền Trợ năng, và trang
  Dịch mọi nơi không cho biết trạng thái quyền (chỉ có nút "Thiết lập").
- Panel Dịch vùng chọn khác spec: cửa sổ 760×779 gần trống, phải bấm Dịch, nút "Mở lại", ô nhập
  model ID thô; spec là chỉ báo nhỏ cạnh con trỏ, tự dịch, thay tại chỗ
  (`evidence/native-everywhere-44/before-quick-panel.jpg`).
- Launcher là panel tiện ích có tiêu đề với ô nhập + vài nút; spec là cửa sổ tìm nổi kiểu Spotlight.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| Dịch nhanh (SwiftUI) | `QuickTranslate.swift`: ⌥T lấy vùng chọn (Accessibility), tự dịch, **thay tại chỗ**; chỉ báo nổi không lấy focus cạnh con trỏ cho từng trạng thái (đang lấy / đang dịch / đã thay / không có chữ / thiếu quyền / lỗi). Không thay được → thẻ bản dịch (Sao chép, Mở trong Dịch). Ứng dụng không cho đọc vùng chọn → `SelectionClipboard` sao chép bằng ⌘C rồi trả lại clipboard; thẻ có "Dán thay vùng chọn" |
| Cặp ngôn ngữ riêng | `QuickTranslatePreferences` (Swift) / `quickTranslate` + lệnh `quickTranslatePrimary`/`quickTranslateSecondary` (Qt): chữ đã ở ngôn ngữ chính → ngôn ngữ phụ; chọn ngôn ngữ phụ làm chính thì đảo cặp; mặc định = ngôn ngữ đích trang Dịch. Nhận diện: NaturalLanguage (Swift), theo hệ chữ (Qt `TextLanguage.h`) |
| Trang Dịch mọi nơi | Hàng quyền Trợ năng "Đã cấp"/"Chưa cấp" (đọc lại khi app được kích hoạt) + "Mở Cài đặt hệ thống"; hàng Ngôn ngữ chính/phụ; hàng Model chỉ đọc. Qt: thêm ba hàng tương ứng |
| Qt panel | Có vùng chọn thì tự dịch theo cặp ngôn ngữ |
| Launcher (SwiftUI) | `Launcher.swift`: cửa sổ nổi không viền 760, cách đỉnh 22%, nhận bàn phím không kích hoạt cửa sổ chính, ẩn khi mất focus; nhóm Máy tính/Tiền tệ/Gần đây/Ứng dụng/Tệp/"Dùng … với" (Hỏi AI, Dịch, Tra từ điển, Google); footer gợi ý phím; ↑↓ ↵ ⇧↵ ⌘↵ ⇥ Esc. `LauncherRanking` xếp ứng dụng. Dịch/Tra từ điển mở trang chính và gửi ngay; Hỏi AI mở Chat nhanh đã gửi câu hỏi |
| Tìm tệp | Bỏ thư mục phụ thuộc/build (`node_modules`, `DerivedData`…); chỉ dùng Spotlight, không tự quét Desktop/Documents/Downloads |
| Chuỗi | 19 khoá `quick*`/`permission*` (VI/EN/JA); `generate-resources.mjs` đưa các khoá `launcher_*` sẵn có vào tài nguyên native |

## Lỗi tìm thấy khi chạy thật và đã sửa

- Quyền Trợ năng bật mà app vẫn "Chưa cấp": mục cũ trong Trợ năng gắn với chữ ký ad-hoc
  (cùng bundle ID) nên không khớp bản đã ký; macOS không thêm mục mới. Người dùng xoá mục cũ rồi
  cấp lại → giữ được qua các bản build sau (chữ ký cố định).
- Chỉ báo cao 858 pt rồi 0 pt: đo `fittingSize` với `sizingOptions` mặc định/tắt. Sửa: đo bằng
  `sizeThatFits` trên một view mới dựng theo trạng thái hiện tại (view sống chưa vẽ lại kịp).
- Thẻ kết quả bị cắt: `ScrollView` không có chiều cao lý tưởng → bỏ, giới hạn 12 dòng.
- Launcher: phím mũi tên bị ô nhập AppKit nuốt (`onKeyPress` không nhận) → bắt ở cấp cửa sổ
  (local event monitor); `onSubmit` giữ closure cũ nên ↵ chạy dòng đầu → đọc dòng chọn lúc nhấn
  phím; kết quả tệp về sau làm đổi dòng chọn ngầm → nhớ theo id; tệp rác trong `node_modules`;
  tiêu đề nhóm viết hoa cả chữ người dùng gõ.
- Tìm tệp dự phòng quét Desktop → hộp thoại quyền thư mục của macOS hiện giữa lúc gõ và làm
  Launcher đóng → bỏ phần quét dự phòng.

## Chạy thật sau khi sửa (macOS, v41–v49)

- TextEdit: câu tiếng Anh → tiếng Việt thay tại chỗ trong ~1–2 s, TextEdit giữ focus; ⌘Z trả lại câu
  gốc. Ngôn ngữ phụ = Tiếng Anh: câu tiếng Việt → tiếng Anh; câu tiếng Nhật → tiếng Việt.
- Safari (trang thử riêng): không đọc được vùng chọn qua Accessibility → sao chép dự phòng, thẻ
  "Bản dịch sang Tiếng Việt" + "Dán thay vùng chọn"; "Sao chép" ghi bản dịch vào clipboard, đóng thẻ,
  Safari giữ focus. Không chọn chữ → "Không có văn bản được chọn." rồi tự ẩn.
- Launcher: phép tính → ↵ sao chép kết quả và đóng; "note" → ứng dụng Notes + tệp; ↓ chọn "Dịch" +
  ↵ → trang Dịch "good evening" → "Chào buổi tối."; Hỏi AI → Chat nhanh trả lời; Esc ô trống và bấm
  ra ngoài đều ẩn.
- Ảnh: `evidence/native-everywhere-44/` (chỉ cửa sổ app và trang thử).
- Sự cố trong lúc QA: một lần ⌘A rơi vào tab YouTube đang mở của người dùng trong Safari, nội dung
  trang bị gửi đi dịch. Đã dừng ngay, xoá hai phiên đó khỏi lịch sử; sau đó chỉ gửi phím khi đã
  xác minh cửa sổ phía trước là cửa sổ thử.

## Chưa làm / chưa chạy

- Qt: Launcher giữ bản cũ; Dịch nhanh Qt chưa chạy trên Windows/Linux (chỉ test đơn vị + trang trên Mac).
- Launcher: chế độ Hỏi AI trong cùng cửa sổ, bộ chọn loại tiền; phím tắt toàn cục ⌥Space chưa thử
  (đang tắt mặc định), chỉ mở bằng nút Launcher.
- Dịch nhanh: "Dán thay vùng chọn" chưa thử trên ô sửa được thật (trang thử chỉ đọc).

## Kiểm tra

`swift test` 31 + 36 (thêm cặp ngôn ngữ, mặc định/lưu, xếp hạng launcher); Qt 102/102 (thêm cặp ngôn
ngữ + nhận diện theo hệ chữ); domain 11; `generate-resources --check`; `documentation.mjs`.
