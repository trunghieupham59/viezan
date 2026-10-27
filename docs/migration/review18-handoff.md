# Review 18 — bàn giao thiết kế desktop

Ngày kiểm tra: 2026-10-26. Phạm vi: prototype trong `desktop-review/`.
Không thay đổi Electron production, không tạo app SwiftUI/Qt, không triển khai mobile.

## Quyết định triển khai

Có thể dùng bản này làm đầu vào cho **lát cắt native đầu tiên**: shell + Chat +
Dịch + lịch sử + tác vụ giả lập. Chưa chấp nhận chuyển toàn ứng dụng sang native.
User acceptance và review chéo Fable 5.1 vẫn pending; runtime ba OS là NOT RUN.

Claude Code 2.1.310 đã được gọi với model `claude-fable-5-1`, bộ đọc giới hạn
Read/Glob/Grep, không MCP, không quyền ghi, ngân sách tối đa 8 USD. Người dùng
đã cho phép gửi 7 ảnh dữ liệu mẫu và 17 file đã chọn. Lần gọi có mạng trả
`Invalid API key`, `is_error: true`, không có model usage. **Không có nhận xét
nào trong bản này được gán cho Claude.** Người dùng đang cập nhật đăng nhập.
Bộ packet tạm: `/tmp/viezan-fable-review-20261026`; không đưa thông tin xác thực
vào tài liệu hoặc repository. Kết quả này không chứng minh model đã xử lý packet.

## Các lỗi đã sửa và kiểm tra

| Vấn đề | Hành vi Review 18 | Bằng chứng |
| --- | --- | --- |
| Model dùng chung làm đổi Chat khi chuyển tính năng | Snapshot model của Chat và từng tính năng độc lập; lưu ngữ cảnh trước khi điều hướng | Chat chọn gemma3:4b, Dịch vẫn qwen3:4b; quay về Chat giữ gemma3:4b và bản nháp |
| Hoạt động tràn khung 640 | Vị trí và chiều cao đo theo cửa sổ app, có điều chỉnh khi resize | Khung app x320–960; bảng x563–947, y109–564; nằm trong app |
| Chỉ Chat có Dừng/Thử lại | Hai tác vụ có cùng bố cục Mở + Dừng/Thử lại, tên truy cập riêng | Dừng Product brief: Dịch đã hủy, Chat đang chạy, badge 2 → 1; focus ở Thử lại |
| Mở tác vụ Dịch có thể vào nhầm bản nháp | Link mang danh tính Product brief; giữ bản nháp đang làm trong lịch sử | Mở Product brief rồi tìm “ban dich moi”, Enter mở đúng bản nháp đã nhập |
| Nút Tạo mới mất tên khi ẩn nhãn | Có accessible name và tooltip ở cả bốn tính năng | AX ở 640 còn “Chat mới”, “Tra cứu mới”; cùng hợp đồng cho Dịch/Phiên dịch |
| Lịch sử thiếu hành vi bàn phím/field focus | Tìm không dấu, mũi tên chuyển dòng, Enter mở, Escape trả về nút mở; search dùng border-strong | Đã thao tác trên browser; Linux 640 Escape trả focus đúng trigger |
| Kết quả mẫu còn hiện sau khi đổi nội dung | Ẩn kết quả cũ; vô hiệu Sao chép/So sánh; từ điển chỉ hiện mẫu khi đúng từ và cặp ngôn ngữ | Dịch bản nháp mới không còn hiển thị bản dịch Product brief |
| Đặc tả còn đề xuất thanh tab đã bỏ | Một header ngữ cảnh; Lịch sử + Tạo mới + Hoạt động; không thêm dải phiên | `workbench-ux.md`, `architecture.md`, `acceptance.md` đã cập nhật |

Ảnh và bản review trực quan: [gallery](desktop-review/audit/review18-handoff/index.html).
Ảnh chứng minh bố cục web prototype; không phải ảnh chạy app native Windows/Linux.

## Hợp đồng tương tác cần giữ khi port

1. **Header:** một tiêu đề có ngữ cảnh. Lịch sử là utility trung tính, Tạo mới là
   soft accent, Hoạt động tách nhóm. Sibling controls cùng semantic size. Ẩn nhãn
   không ẩn accessible name. Toolbar không bị kéo cửa sổ khi bấm control.
2. **Lịch sử:** mặc định popover không modal neo vào nút. Search, active record,
   empty result, Escape/outside click; giữ canvas. “Xem tất cả” mở thư viện với
   list + preview. Chọn preview không thay active session; Mở lại mới chuyển.
   Quay lại giữ bản nháp. History và Activity không cùng mở.
3. **Phiên/tác vụ:** `SessionId` độc lập `TaskId` và `attemptId`. Model được snapshot
   theo phiên/attempt, không có biến model toàn cục có thể ghi đè tính năng khác.
   Chuyển trang, đổi model, dừng tác vụ không làm mất draft. Late events phải kiểm
   tra ID. Retry tạo attempt mới. Không tự gọi lại provider khi khôi phục app.
4. **Dịch:** input/pair version gắn với result. Khi đổi input hoặc cặp ngôn ngữ,
   kết quả cũ phải được đánh dấu/ẩn, không được copy như kết quả hiện tại. Hai editor
   dùng cùng hàng header, vùng nội dung co giãn và hàng footer đồng chiều cao.
5. **Phiên dịch:** đổi cặp ngôn ngữ chỉ áp dụng từ segment kế tiếp, có marker;
   không dịch lại âm thầm đoạn cũ. Ghi âm thật phải có permission/indicator.
   Fixture của prototype không chứng minh pipeline âm thanh.
6. **Từ điển:** query và cặp ngôn ngữ là khóa của kết quả. Đổi query không được giữ
   định nghĩa của từ cũ dưới query mới. Saved words tách với recent lookups.
