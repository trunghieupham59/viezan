# Bốn story sau bản 2.6.0

Thay đổi cục bộ trong checkout chính trên `develop`. Mốc đối chiếu CI là `3b14b195`. Các mục dưới đây ghi riêng kiểm tra với dữ liệu giả và nghiệm thu trên thiết bị.

## 1. Quạt macOS khi mất cảm biến đã chọn

Giữ quy tắc an toàn hiện hành. Nếu vòng điều khiển gặp mẫu thiếu cảm biến đích danh, ứng dụng dừng cấu hình, xoá mục tiêu đang hiển thị và đóng kết nối tới helper. Trang tiếp tục theo dõi nhiệt độ. Helper chịu trách nhiệm trả quạt về tự động sau khi ngắt kết nối.

`ThermalMonitor.swift` cho phép bài test cấp tiến trình xuất mẫu và kết nối helper giả. Đường chạy ứng dụng vẫn dùng trình đọc đi kèm và socket kiểm tra quyền như trước. Trong `FanControlStateTests.swift`, cảm biến được chọn báo 60 °C và helper xác nhận 3.000 RPM. Mẫu sau chỉ còn cảm biến khác ở 85 °C. Test kiểm tra đúng lỗi, hết cấu hình đang chạy, không có lệnh đặt RPM mới và kết nối đóng. Đã cập nhật spec Nhiệt độ và backlog. Chưa kiểm RPM trên quạt thật.

## 2. Dán ảnh vào Chat Qt

Phím Dán trên ô soạn Chat đọc PNG hoặc ảnh native từ clipboard. C++ kiểm dung lượng và kích thước ảnh, xử lý ảnh trên worker và gắn kết quả vào cuộc trò chuyện đã nhận lệnh dán. Các ảnh đang xử lý được tính trong giới hạn bốn ảnh. Dán văn bản đi qua trình soạn Qt như trước.

Các tệp chính là `Main.qml`, `WorkbenchBridge.{h,cpp}`, `Attachments.{h,cpp}` và `WorkbenchBridgeTests.cpp`. Ca test mới gửi phím Dán qua ô soạn: bản trước sửa nhận văn bản nhưng có 0 ảnh sau khi dán PNG. Bản sau sửa giữ đúng dữ liệu và kích thước ảnh, từ chối dữ liệu hỏng, giữ nguyên văn bản và đưa ba ảnh tiếp theo về đúng cuộc trò chuyện sau khi người dùng chuyển phiên. Bản nháp mới vẫn trống.

## 3. Ngữ cảnh Từ điển trên macOS

`WorkbenchStore.swift` giữ nguyên bản nháp theo phiên. `Workspaces.swift` hiện số ký tự và hướng dẫn dưới ô ngữ cảnh. Khi quá 500 ký tự, nút Tra cứu và Enter cùng bị chặn. Lần thử lại cũng kiểm độ dài của ngữ cảnh đã lưu trong yêu cầu.

Trước khi sửa, test trong `WorkbenchTests.swift` xác nhận setter bỏ toàn bộ lần dán quá giới hạn và vẫn cho gửi yêu cầu với ngữ cảnh cũ. Sau khi sửa, bản nháp 501 ký tự còn nguyên sau khi mở lại. Rút về 500 cụm emoji ghép cho phép gửi đúng nội dung. Ca sửa ngữ cảnh thành chính giá trị hiện tại vẫn giữ nguyên kết quả tra. Hợp đồng lưu trữ dùng chung đã cho phép khôi phục bản nháp dài, nên không cần đổi schema.

## 4. Dịch vụ quạt macOS chờ phê duyệt

`ThermalWorkspace.swift` hiện hướng dẫn và ba thao tác ngay trong thẻ. **Gỡ dịch vụ quạt** mở hộp xác nhận, **Mở Cài đặt hệ thống** mở phần cấp quyền, **Thử lại** đọc lại trạng thái. Khi quay lại ứng dụng, thẻ cũng tự kiểm quyền. Các nút xếp dọc nếu chiều ngang không đủ. Trạng thái chưa cài với nút đăng ký ngay trên thẻ vẫn thuộc backlog.

