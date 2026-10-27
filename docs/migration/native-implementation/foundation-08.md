# Foundation 08 — panel và lịch sử nhanh

2026-10-27. Tiếp tục UI/UX foundation, chưa chuyển sang Trang chủ.

## Thay đổi

- Swift: dùng chung ShellCloseButton với vùng bấm theo metric control, accessible
  name và tooltip bản địa hóa. Giữ focus ban đầu của Activity/navigation;
  Commands và History vẫn ưu tiên ô tìm kiếm.
- Qt: quick history có tiêu đề và nút đóng; Activity giữ header/nút đóng ngoài
  vùng cuộn. Nút đóng compact navigation dùng kích thước control và palette icon.
- Qt: hàng lịch sử nhanh expose AX Button. Đoạn trích gộp khoảng trắng/xuống dòng
  và elide một dòng; không sửa nội dung lưu. Màu chữ lấy palette của ItemDelegate
  để hàng chọn có tương phản đúng với nền highlight của control.

## Kiểm chứng

- Swift build/test PASS: 27 executed (17 domain + 10 native); 2 optional render
  tests skipped vì không bật biến môi trường screenshot. Đã đóng gói app mới.
- Qt build/CTest PASS: 66 passes = 64 scenarios + init/cleanup. Test mới mount
  QML tại 640×480, tạo 12 tác vụ giả lập trong thư mục tạm, cuộn Activity rồi
  xác minh nút đóng không di chuyển; đóng hai panel không đổi workspace.
  Draft nhiều dòng được kiểm tra thành snippet một dòng.
- CUA macOS: xem Commands Swift sau sửa và click Đóng; xem History Qt, click
  Đóng và xác minh popup biến mất. Ảnh thực tế phát hiện snippet nhiều dòng và
  màu chữ selected chưa đúng; đã sửa, build/test lại, khởi động lại và chụp lại.
- Không thêm literal màu/kích thước: tái sử dụng native palette và metric hiện có.
- Atomic/Design, contract Node và docs: log `checks.log` trong evidence.

Evidence: [foundation-08](evidence/foundation-08/). `qt-history-multiline-issue.jpg`
cho thấy lỗi trước sửa snippet/palette; `qt-history-after.jpg` là kết quả cuối.
`qt-canvas-before.jpg` không chụp được popup nên không dùng làm bằng chứng History.
Ảnh Swift Commands before/after cùng cây AX dismiss được giữ để đối chiếu.

## Giới hạn

Không coi AX focus cửa sổ là bằng chứng VoiceOver hoặc toàn bộ focus traversal.
Không chạy lại matrix render 144 trạng thái/24 lỗi lưu trong lượt này. Các bước
IME thật, VoiceOver speech, cửa sổ thật đủ widths/themes/locales và nghiệm thu
người dùng còn mở theo [hướng dẫn macOS](MANUAL-MACOS-FOUNDATION.md).
Không thay đổi cài đặt hệ thống trong lượt này. Không chạy Electron build,
TypeScript, web/full Vitest vì chỉ sửa native Swift/QML/C++ và tài liệu; Biome
không áp dụng các ngôn ngữ native này. Windows/Linux host acceptance còn riêng.
