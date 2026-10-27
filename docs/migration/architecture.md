# Kiến trúc đề xuất và lộ trình

## Hiện trạng mã nguồn sau cutover

Entry point hiện tại là SwiftUI/AppKit + Swift trên macOS và Qt Quick/QML + C++
trên Windows/Linux. Không có Rust bridge hoặc Electron runtime trong đường chạy
native; hai implementation dùng chung tài nguyên và hợp đồng dữ liệu tại
`contracts/native-workbench`. Build/đóng gói nằm trong `scripts/native/`.

Xem [bảng nguồn hiện tại](native-implementation/full-migration-status.md) và
[native code 38](native-implementation/native-code-38.md). Bản macOS review đã
build và mở trước lượt audit này; các sửa đổi mới chưa build/test theo chỉ dẫn
của người dùng. Windows/Linux chưa được xác nhận build. Phần kế hoạch bên dưới lưu quyết định và hiện trạng ở
thời điểm trước cutover; các câu mô tả Electron hoặc Rust không còn là entrypoint
hiện tại, cũng không phải bằng chứng nghiệm thu native.

## Quyết định làm việc

| Phần | Hướng đề xuất | Cổng quyết định |
| --- | --- | --- |
| macOS | SwiftUI + AppKit khi cần | Chat dài, IME, focus, nhiều cửa sổ |
| Windows/Linux | Qt 6 + Qt Quick/QML, chung UI có adapter OS | DPI, accessibility, Wayland, đóng gói |
| Lõi | Rust library sau spike | Streaming, cancellation, Swift/Qt bridge, build |
| Mobile | SwiftUI / Kotlin Compose trong kế hoạch | Chưa tạo project hoặc triển khai |

Hai UI, ba nền tảng nghiệm thu. Không coi Qt là WinUI, không coi một theme là
bằng chứng native. Rust là ứng viên, chưa là quyết định không thể đảo ngược.
Nếu FFI quá tốn kém, ghi ADR so sánh thư viện với sidecar có IPC có kiểu trên desktop;
không mặc định mở HTTP server hoặc mang sidecar sang iOS.

## Hiện trạng đã đối chiếu

Electron + React, IPC và typed preload trong electron/ và shared/; provider trong
electron/ipc/providers/; state trong src/store/; Swift helpers trong native/.
Không đổi cấu trúc hiện tại chỉ để làm khung mới. native/ đang chứa helper thật,
không dùng lại nó làm thư mục app mới.

## Ranh giới đích

`apps/macos/`, `apps/desktop-qt/` và `contracts/native-workbench/` hiện có bản
preview với provider mô phỏng và mã adapter Ollama chưa kiểm thử; xem [build và giới hạn](native-implementation/README.md).
`crates/viezan-core/` vẫn là đề xuất, chưa có bridge Rust; adapter Ollama trực tiếp đã có mã nhưng chưa được chạy kiểm chứng.

- apps/macos/: SwiftUI, AppKit, presentation state và platform adapters.
- apps/desktop-qt/: QML, Qt/C++, Windows/Linux adapters.
- crates/viezan-core/: domain, provider protocols, task state machine, persistence.
- contracts/: versioned DTO, fixtures, error codes, compatibility tests.

UI -> application service -> core. OS capabilities qua interface có typed result;
quyền đặc biệt ở helper riêng. Không đưa raw credentials vào UI state, log, Figma
hoặc fixtures. Core chỉ nhận bí mật trong adapter nội bộ khi cần gọi provider.
FFI phải có ownership, free function, lifetime callback, thread affinity và
error conversion rõ; không để Rust panic đi qua FFI. Callback UI về main thread.

## Đa nhiệm

TaskId, SessionId, OperationId và attemptId tách biệt. Mỗi event mang định danh
để kết quả trễ không ghi vào phiên mới. Snapshot provider/model khi submit.
State: queued -> running -> succeeded | failed | cancelled; cancelling là trạng thái
chuyển tiếp. Retry tạo attempt mới; không append trùng output. Giới hạn concurrency
per provider và local model, có backpressure cho stream. Không hiển thị phần trăm
nếu không có tổng công việc xác định.

Draft và kết quả hoàn tất được lưu; process bị ngắt khôi phục thành interrupted,
không giả vờ running, không tự gọi AI/tốn phí. Chuyển phiên không đồng nghĩa cancel; không thiết kế thêm dải tab.
Đóng cửa sổ và Quit là hai hành vi riêng theo OS. Thu âm luôn hiển thị rõ, không
ngầm tiếp tục sau khi app được mở lại. Không đặt giới hạn concurrency tùy ý trước
khi đo tài nguyên và rà điều khoản/provider limits.

## Migration dữ liệu

Inventory settings, histories, drafts, attachments, presets, provider IDs và khóa.
Dùng schema version, backup có checksum, dry-run, import transaction, report số lượng
và validation nội dung. Không cho Electron/native cùng ghi một database.
Import thử trong dữ liệu riêng, chạy lại phải idempotent. Giữ bản gốc để rollback.
Không giả định đọc được Electron safeStorage từ Swift/Rust; mặc định yêu cầu nhập
lại API key vào kho khóa OS. Không export bí mật dạng rõ.

## Các giai đoạn và cổng ra

0. Inventory capability từng OS, baseline Electron, kiến trúc đề xuất + UX review.
1. Spike: chat giả lập rồi một provider thật theo cấu hình người dùng; stream,
   cancel, đổi phiên, save/reopen trên SwiftUI và Qt. Chạy Qt trên Windows/Linux thật
   trước khi chốt bridge. Build được trên Mac không chứng minh hỗ trợ hai OS kia.
2. Chuyển Chat/Translate/Dictionary/Settings theo từng lát cắt, kèm fixtures parity.
3. Tích hợp audio/launcher/helper/extension; đánh giá sandbox, portal, signing,
   license Qt và phân phối từ tài liệu chính thức trước lựa chọn gói phát hành.
4. Import thử, beta song song, rollback, ký/package/update cho từng OS.
5. Chỉ thay Electron khi ma trận nghiệm thu tương ứng được chấp nhận.

Không tự commit/push/release hoặc xóa Electron khi thực hiện skill. Scope mobile:
DTO độc lập desktop, task cancellation, storage adapter; sync cloud và mobile UI
là các quyết định sau, không tự thêm dịch vụ trung gian.


### Source continuation, 2026-10-27 (code 33)

[Native code 33](native-implementation/native-code-33.md) adds cloud transports,
OS credential storage, audio input/speech, attachments/OCR/capture, language
operation templates, Ollama model operations and native backup/session management.
The user explicitly waived build/test execution. These source additions have no
new compilation/runtime evidence and do not complete the full migration. Native
backup import is distinct from the still-pending Electron data adapter. Existing
Electron entrypoints remain until the outstanding capability inventory is covered.
