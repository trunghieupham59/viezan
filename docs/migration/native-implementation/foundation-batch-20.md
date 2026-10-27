# Foundation batch 20 — Electron → Swift, đồng bộ Review 18

2026-10-27. Batch này hoàn thiện một phần controls/hành vi, chưa migrate đủ
cấu trúc shell Electron. Nhận định hoàn tất trước đây quá rộng; được sửa lại sau
đối chiếu ảnh người dùng. Xem [Shell 21](foundation-shell-21.md).
macOS user acceptance còn chờ. Chưa Trang chủ. Kế thừa các phần native đã có,
không viết lại phần đã kiểm chứng và không chuyển cả mã React sang Swift.

Workflow: native-migration + sync-docs. Rules: native-migration và
viezan-product-engineering. Skills: viezan-native-migration/viezan-native-ux.
Acceptance liên quan F01–F08, UX05/UX07/UX08/UX09.

## Đối chiếu theo phạm vi trọn phần

| Nguồn Electron / hợp đồng | Swift tương ứng và kết quả đợt này |
| --- | --- |
| `AppShell.tsx`, `PageHeader.tsx`: shell, chỗ đặt controls, vùng kéo, nội dung/overlay tách biệt | WorkbenchView: giữ titlebar native/traffic lights, toggle riêng, title truncate trước actions; material chrome và reading surface đục |
| `PrimaryNavigationSidebar.tsx`: 236/60, compact 900, preference độc lập route | NativeNavigation/ShellLayout: giữ rail/overlay và preference; đồng bộ selected text/icon accent soft; disabled navigation dùng system gray |
| `Button` atoms: cùng kích thước, semantic state, disabled thật | ShellToolbarButton/NativePanelButton: dùng NSButton cho Close ở tất cả panel, Retry storage, Activity/library; disabled được truyền từ SwiftUI và không nhận first responder |
| `CommandPalette.tsx`: tìm lệnh, selection, shortcut, empty state | NativeCommands: giữ command routing/IME guards; search chờ gắn vào window trước focus; selected accent + tooltip; panel đo nội dung và bounded scroll, no-results không chiếm nguyên chiều cao |
| History context + explicit Open trong Review 18 | QuickHistory/library: shared selected appearance, title tooltip, anchored panel, bounded lists, empty state đơn, preview đổi mục về đầu; active draft không đổi khi chỉ preview |
| Trạng thái tác vụ nền, cancel/retry độc lập trong workbench contract | Activity: giữ task identity; chuyển focus Stop → Retry → Stop hoặc Open khi control biến mất, không rơi về nền |
| Error/recovery surface: thông báo và hành động nhìn thấy, không phá layout | Storage banner: icon + text semantic error, Retry native primary 36pt, chuyển sang xếp dọc ở width hẹp; load blocked vẫn không sửa snapshot lỗi |
| Lifecycle và state preservation | Giữ Close/reopen, Quit/save failure, recovery không tự gửi provider, độc lập session/model/draft; regression suite chạy cuối batch |
| Locale/type/theme của Electron | Giữ adapter sinh từ EN/VI/JA + tokens.css; không thêm literal màu/kích thước hay copy riêng cho Swift; semantic system colors và material macOS |

Các khả năng ngoài foundation không được giả lập thành chức năng đã migrate:
AI answer/calculator của palette, provider thật, updater, tray/OS utilities,
onboarding và toàn bộ các module chưa native. Sidebar chỉ hiện route đang hoạt động.
Chat/Dịch/Settings đang dùng làm workspace preview để kiểm shell, không phải hoàn tất
redesign của các module đó. Foundation ở đây theo phạm vi trong PAUSED/foundation.md.

## Cách kiểm thử theo đợt

- Trong lúc sửa: 3 test tập trung cho delayed focus, disabled action, vòng
  Stop/Retry. Không render lại full matrix sau từng chỉnh sửa.
- Cuối batch: Swift build và 39 tests PASS (22 native + 17 domain).
- Một full matrix cuối: 276 layout + 48 failure fixtures = 324, EN/VI/JA ×
  light/dark × 640/820/1200/1440, gồm command-empty. Control geometry assertions
  kiểm nút thực trong host, bên cạnh kiểm trạng thái/session/focus.
- Atomic/Design, generated resources freshness, 13 docs tests, check:docs và
  diff whitespace PASS. Không thêm token/literal presentation trùng canonical.
- CUA build đã package: Command search nhận focus; no-results panel co gọn;
  Escape về opener. Cửa sổ được thu bằng Window → Move & Resize → Top Left,
  ảnh 2034×1186 pixels (~1017×593pt): title không đè actions, toggle/traffic lights
  riêng. Đã Return to Previous Size; bản nháp QA giữ nguyên.
- Kéo mép qua CUA chưa đưa window về đúng 640/820pt: các kích thước này chỉ xác
  nhận bằng mounted fixtures. VoiceOver/IME thực tế chưa chạy lại trong batch.
- Electron TS/build/web, Qt và Windows/Linux: Not run — chỉ sửa Swift và docs.

Evidence: `evidence/foundation-batch-20/`; toàn bộ matrix tại
`/tmp/viezan-foundation-batch-matrix`, `/tmp/viezan-foundation-batch-failures`.
App: `apps/macos/.build/Viezan Native Preview.app`.

## Một lượt nghiệm thu thủ công còn lại

1. **Cửa sổ hẹp:** mở preview, kéo về nhỏ nhất 640×480 rồi khoảng 820pt. Kiểm
   traffic lights/toggle/title/actions không chồng; sidebar rail mở thành overlay;
   chọn trang/Escape đóng overlay, mở rộng >900pt khôi phục preference cũ.
   Mở ⌘K, nhập từ không khớp rồi xóa: panel co/giãn, bảy lệnh còn vào được.
2. **Keyboard và IME:** tại search ⌘K, chuyển VI/JA, nhập chữ đang composition;
   Return xác nhận chữ không thực thi lệnh. Sau commit, arrows/Return chọn đúng
   lệnh; Escape về opener. Dùng riêng phiên QA với model chậm để thử Activity:
   Tab tới Dừng → Space → focus Thử lại → Space → focus Dừng; không thử trên task thật.
3. **VoiceOver và visual:** bật ⌘F5 (hoặc Fn⌘F5), duyệt navigation/panel/search,
   nghe tên/selected/disabled và kiểm focus ring. Lặp cửa sổ hẹp với JA/dark,
   sau đó trả language/theme/input/VoiceOver về trạng thái ban đầu.

Chỉ cần báo control, bước và ảnh khi có lệch. Không cần chạy lại toàn bộ fixture
hoặc chuyển sang Trang chủ. Runtime automation PASS không thay thế user acceptance.
