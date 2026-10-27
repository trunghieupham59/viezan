# Foundation shell 28 — kiểm rộng panel ở JA/dark

2026-10-27. Workflow native-migration/sync-docs; skills viezan-native-migration,
viezan-native-ux; rules native-migration/viezan-product-engineering.
Phạm vi foundation, chưa làm Trang chủ.

## Kết quả đợt này

Không sửa runtime trong đợt này: chưa tái hiện được lỗi tràn/cắt control mới trong
các trạng thái được kiểm. Đây là đợt xác minh sau Shell 26–27, không phải tuyên bố
đã hoàn thiện toàn bộ giao diện theo Electron.

Chạy lại renderFoundationLocaleWidthThemeMatrix: PASS, 276 ảnh VI/EN/JA ×
light/dark × 640/820/1200/1440, tiêu đề dài và reading text size large. Test kiểm
vị trí các native toolbar buttons trong cửa sổ, height 36pt, titlebar riêng,
accessible expanded state của các trigger. Đã xem trực tiếp JA/dark ở 640pt:
Commands, History, Activity running/retry, Library, Settings, Translation; thêm
History/Activity/Library ở 820pt. Không xem thủ công từng ảnh trong 276 ảnh.

- [Bảng lệnh 640](evidence/foundation-shell-28/swift-ja-dark-640-commands.png):
  nút đóng, search và dòng navigation dài vẫn nằm trong panel.
- [Lịch sử 640](evidence/foundation-shell-28/swift-ja-dark-640-history.png):
  trailing edge neo đúng trigger, footer mở thư viện còn thấy.
- [Activity retry 640](evidence/foundation-shell-28/swift-ja-dark-640-activity-retry.png):
  title hai dòng, Open/Retry nằm trong panel.
- [Thư viện 820](evidence/foundation-shell-28/swift-ja-dark-820-library.png):
  nút Open ghim đáy, preview dài cuộn trong vùng riêng.
- [Settings 640](evidence/foundation-shell-28/swift-ja-dark-640-settings.png):
  bố cục compact dùng section picker, phần còn lại trong vùng cuộn.

Các ảnh là NSWindow fixture không key; selection List xám không chứng minh trạng
thái selection khi app đang active. Không thay ngôn ngữ/màu hoặc draft của user.

## Gates và giới hạn

- Render/layout matrix PASS; check:docs và git diff --check PASS.
- Không chạy lại suite hành vi/Atomic/Design/build: không sửa production source;
  kết quả Shell 27 vẫn là bằng chứng trước đó, không tính là lượt chạy mới.
- Không refresh README review record vì README không đổi và mô tả vẫn đúng.
- Log có cảnh báo sandbox chặn dịch vụ spell/grammar macOS. Không dùng kết quả
  render làm bằng chứng cho Japanese IME hoặc spellchecking thực tế.
- Full-screen, VoiceOver, hover/focus trong app thật chưa kiểm thêm ở đợt này.
  Visual acceptance còn mở, chưa đánh dấu foundation hoàn tất.

## Kiểm thủ công tập trung (không cần gửi chat)

1. Mở preview, ghi lại ngôn ngữ/theme hiện tại; chọn 日本語 và Dark trong Settings.
   Thu cửa sổ xuống nhỏ nhất. Kiểm toggle/titlebar không nhảy hàng.
2. ⌘K: gõ tiếng Nhật bằng IME, dùng mũi tên chọn ứng viên rồi Enter xác nhận.
   Khi còn composing, Enter không được chạy lệnh. Escape đóng bảng lệnh;
   focus phải trở lại control đã mở nó.
3. ⌘⇧H: gõ tìm kiếm, thử mũi tên/Enter; bấm すべての履歴を見る. Cuộn preview
   dài và kiểm nút 開く còn ở đáy. Bấm Back để về phiên cũ; draft không đổi.
4. Mở 実行状況, dùng Tab/Shift-Tab: focus đi qua các action đang có, không biến
   mất ngoài panel; Escape đóng. Không cần tạo tác vụ mới chỉ để kiểm layout.
5. Rê chuột qua các mục sidebar enabled/disabled. Bật VoiceOver nếu muốn kiểm
   trợ năng: tên nút sidebar/search rõ, mục disabled được đọc đúng. Thử ở 820pt,
   rồi khôi phục locale/theme trước kiểm. Ghi lại bước/ảnh nếu có lệch.
