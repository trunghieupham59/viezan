# Native code 79 — S7 · Chuyển liên kết ứng dụng hỏng vào Thùng rác trên macOS

Khi một liên kết `.app` nằm ngay dưới gốc cài đặt cho phép và kết quả quét vẫn là `brokenLink`, Glass và Classic cho phép xác nhận chuyển chính liên kết vào Thùng rác. Nhật ký ghi nhận 0 byte dữ liệu và cho phép Hoàn tác. Kho được quét lại sau thao tác.

## Ranh giới thao tác

- Domain dùng cùng phép phân loại với inventory khi nhận xác nhận và ngay trước lệnh chuyển. Domain chỉ tra metadata của đích để nhận diện bundle hợp lệ. Với gốc launcher, nó kiểm tra lại độ tin cậy của gốc và đối chiếu UID qua `lstat` trên liên kết.
- Snapshot gồm device và inode của liên kết. SHA-256 nhận các byte từ `readlink` và metadata bền qua thao tác đổi tên, gồm mode, UID, GID, kích thước và mtime. `isLink` là trường tuỳ chọn của từng mục nhật ký. Trường này chọn snapshot và lệnh cho cả chuyển, đọc receipt sau khởi động và Hoàn tác. Luồng liên kết bỏ qua `lsof +D`.
- Helper lấy thư mục Trash từ macOS theo thư mục cha của mục gốc. Nó so sánh đường dẫn chính tắc của cha, mở cha bằng `O_SEARCH | O_NOFOLLOW_ANY | O_CLOEXEC`, rồi chỉ truyền tên cuối cho các lệnh tương đối với descriptor. `fstatat(..., AT_SYMLINK_NOFOLLOW)` kiểm `S_IFLNK`, device và inode trước và sau khi chuyển. `renameatx_np(..., RENAME_EXCL)` di chuyển chính mục thư mục và từ chối ghi đè ở cấp hệ điều hành. Khi Hoàn tác, nguồn phải nằm ngay trong Trash và phép kiểm tra tên đích phải trả về `ENOENT`. Liên kết treo chiếm tên đích cũng làm lệnh từ chối khôi phục.
- Đường dẫn trong receipt ghép từ cha đã kiểm và tên thực tế. Sau khi kiểm định danh ở Trash, helper công bố nguyên tử receipt quyền `0600` và trả JSON trên stdout. Nếu tên trùng trong Trash, helper dùng tên riêng. Nếu xuất bản receipt thất bại, helper thử trả liên kết về vị trí cũ bằng cùng phép đổi tên độc quyền. Diagnostics chỉ có miền và mã lỗi.
- Đã so mã trước và sau S7. Thân các lệnh helper cũ, `verified`, snapshot cây thư mục, policy quyền sở hữu cũ của gốc và bộ lập kế hoạch Gỡ/Đặt lại giống nhau từng byte. Nhánh policy thường vẫn kiểm đường dẫn chính tắc và chạy các kiểm tra đang dùng của S5.

## Tệp S7

- `native/files/main.swift`, `apps/macos/Sources/ViezanDomain/Applications.swift`, `apps/macos/Sources/ViezanNative/ApplicationsWorkspace.swift` và `apps/macos/Tests/ViezanDomainTests/WorkbenchTests.swift`.
- `resources/locales/{en,vi,ja}.json` và hai bản sinh `apps/macos/Sources/ViezanDomain/Resources/native.json`, `apps/desktop-qt/qml/native.json`. Hai hộp xác nhận dùng chung cách chọn câu phạm vi. Mỗi bản dịch nhắc đúng tên mục nhật ký.
- `docs/design/screens/apps.md`, đoạn về helper tệp trong `docs/migration/legacy-reference/agent-handbook/ARCHITECTURE.md`, một dòng `CHANGELOG.md` và báo cáo này.

## Fixture và kiểm tra helper

Trước khi sửa, hai test Domain chạy và đỏ ở ba assertion nhận liên kết trong gốc cài đặt thường và launcher. Helper trước S7 trả mã 1 cho lệnh chuyển liên kết treo. Các test snapshot và decode journal được viết trước khi có API tương ứng.

Trên macOS arm64, đã chạy các lệnh dưới đây với `s7dir` là thư mục tạm. Mỗi tên liên kết dùng trong kiểm tra helper có dạng `ViezanLinkFixture-<UUID>.app`.

```sh
swiftc -O native/files/main.swift -o "$s7dir/viezan-fs" -framework AppKit
"$s7dir/viezan-fs" trash-link "$fixture" "$dev" "$ino" "$receipt"
"$s7dir/viezan-fs" restore-link "$trashed" "$fixture" "$dev" "$ino"
```

Binary nguyên bản biên dịch đạt. Nó từ chối thư mục thường, sai device, sai inode và cha là symlink. Lệnh `trash` cũ cũng từ chối liên kết. Sandbox không truy cập được thư mục Trash mà macOS trả về. Khi thử chuyển liên kết treo, binary trả mã 1, liên kết vẫn ở fixture và chưa có receipt. Test `applicationHelperTrashesAndRestoresOnlyTheFixtureLink` trong repo tự biên dịch helper và chạy cả hai lệnh khi môi trường cho phép truy cập Trash. Phần dọn chỉ dùng đường dẫn từ receipt sau khi kiểm tra cha, kiểu, device và inode.

