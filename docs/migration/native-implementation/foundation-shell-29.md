# Foundation shell 29 — điều hướng bảng lệnh và Japanese IME

2026-10-27. Workflow native-migration/sync-docs; skills viezan-native-migration,
viezan-native-ux; rules native-migration/viezan-product-engineering.
Không làm Trang chủ, không thay đổi session/draft/preferences của người dùng.

## Lệch đã sửa

Đối chiếu shell spec §6/§9: Electron quay vòng lựa chọn bằng ↑/↓, hỗ trợ Home/End
và chọn hàng khi rê chuột. Swift trước đây clamp chỉ số ở hai đầu, thiếu Home/End
và hover selection. Nay đồng bộ ba hành vi này. Chỉ search của bảng lệnh đăng ký
Home/End; search Settings/History giữ xử lý mặc định của native editor.

Mọi shortcut mới vẫn đi qua guard hasMarkedText: lúc Japanese IME đang ghép chữ,
coordinator trả false để native editor xử lý, không đổi lựa chọn lệnh. Không sửa
geometry/màu/font của các panel đã đối chiếu ở Shell 28.

## Kiểm thử

- Suite hành vi: 43 tests PASS (26 native thực thi +17 domain; 2 render tests
  skipped). Regression mới kiểm quay vòng đầu/cuối, 0/1 kết quả, Home/End sau
  composition và opt-in để không chặn hành vi field khác.
- Thêm một integration test sau suite: dựng NativeCommands thật bằng SwiftUI/
  AppKit, tiếng Nhật + dark, panel 376pt. End → Enter mở navigation; Down → Enter
  quay về chat; Up → Enter quay về navigation; Home → Enter về chat. PASS.
  Tổng cộng 44 tests hành vi khác nhau đã chạy trong đợt, không phải một suite
  duy nhất gồm 44 tests.
- Atomic/Design, generated resource freshness, check:docs, 13 docs tests và
  whitespace PASS. Build/package preview cập nhật. README và review record
  đồng bộ behavior mới.
- Không render lại matrix 276 ảnh: chỉ đổi lựa chọn/keyboard, không layout. Ảnh
  [JA/dark bảng lệnh 640pt từ Shell 28](evidence/foundation-shell-28/swift-ja-dark-640-commands.png)
  vẫn là ảnh trước đợt này, không được coi là ảnh kiểm hover mới.
- Không build Electron/Qt/TypeScript vì không sửa code của các runtime đó.
- Test native có log cảnh báo dịch vụ keyboard/macOS trong sandbox; không coi
  synthetic marked text là kiểm Japanese input source thực tế.

## Kiểm thủ công (2–3 phút)

1. Thoát bản preview cũ, mở package mới. Chọn 日本語 + Dark trong Settings,
   thu cửa sổ về nhỏ nhất. Mở ⌘K; không cần gửi chat hoặc thay draft.
2. Từ hàng đầu, bấm ↑: hàng cuối sáng; ↓ quay lại hàng đầu. Home/End (hoặc
   Fn+←/Fn+→ trên bàn phím Mac) chọn đầu/cuối. Chưa nhấn Enter nếu không muốn
   chuyển workspace. Escape đóng panel và trả focus về opener.
3. Mở lại, rê chuột qua từng hàng: hàng tô sáng phải đi theo chuột; Enter thực
   hiện hàng đang tô. Phần pointer này chưa tự kiểm bằng app thật trong đợt này.
4. Chuyển nguồn nhập Japanese, gõ にほん: khi còn marked text, ↑/↓/Enter dùng
   cho chọn ứng viên IME, không chạy lệnh. Xác nhận composition, thử lại ↑/↓.
   Escape khi đang composition phải ưu tiên IME, không đóng panel sớm.
5. Bật VoiceOver kiểm tên và trạng thái selected của hàng, sau đó khôi phục
   language/theme/input source ban đầu. VoiceOver và IME thật còn chưa xác minh.

Foundation vẫn IN PROGRESS; hành vi được bảo vệ thêm nhưng chưa visual/platform
acceptance toàn bộ.
