# macOS 27 · Liquid Glass · Review 02

Ngày: 2026-10-26. Trạng thái: **prototype thiết kế để nghiệm thu**, chưa triển khai
SwiftUI/AppKit. Đây là đề xuất native, không thay đổi hành vi Electron đã phát hành.

## Mở bản nghiệm thu

- [Prototype cục bộ](macos27/index.html): mở trực tiếp trong trình duyệt, không cần build.
- Khi máy chủ preview đang chạy: <http://127.0.0.1:8765>.
- [Figma · page 02](https://www.figma.com/design/AXNXvFbXPr5CK1K5Vjhz6b?node-id=13-70).
- [Node ledger và các liên kết chưa nối](macos27-figma-state.json).

Muốn mở lại preview bằng HTTP, chỉ phục vụ thư mục prototype:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory docs/migration/macos27
```

Figma đã tạo 9 màn hình module, semantic color variables, text styles SF Pro,
glass effect style và instance Window Controls/Switch từ thư viện **macOS 27**.
Starter MCP quota chặn ngay lần chụp kiểm tra đầu tiên. Do đó **Figma còn dở**:
chưa visual QA, chưa nối hotspot, chưa có 8 nhóm Cài đặt và các cửa sổ phụ.
Không coi các frame đó là bản đã nghiệm thu. Review 01 được giữ nguyên.
Nguồn dựng nằm trong [figma-src](macos27/figma-src/); không chạy lại nguyên bộ
trên canvas đã có. Dùng ledger, đọc canvas và sửa từng node khi tiếp tục.

## Ngôn ngữ thiết kế

- Kính ở điều hướng, toolbar, lớp nổi; nội dung dài có nền ổn định. Sidebar hấp thụ
  sắc nền nhẹ, viền sáng và bóng mềm. Không đặt kính ở mọi thẻ nội dung.
- Chữ hệ thống macOS, phân cấp rõ, icon từ registry hiện tại của Viezan. Dấu `v`
  là monogram tạm trong prototype, không phải quyết định đổi nhận diện thương hiệu.
- Xanh cho thao tác chính và lựa chọn; đỏ cho dừng, đặt lại và xác nhận xóa.
- Điều hướng chính độc lập với lịch sử Chat; bản compact dùng rail 60, lịch sử
  mở từ header. Composer một bề mặt, luôn nhìn thấy ở cửa sổ thấp.
- Sáng/tối, giảm trong suốt và mẫu chiều rộng 820 có công tắc nghiệm thu.
- Tab hoạt động phía dưới là **đề xuất đa nhiệm**, chưa phải tính năng đã phát hành.
- Cài đặt native được đề xuất chia theo mục; hiện trạng Electron là trang dài
  có mục lục/scrollspy. Không tuyên bố hai cách tổ chức giống nhau.

Tham khảo [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
và [Modernize your AppKit app, WWDC26](https://developer.apple.com/videos/play/wwdc2026/289/).
Figma GLASS và CSS backdrop-filter chỉ mô phỏng ý đồ thị giác; không chứng minh
độ khúc xạ, chuyển động, hiệu năng hoặc hành vi vật liệu macOS thật.

## Phạm vi đã dựng

| Hiện trạng/spec | Prototype Review 02 | Figma |
| --- | --- | --- |
| home | Bắt đầu nhanh, tiếp tục, model, phím tắt | 14:94 |
| chat | Hội thoại, empty, composer, lịch sử, chọn model, lỗi/thử lại | 14:232 |
| translate | Hai cột, ngôn ngữ, giọng điệu, so sánh, ảnh, lịch sử | 14:357 |
| interpret | Bản ghi song ngữ, nguồn âm thanh, dừng/bắt đầu, tóm tắt, phụ đề | 14:474 |
| dictionary | Tra từ mẫu, phát âm, ví dụ, lưu từ | 14:589 |
| everywhere | Vùng chọn, quyền Trợ năng, Chrome bridge, dịch nhanh | 14:701 |
| apps | Danh sách, chi tiết, preview gỡ/reset, mục được bảo vệ, nhật ký | 14:821 |
| thermal | Cảm biến, quạt, profile, quy tắc, helper, hiệu chuẩn | 14:954 |
| utilities | Phím tắt, Launcher, Quick Chat | 14:1078 |
| settings | Chung, Giao diện, Mô hình AI, Giọng nói, Chat, Module, Cập nhật, Giới thiệu | Chờ quota |
| shell / overlays | Bảng lệnh, hoạt động, quyền, provider, update, rename/delete | Chờ quota |

Đây là độ phủ **các module và luồng đại diện**, không phải mọi tổ hợp trạng thái,
mọi trường cấu hình nhà cung cấp, hay bộ màn EN/JA hoàn chỉnh. Thermal rules,
calibration, Chrome setup và provider settings là các sheet định hướng, cần
chi tiết hóa theo hợp đồng nền tảng trước khi code. Mobile vẫn ngoài phạm vi.

## Thao tác thật trong prototype

Điều hướng; lọc danh sách lệnh/model/app; nhập và giữ draft Chat khi chuyển module;
gửi tin nhắn mẫu; chọn model mẫu; Quick Chat giữ draft sau khi đóng; chuyển sáng/tối;
đổi cỡ chữ; giảm trong suốt; bật/tắt lựa chọn trong các form; lưu từ mẫu;
dừng/bắt đầu phiên mẫu; mở/đóng sheet và luồng xác nhận. Các trạng thái chỉ sống
trong bộ nhớ trang, tải lại sẽ reset. Nút có tác động AI/OS/clipboard/export trả
phản hồi minh họa hoặc mở sheet; không thực thi tác động đó.

Preset, màu nhấn, module toggles và ngôn ngữ trong form chỉ lưu lựa chọn mẫu,
chưa đổi toàn bộ giao diện. Không nhập khóa thật: trường khóa API bị disabled.
Không có request AI, analytics, filesystem, quạt, cài helper hoặc xóa dữ liệu.

## Bằng chứng và giới hạn nghiệm thu

- **Design:** đã xem render tất cả 9 module chính trong trình duyệt; đã kiểm tra
  phần Cài đặt bằng nội dung DOM của đủ 8 mục và screenshot Giao diện/Chung.
- **Prototype:** Chat → Dịch → Chat giữ đúng chuỗi draft; Quick Chat đóng/mở giữ
  đúng câu hỏi; dark và compact 820 hiển thị composer; sheet phụ đề và preview
  gỡ ứng dụng có nội dung/điều khiển; reduced transparency chuyển nền đặc.
- Đã sửa grid minimum-size làm footer/composer ra ngoài cửa sổ, reset scroll khi
  chuyển trang và sửa preview sáng/tối trong Cài đặt. Compact là khung 820 trong
  viewport trình duyệt, chưa phải thay kích thước cửa sổ macOS native.
- **Checks:** `node --check review.js`, `check:atomic`, `check:design`, `check:docs`
  và `test:docs` (13/13) đều pass. Atomic/design scripts không quét HTML prototype;
  đây không phải bằng chứng lint/kiểm thử runtime cho prototype.
- **NOT RUN:** build/full app tests (không đổi product source); VoiceOver thật,
  IME thật, EN/JA dài, độ tương phản đo số, OS permissions, khôi phục sau crash,
  concurrency/provider thật, hiệu năng/animation native. Theo acceptance.md,
  các tiêu chí runtime tương ứng vẫn chưa được nghiệm thu.
- **User acceptance:** chờ người dùng xem và góp ý. Không có trạng thái “đã duyệt”.

Ảnh: [Chat dark 820](macos27/evidence/chat-820-dark.png),
[phụ đề kính](macos27/evidence/subtitles-glass.png),
[nền đặc](macos27/evidence/home-reduced-transparency.png).

## Handoff triển khai

Giữ `src/styles/tokens.css` là nguồn production. File `source-tokens.snapshot.css`
là bản sao nguyên trạng tại thời điểm review để mở artifact độc lập; không chỉnh
tay và không import ngược vào app. `review.css` chỉ chứa art direction đề xuất,
không tạo theme runtime thứ hai. Icon SVG được xuất từ registry hiện tại.

Trước SwiftUI/AppKit: chốt hình ảnh với người dùng, chuyển vai trò màu/khoảng cách
sang token native có generator một chiều, dùng vật liệu và điều khiển hệ thống,
đặt ranh giới capability rõ cho quyền/helper. Thực hiện một luồng Chat → Dịch →
quay lại Chat có draft/stream thực trước khi nhân rộng toàn ứng dụng.

README sản phẩm hiện tại vẫn đúng: chỉ thêm artifact nội bộ, không phát hành
tính năng hoặc đổi phiên bản. Không cập nhật dấu review README để ghi nhận
prototype như hành vi đã ship.
