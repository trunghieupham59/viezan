# Plugin và công cụ hỗ trợ

Kiểm tra ngày 2026-10-26:

| Công cụ | Trạng thái | Mục đích |
| --- | --- | --- |
| Figma | Đã cài, whoami/create file thành công | Editable UI, variables/components, review |
| Product Design | Đã cài; phiên Codex xác nhận plugin và skills sẵn sàng | Audit flow và khám phá prototype tùy chọn |
| Browser control | Có sẵn trong phiên Codex | Nghiệm thu web preview hiện tại |
| Xcode/MCP | Chưa cấu hình trong nhiệm vụ này | Chỉ bổ sung khi có project SwiftUI |
| Qt toolchain | Chưa cài trong nhiệm vụ này | Bổ sung ở spike Qt theo OS |

Cơ chế hiện có chỉ mở đề xuất cài plugin; không thể xác nhận đã cài khi người dùng
chưa hoàn tất kết nối. Không cài thêm plugin trùng chức năng chỉ để tăng số lượng.
Không thêm MCP command chạy @latest vào config dùng chung. Khi cần MCP local:
xác minh nguồn chính thức/maintainer, pin version, scope quyền và smoke-test tools.
Không lưu token cá nhân vào repo. CLI build/test trực tiếp là fallback hợp lệ.

Figma: https://developers.figma.com/docs/figma-mcp-server/
OpenAI workflow: https://learn.chatgpt.com/use-cases/figma-designs-to-code
Playwright: https://github.com/microsoft/playwright-mcp (web, không thay native QA).

## Quy trình dùng Product Design

Khi audit bản review đã có, đọc skill `product-design:audit`, chụp/đọc bằng chứng
giao diện trước rồi ghi vấn đề theo màn hình và bước thao tác. Khi muốn khám phá
hướng thiết kế mới, dùng `product-design:ideate`; không tự thay bản đã nghiệm thu.
Figma tiếp tục giữ component, token và màn hình editable; Product Design hỗ trợ
đánh giá luồng và phương án. Việc cài plugin không có nghĩa đã chạy audit.
