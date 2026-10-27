# Foundation shell 22 — titlebar và cửa sổ hẹp

2026-10-27. Workflow native-migration/sync-docs; skills viezan-native-migration,
viezan-native-ux; rules native-migration/viezan-product-engineering.
Scope F01–F08/UX05: foundation Swift, không nội dung Trang chủ.

## Đối chiếu và sửa

- Electron dành 80pt cho traffic lights và 60pt cho slot toggle. Swift trước đó
  đặt toggle 36pt ngay sau 80pt (tâm 98). Thêm gap token 12pt: tâm 110pt,
  khớp tâm slot Electron; vẫn giữ vùng bấm native 36pt và focus ring.
- Hàng logo Swift đang dùng chiều cao header workspace 56pt. Đổi về navControl
  40pt như brand row Electron, giúp search và navigation dịch lên 16pt.
- Heading nhóm dùng padding trên 12/bottom 4 từ token, thay 24/8. Mỗi nhóm
  giảm 16pt khoảng trắng; footer cố định, danh sách vẫn cuộn độc lập.
- Divider titlebar/header/sidebar dùng token Glass divider trên nền chrome đục.
  Nền tường minh tránh alpha mất nền trong ảnh test host (dark bị trắng).
- Bổ sung kiểm hình học control thực trong matrix: toggle trong titlebar, nút
  header phía dưới, toàn bộ controls trong bounds x/y; cập nhật phép tính test
  panel trừ cả titlebar 40 và header 56. Không thêm literal design value.

## Kiểm chứng

- Build và suite Swift PASS: 21 native tests chạy + 1 render failure test skipped;
  17 domain PASS. Matrix layout 276 ảnh EN/VI/JA × light/dark ×640/820/1200/1440.
  Failure render không chạy lại vì không sửa recovery/storage.
- Sau sửa nền divider, chạy lại riêng matrix layout và xem ảnh VI 640 overlay,
  JA dark 820, VI light 1200: PASS (276 renders, assertions x/y).
  [Ảnh macOS cuối](evidence/foundation-shell-22/macos-final.jpg),
  [640 overlay](evidence/foundation-shell-22/swift-vi-light-640-navigation.png),
  [820 dark](evidence/foundation-shell-22/swift-ja-dark-820-chat.png).
- Bản macOS thật ~1016×592pt: đã xem logo/search/nav mới, titlebar tách header,
  title truncate trước actions, draft cũ giữ nguyên. Không gửi request mới.
- Atomic/Design, resource freshness, check:docs và 13 docs tests PASS.
  README đã mô tả grouped Glass shell chính xác; chỉ thay spacing/divider nên
  không cần đổi mô tả tính năng hay tạo lại review record. Không chạy Electron/Qt build hoặc
  TypeScript vì không sửa các lớp đó. Không kiểm VoiceOver/IME lại trong đợt này.
- CUA kéo góc chưa thay đổi kích thước cửa sổ thực; 640/820 hiện là mounted
  fixture. Badge chia sẻ màn hình vẫn che traffic lights thật. Không coi các
  phần này là đã nghiệm thu, không tuyên bố pixel-perfect.

## Bạn kiểm tra các phần automation chưa xác nhận

1. Mở preview khi không có badge chia sẻ màn hình. Nhìn ba nút macOS: không đè
   toggle; toggle nằm ở titlebar trên cùng. Kéo vùng trống titlebar để di chuyển.
2. Kéo cửa sổ nhỏ nhất (640×480), rồi mở rộng khoảng 820pt. Bấm toggle: sidebar
   mở thành overlay; cuộn đến Tiện ích, Settings/footer vẫn nhìn thấy. Escape
   đóng overlay; tăng trên 900pt khôi phục sidebar theo preference trước đó.
3. Mở ⌘K, ⌘⇧H, ⌘⇧A; header và nút đóng không bị cắt ở cạnh dưới. Escape trả focus
   về nút mở. Không cần gửi chat hoặc thay bản nháp để kiểm tra.
4. Nếu kiểm VoiceOver/IME: bật VoiceOver, kiểm tên/disabled/expanded của navigation;
   nhập VI/JA đang composition trong ⌘K, Return chỉ commit chữ. Khôi phục input
   và VoiceOver sau thử. Đây vẫn là manual acceptance, không phải test đã chạy.
