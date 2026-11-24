# Sprint 13 · Qt · Gửi tin AI Chat bằng Enter

## Thay đổi theo file

- `apps/desktop-qt/qml/Main.qml` — Ô soạn chung của Chat trống và hội thoại gửi bằng Enter hoặc Ctrl+Enter, kể cả Enter bàn phím số. Shift+Enter xuống dòng tại con trỏ. Nếu Enter tới ô soạn khi còn preedit, ô yêu cầu IME xác nhận và nhận sự kiện để tránh chèn thừa một dòng.
- Phím gửi dùng cùng nút Gửi và chỉ kích hoạt khi nút đang ở trạng thái gửi. Nháp chỉ có khoảng trắng cần kèm ảnh. Khi phiên đang chạy, Enter giữ nguyên tác vụ và nháp kế tiếp. Tooltip và mô tả trợ năng dùng hai nhãn sẵn có `send`, `ai_chat_popup_new_line` để chỉ rõ Enter và Shift+Enter.
- `apps/desktop-qt/tests/WorkbenchBridgeTests.cpp` — `chatComposerEnter` thử cả hai phím Enter, kiểm chính xác văn bản nhiều dòng sau khi xác nhận IME, chặn gửi khi thiếu provider hoặc kho bị khoá, và gửi tiếp bằng Ctrl+Enter trong cùng hội thoại. `glassChatStates` gửi câu đầu bằng Return. `glassImageResearchAndReset` gửi nháp chỉ có ảnh bằng Return và đối chiếu ID ảnh trong yêu cầu.

## Phím ở các ô khác

| Ô nhập Qt | Hành vi hiện tại theo mã nguồn |
| --- | --- |
| Chat nhanh | Ctrl+Enter hoặc Meta+Enter gửi. Enter xuống dòng. |
| Launcher Quick AI | Trong ô tìm Launcher, Enter chạy mục đang chọn. Chọn mục AI hoặc nhấn Ctrl/Meta+Enter với truy vấn để chuyển sang Quick AI và gửi khi đủ điều kiện. Trong ô soạn Quick AI, Ctrl/Meta+Enter gửi, Enter xuống dòng. `quickKeyboardHint` nằm trong bảng dùng chung với Chat nhanh. |
| Dịch văn bản | Ctrl+Enter dịch. Enter xuống dòng trong ô nguồn. |
| Từ điển | Enter ở ô từ khoá chọn gợi ý đầu nếu có, còn lại tra từ khi hợp lệ. Ô ngữ cảnh một dòng chỉ cập nhật nội dung. |

## Kết quả kiểm

Build Release trong `.native-build/qt` thành công, không có cảnh báo biên dịch. QtTest dùng Qt 6.12.0 trên macOS arm64, Fusion/offscreen và hồ sơ tạm. Năm hàm được lọc theo tên gồm `chatComposerEnter`, `keypadSubmitAndCommands`, `submitShortcutDoesNotCancelRunningTask`, `glassChatStates` và `glassImageResearchAndReset`. Tổng kết nguyên văn, gồm cả khởi tạo và dọn dẹp.

```text
Totals: 24 passed, 0 failed, 0 skipped, 0 blacklisted, 11001ms
```

Trong lượt CTest đầu, một phiên khác cập nhật test và binary Qt dùng chung. Năm mục CTest lỗi ở các ca thư viện lịch sử, hiển thị model và khôi phục giao diện. Sau khi build lại, năm ca vừa lỗi cùng hai ca Enter đều qua khi lọc theo tên.

Tổng kết nguyên văn của lượt cuối, chạy bằng `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`.

```text
100% tests passed out of 9

Total Test time (real) =  53.46 sec
```

Lượt này sửa hai file Qt nêu trên và thêm báo cáo này. So với đầu lượt, `git status --short` còn có thay đổi của các phiên song song trong và ngoài cây Qt. Hai binary QtTest giữ cùng SHA-256 suốt lượt CTest cuối. Phiên khác đã sinh lại `qml/native.json` sau build. Đã đối chiếu cả hai nhãn phím trong bản sinh mới ở VI/EN/JA.

## Chưa kiểm

Chưa mở ứng dụng. Chưa nghiệm thu trên Windows/Linux với IME VI/JA thật, bàn phím số vật lý hoặc trình đọc màn hình. QtTest bỏ qua một ca Glass cần RHI tăng tốc trong môi trường offscreen.

## Cần Tech Lead xử lý

Đề nghị ghi rõ ngoại lệ Qt tại C2 trong `docs/design/screens/chat.md`. Bản Qt hỗ trợ đồng thời Enter và Ctrl+Enter. C2 hiện mô tả chọn một trong hai cách gửi qua Cài đặt. Chuỗi EN/VI/JA và token hiện có đã đủ cho thay đổi này.
