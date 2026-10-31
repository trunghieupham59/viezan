# Native code 46 — Cài đặt (2026-10-28)

## Chạy thật trước khi sửa (macOS, v52)

Đi qua 10 mục (`evidence/native-settings-46/*-before.jpg`):
- Mô tả lặp hai lần ở Model AI local, Tiện ích Chrome, Dữ liệu, Cập nhật (phụ đề trang + đoạn đầu khối).
- Chung: các quyền Micro/Ghi màn hình/Trợ năng chỉ có nút "Mở", không cho biết đã cấp hay chưa.
- Model AI local: không cho biết Ollama/LM Studio/llama.cpp có chạy không; ô chọn kéo hết chiều ngang.
- Tiện ích Chrome, Dữ liệu: form rời, không nằm trong thẻ; thời hạn token là ô số tự do (spec 7/30/90/365).
- Giới thiệu, Cập nhật: không có phiên bản.

## Thay đổi (SwiftUI)

| Mục | Thay đổi |
| --- | --- |
| Chung | Nhãn "Đã cấp"/"Chưa cấp" cho từng quyền, đọc lại khi app được kích hoạt |
| Model AI local | Thẻ "Dịch vụ AI cục bộ" theo kết quả dò (số model khi chạy), nút tải Ollama khi chưa có; thẻ "Cấu hình runtime" (máy này, song song, ngữ cảnh — ô chọn vừa nội dung; nút khởi động tắt khi chưa cài Ollama); mục "Model đã tải" + câu trống |
| Tiện ích Chrome | Trong thẻ; hàng "Máy chủ cục bộ" (địa chỉ · model) + nhãn "Đã bật"/"Đã dừng"; thời hạn token 7/30/90/365; mô tả chỉ ở phụ đề trang (sheet ở Dịch mọi nơi vẫn giữ mô tả) |
| Dữ liệu | Trong thẻ; ô chọn vừa nội dung; bỏ mô tả lặp |
| Cập nhật | Hàng "Phiên bản" (`CFBundleShortVersionString (CFBundleVersion)`); bỏ tiêu đề/mô tả lặp |
| Giới thiệu | Thẻ "Viezan": Phiên bản, Mã nguồn (GitHub) |
| Chuỗi | 11 khoá mới VI/EN/JA |

## Chạy thật sau khi sửa (macOS, v53–v54)

- Chung: Micro "Đã cấp", Ghi màn hình "Chưa cấp", Trợ năng "Đã cấp" — khớp quyền thật của bản ký.
- Model AI local: cả ba runtime "Không chạy" (máy này không cài Ollama/LM Studio), có nút tải Ollama;
  "Chưa có model nào trên máy.".
- Cập nhật: "Kiểm tra cập nhật" gọi GitHub Releases → "Bạn đang dùng bản mới nhất." (2.4.2).
- Tiện ích Chrome: "Bật bridge" → nghe `127.0.0.1:39875` (yêu cầu không token trả 401), "Dừng" → đóng cổng.
- Không chạy: tạo token (lưu vào keychain sẽ hỏi mật khẩu), xuất/nhập bản sao lưu (hộp thoại tệp),
  tải model, khởi động runtime; Qt chưa đổi.

## Kiểm tra

`swift test` 31 + 38; Qt 102/102; domain 11; `generate-resources --check`; `documentation.mjs`.
