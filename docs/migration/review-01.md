# Review 01 — bằng chứng và giới hạn

Ngày 2026-10-26. Thiết kế chưa được người dùng nghiệm thu.

## Mở bản thiết kế

- [Canvas editable](https://www.figma.com/design/AXNXvFbXPr5CK1K5Vjhz6b?node-id=4-619)
- [Prototype bắt đầu từ Chat](https://www.figma.com/proto/AXNXvFbXPr5CK1K5Vjhz6b?node-id=4-619)
- [State ledger](figma-state.json) để sửa đúng node trong lượt tiếp theo.

| Màn hình | Node | Kích thước | Visual QA |
| --- | --- | --- | --- |
| Mac Chat + hoạt động | 4:619 | 1440 × 900 | Đã xem screenshot, sửa text sizing |
| Mac Dịch dark | 4:698 | 1440 × 900 | Đã xem, sửa màu control dark |
| Windows Chat | 4:780 | 1440 × 900 | Đã xem, sửa chrome overflow |
| Linux Qt | 4:859 | 1440 × 900 | Đã xem, sửa chrome overflow |
| Compact | 4:938 | 820 × 900 | Đã xem screenshot |
| Lỗi/thử lại | 4:987 | 1440 × 900 | Đã xem, sửa trạng thái Chat đã lưu |

Structural audit cuối: cả 6 root không có descendant vượt bounds parent.
Có 256 text layer editable, 68 component instances trên 6 screen; không raster hóa UI.
Hai collection với 45 variable (primitive + semantic/geometry), 28 text styles,
4 action components. Neutral control dark có override gắn semantic variable.

Discovery: không có Code Connect trong repo; file mới trống. Đã tìm macOS library:
Push Button có metric 24, không khớp contract review 32; xây action components riêng
với semantic tokens, không quảng cáo các component đó là control native đã chạy.
SF Pro trên Mac; Noto Sans fallback trong specimen Windows/Linux vì Segoe UI không
có trong font inventory. Typography native cuối cùng phải nghiệm thu trên OS thật.

## Luồng bấm và phạm vi

33 node có reaction được kiểm tra qua API, target tồn tại. Chat -> Dịch -> Tác vụ ->
Lỗi -> Thử lại/Mở công việc là luồng minh họa. Retry chuyển tới frame kết quả mẫu,
không thực hiện network. Windows/Linux/compact dẫn tới luồng chung trên Mac;
chúng là visual specimens, chưa có đủ luồng riêng theo nền tảng.
Control không có reaction là tĩnh. Chưa chạy thử click trong trình phát Figma bằng
browser automation. Chưa có form nhập liệu, persistence, native keyboard/IME,
screen reader, model picker, cancellation hoặc actual background execution.

## Kiểm tra repo

- PASS: check:agent — 36 JSON, 246 references.
- PASS: test:docs — 13 tests.
- PASS: check:atomic, check:design; không thay presentation code hiện tại.
- PASS: diff whitespace ở repo chính và submodule viezanagent.
- PASS: YAML frontmatter/naming/description/scaffold kiểm tra bằng js-yaml có sẵn.
- BLOCKED: quick_validate.py thiếu PyYAML ở cả Python hệ thống và bundled runtime;
  dùng validator thay thế nêu trên, không tuyên bố script Python đã pass.
- NOT PASS: check:docs báo review stale (sourceSha256). Repo có source edits đồng
  thời ở Applications/file actions ngoài scope. Không ghi docs:review để ký duyệt
  source chưa được review. README prose vẫn mô tả Electron; migration pack chỉ là
  nội bộ nên không thêm claim native đã phát hành.
- NOT RUN: native build/tests, TypeScript/full test/build/test:web — nhiệm vụ chỉ
  thêm hướng dẫn và thiết kế, không đổi runtime. Các source edits đồng thời không
  được tính là thay đổi hoặc kiểm thử của nhiệm vụ này.

## Plugin

Figma cài và kết nối xác nhận qua thao tác tạo/read/write. Cập nhật sau bàn giao:
Product Design đã được cài, phiên Codex xác nhận skills sẵn sàng; chưa chạy audit
bằng plugin này. Không cài
thêm toolchain/MCP Xcode hoặc Qt trước khi có project và spike cần chúng.

## Góp ý nghiệm thu

Ghi node, điều chưa phù hợp và hành vi mong muốn. Ưu tiên: mật độ, khả năng nhận biết
việc đang chạy, chuyển module, reading width, dark contrast, compact navigation.
Chấp nhận thiết kế không tương đương chấp nhận runtime hay phát hành.
