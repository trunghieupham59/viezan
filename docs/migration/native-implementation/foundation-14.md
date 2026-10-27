# Foundation 14 — Swift header và cửa sổ hẹp

2026-10-27. Phạm vi foundation Swift/macOS, chưa Trang chủ. Đối chiếu
Review 18 `desktop-review/audit/review18-handoff/02-macos-history.png`.

## Thay đổi

- Header được bố trí theo cột navigation: toggle ở mép phải sidebar mở rộng,
  tiêu đề bắt đầu tại workspace. Rail/compact chừa vùng riêng cho nút cửa sổ
  native; không đặt toggle đè lên traffic lights.
- Bỏ toolbar tự sắp xếp của SwiftUI và dải titlebar trống phía trên. Giữ các
  nút cửa sổ của macOS; nền trống header hỗ trợ kéo cửa sổ.
- Nút header dùng NSButton với chiều cao 36pt, intrinsic width và padding từ
  metrics chung; bỏ bezel alignment insets để khung thực đồng nhất. Khi dưới
  900pt, History/New/Activity chỉ hiện icon; accessible name và shortcut còn
  nguyên. Tiêu đề một dòng, cắt cuối trước khi lấn các hành động.
- Chiều cao khả dụng của panel tính sau header; navigation overlay và các
  panel luôn nằm trong phần nội dung. Không ghi đè collapse preference khi resize.

## Kiểm chứng và giới hạn

- Build/package Swift PASS; 32 tests PASS (15 native + 17 domain). Ma trận 144 render EN/VI/JA, light/dark, 640/820/1200/1440,
  sáu trạng thái, cộng 48 render lỗi lưu trữ. Test đo khung NSButton đã mount:
  cao đúng token và không vượt cạnh cửa sổ. Đây là fixture, không phải ảnh cửa
  sổ người dùng và không thay thế nghiệm thu VoiceOver/IME.
- CUA mở bản build, đối chiếu header thật và dùng Window → Move & Resize →
  Top Left để kiểm tra cửa sổ nhỏ hơn. Kéo resize bằng CUA không ổn định, nên
  không ghi nhận kiểm tra thật ở chính xác 640/820pt chỉ từ thao tác đó.
- Các vòng ảnh đầu phát hiện dải titlebar thừa và nút kéo cao; đã sửa rồi chụp
  lại. Các nút đóng/thu nhỏ/phóng to vẫn do macOS quản lý, tọa độ dọc theo OS.
- Evidence cuối nằm ở `evidence/foundation-14/`; chỉ lưu một số ảnh đại diện,
  ma trận đầy đủ ở `/tmp/viezan-visual14-matrix` và `/tmp/viezan-visual14-failures`.
- CUA xác nhận click History → Escape trả focus về History (AX), Space mở lại.
  Đã dùng Return to Previous Size trả cửa sổ về kích thước trước kiểm tra.
- Atomic/Design, resource freshness và 13 docs tests PASS. Electron TS/build/web,
  Qt runtime, Windows/Linux không chạy lại vì lượt này chỉ đổi Swift foundation.

## Kiểm tra thủ công bổ sung

1. Mở `apps/macos/.build/Viezan Native Preview.app`, kéo hẹp tới 640pt và mở rộng
   qua 900pt. Tiêu đề dài được cắt cuối; bốn nút bên phải không chồng nhau.
2. Ở cửa sổ hẹp, bấm toggle: navigation là lớp tạm. Escape đóng; mở rộng lại
   phải giữ lựa chọn thu gọn trước đó.
3. Bấm History, gõ tìm kiếm, Escape rồi Space: mở lại History từ đúng nút.
4. Kéo vùng trống header để di chuyển cửa sổ; thử ba nút cửa sổ native. Bản nháp
   phải còn khi đóng/mở lại app. Không bấm tạo phiên mới để kiểm tra bản nháp.

Chưa đánh dấu toàn bộ foundation/Review 18 đã nghiệm thu; không triển khai Home.
