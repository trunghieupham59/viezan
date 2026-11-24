# Sprint 16 · Qt · Hoàn tác “Dùng làm nguồn”

Ngày 24/11/2026, nhánh `develop`. Hoàn tác trả nháp và cặp ngôn ngữ về đúng phiên đã bấm nút. Ô kết quả vẫn trống vì đổi cặp ngôn ngữ xoá kết quả cũ, như trên macOS.

## Thay đổi theo file

| File trong `apps/desktop-qt/` | Thay đổi |
| --- | --- |
| `qml/Main.qml` | Toast dùng chuỗi `usedAsSource`, nút `undo` và khoá riêng theo ID phiên. Khi đảo, đích mới là nguồn cũ. Với nguồn Tự động, ưu tiên ngôn ngữ giao diện. Nếu trùng đích cũ, lấy ngôn ngữ hỗ trợ đầu tiên khác đích cũ. |
| `WorkbenchDomain.cpp` | Lệnh `pair` nhận thêm nháp tuỳ chọn để lưu cả cặp và nháp trong cùng một lần, cho cả thao tác dùng làm nguồn và Hoàn tác. |
| `WorkbenchBridge.cpp` | Kiểm ID phiên trước khi thay lịch dịch tự động. Hoàn tác cho phiên nền giữ được lượt dịch đang chờ của phiên đang mở. |
| `tests/WorkbenchBridgeTests.cpp` | Dùng phím Space trên cả hai nút. Kiểm nội dung toast, nháp, cặp ngôn ngữ và ô kết quả ở bốn ca. Ca đổi phiên còn kiểm phiên mới giữ nguyên dữ liệu và tiếp tục dịch đúng nháp của nó. |

## Kết quả kiểm

Build Release bằng `cmake --build .native-build/qt --config Release -j 6` thành công, log biên dịch không có cảnh báo. QtTest 6.12.0 chạy trên macOS arm64, Fusion/offscreen, với `CFFIXED_USER_HOME` trỏ vào thư mục tạm.

Trước sửa, năm ca thất bại vì thiếu toast. Sau khi có toast, ca đổi phiên vẫn thất bại vì lượt dịch tự động của phiên mới bị huỷ. Sau khi sửa kiểm tra ID, ba hàm `translationActionsRespectRunningSession`, `translationUseAsSourceUndoAfterSessionSwitch` và `translationEditHidesReuseAndCompareClosesOnStart` cho tổng kết nguyên văn sau.

```text
Totals: 8 passed, 0 failed, 0 skipped, 0 blacklisted, 4103ms
```

Tổng kết nguyên văn của `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`.

```text
100% tests passed out of 9

Total Test time (real) =  40.54 sec
```

Đã đối chiếu `TranslateSwap.target`, ghi chú Designer và hướng dẫn `native-migration`, `viezan-product-engineering`, `viezan-native-migration`, `viezan-native-ux`. UI UX Pro Max không có kết quả Undo phù hợp với Qt.

## Chưa kiểm

Chưa chạy app trên Windows/Linux, kiểm giao diện trực quan, IME hay trình đọc màn hình. Trong bộ đầy đủ, QtTest bỏ qua ca Glass tăng tốc vì offscreen không có RHI.

## Cần Tech Lead xử lý

Cập nhật hàng R2 và mục toast trong `docs/design/screens/translate.md` để ghi hành vi Hoàn tác theo phiên. Hai khoá `usedAsSource` và `undo` đã khớp giữa locale nguồn và bundle Qt ở cả VI, EN, JA.
