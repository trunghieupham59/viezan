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
