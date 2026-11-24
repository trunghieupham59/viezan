# Native code 75 — S4 · Quét gốc cài Riot trên macOS (2026-11-24)

## Phạm vi và hành vi

`ApplicationInstallRoot.defaults` khai báo ba gốc cho phép gồm `/Applications`, `~/Applications` và gốc launcher `/Users/Shared/Riot Games`. Kho đọc thêm `/System/Applications` để nhận diện ứng dụng hệ thống. Bộ quét, lý do bảo vệ app, chính sách chuyển vào Thùng rác và hành động trên issue S3 dùng cùng danh sách gốc. Các test tiêm gốc tạm qua tham số nội bộ.

Bộ quét mở gốc launcher bằng `O_NOFOLLOW_ANY`, đối chiếu đường dẫn chính tắc rồi chỉ đọc các tên có đuôi `.app` trực tiếp trong thư mục đó. Gốc vắng mặt được bỏ qua. Gốc là symlink hoặc có đường dẫn không chính tắc tạo một issue chặn `unreadable` tại chính gốc. Symlink `.app` hợp lệ vẫn vào kho với `appProtected`. Bundle hỏng và thư mục rỗng giữ cách phân loại của S1–S3.

Thư mục bundle trong gốc launcher phải có `st_uid == getuid()` mới được gỡ. Bundle hợp lệ thuộc UID khác có lý do `appNeedsAdmin`. S3 và `policy` đọc lại loại và chủ sở hữu của thư mục trước khi cho phép chuyển. Khi Hoàn tác, đích phải còn trống và thư mục cha phải còn chính tắc. `plan()` trùng từng byte với bản đầu lượt. Tệp và thư mục anh em của Riot Client nằm ngoài kho và kế hoạch gỡ.

## Tệp S4

- `apps/macos/Sources/ViezanDomain/Applications.swift` và ba test trong `apps/macos/Tests/ViezanDomainTests/WorkbenchTests.swift`.
- Mục 10 và follow-up ngày 2026-11-24 trong `docs/design/screens/apps.md`, một dòng Unreleased trong `CHANGELOG.md` và báo cáo này.
- README mô tả tính năng gỡ và khôi phục ở mức chung. S4 dùng UI và các chuỗi lý do hiện có.

## Kiểm chứng

- Đã đối chiếu theo workflow và rule `native-migration`, skill `viezan-native-migration` và đặc tả màn Ứng dụng.
- **Trước khi sửa hành vi**, ba test S4 chạy với các tham số tiêm gốc đã khai báo nhưng chưa nối vào logic. Cả ba thất bại với tám lỗi ghi nhận. Bộ quét còn đi vào `Metadata/Other.app`, đánh dấu client được bảo vệ và báo đường dẫn con khi gốc là liên kết. `policy` từ chối client và S3 từ chối `Empty.app`.
- **Sau khi sửa**, cả bảy test Ứng dụng S1–S4 đạt khi chạy riêng. Fixture thử cùng một client khi gốc được cho phép và khi chỉ được đọc, kiểm tra các đường dẫn ngoài gốc, app lồng, tệp anh em, thư mục rỗng, bundle hỏng và symlink tới app. Test gốc bao phủ đường dẫn vắng mặt, symlink hợp lệ và đứt, thư mục cha là symlink và đường dẫn có thành phần `/.`. Quyết định về chủ sở hữu được thử với hai UID khác nhau bằng hàm thuần.
- **Build Debug đạt.** Cả `swift build --package-path apps/macos` và `swift test --package-path apps/macos` với thiết lập mặc định đều bị sandbox từ chối ghi module cache khi nạp manifest. Các lượt hoàn tất dùng `--disable-sandbox --build-system native --scratch-path`, `CLANG_MODULE_CACHE_PATH`, `SWIFTPM_MODULECACHE_OVERRIDE` và `-Xswiftc -module-cache-path` trỏ vào thư mục tạm. Một lượt test trung gian chưa biên dịch được khi `PinnedNotesTests.swift` xuất hiện trước mã `PinnedNotes` đang được bổ sung đồng thời. Các lượt sau chạy được trên cây làm việc đầy đủ.

- **Toàn bộ suite macOS** ghi nhận 213 test, 206 đạt, 4 lỗi và 3 test render bỏ qua theo cấu hình mặc định. Cả bảy test Ứng dụng đạt trong lượt này. Bốn test lỗi trùng với các lỗi sandbox đã ghi ở S3.
- `npm run check:docs` và `git diff --check` cho các tệp theo dõi của S4 đều đạt.

| Test lỗi trong sandbox | Kết quả quan sát |
| --- | --- |
| `pastedImageBytesIngestLikeAFileAndRejectNonImages` | Nhập ảnh trả về `.invalidResponse`. |
| `composerPasteHandsImagesToTheIntakeInsteadOfTheText` | Bốn assertion lỗi ở lệnh Paste, dữ liệu ảnh, URL và văn bản từ clipboard. |
| `launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens` | Fixture `Documents/Notes.rtfd` không đạt kỳ vọng `isDirectory == false`. |
| `screenTextRecognizesPNGData` | Apple Vision trả mã 8, `Failed to create CVPixelBuffer`. |

## Phạm vi nghiệm thu

Đã kiểm tra domain bằng fixture tạm. Lượt S4 chưa mở Viezan, chưa thử với bản cài Riot thật, chưa chuyển bundle vào Thùng rác hoặc Hoàn tác qua helper. Việc kiểm tra UID khác dùng giá trị giả lập. S4 không cần UI hoặc chuỗi dịch mới.

## Sau review độc lập và thử trên app thật — 2026-11-24

- **Gốc launcher phải đáng tin.** `/Users/Shared/Riot Games` chỉ được quét và cho chuyển vào Thùng rác khi là thư mục thật, thuộc người dùng hiện tại hoặc root, và nhóm/người khác không ghi được. Gốc không đạt (symlink, tài khoản khác sở hữu, cho ghi rộng) được bỏ qua như trước S4 và không sinh issue, để một tài khoản khác trên máy không thể khoá các app trong `/Applications`.
- **Kiểm tra đang-dùng.** Chuyển `/Applications/League of Legends.app` (thư mục rỗng) vào Thùng rác trên app thật báo `appActionError`: `lsof +D` liệt kê `UserEventAgent`, tiến trình hệ thống giữ một descriptor theo dõi trên thư mục bundle. `ApplicationFiles.inUse` giờ đọc `lsof -F ft`; descriptor đánh số trỏ tới thư mục là bộ theo dõi, không tính là đang dùng. Tệp đang mở, thư mục làm việc, mã đã ánh xạ, hoặc đầu ra không đọc được vẫn tính là đang dùng. Thay đổi này áp dụng cho cả Gỡ/Đặt lại.
- Chạy lại ngoài sandbox Codex: `swift build` đạt, `swift test` đạt toàn bộ (74 + 152 test, 0 lỗi). Chưa chạy lại thao tác trên app thật sau khi sửa.