7. **Cài đặt:** workspace đầy đủ, nội dung cuộn riêng; dialog/sheet chỉ dành cho
   hành động hữu hạn. Model/provider phải giữ ID thật; không dùng nhãn thay ID.
8. **Focus:** Escape đóng lớp tạm trước, không hủy job; IME không gửi/dismiss;
   close trả focus về opener còn tồn tại. Text fields dùng caret và border, không
   accent ring. Nút dùng focus-visible rõ. Native testing phải bao gồm VoiceOver,
   Narrator/Orca, VI/JA IME và text scaling.

## Mapping nền tảng

Đây là hướng triển khai; API và khả năng SDK cần được xác nhận trong spike.

| Thành phần | macOS SwiftUI/AppKit | Windows Qt Quick | Linux Qt Quick |
| --- | --- | --- | --- |
| Shell/navigation | NavigationSplitView hoặc bố cục tương đương, toolbar/window controls hệ thống; AppKit bridge khi cần | App window + titlebar adapter; keyboard/focus conventions Windows | Qt window + decoration phù hợp compositor, không giả traffic lights |
| Material | System Liquid Glass cho chrome/control phù hợp; tránh chồng glass; fallback Reduce Transparency | Bề mặt trung tính, flyout gọn; native material chỉ khi adapter thực sự hỗ trợ | Bề mặt ổn định, theme/palette OS; không ép glass lên GNOME/KDE |
| Đọc/soạn | Opaque text surface, system typography; NSTextView bridge nếu SwiftUI không đạt selection/IME/long text | TextArea/virtualized transcript, kiểm tra IME, DPI và selection | Cùng domain/layout, kiểm tra font fallback, Wayland, input method |
| Lịch sử nhanh | Popover/control hệ thống, anchor và focus trong cửa sổ | Popup modeless, bounds theo app/container | Popup modeless, placement theo app; keyboard dismissal |
| Hoạt động | Modeless transient, task-specific stop/retry | Cùng state machine; control metrics adapter | Cùng state machine; không phụ thuộc global shortcut để truy cập |
| Settings | Workspace như bản được duyệt; bounded sheet cho Add Provider | Workspace + dialogs theo OS | Workspace + native file chooser/portal khi có |

Qt trên Windows không phải WinUI; Qt trên Linux không tự động đạt GNOME/KDE
native parity. CSS blur ở macOS cũng không chứng minh Liquid Glass thật. Giữ
semantic token names từ `src/styles/tokens.css`; không copy các px browser thành
metric cố định trên ba OS. Chuẩn hóa token adapter trong ADR trước khi có nhiều
bảng token thủ công. Mobile vẫn ngoài phạm vi.

## Lát cắt implement đề xuất

- **1 — contracts + fixture:** Session/Task/Attempt, draft lifecycle, result version,
  cancellation/retry và storage failure. Một bộ fixture dùng cho hai UI.
- **2 — SwiftUI shell + Chat/Dịch:** toolbar, popover, full library, Activity,
  opaque composer/reading; test thật trên macOS trước khi trau chuốt material.
- **3 — Qt shell + cùng fixture:** chạy trên Windows và Linux thật; kiểm DPI,
  IME, accessibility, Wayland. Không suy luận từ Qt chạy trên Mac.
- **4 — một provider thật:** typed bridge, streaming/cancel/reopen; callbacks
  về UI thread, late event isolation. Sau đó mới mở rộng Dict/Settings/Live.
- **5 — tích hợp OS riêng:** Launcher/global shortcuts, capture/audio,
  Applications, thermal/fan helper. Các module này cần capability matrix riêng;
  prototype không xác nhận được hỗ trợ phần cứng hay quyền trên từng OS.

Giữ Electron như baseline. Không import chuỗi JS override của prototype vào
production. Implement bằng component/state layer có trách nhiệm rõ; ưu tiên
review `HistoryTrigger`, `PageHeader`, `AppShell`, `AIChatSidebar` hiện có khi
đối chiếu semantics. Quy tắc sidebar của Electron không bị thay đổi bởi bản native
đề xuất này. Không đổi/xóa dữ liệu Electron trước import dry-run và rollback gate.

## Kiểm tra và phần chưa chứng minh

- PASS: syntax 7 JS sửa; Biome 0 error/0 warning (68 gợi ý style ở các lớp cũ); CSS mới tham chiếu
  token đã có, không thêm literal color/dimension; `check:atomic`, `check:design`.
- PASS: `check:docs`, `test:docs` (13 tests). README production vẫn đúng vì chỉ sửa
  prototype/spec đề xuất, không thay đổi tính năng shipped; không refresh review
  record chỉ để đổi timestamp. Không bump version.
- Browser QA: macOS light, Windows dark, Linux light; popover + Activity 640,
  record/draft restoration, stop độc lập, keyboard search/Enter/Escape, history/activity
  loại trừ nhau, Dịch trống không submit, Từ điển không giữ nghĩa sai query.
- Không chạy full build/TypeScript/product unit suite vì production TS/Electron
  không đổi. Atomic/design checks không scan prototype; không dùng chúng làm
  bằng chứng visual QA. Các stylesheet prototype cũ vẫn có literal debt.
- NOT RUN: actual native runtime, API streaming, persistence qua relaunch,
  1.000 history records, zoom/text scale, high contrast, full screen reader,
  VI/JA IME trên cả ba OS, sleep/wake/permissions, packaging/signing/performance.
- BLOCKED: review chéo Fable 5.1 do key không hợp lệ; chờ người dùng cập nhật.

Chỉ nâng trạng thái lên “ready to replace Electron” sau các gate trong
`acceptance.md`, không dựa vào ảnh đẹp hoặc một lượt review model.
