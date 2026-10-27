# Foundation — cổng hoàn tất trước Trang chủ

**Đợt hiện tại:** [Foundation shell 31](foundation-shell-31.md) — vòng Tab/Shift-Tab
trong bảng lệnh theo Electron, bảo vệ Japanese IME; test JA/dark trước sửa 4
failures, sau sửa suite 44 tests hành vi PASS; chưa Home.


Trạng thái **IN PROGRESS — đang triển khai UI/UX theo Review 18; chưa đạt visual acceptance**, 2026-10-27.
Ưu tiên đã được người dùng làm rõ: **UI/UX Viezan mới theo thiết kế trước**.
Test pass chỉ bảo vệ hành vi; không thay cho giao diện đạt thiết kế. Lượt
[Foundation 12](foundation-12.md) bắt đầu khép khoảng cách hình ảnh thực tế:
sidebar, toolbar, composer và panel; không chuyển sang Trang chủ.
[Foundation 13](foundation-13.md) tiếp tục ưu tiên Swift/macOS: sidebar liền,
toolbar bo tròn, panel đọc đục và lịch sử neo theo control.
[Foundation 14](foundation-14.md) chỉnh header theo cột sidebar, bỏ dải titlebar
thừa và giới hạn control/title ở cửa sổ hẹp.
[Foundation 15](foundation-15.md) tiếp tục sửa neo History, navigation overlay
compact và trạng thái expanded của các nút header.
[Foundation 16](foundation-16.md) thu gọn History theo kết quả, giữ footer và
vùng đọc thư viện ở cửa sổ hẹp; quay lại thư viện trả focus về History.
[Foundation 17](foundation-17.md) chỉnh mật độ Bảng lệnh và Activity co theo
nội dung, kiểm tra thêm tác vụ đang chạy ở width hẹp.

Đã tiếp tục theo yêu cầu người dùng từ [bàn giao](PAUSED-2026-10-27.md).
Source foundation hiện đã build mới trên macOS; không dùng pass baseline 04 để
xác nhận thay đổi này. Xem [Foundation 05](foundation-05.md) và [kiểm tra macOS Foundation 06](foundation-06.md),
[Foundation 07](foundation-07.md), [Foundation 08](foundation-08.md), [Foundation 09](foundation-09.md), [Foundation 10](foundation-10.md), [Foundation 11](foundation-11.md) và [hướng dẫn thủ công macOS](MANUAL-MACOS-FOUNDATION.md).

| ID | Tiêu chí nghiệm thu | Trạng thái hiện tại |
| --- | --- | --- |
| F01 | OS window controls; min 640×480; không overflow tại 640/820/1200/1440 | Qt có 24 tổ hợp runtime; Swift 276 layout fixtures EN/VI/JA × light/dark × 4 widths PASS; window/toolbar visual matrix thật chưa đủ |
| F02 | Navigation 236/60; logo/toggle riêng; preference qua route/relaunch | Triển khai cả hai; domain/Qt persistence và resize tests PASS; Qt click lại trang hiện tại giữ selected PASS |
| F03 | Dưới 900 luôn rail; expansion là overlay tạm; resize không ghi preference; chọn/Escape/outside đóng | Layout/preference PASS; Qt preedit/Escape, overlay exclusivity và resize đóng compact overlay PASS; CUA compact matrix còn thiếu |
| F04 | Toolbar cùng size, icon/accessible name; nav/history/activity/commands độc quyền, bounded, trả focus đúng opener | Sửa sizing/AX/focus, Qt dark icon contrast, fixed panel header và bounded history snippet; CUA outside dismiss PASS; AppKit first-responder round trip PASS; Swift search focus ring khôi phục; Qt 6 locale/theme rows resize/Escape trả focus PASS; Swift panel AX group và chuyển Commands→Activity focus Đóng CUA PASS; toàn bộ focus/VoiceOver matrix cần nghiệm thu thủ công |
| F05 | Command search EN/VI/JA không dấu; arrows/Return/Escape; shortcut; IME guard; không dead action | Palette/menu/shortcut và tìm không dấu PASS; AppKit marked text + Qt preedit/commit guards PASS; Qt phím gửi không hủy task đang chạy PASS; Return/keypad Enter + IME guards PASS cả Chat/Dịch; Undo/Redo và cách ly undo khi đổi phiên PASS; VI/JA IME thật chưa xác nhận do nguồn nhập automation không đổi |
| F06 | System type/palette; light/dark/system; Liquid Glass đúng chrome; Reduce Transparency; content đục | System dark → Auto live PASS cả hai; Swift Reduce Transparency nền đục PASS; Reduce Motion history/Escape smoke PASS; chưa đo animation timing |
| F07 | Storage error/retry/disable chính xác; navigation/dismiss giữ draft và task | Domain/mounted load/save PASS; Qt retry-control 12 tổ hợp PASS; Swift 48 failure renders light/dark (large text), rà banner/retry 640pt; cửa sổ thật/dark vẫn chưa đầy đủ |
| F08 | Mac close/reopen khác Quit; Qt save/quit; restore không gọi provider | CUA Mac Close/reopen PASS; AppDelegate giữ task khi Close, cancel Quit nếu save lỗi, interruption/restore PASS; CUA Swift Close/reopen đang stream giữ draft và tiếp tục phản hồi PASS; user acceptance còn chờ |

**Chưa chuyển sang Trang chủ.** Foundation chưa được đánh PASS toàn bộ và chưa
có user acceptance. Windows/Linux thật là cổng riêng, chưa chạy trên host này.

Chi tiết tiếp nối: [Foundation 18](foundation-18.md) chuẩn hóa nút Activity/library
và sửa vòng focus bàn phím trong Activity ở cửa sổ hẹp.

[Foundation 19](foundation-19.md) sửa trạng thái thư viện không có kết quả,
giữ search ổn định và bỏ thông báo rỗng bị lặp ở cửa sổ hẹp.

## Ma trận bắt buộc

- EN/VI/JA, light/dark và system theme live; width 640/820/1200/1440.
- Expanded/collapsed; resize qua breakpoint; relaunch; keyboard/focus/IME.
- Từng overlay, chuyển overlay, outside click/Escape; load/save failure.
- Chat/Translate/Settings navigation giữ session, draft, model và background task.
- macOS native và Qt trên macOS trước; Windows/Linux thật vẫn là gate riêng.

Chỉ đánh PASS khi có bằng chứng đúng source đã build. Ghi host, trạng thái, ảnh,
lệnh và giới hạn vào verification; cho người dùng review nền trước Trang chủ.

## Phạm vi chưa làm ở bước nền

Không triển khai nội dung Trang chủ, redesign hoàn chỉnh từng module, AI thật,
secure provider bridge, updater/tray/OS utilities hoặc mobile. Nền chỉ nối đúng
các route đã tồn tại, không thêm route/tác vụ giả để lấp thiết kế.
