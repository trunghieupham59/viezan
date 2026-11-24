# Native code 78 — S6 · Xác nhận và thẻ quét trong màn Ứng dụng macOS (2026-11-24)

## Thay đổi

- Trong `ApplicationsWorkspace.swift`, Classic dùng `confirmationDialog` với tiêu đề chứa tên mục, thông báo chứa đường dẫn tuyệt đối và phạm vi thao tác. Nút Huỷ mang role `.cancel` và phím tắt `.defaultAction` cho Return. SwiftUI đặt lại binding khi đóng hộp. [Ngữ nghĩa hộp xác nhận của SwiftUI](https://developer.apple.com/documentation/swiftui/view/confirmationdialog%28_%3Aispresented%3Atitlevisibility%3Apresenting%3Aactions%3Amessage%3A%29)
- Glass tiếp tục dùng `BlockingDialog`. Cả hai nhánh xoá lựa chọn đang chờ khi đổi preset giữa Glass và Classic, hoặc khi lượt quét mới thiếu mục có cùng đường dẫn và lý do.
- Đầu thẻ và từng dòng chọn bố cục theo bề rộng nội dung. Khi xuống hàng, nút Quét lại hoặc cặp nút Hiện trong Finder và Chuyển vào Thùng rác căn phải. Hai nút cùng kích thước theo nhãn dài hơn trong ngôn ngữ đang dùng. Đường dẫn dài vẫn có thể rút gọn ở giữa khi hai nút vừa trên một hàng.
- Icon khoá trong tiêu đề chi tiết Glass vẫn có tooltip. VoiceOver nhận lý do qua thẻ giải thích bên dưới.
- `ApplicationsLayoutTests.swift` đo đầu thẻ và dòng issue bằng SwiftUI ngoài màn hình. `docs/design/screens/apps.md` cập nhật mục 7 và 8. `CHANGELOG.md` thêm một dòng vào Unreleased.

## Cơ sở triển khai

Đã đối chiếu S3 (native-code-73), workflow và rule `native-migration`, skill `viezan-native-migration`, `viezan-native-ux` và `.claude/rules/ui-ux.md`. Hai kết quả tra cứu UI UX Pro Max áp dụng ở đây là *Text Reflow and Spacing* cho bố cục hẹp và *Use VStack HStack ZStack* cho bố cục tuyến tính của SwiftUI. Các nút dùng style và vai trò sẵn có của màn Ứng dụng.

## Kết quả kiểm chứng

- `swift build --package-path apps/macos` và `swift test --package-path apps/macos` mặc định dừng khi nạp manifest vì sandbox chặn ghi Clang module cache. Lượt hoàn tất dùng `--disable-sandbox --build-system native --scratch-path`, `CLANG_MODULE_CACHE_PATH`, `SWIFTPM_MODULECACHE_OVERRIDE` và `-Xswiftc -module-cache-path` trong thư mục tạm riêng. Build Debug cuối đạt.
- Test mới `scanActionsReflowWithTheAvailableWidth` đạt ở VI, EN và JA, cả khi chạy riêng và trong toàn bộ suite. Test đo chiều cao đầu thẻ và dòng issue có hai nút ở bề rộng nội dung 400 và 900 pt. Ở 900 pt, đường dẫn dài và ngắn cho cùng chiều cao dòng. Cả 9 test domain liên quan đến Ứng dụng và descriptor theo dõi thư mục đều đạt.
- Suite macOS cuối có 244 test, 236 đạt, 5 lỗi và 3 test render bỏ qua. `npm run check:docs` đạt.

Năm test lỗi trong suite

- `screenTextRecognizesPNGData`
- `pastedImageBytesIngestLikeAFileAndRejectNonImages`
- `launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens`
- `updateReplacesTheAppFromADiskImage`
- `composerPasteHandsImagesToTheIntakeInsteadOfTheText`

Hai lượt biên dịch test trung gian bị gián đoạn khi tệp Thermal và Interpretation thay đổi đồng thời. Một fixture thử ép Graphite dừng ở bước đọc màu vì tài nguyên hiện chỉ có palette Glass. Test cuối đo bố cục chung với palette được hỗ trợ. Một probe SwiftUI riêng cũng dừng khi AppKit trình bày sheet ngoài màn hình, trước khi gửi phím. Hành vi bàn phím, VoiceOver và thứ tự nút của hộp Classic còn chờ kiểm trực tiếp trong bản có tài nguyên Classic.

## Cần kiểm tay trên ứng dụng đang chạy

- Mở hộp Classic trên fixture. Thử Escape rồi mở lại thử Return khi hộp vừa hiện. Cả hai lần phải chọn Huỷ. Kiểm thứ tự nút, Tab/Shift-Tab, vòng focus và chỗ nhận lại focus sau khi đóng. Trong thẻ, Tab đi từ Hiện trong Finder tới Chuyển vào Thùng rác.
- Với VoiceOver, kiểm tiêu đề chứa tên mục, đường dẫn đầy đủ và phạm vi thao tác trong hộp. Trong chi tiết Glass, kiểm lý do khoá chỉ được đọc một lần và tooltip của icon vẫn hiện khi rê chuột.
- Khi hộp đang mở, kiểm lượt quét làm mất mục, đổi lý do ở cùng đường dẫn hoặc giữ nguyên mục. Hai trường hợp đầu phải đóng hộp, trường hợp cuối giữ hộp. Kiểm mở lại cho mục khác và bảo đảm hai kiểu hộp không xuất hiện đồng thời khi đổi preset trong fixture.
- Kiểm Glass và Classic ở 1200/820/560 pt, sáng/tối, VI/EN/JA và ba cỡ chữ. Dùng cả dòng có hai nút, dòng chỉ có Finder và đường dẫn dài. Kiểm đọc được lý do, nút xuống hàng khi thiếu chỗ và chiều cao thẻ khi đủ chỗ. Cửa sổ chính đặt mức tối thiểu 640 pt, nên mức 560 pt cần một host cho phép thu hẹp vùng nội dung.
