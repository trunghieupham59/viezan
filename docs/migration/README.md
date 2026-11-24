# Viezan Native — kế hoạch chuyển đổi

> **Đã tiếp tục 2026-10-27.** Đọc [checklist nền](native-implementation/foundation.md)
> và [bằng chứng mới](native-implementation/foundation-05.md). Hai bản foundation đã
> build/test trên macOS; nghiệm thu runtime còn mở. Chưa sang Trang chủ.
> [Bàn giao tạm dừng](native-implementation/PAUSED-2026-10-27.md) là mốc lịch sử.


Trạng thái: **đã có lát cắt SwiftUI chạy trên macOS** với provider mô phỏng.
Qt 6.12 đã build, chạy và kiểm thử C++/QML trên macOS; Windows và Linux vẫn cần
nghiệm thu trên máy tương ứng. Hai bản đều dùng dữ liệu preview riêng.
Ngày: 2026-10-26. Desktop trước; mobile chỉ thiết kế ranh giới kiến trúc.

## Bắt đầu

- [Implementation 01: build, phạm vi và giới hạn](native-implementation/README.md)
- [Implementation 02: lịch sử nhanh và xem trước thư viện](native-implementation/history-02.md)
- [Implementation 03: workspace Cài đặt và giao diện](native-implementation/settings-03.md)
- [Implementation 04: đọc Chat, vùng chọn và sao chép](native-implementation/chat-reading-04.md)
- **[Bàn giao 2026-10-28: UI/UX Review 18 — đọc trước khi làm tiếp](native-implementation/HANDOFF-2026-10-28.md)**
- [Native code 39: UI/UX Review 18 trên SwiftUI và Qt, có ảnh chạy thật](native-implementation/native-code-39.md)
- [Bằng chứng runtime và kiểm thử](native-implementation/verification.md)
- [Kiến trúc và lộ trình](architecture.md)
- [Quy tắc UI/UX đa nhiệm](workbench-ux.md)
- [Ma trận nghiệm thu](acceptance.md)
- [Review 01: màn hình, bằng chứng và giới hạn](review-01.md)
- [Review 02: toàn bộ module macOS 27 / Liquid Glass](macos27-review.md)
- [Review 03: bộ thiết kế macOS, Windows, Linux](desktop-review/README.md)
- [Plugin và công cụ](tooling.md)
- [Skill chuyển đổi](../agents/skill/viezan-native-migration/SKILL.md)
- [Skill nghiệm thu UI](../agents/skill/viezan-native-ux/SKILL.md)
- [Figma — bản thiết kế để review](https://www.figma.com/design/AXNXvFbXPr5CK1K5Vjhz6b)

Prompt tiếp tục:

> Dùng workflow native-migration, đọc native-implementation/PAUSED-2026-10-27.md.
> Hoàn tất checklist foundation, build/test và nghiệm thu nền trước Trang chủ.
> Giữ Electron, dữ liệu và các thay đổi ngoài phạm vi nguyên vẹn.

Thiết kế được nghiệm thu riêng với runtime. Không dùng screenshot hoặc prototype
để tuyên bố đã hỗ trợ native, background task, accessibility hay khôi phục dữ liệu.

Hướng thiết kế duy nhất cho native và đợt nối backend–frontend 2026-11-02: [docs/design/direction.md](../design/direction.md), [native code 49](native-implementation/native-code-49.md), [native code 50](native-implementation/native-code-50.md) (toast/Hoàn tác dùng chung, Phiên dịch), [native code 51](native-implementation/native-code-51.md) (Cài đặt: bộ ghi phím tắt, làm mới lượt, nhà cung cấp theo hàng), [native code 52](native-implementation/native-code-52.md) (cập nhật trong app, Giọng nói, Model AI local), [native code 53](native-implementation/native-code-53.md) (Chat dán/thả ảnh, chân panel Dịch), [native code 54](native-implementation/native-code-54.md) (vai trò màu, Module theo nhóm, panel Phiên này, So sánh chuẩn), [native code 55](native-implementation/native-code-55.md) (bước nghiên cứu, diff So sánh, kế hoạch Ứng dụng theo nhóm, tỷ lệ bố cục thành token), [native code 56](native-implementation/native-code-56.md) (dải chạy nền, huy hiệu khoá, bảng lệnh mở rộng, meta câu trả lời), [native code 57](native-implementation/native-code-57.md) (tổng hợp theo tab, lịch sử Phiên dịch, bảng hiệu năng local — khép loạt), [native code 58](native-implementation/native-code-58.md) (nút thu gọn neo một chỗ theo quy tắc Finder, rail một loại hình, animation đổi bề rộng), [native code 59](native-implementation/native-code-59.md) (AI Chat: composer giữa màn khi trống, một hàng nở năm dòng, Enter gửi, Tiếp tục), [native code 60](native-implementation/native-code-60.md) (menu chọn model: mục đích, gần đây, model mới nhất mỗi dòng, Tất cả, Trên máy), [native code 61](native-implementation/native-code-61.md) (thư viện lịch sử: lọc phiên trống, sắp xếp, sửa mã tiêu đề, xem trước trao đổi, Xoá hoàn tác, bộ lọc tính năng), [native code 62](native-implementation/native-code-62.md) (AI Chat: gợi ý thói quen tầng 2/3, bốn mức suy luận trên macOS), [native code 63](native-implementation/native-code-63.md), [native code 64](native-implementation/native-code-64.md), [native code 65](native-implementation/native-code-65.md), [native code 66](native-implementation/native-code-66.md), [native code 67](native-implementation/native-code-67.md), [native code 68](native-implementation/native-code-68.md), [native code 69](native-implementation/native-code-69.md), [Qt parity 1](reports/native-migration-report-20261124-qt-parity-1.md), [Qt parity 2](reports/native-migration-report-20261124-qt-parity-2.md), [Qt parity 3](reports/native-migration-report-20261124-qt-parity-3.md), [Qt parity 4](reports/native-migration-report-20261124-qt-parity-4.md), [Qt parity 5](reports/native-migration-report-20261124-qt-parity-5.md), [Qt parity 6](reports/native-migration-report-20261124-qt-parity-6.md), [Qt parity 7](reports/native-migration-report-20261124-qt-parity-7.md), [Qt parity 8](reports/native-migration-report-20261124-qt-parity-8.md), [Qt parity 9](reports/native-migration-report-20261124-qt-parity-9.md), [Qt parity 10](reports/native-migration-report-20261124-qt-parity-10.md), [Qt parity 11](reports/native-migration-report-20261124-qt-parity-11.md), [Qt parity 12](reports/native-migration-report-20261124-qt-parity-12.md), [Qt parity 13](reports/native-migration-report-20261124-qt-parity-13.md), [Qt parity 14](reports/native-migration-report-20261124-qt-parity-14.md), [Qt parity 15](reports/native-migration-report-20261124-qt-parity-15.md), [Qt parity 16](reports/native-migration-report-20261124-qt-parity-16.md), [Qt parity 17](reports/native-migration-report-20261124-qt-parity-17.md), [Qt parity 18](reports/native-migration-report-20261124-qt-parity-18.md), [Qt parity 19](reports/native-migration-report-20261124-qt-parity-19.md) (audit trợ năng macOS và checklist kiểm tay), [native code 70](native-implementation/native-code-70.md), [native code 71](native-implementation/native-code-71.md), [native code 72](native-implementation/native-code-72.md), [native code 73](native-implementation/native-code-73.md), [native code 74](native-implementation/native-code-74.md), [native code 75](native-implementation/native-code-75.md), [native code 76](native-implementation/native-code-76.md), [native code 77](native-implementation/native-code-77.md), [native code 78](native-implementation/native-code-78.md), [native code 79](native-implementation/native-code-79.md), [native code 80](native-implementation/native-code-80.md), [native code 81](native-implementation/native-code-81.md), [native code 82](native-implementation/native-code-82.md). Việc còn mở sau ngày 2026-11-24: [open work](reports/native-migration-report-20261124-open-work.md).

Review 18 follow-up: [native code 40](native-implementation/native-code-40.md) records Settings/Dictionary alignment, successful local builds, and the concurrent-review blocker.
