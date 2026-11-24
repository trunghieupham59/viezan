# Qt/QML · Sprint 5 · 24/11/2026

## S1 · Tốc độ từng model đã cài

Hàng model có thể hiện “2,6 GB · ollama:qwen3:4b · gpu · 48,2 token/giây”. Khi thiếu dung lượng, dòng bắt đầu bằng ID. Khi thiếu kết quả dùng được, dòng kết thúc bằng “Chưa đo được”.

| File trong `apps/desktop-qt/` | Thay đổi |
| --- | --- |
| `LocalPerformance.h`, `LocalPerformance.cpp` | Giữ kết quả theo ID model trong bộ nhớ. Ưu tiên kết quả khớp cả số lớp và kích thước ngữ cảnh của cấu hình đang áp dụng, sau đó chọn tốc độ cao nhất. Bỏ kết quả có lỗi, tốc độ không dương hoặc không hữu hạn. Cập nhật khi danh sách đổi, khi lưu lựa chọn và khi lần đo kết thúc. |
| `WorkbenchBridge.cpp` | Chuyển danh sách Ollama cho dịch vụ ở cả hai đường khám phá provider và làm mới thủ công. |
| `qml/LocalModelSettings.qml`, `qml/Kit.qml` | Hàng đọc kết quả từ bộ nhớ, dùng chuỗi `localModelMeasured` hoặc `notMeasured`. Tốc độ có một chữ số thập phân theo ngôn ngữ ứng dụng. Dòng phụ dùng chữ số có độ rộng cố định. |
| `tests/WorkbenchBridgeTests.cpp` | Port ca chọn cấu hình từ Swift. Kiểm hàng có và thiếu dung lượng, model chưa đo, ba ngôn ngữ, đổi cấu hình, đọc lại sau khi hủy đo và sau khi danh sách đổi. Dùng kho đo tạm và hủy trước khi worker gửi yêu cầu tới runtime. |

Đã đối chiếu ghi chú N5, spec Cài đặt, workflow và quy tắc `native-migration`, kỹ năng Viezan Native Migration, Viezan Native UX và mục *Number Formatting* của UI UX Pro Max.

## S2 · Review C++

| Phát hiện | Xử lý | Lý do |
| --- | --- | --- |
| chưa có review | Dừng S2 | Khi QtTest S1 hoàn tất, file `agy-review-qt-1.out` chưa có nội dung để đối chiếu. |

## Kết quả kiểm

Build Release trên macOS arm64, Qt 6.12.0 đạt bằng `cmake --build .native-build/qt --config Release -j 6`. Bốn cảnh báo bỏ qua kết quả `QFile::open` ở `LocalProvider.cpp`, dòng 56, 62, 72 và 80, đều có sẵn ở HEAD. Build không thêm cảnh báo.

QtTest lọc theo bốn hàm `localModelHeadlineIsTheAppliedProfileOrTheFastest`, `installedModelRowsRefreshStoredMeasurements`, `localCatalogUsesOnlyValidSizes` và `localModelProgressTracksLayerAndClearsOnExit`, chạy Fusion/offscreen với thư mục người dùng tạm.

```text
Totals: 6 passed, 0 failed, 0 skipped, 0 blacklisted, 549ms
```

Tổng kết nguyên văn của `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`.

```text
100% tests passed out of 9

Total Test time (real) =  33.21 sec
```

`git diff --check -- apps/desktop-qt` đạt. Thay đổi của lượt này gồm sáu file Qt ở bảng S1 và báo cáo này.

## Chưa kiểm

Chưa mở ứng dụng, đo bằng Ollama thật, kiểm bằng mắt hoặc trình đọc màn hình, hay chạy trên Windows/Linux. Trong bộ CTest, ca `acceleratedGlassSurfacesSurviveAppearanceChanges` được bỏ qua vì offscreen thiếu RHI tăng tốc.

## Cần Tech Lead xử lý

Cập nhật mô tả hàng model đã cài trong `docs/design/screens/settings.md` để ghi nhận tốc độ của cấu hình đang áp dụng, quy tắc chọn tốc độ nhanh nhất và trạng thái chưa đo. Ba bản dịch và token cần dùng đã có sẵn.
