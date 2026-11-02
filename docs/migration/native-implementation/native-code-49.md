# Native code 49 — Một hướng thiết kế, kiểm kê gap và nối backend–frontend đợt 1 (2026-11-02)

Phạm vi: SwiftUI/macOS. Qt không đổi (người dùng sẽ làm trên Windows sau).
Chạy thật bản ký `.native-build/ux-02/Viezan.app` 1400×860 và 820×700; ảnh ở
`evidence/native-direction-49/` (chỉ cửa sổ app, dữ liệu là của máy này).

## 1. Hiện trạng UI/UX trước khi sửa

Chụp 10 route của bản `9ef3676` (ux-01): bản native đã theo Review 18 khá đồng
nhất (sidebar vật liệu, header pill, thẻ flush, LanguageMenu). Điểm lệch quan sát:

| Nơi | Lệch |
| --- | --- |
| Toàn repo | Bốn nguồn thiết kế song song: boards Electron (`docs/design/boards`), Review 02 Liquid Glass (`docs/migration/macos27`), Review 18 (`desktop-review`), Figma. Mỗi lượt sửa UI phải chọn lại chuẩn. |
| Trang chủ | Gần đây chỉ có Chat/Dịch/Từ điển; phiên Phiên dịch không bao giờ xuất hiện dù `Interpretation.sessions` có dữ liệu. "Quản lý" mở Cài đặt ở mục đầu, không phải mục của model. |
| Hoạt động | Đếm và liệt kê chỉ tác vụ văn bản; phiên dịch đang nghe (chạy nền sau khi rời trang) không có trong panel. |
| Bảng lệnh ⌘K | Lệnh của module đã tắt vẫn hiện, chọn thì không làm gì. |
| Dịch mọi nơi | Thẻ xem trước dùng chữ mẫu, nhưng "Mở trong Dịch" gieo chữ mẫu thành phiên thật và "Sao chép" chép chữ mẫu vào clipboard. |
| Từ điển | Ô ngữ cảnh là dòng chữ trần dưới ô từ có khung. |
| Nhiệt độ & quạt | Menu "Thiết lập helper" luôn có cả Đăng ký lẫn Gỡ bất kể helper đã cài hay chưa. |
| Toàn bộ view | 50 chỗ dùng kiểu chữ hệ thống (`.callout`, `.caption`, `.headline`, `.title2`, `.title3`) bên cạnh thang `Font.vzn`, nên cùng một vai trò có hai cỡ. |

Ba bản kiểm kê gap (Home/Chat/Dịch/Từ điển; Phiên dịch/Mọi nơi/Ứng dụng/Nhiệt
độ/Tiện ích/Launcher; Cài đặt/shell) đã được lập bằng cách đối chiếu spec +
prototype với mã; phần chưa làm ghi ở mục 4.

## 2. Hướng thiết kế duy nhất

Chốt **Quiet Workbench** (Review 18 trên native). Ghi ở
[`docs/design/direction.md`](../../design/direction.md); thứ tự ưu tiên nguồn
cập nhật trong `.claude/rules/ui-ux.md`; dòng quyết định trong
`docs/design/findings.md`. Bản vẽ trên Claude Design:
<https://claude.ai/artifact/VeqxUQ2GsC716JPr1vVreM> (board hệ thống thiết kế +
AI Chat sáng, Dịch tối, Cài đặt, Dịch hẹp 820, Launcher). Board Cài đặt vẽ
công tắc "Làm mới lượt đã hoàn tất" là đích; domain native chưa có.

## 3. Thay đổi mã (SwiftUI)

| Phần | Thay đổi |
| --- | --- |
| Điều hướng | `Notification.Name.viezanOpenRoute` (`ImageControls.swift`); `WorkbenchView` nhận và `select(route)`. Dùng cho Từ điển › Dịch/AI Chat và Dịch mọi nơi › Mở trong Dịch, thay cho `setRoute` (chỉ lưu `lastRoute`, không đổi màn). |
| Trang chủ | `RecentEntry` gộp `Session` và `InterpretationSession` (có segment hoặc tóm tắt), sắp theo thời gian; tab lọc thêm "Phiên dịch"; hàng phiên dịch hiện thời điểm, cặp ngôn ngữ, "Đang nghe" nếu đang chạy; mở lại = `interpretation.select` + route `interpret`. "Quản lý" mở `localModels` hoặc `providers` theo model đang dùng. |
| Hoạt động | Badge đếm thêm `interpretation.busy`; `ActivityView` có thẻ phiên dịch (Mở → route interpret, Dừng → `interpretation.stop()`), tham số `openRoute` mới; vòng Tab bao gồm hai nút này. |
| Bảng lệnh | `NativeCommands.entries` lọc `store.moduleEnabled`. |
| Dịch mọi nơi | Thẻ xem trước chỉ còn "Mở trong Dịch" (outline, tắt khi module Dịch tắt); bỏ sao chép và gieo chữ mẫu. |
| Từ điển | Ô ngữ cảnh có khung `controlRadius` cao `control`, cùng bề mặt/viền với ô từ. |
| Nhiệt độ | `helperActions`: Đăng ký chỉ khi helper chưa cài; Mở Cài đặt hệ thống chỉ khi chờ duyệt; Gỡ chỉ khi đã cài/chờ duyệt. |
| Chữ | Thay toàn bộ `.callout/.caption/.caption2/.headline/.title2/.title3` trong `ViezanNative` bằng `Font.vzn("smallScale" / "captionScale" / "labelScale" semibold / "headingScale" semibold / "titleScale" semibold)`. 149 chỗ dùng `.vzn` sau sweep, 0 kiểu hệ thống còn lại. |
| Test | `FoundationRuntimeTests` gọi `ActivityView` với `openRoute`. |

