# Xác minh client quạt, liên kết ứng dụng và kết quả kiểm cuối

## Helper quạt

`scripts/native/build.py` bật Hardened Runtime cho bản macOS phát triển ký theo team và các helper đi kèm. Ứng dụng chính dùng entitlement âm thanh và Apple Events hiện có. Trong `native/fanhelper/main.swift`, helper kiểm định danh và Team ID theo audit token của kết nối, rồi đọc cờ runtime của chính tiến trình đó. Khi thiếu thông tin chữ ký của helper, kết nối của người dùng console bị từ chối. Ngoại lệ phát triển chỉ áp dụng khi chữ ký của helper có cờ ad-hoc. Kết nối root giữ quy tắc hiện có.

`test_dev.py` kiểm lệnh ký khi chọn team, chọn ad-hoc hoặc máy thiếu danh tính ký. Trường hợp cuối dùng chữ ký ad-hoc tường minh trên cả Intel lẫn Apple Silicon. `CommandHandler.swift` và `native/fanhelper/tests/main.swift` kiểm các tổ hợp cờ hợp lệ, thiếu cờ và thiếu metadata. Chưa chạy bản ký thật, kết nối đặc quyền hay điều khiển phần cứng. Antigravity và Codex thống nhất giữ tên driver của các cảm biến IOHID chưa có đối chứng theo mẫu máy.

## Helper tệp

`native/files/LinkEntry.swift` giữ thư mục cha bằng file descriptor, kiểm thiết bị và inode trước và sau khi chuyển liên kết. Nếu không xác minh được đích sau khi chuyển, helper báo lỗi ngay. Khi chỉ bước công bố biên nhận thất bại, `native/files/main.swift` vẫn có thể trả liên kết đã xác minh về tên gốc còn trống.

`linkMoveStopsWhenDestinationIdentityCannotBeRead` biên dịch cùng mã di chuyển với một đích fixture trả lỗi khi đọc metadata. Trước sửa, helper tự chuyển liên kết về nguồn. Sau sửa, liên kết còn ở đích đúng inode, tên nguồn trống và fixture nhận lỗi kiểm danh tính. Test dùng hai đường dẫn trong thư mục tạm. Ca `fileHelperRoundTripsUninstallResetAndScanIssueInsideFixture` và ca Hoàn tác khôi phục tên gốc cũng đạt. Fixture hàng S7 kiểm EN/VI/JA ở 400 và 900 pt. Các cỡ cửa sổ thật nằm trong [open-work](../reports/native-migration-report-20261124-open-work.md).

## Kiểm tra checkout trên develop

| Loại | Lệnh hoặc phạm vi | Kết quả |
| --- | --- | --- |
| Nguồn | `npm run check:resources` và `cmp` hai bản `native.json` | Ba locale, 84 token kích thước và hai bundle giống nhau. |
| Nguồn | `npm run check:docs` và `git diff --check` | Đạt. |
| Test chung | `node --test scripts/native/__tests__/domain.test.mjs` | 11/11 đạt. |
| Test công cụ | `python3.13 -m unittest discover -s scripts/native/__tests__ -p 'test_*.py'` | 16/16 đạt. |
| Build macOS | Hai lệnh `swiftc -O` của fan helper và self-check trong CONTRIBUTING, cùng lệnh build `viezan-fs` | Ba executable build đạt với module cache trong thư mục tạm. |
| Test helper quạt | `fan-helper-self-check` | 35/35 đạt với FakeSMC và fixture chữ ký. |
| Build Qt | `cmake -S apps/desktop-qt -B .native-build/qt -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release` rồi `cmake --build .native-build/qt --config Release` | Đạt với Qt 6.12 trên macOS arm64. |
| Test Qt | `QT_QPA_PLATFORM=offscreen QT_QUICK_CONTROLS_STYLE=Fusion ctest --test-dir .native-build/qt -C Release --output-on-failure --parallel 4` | 9/9 nhóm đạt. Ca Glass tăng tốc được bỏ qua do chế độ offscreen thiếu RHI. |
| Build và test Swift | `swift test --package-path apps/macos` | Sandbox chặn ghi module cache mặc định. Chạy lại với cache và scratch trong thư mục tạm đã build xong. Swift Testing báo 353 test, 5 test báo lỗi trong sandbox. |
| Chạy thật | Finder, helper ký theo team, phần cứng, editor Windows qua COM, IME, trình đọc màn hình và UI desktop | Chờ nghiệm thu theo nền tảng. |

Năm test Swift cần kiểm ngoài sandbox gồm hai ca dán ảnh (`pastedImageBytesIngestLikeAFileAndRejectNonImages`, `composerPasteHandsImagesToTheIntakeInsteadOfTheText`), OCR (`screenTextRecognizesPNGData`), phân loại `Notes.rtfd` (`launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens`) và thay ứng dụng từ DMG (`updateReplacesTheAppFromADiskImage`). Bộ Swift cũng bỏ qua fixture dùng Thùng rác thật và ba ca render ảnh. PO phụ trách lượt chạy ngoài sandbox và xem UI.
