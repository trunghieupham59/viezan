# Sprint 12 · Qt · Sáu lỗi lưu lịch sử

Đã tái hiện cả sáu mục review bằng QtTest trên dữ liệu tạm trước khi sửa C++. Các ca lỗi ghi dùng thư mục ở vị trí tệp đích. Một ca riêng dùng `QSaveFile::cancelWriting()` để ép lần commit thứ hai thất bại sau khi cả hai tệp đã được ghi tạm.

| Mục | Tái hiện trước sửa | Sửa và kết quả kiểm | QtTest |
| --- | --- | --- | --- |
| Xoá toàn bộ lịch sử | Có. Ghi Phiên dịch lỗi sau khi workspace đã mất lịch sử. | Chuẩn bị cả hai tệp trước khi commit. Nếu lần commit thứ hai lỗi, phục hồi đúng byte của workspace cũ hoặc phục hồi trạng thái chưa có tệp. Giữ bản nháp mới hơn trên RAM. Chỉ dọn ảnh sau khi cả hai kho đã lưu. | `failedClearPreservesBothHistoriesAndAttachments`, `secondHistoryCommitFailureRestoresOriginalFile` |
| Xoá phiên lưu trữ | Có. Sau lỗi ghi, số phiên lưu trữ trong RAM từ 1 xuống 0. | `deleteArchived` chỉ công bố kết quả sau khi lưu. Kiểm phiên và nháp khi mở lại, rồi thử xoá thành công. | `failedArchivedDeletionKeepsSavedDraft` |
| Nhập sao lưu | Có. Lỗi ghi workspace vẫn thêm cuộc họp. Lỗi ghi Phiên dịch để lại ảnh. Callback vẫn báo thành công sau khi workspace bị chặn hoặc đã thoát. | Chuẩn bị ảnh trong thư mục tạm. Callback kiểm lại trạng thái và phối hợp ghi hai kho. Khi thất bại chỉ thu hồi ảnh vừa thêm. Đã kiểm cả xung đột ID ảnh và nhập lại sau lỗi ghi. | `failedBackupPreservesBothStores` |
| Kiểu dữ liệu Phiên dịch | Có với `segments` dạng object. Ba đối chứng dùng chuỗi, phiên sai kiểu và phần tử sai kiểu đã bị chặn từ trước. | Yêu cầu `segments` là danh sách khi nạp và kiểm bản sao lưu. Tải lại file hỏng giữ nguyên phiên trong RAM và byte trên đĩa. | `malformedTranscriptBlocksWrites` |
| Kiểu của `disabledModules` | Có. Chuỗi `"bridge"` bị đổi thành danh sách rỗng. | Chỉ xoá module cũ khỏi giá trị dạng danh sách. Chuỗi sai kiểu chặn ghi. Danh sách cũ hợp lệ vẫn nâng cấp được. | `invalidSnapshotBlocksWrites:disabled-modules-scalar`, `workspaceDropsRetiredBrowserSettingsDuringRecovery` |
| Lỗi còn sau khi tải lại | Có. Bridge vẫn giữ `interpretStorageError` dù đã đọc được Phiên dịch. | Khi tải lại thành công, xoá riêng mã lỗi này. Test kiểm tự dịch chạy lại ngay và lỗi đọc workspace vẫn được giữ. | `transcriptReloadReleasesTranslation` |

## Kiểm chứng

Qt 6.12.0, macOS arm64, Release, Fusion/offscreen. Workflow và rule `native-migration`, rule `viezan-product-engineering`, skill `viezan-native-migration`. Build và CTest chạy trong `.native-build/qt` có sẵn.

| Lượt QtTest lọc theo tên hàm | Tổng kết nguyên văn |
| --- | --- |
| Trước sửa | `Totals: 5 passed, 9 failed, 0 skipped, 0 blacklisted, 565ms` |
| Cùng bộ lọc sau sửa | `Totals: 14 passed, 0 failed, 0 skipped, 0 blacklisted, 887ms` |
| Bản cuối, gồm lỗi commit, xung đột ảnh và hồi quy snapshot cũ | `Totals: 22 passed, 0 failed, 0 skipped, 0 blacklisted, 1115ms` |

Build Release cuối thành công, không phát cảnh báo compiler. Lượt build trung gian lặp lại ba cảnh báo `QFile::open` có từ trước trong `LocalProvider.cpp`. Chín log QtTest ghi 437 lượt qua, 0 lỗi, 1 bỏ qua. Tổng kết CTest nguyên văn.

```text
100% tests passed out of 9

Total Test time (real) =  44.33 sec
```

Thay đổi của lượt này nằm trong `apps/desktop-qt/` và báo cáo này. So với đầu lượt, `git status --short` còn hiện thêm ba tệp Swift/tài liệu của luồng song song.

## Chưa kiểm

Windows/Linux, ứng dụng thật, mất nguồn giữa hai lần commit và lỗi thiết bị khiến cả bước hoàn tác cũng thất bại. Ca Glass dùng RHI tăng tốc bị bỏ qua với backend offscreen.

## Cần Tech Lead xử lý

Đọc tĩnh `WorkbenchStore.swift` cho thấy hai thứ tự ghi tương tự trên Swift. Chưa chạy các ca này trên macOS/SwiftUI.

- Với `clearHistory()`, tạo bản nháp, ảnh cũ và một cuộc họp. Sau khi nạp, chặn ghi tệp Phiên dịch rồi xoá toàn bộ. Kiểm cả hai kho và vị trí ảnh. Hiện Swift lưu workspace và dọn ảnh trước khi gọi `interpretation.clearAll()`.
- Với `importBackup(_:restorePreferences:)`, nhập bản sao có phiên, cuộc họp và ảnh mới, rồi ép `persistence.save(candidate)` thất bại. Kiểm cuộc họp và ảnh mới sau lỗi. Hiện Swift phục hồi ảnh và ghi Phiên dịch trước khi lưu workspace.
