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
- [Skill chuyển đổi](../../viezanagent/skill/viezan-native-migration/SKILL.md)
- [Skill nghiệm thu UI](../../viezanagent/skill/viezan-native-ux/SKILL.md)
- [Figma — bản thiết kế để review](https://www.figma.com/design/AXNXvFbXPr5CK1K5Vjhz6b)

Prompt tiếp tục:

> Dùng workflow native-migration, đọc native-implementation/PAUSED-2026-10-27.md.
> Hoàn tất checklist foundation, build/test và nghiệm thu nền trước Trang chủ.
> Giữ Electron, dữ liệu và các thay đổi ngoài phạm vi nguyên vẹn.

Thiết kế được nghiệm thu riêng với runtime. Không dùng screenshot hoặc prototype
để tuyên bố đã hỗ trợ native, background task, accessibility hay khôi phục dữ liệu.

Hướng thiết kế duy nhất cho native và đợt nối backend–frontend 2026-11-02: [docs/design/direction.md](../design/direction.md), [native code 49](native-implementation/native-code-49.md), [native code 50](native-implementation/native-code-50.md) (toast/Hoàn tác dùng chung, Phiên dịch), [native code 51](native-implementation/native-code-51.md) (Cài đặt: bộ ghi phím tắt, làm mới lượt, nhà cung cấp theo hàng), [native code 52](native-implementation/native-code-52.md) (cập nhật trong app, Giọng nói, Model AI local), [native code 53](native-implementation/native-code-53.md) (Chat dán/thả ảnh, chân panel Dịch), [native code 54](native-implementation/native-code-54.md) (vai trò màu, Module theo nhóm, panel Phiên này, So sánh chuẩn), [native code 55](native-implementation/native-code-55.md) (bước nghiên cứu, diff So sánh, kế hoạch Ứng dụng theo nhóm, tỷ lệ bố cục thành token), [native code 56](native-implementation/native-code-56.md) (dải chạy nền, huy hiệu khoá, bảng lệnh mở rộng, meta câu trả lời), [native code 57](native-implementation/native-code-57.md) (tổng hợp theo tab, lịch sử Phiên dịch, bảng hiệu năng local — khép loạt).

Review 18 follow-up: [native code 40](native-implementation/native-code-40.md) records Settings/Dictionary alignment, successful local builds, and the concurrent-review blocker.
