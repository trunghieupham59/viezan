# Qt/QML · Sprint 3 · 24/11/2026

## Thay đổi theo file

Các đường dẫn trong bảng tính từ `apps/desktop-qt/`.

| Story | File | Thay đổi |
| --- | --- | --- |
| N1 | `ModelCatalog.{h,cpp}`, `LocalProvider.{h,cpp}`, `ProviderDiscovery.h`, `WorkbenchBridge.{h,cpp}` | Đọc ID và số byte từ cùng phản hồi `/api/tags`. Cả khám phá provider lẫn làm mới thủ công đều chuyển dung lượng cùng danh sách. Chỉ nhận số dương, hữu hạn và dưới 10¹⁵ byte. |
| N1 | `qml/LocalModelSettings.qml`, `qml/Kit.qml` | Hàng `CardRow` hiện tên model và dòng phụ như “2,6 GB · ollama:qwen3:4b”. Khi runtime thiếu dung lượng, dòng phụ chỉ còn ID. Tên và ID hiển thị dưới dạng văn bản thuần. |
| N2 | `qml/ChatTranscript.qml`, `qml/Kit.qml` | Chip dưới câu trả lời nghiên cứu tính giờ từ `task.started`, dùng chữ số có độ rộng cố định và cập nhật mỗi giây. Thiếu mốc bắt đầu thì dùng `researching`. Chip có một tên trợ năng cố định. Tác vụ thường dùng `chatAnswering`. |
| N3 | `qml/SettingsSearch.js`, `qml/SettingsWorkspace.qml`, `qml/Launcher.qml`, `qml/Main.qml`, `CMakeLists.txt` | Dùng chung bộ lọc `settingsSections` của Cài đặt. Từ hai ký tự, nhóm Viezan hiện tối đa ba mục và ưu tiên khớp tiêu đề. Khi tắt module Launcher, từ khóa của hàng phím tắt đã ẩn cũng bị loại khỏi mục Chung. Chọn kết quả mở cửa sổ chính ở đúng mục. |
| N1–N3 | `tests/WorkbenchBridgeTests.cpp` | Kiểm parser và hàng model bằng dữ liệu trong bộ nhớ, đồng hồ và tên trợ năng qua hai nhịp hiển thị, tìm bỏ dấu theo tiêu đề/mô tả/từ khóa và mở đúng mục bằng Enter. |

## Kết quả kiểm

Áp dụng workflow và quy tắc `native-migration`, `ui-ux.md`, Viezan Native UX, hướng dẫn *Contextual Live Badge Updates* của UI UX Pro Max và ghi chú Designer N1–N3.

Build Release đạt trên macOS arm64, Qt 6.12.0, bằng `cmake --build .native-build/qt --config Release -j 6`. Năm vị trí cảnh báo bỏ qua kết quả `QFile::open` trong `LocalProvider.cpp` và `Research.cpp` đã có ở HEAD. Lượt build cuối không phát sinh cảnh báo mới.

QtTest dùng Fusion/offscreen và thư mục home tạm. Tổng kết nguyên văn của từng lượt lọc sau chỉnh sửa cuối, gồm cả init/cleanup.

| Story | Hàm QtTest | Kết quả |
| --- | --- | --- |
| N1 | `localCatalogUsesOnlyValidSizes`, `localModelProgressTracksLayerAndClearsOnExit` | `Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 327ms` |
| N2 | `researchChipFollowsRunningTask`, `glassChatStates:820-dark` | `Totals: 4 passed, 0 failed, 0 skipped, 0 blacklisted, 1545ms` |
| N3 | `launcherOpensMatchingSettingsSection`, `w4SettingsSearchIme`, `w5bLauncher` | `Totals: 5 passed, 0 failed, 0 skipped, 0 blacklisted, 1535ms` |

Tổng kết nguyên văn của `ctest --test-dir .native-build/qt -C Release --output-on-failure -j 4`.

```text
100% tests passed out of 9

Total Test time (real) =  27.75 sec
```

`git diff --check -- apps/desktop-qt` đạt. Các file của lượt này nằm trong bảng trên và báo cáo này. So với đầu lượt, `git status --short` cũng ghi nhận `docs/design/screens/launcher.md` và `docs/design/glass2/SPRINT-DESIGN-NOTES-20261124.md` từ luồng song song.

## Chưa kiểm

Chưa mở app, dùng Ollama thật, chạy tác vụ nghiên cứu thật, thử trình đọc màn hình hay chạy trên Windows/Linux. QtTest bỏ qua một ca Glass tăng tốc có sẵn vì offscreen thiếu RHI.

## Cần Tech Lead xử lý

Thống nhất tiêu chí tìm mục Cài đặt giữa hai nền tảng và cập nhật spec Launcher. Qt tìm cả mô tả theo N3. Swift `settingsJump` hiện xét đầu từ trong tiêu đề và từ khóa ngắn. Ba story dùng chuỗi và token hiện có.
