# Foundation shell 23 — đợt controls titlebar/header

2026-10-27. Scope foundation Swift; chưa nội dung Trang chủ.
Workflow native-migration/sync-docs, skills viezan-native-migration/viezan-native-ux,
rules native-migration/viezan-product-engineering. Tiếp nối Shell 22.

## Đã sửa và đối chiếu

- AppKit borderless cell đặt icon sát mép trái pill mặc dù frame đã có khoảng
  rộng dự phòng. Thêm inset native cell khi vẽ icon/nhãn, giữ nguyên width và
  native keyboard/accessibility. Controls icon-only không nhận inset.
- Nút tạo mới dùng nền xanh đặc, chữ/icon action-fg. Màu header/titlebar lấy
  cùng palette Glass với shell; không còn lệ thuộc accent người dùng của macOS.
  Dùng solid action token, chưa tái tạo gradient action-fill của Electron Glass.
- Hover trên control titlebar/header có nền phản hồi; màu hover primary từ
  action-hover. Expanded vẫn dùng soft state. Disabled ưu tiên nền/chữ xám,
  không đổi theo hover và không nhận focus/activation.
- Các panel actions giữ semantics riêng (primary/destructive/neutral).
- Titlebar vẫn 40pt, toggle tâm 110pt, header 56pt; title dài truncate trước
  actions. Không thay đổi route, session, draft, compact preference hay Home.

## Một lượt kiểm thử cuối đợt

- Swift build PASS. 39 tests thực thi PASS (22 native +17 domain), 1 failure
  render test skipped vì không đổi storage/recovery. Bao gồm regression mới
  disabledShellPrimaryIgnoresHoverAndCannotActivate.
- 276 layout renders EN/VI/JA × light/dark ×640/820/1200/1440, kiểm geometry
  control trong window/titlebar/header. Đã xem VI light 640/1200 và JA dark 820.
- Atomic/Design, adapter freshness, check:docs, 13 docs tests, diff whitespace PASS.
- Bản package mở lại trên macOS; đối chiếu lề icon/label và primary action ở
  ~1016×592pt. Draft và session cũ giữ nguyên. Không gửi request hay tạo chat.
- Electron/Qt build và TypeScript Not run: chỉ Swift presentation và generated
  palette fields bổ sung (Qt không dùng fields mới). README vẫn mô tả đúng
  grouped Glass shell; không đổi tính năng hay làm mới review record.

Ảnh: [macOS thật](evidence/foundation-shell-23/macos-final.jpg),
[640 fixture](evidence/foundation-shell-23/swift-vi-light-640-chat.png),
[1200 fixture](evidence/foundation-shell-23/swift-vi-light-1200-chat.png).

## Giới hạn và kiểm thủ công

Không tuyên bố toàn bộ foundation đã đạt visual acceptance. Dùng SF Symbols,
solid primary và nền tint đục; không phải bản sao pixel-perfect Electron Glass.
Traffic lights vẫn bị badge chia sẻ màn hình che khi chụp. Cửa sổ thật đúng
640/820pt và VoiceOver/IME chưa được xác nhận trong đợt này; không lặp thao tác
resize automation đã không hiệu quả ở đợt trước.

1. Khi không chia sẻ màn hình, nhìn traffic lights/toggle: không đè nhau.
   Rê chuột lên toggle: có nền hover, ra ngoài: nền trở lại; kéo vùng titlebar
   trống để di chuyển cửa sổ, bấm toggle vẫn chỉ đổi sidebar.
2. Kéo cửa sổ nhỏ nhất 640×480: header hiển thị bốn icon, dấu cộng xanh đặc,
   không tràn mép. Mở sidebar, cuộn đến nhóm cuối: Settings/footer vẫn nhìn thấy.
3. Mở ⌘K/⌘⇧H/⌘⇧A rồi Escape: panel không bị cắt, focus trả về control mở.
   Không cần gửi chat hoặc sửa bản nháp. Thử lại khoảng 820pt và trên 900pt.
4. VoiceOver/VI–JA IME: theo hướng dẫn Shell 22; vẫn là manual acceptance,
   không suy ra từ ảnh render hay test composition giả lập.
