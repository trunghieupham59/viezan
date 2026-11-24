# Native code 73 — S3 · Chuyển bundle hỏng vào Thùng rác trên macOS (2026-11-24)

## Từ thẻ quét đến Hoàn tác

Glass và Classic hiển thị thẻ khi có vấn đề trong kho ứng dụng. Khi có mục chặn, thẻ giữ tiêu đề đếm của S1 và viền cảnh báo. Khi chỉ có `notAnApp`, thẻ dùng `info.circle`, số đường dẫn đã lưu và hướng dẫn riêng. Trong cả hai trạng thái, mỗi dòng đủ điều kiện có nút **Chuyển vào Thùng rác** sau **Hiện trong Finder**.

Hộp xác nhận hiển thị tên gồm đuôi `.app`, đường dẫn đầy đủ bằng chữ đơn cách có thể chọn và phạm vi thao tác. Glass dùng `BlockingDialog`. Classic dùng `NSAlert` dạng sheet với đường dẫn trong accessory để người dùng sao chép được. Huỷ là lựa chọn mặc định. Dòng kết quả chỉ cung cấp Hoàn tác khi nhật ký mới ghi mục tương ứng đã vào Thùng rác.

Domain tra ID trong `scanIssues`, kiểm tra gốc cài đặt và đọc lại metadata bằng cùng hàm với inventory. ID kết hợp đường dẫn với lý do để một lượt quét mới có thể làm hết hiệu lực xác nhận cũ. Cả giao diện và domain đều loại các đường dẫn ngoài gốc cài đặt được phép, cây Setapp được bảo vệ và chính Viezan. Sau xác nhận, thư mục phải còn là issue với cùng lý do. S3 tạo một mục nhật ký duy nhất, lấy tên thư mục bỏ đuôi `.app` và dùng action `uninstall` để dòng kết quả dùng bản dịch chuyển vào Thùng rác. Luồng dùng chung với Gỡ/Đặt lại kiểm tra policy, snapshot và tệp đang dùng, lưu ý định, rồi kiểm tra lại trước khi gọi helper. Riêng S3 đối chiếu lý do lần cuối ngay trước lệnh `trash`. Receipt, đường dẫn và snapshot ở Thùng rác cấp dữ liệu cho Hoàn tác. Lỗi trước khi lưu ý định dừng thao tác. Lỗi ở bước chuyển được ghi `failed`. Kho được quét lại sau thao tác hoặc khi phát hiện mục đã đổi.

**Quyết định về symlink.** `ApplicationFiles.snapshot` và `verified` trong `native/files/main.swift` yêu cầu đường dẫn chính tắc và từ chối symlink gốc bằng `lstat`. Với liên kết đứt, `realpath` cũng thất bại. Vì vậy `brokenLink` chỉ có Hiện trong Finder, như `unreadable` và `scanLimit`. Không có thao tác trên đích của liên kết.

## Phạm vi mã và tài liệu

- `apps/macos/Sources/ViezanDomain/Applications.swift`, `apps/macos/Sources/ViezanNative/ApplicationsWorkspace.swift` và test inventory trong `apps/macos/Tests/ViezanDomainTests/WorkbenchTests.swift`.
- `resources/locales/{en,vi,ja}.json` và hai bản sinh `apps/macos/Sources/ViezanDomain/Resources/native.json`, `apps/desktop-qt/qml/native.json`. Sáu khoá mới, hai khoá hướng dẫn/lý do cập nhật cho từng ngôn ngữ. Câu xác nhận dẫn tới đúng tên mục nhật ký của locale. Nhãn dùng chung `cancel` trong VI dùng chính tả “Huỷ”.
- Bảng điều khiển, trạng thái và follow-up ngày 2026-11-24 trong `docs/design/screens/apps.md`, một dòng `CHANGELOG.md` và báo cáo này.

## Kiểm chứng

