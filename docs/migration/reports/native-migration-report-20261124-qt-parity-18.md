# Sprint 15 · Qt · Phím gửi, Dịch và Từ điển

Ngày 24/11/2026, nhánh `develop`. QtTest gửi phím tới cửa sổ bằng `QTest::keyClick` và `keySequence`. Các phiên và phản hồi dịch, tra từ là dữ liệu thử.

| Mục review | Tái hiện trước sửa bằng bàn phím | Thay đổi và QtTest |
|---|---|---|
| 1. Ctrl+Shift+C | Phím mở được ngữ cảnh ở cả sáng và tối. Hai ca đỏ khi bôi đen chữ trong ô ngữ cảnh rồi nhấn phím tắt, focus nhảy về ô từ. | Chỉ bật phím tắt khi ô có focus không có vùng chọn. Giữ điều kiện overlay và IME. `dictionaryContextShortcut` kiểm vùng chọn ở cả hai ô, lịch sử và hộp thoại đổi tên. |
| 2. Enter sau khi không tìm thấy | Gõ `elm` thay `bnak` đã tra đúng vì sửa nháp xoá kết quả cũ. Với phiên thử nạp lại có nháp `elm` và kết quả cũ của `bnak`, Enter gửi nhầm `bank`. Shift+Return ở ô từ và Ctrl+Return tại kết quả cũng chọn nhầm gợi ý. | Chỉ chọn gợi ý đầu khi nháp và kết quả khớp yêu cầu tra gần nhất của đúng phiên. Chấp nhận Enter thường và bàn phím số. `dictionaryEnterAfterMiss`, `glassW2Dictionary`. |
| 3. Dùng làm nguồn | Space trên nút tạo cặp VI → VI và EN → EN khi nguồn cũ là Tự động. Gõ sửa nháp đã dịch làm nút biến mất ngay, nháp mới được giữ. | Vẫn ưu tiên ngôn ngữ giao diện cho nguồn Tự động. Khi trùng, lấy ngôn ngữ đầu tiên khác đích cũ trong `nativeLanguages`. `translationActionsRespectRunningSession`, `translationEditHidesReuseAndCompareClosesOnStart`. |
| 4. Gập ô ngữ cảnh có chữ | Có. Sau khi gõ `x`, Ctrl+Shift+C đưa focus về ô từ, chữ vẫn hiện. Space trên nút đưa focus trở lại ô ngữ cảnh. | Giữ hành vi theo `toggleContext()` của Swift. Nút bỏ ngữ cảnh mới xoá chữ. `dictionaryContextShortcut`. |
| 5. Chat chốt IME sớm | Chưa tái hiện trong QtTest. Sau Return và Enter bàn phím số, preedit vẫn là `に`, chưa gửi và chưa chèn dòng. Sự kiện xác nhận `日` tiếp theo cập nhật nháp đúng vị trí. | Bổ sung kiểm trạng thái soạn và nội dung preedit vào `chatComposerEnter`. Giữ xử lý QML hiện tại. |
| 6. Đóng hộp So sánh khi bắt đầu dịch | Nhánh non-Glass và `translationOptionsDialog` đã được bỏ. Space mở `compare-panel`; khi dịch tự động bắt đầu, panel đang mở tự đóng. | Bổ sung kiểm đường dùng hiện tại vào `translationEditHidesReuseAndCompareClosesOnStart`. |

## Kiểm chứng

Build Release trong `.native-build/qt` có sẵn bằng `cmake --build .native-build/qt --config Release -j 6`. Log build không có cảnh báo biên dịch. QtTest 6.12.0, macOS arm64, Fusion/offscreen. Kết quả nguyên văn của hai lượt trước sửa và lượt lọc bảy hàm sau sửa.

```text
Totals: 10 passed, 6 failed, 0 skipped, 0 blacklisted, 5898ms
Totals: 2 passed, 1 failed, 0 skipped, 0 blacklisted, 975ms
Totals: 25 passed, 0 failed, 0 skipped, 0 blacklisted, 10579ms
```

Cả chín mục qua trong một lượt `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`. Tổng kết nguyên văn từ tiến trình CTest của sprint này.

```text
100% tests passed out of 9

Total Test time (real) =  45.45 sec
```

Mã sửa ở `qml/Main.qml`, `qml/DictionaryResult.qml` và `tests/WorkbenchBridgeTests.cpp` dưới `apps/desktop-qt/`. Đã áp dụng workflow/rule `native-migration`, rule `viezan-product-engineering`, skill `viezan-native-migration` và `viezan-native-ux`, tham chiếu Focus States của UI UX Pro Max.

So với đầu lượt, `git status --short` cũng ghi nhận icon toast Qt, test Launcher macOS và `native-code-82.md` của phiên khác. Hai binary QtTest giữ cùng SHA-256 trước và sau CTest. Các phiên dùng chung log từng shard, vì vậy số 9/9 lấy từ đầu ra riêng của lệnh trên.

## Chưa kiểm

IME Việt/Nhật và cửa sổ chọn chữ thật trên Windows/Linux, Qt 6.8, trình đọc màn hình và nghiệm thu trực quan. Ca Glass tăng tốc cần RHI và được bỏ qua ở chế độ offscreen. Mục 5 chỉ có bằng chứng từ sự kiện IME tổng hợp.

## Cần Tech Lead xử lý

Swift `useResultAsSource()` gọi `setPair` rồi `setDraft` trực tiếp. Qt giữ cùng hành vi thay nháp. Đề xuất toast Hoàn tác để khôi phục nháp và cặp ngôn ngữ cần quyết định chung cho hai nền tảng. Nhánh Swift hiện cũng có thể tạo cặp trùng khi nguồn là Tự động và đích trùng ngôn ngữ giao diện.