`ShellControlTests.swift` kiểm tập hành động ở ba trạng thái và nhãn EN/VI/JA. Test xử lý trạng thái chờ phê duyệt của monitor cũng đạt. Thứ tự thao tác giữ theo thiết kế T1. Cần kiểm trên macOS thật việc cấp quyền, xác nhận gỡ, thứ tự Tab và VoiceOver.

## Kiểm tra cục bộ

| Phạm vi | Kết quả |
| --- | --- |
| Nguồn và tài nguyên | `npm run resources`, `npm run check:resources`, `npm run check:docs`, `git diff --check` đạt. Hai bản `native.json` sinh ra giống nhau từng byte. README, các spec liên quan, backlog và CHANGELOG mục Unreleased đã cập nhật. |
| Test chung | `node --test scripts/native/__tests__/domain.test.mjs` đạt 11/11. Python 3.13 chạy `test_*.py` đạt 8/8. |
| macOS Swift | Lệnh SwiftPM mặc định bị sandbox chặn ghi Clang module cache. Build Debug với cache và thư mục build tạm đạt. Cả ba test Swift mới đạt. Trong lượt đầy đủ 331 test, năm ca báo lỗi trong sandbox, gồm dán ảnh ở domain/ô soạn, OCR, phân loại Notes.rtfd và cài từ DMG. Cần PO chạy lại `swift test --package-path apps/macos` ngoài sandbox để kết luận toàn bộ suite. |
| Fan helper | Hai lệnh `swiftc` mặc định bị chặn ghi cùng module cache. Khi đặt `-module-cache-path` vào thư mục tạm, helper build đạt và self-check đạt 33/33 trên fixture. |
| Qt | CMake configure và build Release Qt 6.12 đạt trên macOS arm64. CTest Fusion/offscreen đạt 9/9 shard. QtTest dùng quyền ghi vào hồ sơ thử riêng vì sandbox chặn tạo thư mục QStandardPaths của fixture. |
| Chạy thật | PO phụ trách kiểm giao diện. Chưa chạy Viezan, thao tác với helper thật, thử bộ cài, chụp màn hình hay nghiệm thu Windows/Linux trên các thay đổi cục bộ. |

Đã dùng workflow `native-migration`, quy tắc `ui-ux.md`, spec từng màn và hướng dẫn `viezan-native-ux` với UI UX Pro Max cho phản hồi lỗi tại ô nhập. Antigravity phản biện các trường hợp mất cảm biến, mất phiên xử lý ảnh và chặn gửi ngữ cảnh quá giới hạn.

## CI và phát hành trước các story

- Bản 2.6.0 vào `develop` qua PR #203 sau #201. Workflow đóng gói cả bốn nền tảng, ký manifest và công bố release với bốn chữ ký. [Workflow đóng gói](https://github.com/trunghieupham59/viezan/actions/runs/45435744608) · [Release v2.6.0](https://github.com/trunghieupham59/viezan/releases/tag/v2.6.0)
- Ở commit merge #203, job macOS chỉ có một test lỗi trong 328 test. Sau khi Thùng rác đổi tên bundle, test Hoàn tác ghi nhận `apps.error != nil` rồi gặp `invalidData` khi kiểm đường dẫn gốc. Test này đạt trong lượt đầy đủ trên máy phát triển. Log CI không có `errno` hoặc vị trí cụ thể bên trong `undo` để xác định nguyên nhân gốc. [Log macOS](https://github.com/trunghieupham59/viezan/actions/runs/45435744606/job/138593046180)
- GitHub Pages từng báo tìm thấy 0 artifact ngay sau khi upload thành công. Lần triển khai ở `3b14b195` đã đạt. Hai job Native CI Qt 6.8.3 trên Windows và Ubuntu cũng đã đạt ở commit này. [Lần deploy lỗi](https://github.com/trunghieupham59/viezan/actions/runs/45435560730) · [Lần deploy đạt](https://github.com/trunghieupham59/viezan/actions/runs/45436524496) · [Native CI](https://github.com/trunghieupham59/viezan/actions/runs/45436525092)
