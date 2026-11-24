# Qt/QML · Sprint 2 · 24/11/2026

## Thay đổi theo file

Đường dẫn tính từ `apps/desktop-qt/`.

| File | Thay đổi |
| --- | --- |
| `LocalModelManager.h`, `LocalModelManager.cpp` | Đọc tiến độ từng layer Ollama. Chỉ nhận kích thước hữu hạn, dương và dưới 10¹⁵ byte. Chặn số đã tải ở tổng, từ chối JSON hỏng và dòng báo lỗi. Dừng, lỗi và thành công đều xoá cả hai số và tỉ lệ. |
| `qml/LocalModelSettings.qml` | Hiện “Đang tải · 2,1 / 4,9 GB” theo ngôn ngữ của app. Hai số dùng đơn vị của tổng. Thiếu tổng thì chỉ hiện “Đang tải” và thanh tiến độ vô định. Tải xong dùng chuỗi `modelInstalled` (“Đã tải”). |
| `LauncherTools.h`, `LauncherTools.cpp` | Trả loại, thư mục cha và ngày sửa. Chỉ lọc tên ẩn và tên thư mục phụ thuộc/build ở phần dưới thư mục nhà. Bỏ qua symlink, junction và đường dẫn ngoài thư mục nhà. Trên macOS, gói ứng dụng và tài liệu RTFD là tệp. |
| `qml/Launcher.qml` | Nhãn “Tệp” hoặc “Thư mục” ở mép phải. Dòng phụ dạng “~/Documents · hôm qua”, thiếu ngày thì chỉ hiện đường dẫn. Tên trợ năng ghép các phần có nội dung theo thứ tự tên, loại, dòng phụ. |
| `tests/WorkbenchBridgeTests.cpp` | Port các ca Swift cho bộ đọc tiến độ và cây tệp tạm. Kiểm thêm luồng tải với phản hồi trong bộ nhớ, vị trí nhãn và tên trợ năng VI/EN/JA trên hàng Launcher. |

## Kết quả kiểm

Dùng workflow `native-migration`, quy tắc `ui-ux.md`, Viezan Native UX, mục *Progress Indicators* của UI UX Pro Max và ghi chú Designer Q1/Q2.

Build Release bằng `cmake --build .native-build/qt --config Release -j 6` đạt trên macOS arm64, Qt 6.12.0. Không có cảnh báo biên dịch mới. QtTest chạy Fusion/offscreen với thư mục home tạm. Hai lượt lọc theo tên hàm cho kết quả nguyên văn, gồm cả init/cleanup.

- Q1 · `pullStepReadsBytesAndRejectsBadLines`, `localModelProgressTracksLayerAndClearsOnExit`

  ```text
  Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 310ms
  ```

- Q2 · `launcherFilesCarryKindAndDateAndSkipExcludedPaths`, `w5bLauncher`

  ```text
  Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 628ms
  ```

Tổng kết nguyên văn của lần chạy `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4` cuối sprint.

```text
100% tests passed out of 9

Total Test time (real) =  29.39 sec
```

`git diff --check -- apps/desktop-qt` đạt. Phần sửa của luồng này gồm bảy file Qt nêu trên và báo cáo này. Khi đối chiếu `git status --short` với đầu lượt, file `docs/migration/native-implementation/native-code-66.md` cũng xuất hiện từ luồng song song.

## Chưa kiểm

Chưa chạy app, tải model thật, duyệt giao diện bằng mắt, thử trình đọc màn hình hoặc chạy trên Windows/Linux. Một ca Glass tăng tốc có sẵn được bỏ qua vì offscreen thiếu RHI.

## Cần Tech Lead xử lý

Cập nhật spec Cài đặt, Launcher và trạng thái hai hạng mục trong backlog chung. Q1/Q2 dùng chuỗi và token sẵn có. Nếu cần diễn đạt mốc sửa tệp trong tương lai, bổ sung mẫu thời gian tương đối VI/EN/JA. Hiện Qt dùng ngày ngắn theo ngôn ngữ của app cho trường hợp này.
