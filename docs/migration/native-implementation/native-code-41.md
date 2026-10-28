# Native code 41 — dò nguồn AI: local + cloud, ưu tiên cái đang có (2026-10-28)

Yêu cầu: app dùng chung AI cloud và local, **tự ưu tiên AI đang có trên máy**, không
cố định một lõi. Trước đây mọi phiên mới dùng `ollama:llama3.2` dù máy không có Ollama.

## Hành vi

- **Dò nguồn** (`ProviderDiscovery` — Swift `ViezanDomain/ProviderDiscovery.swift`,
  Qt `ProviderDiscovery.{h,cpp}`): local Ollama → LM Studio → llama.cpp (model đã tải,
  qua loopback) rồi cloud OpenAI → Claude → Gemini có key (`CredentialStore.has`, không
  đọc giá trị). Chạy khi mở app, khi lưu/xoá key, khi runtime bật/tắt, sau tải/xoá model
  và khi bấm "Kiểm tra lại".
- **Công bố từng phần**: kết quả local và trạng thái có-key công bố ngay; danh sách
  model cloud cập nhật sau (có thể chờ mạng hoặc hộp thoại keychain macOS). Trước lần
  dò đầu, trạng thái là `unknown` và không cảnh báo.
- **Model ưu tiên**: model dùng gần nhất còn chạy được; nếu không, provider đầu tiên
  theo thứ tự trên, với cloud chọn model chat nhanh (`gpt-4.1-mini`, `claude-haiku-4`,
  `gemini-2.5-flash` …); bỏ qua model embedding/speech/image.
- **Áp dụng** (giữ quy tắc chọn model theo hội thoại): phiên chưa có kết quả (không
  tin nhắn, không output, không chạy, không phải phiên so sánh) tự chuyển sang model ưu
  tiên — Qt qua lệnh domain `adoptModel`, không kích hoạt tự dịch nên không phát sinh
  phí; phiên đã có nội dung giữ model và dòng báo đưa nút "Dùng <model>". Phiên mới dùng
  model ưu tiên.
- **Dòng báo** (`ProviderNotice` / `Kit.ProviderNotice`): không có nguồn nào → hướng
  dẫn + "Mở Model AI local" / "Mở Nhà cung cấp AI"; model không dùng được → lý do
  (AI cục bộ chưa chạy / chưa có API key / model chưa tải) + "Dùng …" hoặc mở đúng mục.
  Chip model có chấm đỏ; Trang chủ hiện trạng thái thật của model đang dùng và "xử lý
  trên thiết bị" / "xử lý qua cloud".
- **Lỗi cụ thể**: AI cục bộ không trả lời → `providerOffline` (trước: `providerError`
  / `providerNetworkError`); tải danh sách model thiếu key → `providerMissingKey`.

## Chạy thật (macOS, 2026-10-28)

- Máy không có Ollama/LM Studio/llama.cpp; có key Claude trong keychain của bản macOS.
- Bản build mới phải xin quyền đọc keychain (ảnh `keychain-prompt.jpg`); trước khi sửa,
  cả lượt dò chờ hộp thoại → không có trạng thái. Sau khi sửa, trạng thái local hiện ngay.
- Sau khi người dùng cho phép: Dịch (phiên chưa có kết quả) tự chuyển sang
  `claude:claude-haiku-4-5-20251001`; Chat (đã có hội thoại) giữ model và hiện
  "Dùng Claude · claude-haiku-4-5-20251001". Dịch thật thành công, usage 516/32 token.
- Qt (chạy trên Mac): keychain riêng `com.viezan.native.qt.providers` chưa có key và
  không có runtime → "Chưa có AI nào dùng được…" đúng. Windows/Linux: NOT RUN.

## Kiểm tra

`swift test` 30 + 23 (mới: ưu tiên/khả dụng, chỉ chuyển phiên chưa có nội dung, không có
nguồn, mã lỗi offline); Qt `ctest` 94/94 (mới: snapshot, `adoptModel`, dòng báo theo
snapshot và nút "Dùng"); domain 11; `generate-resources --check`. View chỉ tự dò khi
provider tự động bật, để test không chạm keychain/cổng thật.

## Còn lại

Trạng thái key trong Cài đặt › Nhà cung cấp AI, test thật Chat/Từ điển/So sánh, nhóm
Ảnh, Giọng nói & Phiên dịch, Dịch mọi nơi & Launcher, Ứng dụng & Nhiệt độ, Giới thiệu.

## Lượt 2 — trạng thái key và test thật Lõi AI (2026-10-28)

| Phần | Thay đổi |
| --- | --- |
| Cài đặt › Nhà cung cấp AI (Swift + Qt) | Danh sách 8 provider: tên, mục đích (chat/dịch/từ điển, giọng nói, tìm kiếm web, giọng đọc), trạng thái "Chưa có key" / "Đã có key · N model" (xác minh bằng danh sách model, miễn phí) / lỗi cụ thể (vd. key bị từ chối); "Kiểm tra lại". Lượt dò lưu mã lỗi listing (`failures`). Qt đệm danh sách key (không gọi `secret-tool` mỗi lần vẽ). Ô chọn provider Qt hiện tên thay ID |
| `StatusBadge` (Swift) | Accent chỉ cho trạng thái sẵn sàng/đang chạy; idle trung tính, lỗi màu danger |
| Từ điển (Swift + Qt) | Chấp nhận JSON bọc ```` ```json ```` / văn bản quanh JSON (Claude bọc dù prompt cấm); output được chuẩn hoá về JSON trước khi lưu; JSON hỏng → `providerInvalidResponse` (trước: lỗi không mã). Prompt nói rõ mã ISO đích, mọi phần giải nghĩa viết bằng ngôn ngữ đích |
| So sánh (Swift + Qt) | Thay ô gõ ID model cách nhau dấu phẩy bằng danh sách chọn 2–3 model từ kết quả dò, có ô lọc, chọn sẵn model hiện tại; mở sẵn khi bật popover; tiêu đề cột dùng nhãn model |
| Nhãn model | Bỏ đuôi ngày phát hành (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`); ID đầy đủ ở tooltip |

Chạy thật trên macOS (key Claude + OpenAI có sẵn, đã xác minh 14 / 142 model):

- Chat (chat mới tự dùng Claude Haiku 4.5): trả lời markdown đúng, 150/267 token.
- Từ điển "serendipity": **lần đầu thất bại** (JSON bọc markdown, không mã lỗi) → sửa → lần hai
  thành công, nghĩa chính tiếng Việt, tab Ý nghĩa/Ví dụ, 265/1016 token.
- So sánh Haiku 4.5 vs Haiku 5.5: hai tác vụ song song hoàn tất. Haiku 4.5 lần này giữ nguyên câu
  kỹ thuật (request đúng en→vi — hành vi model, không phải lỗi app).
- Mỗi bản build macOS mới phải xin quyền keychain một lần (chữ ký ad-hoc khác nhau).

Kiểm tra: `swift test` 31 + 24, Qt 95/95, domain 11, `generate-resources --check`.
Ghi chú QA: ảnh chỉ chụp vùng cửa sổ app (`screencapture -l` hoặc `-R`), không chụp toàn màn hình.
