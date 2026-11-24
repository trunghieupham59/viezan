# Hoàn tác ứng dụng, nhập sao lưu và các story sau 2.6.0

## CI và Hoàn tác ứng dụng trên macOS

Ở commit `3b14b195`, lần đầu GitHub không cấp được runner macOS arm64. Chạy lại riêng job trên cùng commit đã tái hiện lỗi. Trong 328 test, chỉ `undoRestoresTheOriginalNameWhenTheTrashRenamedTheBundle` thất bại. Sau Hoàn tác, ứng dụng báo lỗi và test gặp `invalidData` khi đọc snapshot ở tên gốc. Hai job Qt 6.8.3, CodeQL, Documentation và Pages đạt. Workflow Package Native Release của v2.6.0 đã đóng gói bốn nền tảng và ký manifest. [GitHub Native CI](https://github.com/trunghieupham59/viezan/actions/runs/45436525092) · [Log Swift ở lần chạy lại](https://github.com/trunghieupham59/viezan/actions/runs/45436525092/job/138607970039) · [Package Native Release](https://github.com/trunghieupham59/viezan/actions/runs/45435744608)

Đối chiếu với Antigravity cho thấy bản 2.6.0 yêu cầu Finder chuyển bundle sang thư mục cài đặt, sau đó mã chạy với quyền người dùng tự đổi từ tên do Thùng rác đặt sang tên gốc. Thao tác thứ nhất có thể đã di chuyển bundle trước khi thao tác thứ hai lỗi. Log CI không ghi errno hoặc vị trí thực của bundle lúc đó. Vì vậy nguyên nhân hệ thống cụ thể của lần lỗi trên runner còn cần xác minh.

Trong checkout, `Applications.swift` và `ApplicationBundleRestore.swift` ghi bước khôi phục vào journal, xử lý trường hợp khác tên bằng một lần di chuyển độc quyền tới đúng đích, và đối chiếu danh tính cùng snapshot trước khi ghi nhận thành công. Nhật ký 2.6.0 có thể được tiếp tục từ tên trung gian. Với đích bị bảo vệ, nhật ký cho phép người dùng hiện đúng mục trong Finder. Test trực tiếp đường khôi phục thực thi với bundle ghi được, tên có dấu cách và không mở Finder. Các fixture còn kiểm đích bị chặn, xung đột phát sinh muộn, snapshot không khớp và tiếp tục sau gián đoạn. Phần triển khai Hoàn tác đã có thay đổi song song trong checkout khi kiểm CI. Đã kiểm cả thay đổi đó cùng ca hồi quy mới trong `ApplicationsOwnershipTests.swift`.

## Nhập sao lưu trên macOS

Trước khi sửa, test để lại tệp ảnh mới sau lỗi lưu workspace và sau xung đột với một ảnh có sẵn. `WorkbenchStore.swift`, `NativeBackup.swift` và `Attachments.swift` kiểm dữ liệu hai kho trước khi cài ảnh, ghi nhận danh tính tệp mới và chỉ thu hồi những tệp đó khi nhập lỗi. Ảnh có sẵn cùng nội dung được dùng lại. Khi không thể ghi lại workspace trước đó, bản trên đĩa vẫn tham chiếu ảnh mới. Viezan giữ ảnh, hiện lỗi lưu trữ và yêu cầu đọc lại kho trước khi ghi tiếp. `Persistence.swift` và `Interpretation.swift` chuẩn bị tệp riêng quyền 0600 trước khi công bố nguyên tử. `StorageOrderTests.swift` kiểm xung đột, ghi lỗi, thử lại và trường hợp chính lần hoàn tác thất bại.

## Nhiệt độ và dịch vụ quạt trên macOS

- `ThermalWorkspace.swift` phân biệt đang chờ mẫu, thiếu trình đọc, lỗi đọc và mẫu hợp lệ thiếu cảm biến. Quạt vẫn có thể hiện RPM khi không có cảm biến nhiệt. Hai lỗi đọc có tiêu đề, mô tả và nút Thử lại.
- `ThermalMonitor.swift` chờ tiến trình cũ thoát trước khi mở bộ đọc mới. Một mẫu hợp lệ xoá lỗi đọc trước đó. Fixture dùng hai tiến trình cục bộ chỉ trao đổi dữ liệu giả. Test đã tái hiện cả hai lỗi trước khi sửa.
- Thẻ điều khiển có nút đăng ký khi dịch vụ chưa đăng ký. Khi hệ thống báo thiếu dịch vụ, thẻ hướng dẫn mở bản cài đầy đủ. Trạng thái chờ phê duyệt có các hành động riêng. Đã kiểm trong `FanControlStateTests.swift` và `ShellControlTests.swift`. Chuỗi EN/VI/JA và hai bundle sinh ra đã được cập nhật.

## Glass trên Qt và Hoàn tác theo phiên Dịch

- `WorkbenchDomain.cpp` phân biệt kiểm tra trước khi lưu với chuyển đổi lúc đọc workspace hoặc bản sao lưu cũ. Test trước sửa cho thấy Graphite được phép ghi thẳng. `WorkbenchBridgeTests.cpp` kiểm cả việc từ chối ghi trực tiếp preset cũ và việc đọc lại đủ các preset cũ qua 27 tổ hợp. Fixture Lịch sử sử dụng cấu hình Glass thật do domain khởi tạo.
- `FoundationRuntimeTests.swift` gọi thao tác **Dùng làm nguồn** của `TranslationWorkspace`, chuyển sang một phiên Dịch khác rồi bấm Hoàn tác qua toast. Bản nháp cùng cặp ngôn ngữ của phiên gốc được phục hồi, phiên đang mở giữ nguyên. Qt đã có test tương ứng. Hàng R2 của spec Dịch ghi hành vi này. Spec Chat ghi hai vị trí Dừng nghiên cứu và hành vi phím Enter trên Qt.
- Hai mục backlog đã có bằng chứng trong nguồn. Hàng U6 của spec Cài đặt và cả hai màn cập nhật chỉ chọn một hành động cài tự động hoặc mở gói. `Kit.StatusBadge` dùng `smallScale` theo phông ứng dụng và `Font.Medium` đúng yêu cầu của audit. Kích thước hiển thị thực tùy hệ điều hành và mức chữ.

## Kiểm tra

| Phạm vi | Kết quả |
| --- | --- |
| Mã nguồn và tài nguyên | `git diff --check`, `npm run resources`, `npm run check:resources` và `npm run check:docs` đạt. Hai bundle sinh ra giống nhau từng byte. README, mục Unreleased, các spec và backlog đã cập nhật. |
| Kiểm tra chung | `node --test scripts/native/__tests__/domain.test.mjs` đạt 11/11. `python3.13 -m unittest discover -s scripts/native/__tests__ -p 'test_*.py'` đạt 8/8. |
| Build Swift | SwiftPM mặc định bị sandbox chặn ghi Clang module cache. Với cache và thư mục build tạm, Swift 6.4.2 biên dịch và liên kết bản Debug thành công. |
| Test Swift | Lượt lọc cho Hoàn tác, nhập sao lưu, vòng đời bộ đọc, trạng thái dịch vụ quạt và Hoàn tác theo phiên Dịch đạt 19/19. Lượt đầy đủ chạy 343 test. Năm test báo lỗi trong sandbox, gồm OCR, hai ca dán ảnh, phân loại Notes.rtfd và cài từ DMG. Cần PO chạy lại `swift test --package-path apps/macos` ngoài sandbox để kết luận toàn bộ suite. |
| Fan helper | Hai lệnh `swiftc -O` trong CONTRIBUTING dùng thư mục module cache tạm. Build helper đạt. Binary self-check đạt 33/33 trên fixture. |
| Qt | CMake cấu hình và build bản Release đạt trên macOS arm64, Qt 6.12. Sau khi chuẩn hoá fixture Lịch sử, CTest offscreen/Fusion đạt 9/9 shard. Cả 27 tổ hợp chuyển đổi giao diện đạt. QtTest bỏ qua một ca tăng tốc do offscreen thiếu RHI. |
| Chạy thật | Chưa chạy ứng dụng, Finder với quyền quản trị, bộ đọc hoặc quạt thật, bộ cài hay trình đọc màn hình. Các kiểm tra UI thủ công do PO phụ trách. Chưa có kết quả CI cho mã cục bộ. |

Phạm vi ghi nhận ở checkout chính trên `develop`, chưa commit.