## 4. Chạy thật sau khi sửa (macOS)

- Trang chủ › tab "Phiên dịch": sáu phiên 28 thg 10 hiện đúng thời điểm và cặp
  "Tự động nhận dạng → Tiếng Việt" (`home-interp.jpg`); bấm hàng đầu mở trang
  Phiên dịch đúng phiên 13:50.
- "Quản lý" với model Claude mở Cài đặt › Nhà cung cấp AI (`manage.jpg`).
- Từ điển: ô ngữ cảnh có khung thẳng hàng với ô từ (`dictionary.jpg`).
- Dịch mọi nơi: thẻ xem trước còn một nút (`everywhere.jpg`).
- Chưa chạy thật: thẻ phiên dịch trong Hoạt động (cần bật ghi âm thật — không
  làm trong phiên tự động), menu helper ở trạng thái đã cài (máy này chưa cài
  helper; nhánh "chưa cài" hiện chỉ Đăng ký như thiết kế).

## 5. Kiểm tra

- `swift build` (ViezanNative) PASS; `swift test --package-path apps/macos`:
  41 test ViezanNativeTests + suite ViezanDomain PASS.
- `node scripts/native/documentation.mjs` PASS (2.4.2); `generate-resources.mjs --check`
  PASS (3 locale, 41 metric); `validate-viezanagent.mjs` PASS (36 json, 246 ref);
  `node --test scripts/native/__tests__/domain.test.mjs` PASS.
- Không chạy: Qt (ngoài phạm vi), VoiceOver, ba cỡ chữ, 640 pt.

## 6. Còn lại (theo kiểm kê, ưu tiên gợi ý)

1. **Shell:** toast + Undo dùng chung (chưa có hệ thống toast nào); hộp cập
   nhật trong app + kiểm tra nền; dải "Đang chạy nền" và huy hiệu "Chưa có key"
   ở sidebar; bảng lệnh có máy tính, Hỏi AI, tiền tố `t `/`d `.
2. **Phiên dịch:** đồng hồ phiên, tiêu đề phiên, tự cuộn + "Xem mới nhất",
   panel "Phiên này", hộp tóm tắt có tab, chọn model từ danh sách (hiện là ô
   chữ), lưu `deviceID`, cửa sổ phụ đề neo đáy màn hình.
3. **Cài đặt:** công tắc "Làm mới lượt đã hoàn tất" (domain + UI), bộ ghi phím
   tắt thay ô chữ "Option+T", Nhà cung cấp theo hàng (thêm/sửa/xoá, xác minh
   khoá, link lấy key), danh sách model gợi ý và tiến độ tải ở Model AI local,
   Giọng nói (chế độ TTS, tốc độ, nghe thử, trạng thái STT), Module chia nhóm
   và khoá module cuối, Cập nhật (kênh, tự kiểm tra), Giới thiệu.
4. **Dịch:** bộ chọn Văn bản/Ảnh/Giọng, cặp ngôn ngữ ghim, đếm ký tự, dùng
   kết quả làm nguồn, So sánh có tiến độ/diff/persist; đảo chiều khi nguồn
   "auto" đang gán cứng "en".
5. **Chat:** panel hội thoại cạnh chat (Review 12/13), trạng thái trống có gợi
   ý, kéo-thả/dán ảnh, bước nghiên cứu chi tiết, nguồn trích dẫn.
6. **Ứng dụng / Nhiệt độ:** hàng dữ liệu liên quan và dung lượng trong danh
   sách, trạng thái app đang chạy; chế độ từng quạt, lưu trạng thái thành
   profile, tuỳ chọn thanh menu.
7. **Vocabulary còn sót:** `Color(nsColor: .systemRed/.systemGreen/…)` và
   `Color.accentColor.opacity` ở `ApplicationsWorkspace`, `HistoryViews`,
   `InterpretationWorkspace`, `NativeCommands`, `QuickTranslate`; literal
   `* 2`/`* 3`/`0.22`/`/ 110` ở `BridgeSettings`, `InterpretationWorkspace`,
   `Launcher`, `ThermalWorkspace`.
