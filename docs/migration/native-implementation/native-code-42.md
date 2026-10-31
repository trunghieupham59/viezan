# Native code 42 — nhóm Ảnh: đính kèm, OCR, dịch ảnh, tạo ảnh (2026-10-28)

## Thay đổi (Swift + Qt)

| Phần | Thay đổi |
| --- | --- |
| Tạo ảnh | Tự dùng provider vẽ được mà máy có key: provider của phiên nếu là OpenAI/Gemini, không thì OpenAI → Gemini có key. Không có → `imageProviderMissing` (trước: `providerInvalidResponse`/`imageError` sai nghĩa). Model tạo ảnh lấy từ danh sách tài khoản (dò): model ảnh đã chọn, không thì model `gpt-image-*` / `*image*` (không `imagen`) mới nhất, ưu tiên bản không "mini", cuối cùng mới dùng giá trị mặc định. Chip chế độ ghi "Tạo hình ảnh · OpenAI/Gemini" hoặc "chưa có key" |
| Ảnh không có chữ đi kèm | Không gửi khối text rỗng cạnh ảnh — Claude trả HTTP 400 cho khối text rỗng (lỗi thật: dịch ảnh không gõ chữ luôn thất bại) |
| Mã lỗi | HTTP 400/404/413/415/422 → `providerRejected` (trước: gộp vào `providerNetworkError`). Yêu cầu có ảnh bị từ chối/không dùng được → `imageModelUnsupported`; dịch ảnh không trả vùng hợp lệ → `imageModelUnsupported` |
| Lời giải thích của nhà cung cấp | `ProviderRejection` / `CloudProtocol::errorMessage`: đọc tối đa 16 KB thân lỗi, giữ `error.message` (≤300 ký tự); lưu `errorDetail` trên task, hiện dưới thông báo lỗi (Chat, Dịch/Từ điển, So sánh, panel dịch nhanh); xoá khi thử lại |
| Chụp màn hình (macOS) | Kiểm tra quyền Ghi màn hình trước (`CGPreflightScreenCaptureAccess`), xin quyền và báo `capturePermission` thay vì im lặng |
| OCR | Không có chữ → `ocrNoText`. Qt (OCR qua model) ánh xạ từ chối → `imageModelUnsupported` |

## Chạy thật (macOS, key Claude + OpenAI)

- **Dịch ảnh** (ảnh `test-sign.png`, Claude Haiku 5.5): lần đầu **thất bại** (khối text rỗng) →
  sửa → thành công: ảnh dịch vẽ lại, danh sách câu gốc/dịch, Tải xuống; 607/1306 token. Lớp tô
  nền còn để lộ chút nét chữ gốc ở dòng màu xanh (chất lượng hiển thị, ghi nhận).
- **OCR trên máy** (Apple Vision): ba dòng chữ vào bản nháp Chat; ảnh trắng → rỗng (nay báo
  `ocrNoText`). Đường gửi ảnh trong Chat dùng chung với dịch ảnh (đã chạy thật).
- **Tạo ảnh**: chế độ Tạo ảnh với model chat Claude → chip "· OpenAI". Lần đầu **thất bại**
  HTTP 400 (model ghi cứng `gpt-image-1`) → chọn model từ danh sách tài khoản → thành công.
  Chi tiết lỗi (`errorDetail`) mới kiểm bằng unit test, chưa thấy trong một lỗi thật.
- Thao tác menu SwiftUI qua bàn phím từ automation không ổn định; hộp chọn tệp hệ thống chạy
  ngoài tiến trình. Không chạy: quyền Ghi màn hình khi bị từ chối, Gemini, Qt với key cloud,
  Windows/Linux.

## Kiểm tra

`swift test` 31 + 28 (mới: provider tạo ảnh, mã lỗi ảnh, `ProviderRejection.message`, chọn
model ảnh); Qt 97/97 (mới: provider tạo ảnh, lỗi ảnh + `errorDetail`, `errorMessage`,
`imageModel`); domain 11; `generate-resources --check`.
