# Native code 77 — S5 · Báo mục đang được sử dụng trên macOS (2026-11-24)

## Hành vi

Gỡ, Đặt lại (`apply`) và Chuyển vào Thùng rác từ kết quả quét (`trashIssue`) dùng chung `Applications.execute`. Khi `ApplicationFiles.inUse` trả `true`, bước kiểm tra trước khi lưu ý định ném lỗi nội bộ `ApplicationActionFailure.inUse`. Cả hai hành động đặt `Applications.error` thành `appInUse` mà chưa tạo mục nhật ký. Nếu lần kiểm tra ngay trước helper mới phát hiện mục đang dùng, nhật ký lưu `status = "failed"` và `issue = "appInUse"`, màn hình nhận cùng mã và các mục sau dừng xử lý.

Lỗi do chính `inUse` ném ra và các lỗi khác đi vào các nhánh `catch` này đều cho `appActionError`. Đã đối chiếu thứ tự kiểm tra với mã S4 trong cây làm việc. `policy` và snapshot vẫn chạy trước `inUse`, còn `stillMatches` của `trashIssue` vẫn chạy ngay trước helper. `trashIssue` quét lại kho sau lỗi ở cả hai giai đoạn.

## Tệp đã sửa

- `apps/macos/Sources/ViezanDomain/Applications.swift` thêm lỗi và hàm ánh xạ nội bộ, dùng chung cho hai hành động và nhật ký.
- `apps/macos/Tests/ViezanDomainTests/WorkbenchTests.swift` thêm một test ánh xạ ba loại lỗi.
- `docs/design/screens/apps.md` thêm một câu ở mục 5, `CHANGELOG.md` thêm một dòng ở Unreleased và `docs/migration/native-implementation/native-code-77.md` ghi kết quả S5.

## Kiểm chứng

- Áp dụng workflow và rule `native-migration`, skill `viezan-native-migration` và mục Verification của `CONTRIBUTING.md`.
- **Trước khi sửa hành vi**, test mới `applicationActionReportsInUseOnlyForConfirmedUse` chạy với hàm ánh xạ trả về mã chung như trước. Chỉ kỳ vọng `appInUse` thất bại, giá trị thực tế là `appActionError`.
- **Sau khi sửa**, cả 9 test Ứng dụng S1–S5 đạt, gồm test mới, test descriptor theo dõi thư mục và các fixture inventory, policy, launcher của các story trước. Test mới kiểm cả `StorageFailure.invalidData` và `CocoaError(.fileReadNoPermission)`.
- Lệnh mặc định `swift build --package-path apps/macos` và `swift test --package-path apps/macos` đều dừng khi nạp manifest vì sandbox cấm ghi `~/.cache/clang/ModuleCache`. Các lượt hoàn tất dùng thư mục tạm riêng cho build và module cache qua `--disable-sandbox --build-system native --scratch-path`, `CLANG_MODULE_CACHE_PATH`, `SWIFTPM_MODULECACHE_OVERRIDE` và `-Xswiftc -module-cache-path`. Build Debug đạt.
- Toàn bộ suite macOS có 227 test, gồm 218 đạt, 6 lỗi ngoài S5 và 3 test render bỏ qua. Cả 9 test Ứng dụng đạt trong lượt này.
- `npm run check:docs` đạt.

Sáu test lỗi trong lượt chạy toàn bộ suite gồm

- `composerPasteHandsImagesToTheIntakeInsteadOfTheText`
- `pastedImageBytesIngestLikeAFileAndRejectNonImages`
- `launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens`
- `screenTextRecognizesPNGData`
- `generatedLocalesNameThePinAction`
- `updateReplacesTheAppFromADiskImage`

## Phạm vi nghiệm thu

Các test Swift hiện có cho Ứng dụng dùng fixture ở tầng domain. SwiftPM không đóng gói helper `viezan-fs` vào test và S5 không chạy `lsof` thật. Hai thời điểm dừng và việc lưu nhật ký đã được đối chiếu trong mã, chưa được thử đầu cuối trên Viezan. Lượt này không mở app, xoá hoặc chuyển ứng dụng hay dữ liệu người dùng.