Để chạy hai lệnh dưới sandbox, bản sao helper trong thư mục tạm thay đúng một dòng tra cứu `FileManager.url(for: .trashDirectory, ...)` bằng URL của thư mục Trash fixture. Đã biên dịch bản sao với `swiftc -O` và chạy cùng tham số CLI. Kết quả trên hệ thống tệp thật của thư mục tạm như sau.

| Trường hợp | Kết quả |
| --- | --- |
| Liên kết treo và liên kết tới tệp có nội dung | Cả hai vào Trash fixture đúng device, inode và chuỗi đích. Receipt `0600` khớp stdout. Tệp đích có cùng nội dung trước và sau. |
| Thư mục thường, sai device hoặc inode, tổ tiên là symlink | Từ chối trước khi chuyển. |
| Hoàn tác vào chỗ trống | Trả đúng liên kết, inode và đích. Đã thử cả chuỗi đích tương đối. |
| Đích bị liên kết treo chiếm, sai inode, đường dẫn có `..`, cha là symlink hoặc nguồn ngoài Trash | Từ chối, giữ các mục tại chỗ. |
| Trùng tên trong Trash hoặc trùng receipt | Giữ mục trùng tên. Với receipt đã tồn tại, helper trả liên kết về chỗ cũ và giữ nội dung receipt cũ. |

## Kết quả kiểm chứng

- **Build Debug macOS đạt.** Hai lệnh mặc định `swift build --package-path apps/macos` và `swift test --package-path apps/macos` bị chặn khi SwiftPM ghi Clang module cache. Các lượt hoàn tất chạy trên cùng package với `--disable-sandbox --build-system native --scratch-path`, `CLANG_MODULE_CACHE_PATH`, `SWIFTPM_MODULECACHE_OVERRIDE` và `-Xswiftc -module-cache-path` trong thư mục tạm. Một lượt trung gian gặp `LauncherFileSearchTests` khi mã Launcher đang được chỉnh đồng thời.
- **Nhóm Ứng dụng có 14 test đạt và 1 bỏ qua.** Bao gồm liên kết nằm trực tiếp trong gốc được tiêm, gốc launcher mất tin cậy, đường dẫn ngoài gốc hoặc lồng bên trong, đích nay thành bundle hợp lệ, snapshot sau rename và sau đổi đích, đọc journal cũ, phục hồi receipt đúng liên kết và từ chối receipt có liên kết khác. Test bố cục ngoài màn hình đạt với VI/EN/JA. Test tích hợp dùng Trash người dùng bỏ qua do quyền sandbox.
- **Suite macOS cuối có 274 test, 264 đạt, 5 lỗi và 4 bỏ qua.** Ba test render và test Trash hệ thống là bốn test bỏ qua. Hai test resize từng lỗi trong lượt trước đã đạt trong lượt cuối. Năm test còn lỗi được liệt kê bên dưới.
- `npm run resources`, `npm run check:resources` và `npm run check:docs` đạt. Hai bản `native.json` giống nhau từng byte. Đã đối chiếu `appTrashLinkScope` với nguồn và tên `journalUndo` trong cả ba locale.

```text
screenTextRecognizesPNGData
pastedImageBytesIngestLikeAFileAndRejectNonImages
launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens
updateReplacesTheAppFromADiskImage
composerPasteHandsImagesToTheIntakeInsteadOfTheText
```

Đã đối chiếu workflow và rule `native-migration`, các skill `viezan-native-migration`, `viezan-native-ux`, hướng dẫn Confirmation Dialogs của UI UX Pro Max, quy tắc UI và đặc tả màn Ứng dụng. Chưa nghiệm thu hộp xác nhận trên app đang chạy hoặc chu trình chuyển và Hoàn tác với Trash hệ thống. Kiểm tra khởi động dùng journal và receipt fixture. Chưa mô phỏng ngắt nguồn giữa rename và công bố receipt.

## Sau review độc lập — 2026-11-24

- Chạy lại ngoài sandbox Codex: `swift build` đạt, `swift test` đạt toàn bộ (101 + 187 test, 0 lỗi), gồm chu trình `trash-link` → `restore-link` thật trên fixture; không còn fixture trong Thùng rác.
- Nền của màn Ứng dụng bị vô hiệu hoá và ẩn khỏi VoiceOver khi một trong hai hộp xác nhận đang hiện (trước đó chỉ áp dụng cho hộp chuyển mục quét).
- `ApplicationFiles.inUse` đọc `lsof -F ftn`: chỉ descriptor đánh số kiểu thư mục trên CHÍNH thư mục được kiểm mới được coi là bộ theo dõi; descriptor trên thư mục con, dòng không nhận ra và mọi kiểu khác đều là đang dùng.
- Nhánh Classic của màn Ứng dụng không còn trong mã nguồn (luồng việc khác đã bỏ), nên phần Classic của S6 không còn áp dụng.
- Chưa xử lý: reviewer nghi `ViewThatFits` có thể cho nút xuống hàng sớm ở cửa sổ rộng; helper giữ bước trả lại mục khi kiểm tra danh tính sau khi chuyển thất bại; `canTrash` đọc đĩa mỗi lần vẽ dòng. Cần kiểm tay trên app chạy thật.

