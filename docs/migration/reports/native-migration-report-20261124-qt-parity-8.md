# Qt · Sprint 5b · Review C++ ngày 24/11/2026

Đã đối chiếu sáu mục review với mã Qt và hành vi Swift. Mục 6 có ba nhận xét độc lập. Phạm vi sửa gồm 11 file C++/header/test trong `apps/desktop-qt` và báo cáo này.

| Mục | Quyết định và bằng chứng | QtTest |
| --- | --- | --- |
| 1 · Launcher | **Sửa.** Trước đó cả home qua symlink và Documents ngoài home đều trả 0 kết quả. Chuẩn hóa home và từng gốc chuẩn, dùng ID chính tắc và hiện đường dẫn tuyệt đối cho thư mục ngoài home. Loại gốc là liên kết, bỏ qua symlink/junction trong cây và giữ các ngưỡng 2 giây, 20.000 mục duyệt, 50 kết quả. | `launcherFilesAcceptRedirectedRoots`, `launcherFilesCarryKindAndDateAndSkipExcludedPaths` |
| 2 · Tier model | **Sửa.** Chọn Fast hoặc Balanced từng giữ lại `low` hoặc `medium`. Dùng lệnh `chatReasoning` của reducer để áp dụng `auto`, hoặc `high` cho Careful. Test kiểm cả ba tier ở Chat và mức suy luận riêng của Dịch. | `modelTierSetsEffortOnlyInChat` |
| 3 · Hiển thị tỷ giá | **Sửa.** Tỷ giá VND → USD trong tiếng Việt từng hiện `3,93701e-05`. Kết quả mới là `0,0000393701`, làm tròn đến sáu chữ số có nghĩa. | `currencyRateUsesLocalizedSignificantDigits`, `launcherCurrencyMatchesSwift` |
| 4 · Hủy tải tỷ giá | **Sửa.** Shutdown từng để tác vụ ở trạng thái `loading`. Reply bất đồng bộ thuộc luồng dịch vụ, được hủy khi shutdown hoặc hủy đối tượng. Reply giả kiểm timeout truyền 8 giây, hạn tổng 10 giây, giới hạn 512 KiB, dùng cache cũ khi lỗi và đọc lại cache mới. | `currencyShutdownCancelsPendingLoad`, `currencyRefreshBoundsAndCache`, `w5bLauncher` |
| 5 · Pull/delete model | **Sửa.** Với network manager bên ngoài, cả hai reply từng còn chạy khi đối tượng quản lý model đã bị hủy. Destructor và thao tác hủy ngắt callback, abort reply và lên lịch giải phóng. | `destroyingLocalModelManagerAbortsOwnedOperation`, hai hàng `pull` và `delete` |
| 6a · Dấu kana | **Giữ nguyên.** Đối chiếu Foundation trên macOS với locale `ja` và hai tùy chọn folding như Swift. `ガイド` và `パネル` đều giữ dấu. Qt khớp dạng Unicode tổ hợp tương đương và phân biệt `ガイ/カイ`, `パネ/ハネ`. | `launcherSettingsJumpMatchesTitleAndTermWordsOnly` |
| 6b · Dung lượng Ollama | **Sửa.** Bản ghi trùng thiếu size từng ghi đè 42 thành 0. Giữ dung lượng hợp lệ lớn nhất của cùng ID. | `localCatalogKeepsLargestDuplicateSize` |
| 6c · Lỗi sao chép âm thanh | **Sửa.** Signal lỗi từng phát trước khi `transcribeFile` trả về, khiến hàng đợi Phiên dịch có thể chạy tiếp trước khi xóa tệp đầu vào. Trả lỗi ở lượt vòng lặp kế tiếp, kiểm tra tác vụ còn hiệu lực sau khi hủy. | `transcriptionCopyFailureReturnsBeforeDelivery` |

## Kết quả kiểm

Áp dụng workflow, rule và skill `native-migration`, cùng rule `viezan-product-engineering`. Build Release trên macOS arm64, Qt 6.12.0, bằng `cmake --build .native-build/qt --config Release -j 6`. Build không phát cảnh báo. QtTest chạy Fusion/offscreen với thư mục người dùng tạm và dữ liệu mạng giả cho các ca tỷ giá, pull và delete.

Tổng kết nguyên văn của lượt tái hiện trước khi sửa và lượt lọc sau khi sửa, theo thứ tự.

```text
Totals: 2 passed, 9 failed, 0 skipped, 0 blacklisted, 117ms
Totals: 18 passed, 0 failed, 0 skipped, 0 blacklisted, 693ms
```

Tổng kết nguyên văn của `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`.

```text
100% tests passed out of 9

Total Test time (real) =  32.87 sec
```

`git diff --check -- apps/desktop-qt` đạt. Đối chiếu SHA-256 trong cây Qt với đầu lượt ghi nhận đúng 11 file đã sửa. Trong checkout dùng chung, `git status --short` cũng ghi nhận thay đổi song song ở `apps/macos/Sources/ViezanNative/ProviderSettings.swift`.

## Chưa kiểm

Chưa chạy trên Windows/Linux thật, gồm NTFS junction và Documents chuyển sang ổ đĩa khác. Chưa mở ứng dụng, dùng mạng thật, Ollama hoặc thiết bị âm thanh thật. QtTest bỏ qua `acceleratedGlassSurfacesSurviveAppearanceChanges` vì offscreen thiếu RHI tăng tốc.

## Cần Tech Lead xử lý

Đồng bộ mục Linux trong `docs/design/screens/launcher.md` với hành vi tìm tệp của Qt sau khi xác nhận trên Linux. Các sửa đổi này dùng các chuỗi và token hiện có.
