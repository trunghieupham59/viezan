# Foundation 13 — Swift/macOS theo Review 18

2026-10-27. Scope: foundation Swift, chưa Trang chủ. Workflow/rule native-migration;
skills viezan-native-migration, viezan-native-ux; sync-docs. UX07/UX08/UX09.
Đối chiếu ảnh cửa sổ thật với Review 18 history và workbench-ux.

## Đã triển khai và đối chiếu

- Sidebar dùng NSVisualEffectView sidebar material liền theo cửa sổ, bỏ khung
  glass card và hai divider thừa; Reduce Transparency dùng nền window đặc.
  Hàng navigation 32pt, gap 4pt từ token; tìm kiếm có bề mặt riêng và phím tắt.
- Toolbar AppKit vẫn là NSButton, đổi bề mặt thành capsule có viền nhẹ; Tạo mới
  accent soft, disabled có màu hệ thống, appearance đổi cùng light/dark.
  Focus ring có mask theo capsule và trạng thái AX phản ánh first responder.
- History/Commands/Activity dùng nền đọc đục, radius/border/shadow thống nhất.
  Ảnh vòng đầu cho thấy bóng quá đậm; đã giảm alpha theo shadow-overlay token.
  Không dùng độ trong suốt để trang trí vùng đọc.
- Lịch sử dùng hàng chọn soft, title/snippet một dòng, tên mô hình mô phỏng bản
  địa hóa, ID không biết giữ nguyên. Footer Xem tất cả lịch sử là một hàng rộng,
  mũi tên bên phải. Library vẫn có preview/Open riêng.
- History lấy vị trí control toolbar, clamp panel vào cửa sổ; fallback cạnh phải
  nếu không tìm thấy anchor. Commands ở giữa, Activity bên phải.
- Picker ngôn ngữ không giãn hết cửa sổ ultrawide; dùng intrinsic width và
  ViewThatFits hiện có. Không đổi nguồn/đích hoặc bản nháp.

## Bằng chứng

[evidence/foundation-13](evidence/foundation-13/) có before.png,
final-light-history.jpg, final-dark-history.jpg, final-commands.jpg, logs.
Ảnh light cuối đã xem lại sau sửa focus; dark/commands chụp trước thay đổi mask
focus cuối, cùng bố cục/màu. after-history.jpg là vòng bóng quá đậm, không phải
kết quả cuối. Các tệp ảnh từ CUA giữ nguyên bytes (một số tên .png chứa JPEG).

CUA xác nhận light/dark, search focus khi mở, Escape đóng. Sau mở bằng click,
Escape rồi Space mở lại đúng History: xác minh keyboard focus còn trên nút.
AX dump sau Escape không in focused element, nên không ghi AX focus PASS chỉ
nhờ dump; mounted test xác nhận firstResponder và isAccessibilityFocused.
Đã trả appearance về System. Không thay đổi draft, dữ liệu provider hoặc nguồn
nhập hệ thống. Resize bằng drag CUA không đổi kích thước nên không tính PASS.

## Kiểm tra

- Swift build/package và 32 executed tests PASS, 0 fail/skip: 17 domain + 15 native.
- 144 layout + 48 failure render fixtures chạy lại trên source cuối trong
  /tmp/viezan-visual13-matrix và /tmp/viezan-visual13-failures. Render không
  thay bằng chứng toolbar/window/material thật.
- Test mới kiểm anchor/clamp ở 640/820/1200/1440; assertion đầu bị mismatch
  CGFloat/Double qua macro Swift Testing, đã cố định kiểu CGFloat và chạy lại.
- Resource freshness 3 locale/25 metrics; Node 10; docs 13; Atomic/Design;
  Biome generator và diff whitespace PASS.
- Qt build/tests không chạy lại: không đổi Qt runtime, chỉ thêm metric resource
  được consumers bỏ qua khi không dùng; Node xác nhận parity resources.
- Electron TS/build/web/full Vitest không chạy vì không đổi Electron source.
  Windows/Linux, release, VoiceOver speech và input-source IME không chạy lượt này.

## Chưa khớp đầy đủ

Chưa nghiệm thu toàn bộ Review 18. Native titlebar vẫn theo bố trí AppKit hiện
có, chưa khép vị trí toggle/chrome so với prototype. Material phụ thuộc nền và
appearance macOS; cần review cửa sổ thực ở các width/text sizes. Danh sách module
đầy đủ, Trang chủ và polish từng feature chưa nằm trong lượt foundation này.
