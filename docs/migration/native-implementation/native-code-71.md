# Native code 71 — S2 · Ngoại lệ cho thư mục .app trên macOS (2026-11-24)

## Hành vi

Một thư mục `.app` thật, đọc được và có đường dẫn chính tắc trùng với đường dẫn quét chỉ nhận `notAnApp` khi `lstat` xác nhận `ENOENT` cho cả `Contents/Info.plist`, `Info.plist` ở gốc và `Wrapper`. Nếu có `Contents`, bộ quét kiểm tra thêm quyền truy cập để phân biệt thư mục đọc được với liên kết đứt. Khi đã xác minh các layout này đều thiếu metadata, thư mục không thể sở hữu hay dùng chung dữ liệu khớp theo bundle ID.

Mỗi lượt quét đếm tất cả các mục chặn trước khi áp giới hạn lưu 50 đường dẫn. Danh sách giữ mục chặn trước, theo thứ tự gặp trong mỗi nhóm. Trong Glass và Classic, số đếm đó quyết định việc hiện thẻ cảnh báo, tiêu đề thẻ và lý do khoá của ứng dụng thường. Thẻ hiển thị ba dòng đầu và số đường dẫn đã lưu còn lại. Ứng dụng được bảo vệ giữ lý do riêng.

## Tệp của S2

- `apps/macos/Sources/ViezanDomain/Applications.swift` và `apps/macos/Sources/ViezanNative/ApplicationsWorkspace.swift`.
- Hai test inventory trong `apps/macos/Tests/ViezanDomainTests/WorkbenchTests.swift`.
- Key `appScanIssue_notAnApp` trong `resources/locales/{en,vi,ja}.json`. Lệnh sinh tài nguyên cập nhật `apps/macos/Sources/ViezanDomain/Resources/native.json` và `apps/desktop-qt/qml/native.json` từ các locale hiện có trong cây làm việc.
- `docs/design/screens/apps.md`, một dòng trong `CHANGELOG.md` và báo cáo này.

## Kiểm chứng

- **Đỏ trên S1.** Test inventory thất bại ở bốn assertion. S1 ghi `Empty.app` là `invalidBundle`, khoá `Fixture` khi có một hoặc 51 thư mục rỗng và bỏ mất đường dẫn `Gone.app` xuất hiện sau khi danh sách đầy.
- **Fixture của S2.** Các trường hợp gồm thư mục rỗng, `Contents` rỗng, plist rác, ID `nodot`, plist ở gốc thiếu ID, `Wrapper` thiếu plist, symlink hợp lệ và hỏng, cài lại cùng đường dẫn, đường dẫn không chính tắc, lỗi quyền, `ENOTDIR` và vượt độ sâu quét. Với 51 thư mục rỗng rồi tới một symlink hỏng, kho khoá và lưu symlink ở đầu danh sách. Với 51 mục chặn, kho đếm đủ 51 dù chỉ lưu 50.
- **Xanh.** Cả `applicationInventoryReportsUnverifiedPathsAndPreservesProtectedApps` và `applicationInventoryReportsScanLimitAndUnreadableDirectory` đạt khi chạy riêng và khi chạy toàn bộ.
- **Build.** `swift build --package-path apps/macos` đạt ở cấu hình Debug. SwiftPM mặc định bị sandbox từ chối ghi module cache. Các lượt build/test hoàn tất dùng `--disable-sandbox --build-system native`, `--scratch-path` và module cache trong thư mục tạm.
- **Toàn bộ test macOS.** `swift test --package-path apps/macos` ghi nhận 184 test, 177 đạt, 4 lỗi và 3 test render bỏ qua. Bốn lỗi sau xuất hiện trong sandbox, ngoài hai test inventory.
- Chạy lại ngoài sandbox Codex (2026-11-24, sau review độc lập): `swift build` đạt, `swift test` đạt toàn bộ (68 + 132 test, 0 lỗi). Các lỗi liệt kê ở trên chỉ xuất hiện trong sandbox. Sau review, `notAnApp` chỉ áp dụng cho thư mục `.app` hoàn toàn rỗng (bỏ qua `.DS_Store`); thư mục còn nội dung, kể cả chứa app lồng bên trong, là `invalidBundle` và vẫn chặn.

| Test | Kết quả thực tế |
| --- | --- |
| `pastedImageBytesIngestLikeAFileAndRejectNonImages` | Nhập ảnh trả về `.invalidResponse`. |
| `composerPasteHandsImagesToTheIntakeInsteadOfTheText` | Bốn assertion lỗi khi kiểm tra Paste, dữ liệu ảnh và văn bản từ clipboard. |
| `launcherFilesCarryKindAndDateAndSkipWhatNobodyOpens` | `Documents/Notes.rtfd` không đạt kỳ vọng `isDirectory == false`. |
| `screenTextRecognizesPNGData` | Apple Vision trả mã 8, `Failed to create CVPixelBuffer`. |

`npm run resources`, `npm run check:resources` và `npm run check:docs` đều đạt. Cả hai bundle sinh ra giống nhau từng byte. Đã đối chiếu chính xác chuỗi S2 ở EN, VI và JA giữa từng locale nguồn và cả hai bundle.

## Phạm vi nghiệm thu

Đã đối chiếu mã Glass và Classic với đặc tả màn Ứng dụng, quy tắc UI/UX, workflow `native-migration` và skill `viezan-native-ux`. Thẻ dùng tiêu đề và lý do bằng chữ cho mỗi đường dẫn theo hướng dẫn Error Messages của UI UX Pro Max.

Theo phạm vi S2, chưa mở Viezan, chụp màn hình hoặc gỡ ứng dụng thật. Hiển thị theo kích thước cửa sổ, sáng/tối, bàn phím, VoiceOver, Finder và thao tác Gỡ/Đặt lại thực tế còn chờ nghiệm thu trực tiếp (UX07–UX10). Lượt này chỉ kiểm thử trong sandbox.