- **Đỏ trước khi triển khai.** Test mới thất bại ở hai assertion đòi trả đúng đường dẫn của `Empty.app` và `Invalid.app`. Một lượt đỏ bổ sung tái hiện xác nhận cũ vẫn được chấp nhận sau khi quét lại cùng đường dẫn với lý do khác.
- **Fixture.** `applicationInventoryTrashRequiresTheSameIssueInAnInstallRoot` dùng gốc cài đặt trong thư mục tạm. Test bao phủ hai lý do được phép, `unreadable`, `scanLimit`, liên kết đứt, ID ngoài danh sách, thư mục ngoài gốc cài đặt, đổi lý do, ghi lại plist hợp lệ và thay thư mục bằng symlink.
- **Build và test.** Build Debug macOS đạt. Ba test inventory đạt cả khi chạy riêng và trong toàn bộ suite. Lượt cuối của `swift test` có **195 test, 188 đạt, 4 lỗi và 3 bỏ qua**. Bốn test lỗi trùng với báo cáo sandbox của S2. Ba test render bỏ qua theo cấu hình mặc định.
- Chạy lại ngoài sandbox Codex (2026-11-24, sau review độc lập): `swift build` đạt, `swift test` đạt toàn bộ (68 + 132 test, 0 lỗi). Các lỗi liệt kê ở trên chỉ xuất hiện trong sandbox. Sau review, `notAnApp` chỉ áp dụng cho thư mục `.app` hoàn toàn rỗng (bỏ qua `.DS_Store`); thư mục còn nội dung, kể cả chứa app lồng bên trong, là `invalidBundle` và vẫn chặn.
- **Môi trường.** Cả `swift build --package-path apps/macos` và `swift test --package-path apps/macos` mặc định bị từ chối ghi module cache khi đọc manifest. Các lượt hoàn tất dùng thêm `--disable-sandbox --build-system native --scratch-path` với thư mục build và module cache trong thư mục tạm. Lượt biên dịch test đầu tiên còn gặp `SystemControlsTests` trước khi có mã `SystemControls` trong cây đang được sửa đồng thời. Khi mã xuất hiện, nhóm test đó biên dịch và đạt.
- **Tài nguyên và tài liệu.** `npm run resources`, `npm run check:resources` và `npm run check:docs` đạt. Hai bản sinh giống nhau từng byte. Đã so từng bảng locale với nguồn và kiểm tên `journalUndo` xuất hiện trong `appTrashIssueScope` ở cả ba ngôn ngữ.
- **Đối chiếu UI.** Áp dụng workflow và rule `native-migration`, các skill `viezan-native-migration`, `viezan-native-ux` và quy tắc `.claude/rules/ui-ux.md`. Tra cứu `destructive confirmation` trong domain UX của UI UX Pro Max trả về Confirmation Dialogs và Confirmation Messages. Giao diện dùng nút destructive dạng quiet trên hàng và chỉ hiện kết quả khi nhật ký xác nhận thành công.

| Test lỗi trong sandbox | Kết quả quan sát |
| --- | --- |
| `pastedImageBytesIngestLikeAFileAndRejectNonImages` | Nhập ảnh trả về `.invalidResponse`. |
| `composerPasteHandsImagesToTheIntakeInsteadOfTheText` | Bốn assertion lỗi khi xác thực Paste, số ảnh, URL và văn bản. |
| `launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens` | Fixture `Documents/Notes.rtfd` không đạt kỳ vọng `isDirectory == false`. |
| `screenTextRecognizesPNGData` | Apple Vision trả mã 8, `Failed to create CVPixelBuffer`. |

## Phạm vi nghiệm thu

Lượt này chưa mở Viezan hoặc chụp màn hình. Chưa nghiệm thu trực tiếp bố cục Glass/Classic, sáng/tối, phím Return/Escape/Tab, chọn và sao chép đường dẫn hay VoiceOver (UX07–UX10). SwiftPM không đóng gói `viezan-fs` vào test và bộ test Swift hiện tại không có helper giả cho `apply`. Luồng chuyển thực tế, ghi receipt, phục hồi sau gián đoạn và Hoàn tác của S3 chưa được chạy đầu cuối. Mọi fixture S3 nằm trong thư mục tạm.
