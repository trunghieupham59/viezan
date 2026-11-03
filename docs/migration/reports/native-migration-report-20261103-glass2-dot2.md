# Liquid Glass 2.0 · Đợt 2 — Trang chủ, AI Chat, lớp nổi shell, lịch sử (macOS)

Ngày 2026-11-03 · nhánh `develop`, trên Đợt 1 (chưa commit) · không commit.
Nguồn: [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Trang chủ",
"AI Chat", "Thư viện lịch sử"; board Home, Chat-Empty, Chat-Active, Chat-Dark,
History, History-Archived, Overlays.

## Kiểm tra trước

- Báo cáo Đợt 1 có: [native-migration-report-20261103-glass2-dot1.md](native-migration-report-20261103-glass2-dot1.md).
- Shell (sidebar / header / nền) đã khớp Home.png theo ảnh đối chiếu của Đợt 1.

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| Trang chủ | Hàng intro gồm dải kính model (chấm trạng thái · "Claude · Haiku 5.5" · "sẵn sàng · xử lý qua cloud" · Quản lý lặng màu nhấn) và "Tạo mới" chính. Khi hẹp, dải bỏ phần trạng thái trước, rồi xếp xuống dưới intro. Bắt đầu nhanh là 4 ô kính 56 pt, ô icon theo màu tone (4 → 2 → 1 cột). Gần đây là danh sách phẳng `.row` (icon nhấn, tiêu đề 14, chi tiết 12, hover là lens, vạch lùi 12), bộ lọc `.seg` bên phải nhãn nhóm. Bỏ thẻ bao lưới và thẻ model bên phải. "Đang diễn ra" giữ nguyên. | `HomeWorkspace.swift` |
| Composer Chat | Capsule 52 nổi (surface-raised, viền sáng, bóng bên ngoài; bo 26 khi một dòng, 22 khi xếp hai tầng). Gõ chữ làm viền đậm hơn. Nhóm model + mic là một kính, có vạch 18 giữa. Chip đọc `✦ Haiku 5.5 ⌄` (✦ màu nhấn). Nút Gửi là nút tròn 36 vẽ gradient nhấn. | `Workspaces.swift`, `ViezanApp.swift` (ModelPicker), `NativeFoundation.swift` (ShellToolbarButton: chevron phía sau, chỗ trống cho ✦), `NativeKit.swift` (`PrimaryFace` dùng chung cho `.vznPrimary` và nút Gửi) |
| Transcript | Bong bóng người dùng trung tính bo 18/18/6/18. Nhãn "✦ Viezan" 12 semibold. Hàng meta theo thứ tự Sao chép · Thử lại · chip "Haiku 5.5 · n token" 22 pt. Hàng "Tiếp tục" dùng icon màu nhấn. | `Workspaces.swift` |
| ⌘K | Lớp `.float` rộng 560 (token `--vzn-dialog-md-max-inline`), giữa cửa sổ. Đầu bảng là ô tìm trần kèm nút Đóng. Có các nhóm Kết quả · TRANG · THAO TÁC, hàng cao 40 với keycap, hàng đang chọn là lens. Chân bảng gợi ý "t dịch · d tra từ · ? hỏi AI · = tính toán". Danh sách lệnh, phím tắt và vòng Tab giữ nguyên. | `NativeFoundation.swift`, `ViezanApp.swift`, `HistorySearch.swift` (`SearchBox(bare:)`) |
| Chọn model, menu "+" | Hàng của `PanelRow` cao 40, bo 12. Mục đang dùng là lens kèm ✓ màu nhấn ở mép phải; hover là lens nhẹ; vị trí bàn phím giữ vòng nhấn riêng. Chi tiết 12, vạch ngăn ấm giữa nhóm. | `ComposerPanels.swift`, `ModelPanel.swift` |
| Lịch sử nhanh | Hàng được tô sáng là lens. Chân "Xem tất cả lịch sử →" là chữ màu nhấn, ngăn bằng vạch ấm. | `HistoryViews.swift` |
| Hoạt động | Mỗi việc một dòng: chấm trạng thái · tiêu đề · trạng thái bên phải (lỗi thì đỏ); tên model chuyển vào tooltip. Nút và vòng Tab giữ nguyên. | `HistoryViews.swift` |
| Thư viện lịch sử | Cột 376: seg tính năng; ô tìm + nút bật tắt "Lưu trữ" (chữ màu nhấn khi bật, lọc tại chỗ); nhóm Hôm qua / Tuần này / Cũ hơn; hàng hai dòng, hàng chọn là lens. Khung xem trước: tiêu đề 18, meta (chip "Phiên đã lưu trữ" khi xem kho lưu trữ), hàng nút lặng, "Mở lại" chính ở bên phải, vạch, transcript cùng kiểu bong bóng và nhãn "✦ Viezan". Với phiên đã lưu trữ: Khôi phục, và Xoá vĩnh viễn (nút và phím ⌫) mở hộp thoại xác nhận ở giữa (nền phủ 22 %, bo 18, nút đỏ đặc). Escape đóng hộp thoại trước. | `HistoryViews.swift` |
| Toast | Thông báo hoàn tất có dấu ✓ màu success; lỗi giữ chấm đỏ; chữ 13. | `NativeToasts.swift` |
| Token → native | Generator xuất thêm 4 role `tone-*` và metric `dialog` (560). | `scripts/native/generate-resources.mjs`, 2 × `native.json` |
| Chuỗi mới | `paletteGroupPages`, `paletteGroupActions`, `paletteHintTranslate`, `paletteHintLookup`, `paletteHintAsk`, `paletteHintCalc` (VI/EN/JA). | `resources/locales/*.json` |

Các file ngoài danh sách của Đợt 2 đều đã được anh/chị duyệt trước:
`NativeFoundation.swift`, `ViezanApp.swift`, `NativeKit.swift`, generator.
Riêng metric `dialog` là thêm một dòng vào generator đã duyệt, đọc từ token có
sẵn. Các preset Graphite / Paper / Corporate / Midnight giữ nhánh cũ: Trang chủ
cũ, List hệ thống, Divider hệ thống, ⌘K cũ.

Thay đổi hành vi theo yêu cầu của đợt: ở Glass, xoá phiên **đã lưu trữ** giờ
hỏi xác nhận và gọi `deleteArchivedSession` (không hoàn tác). Xoá phiên thường
vẫn xoá ngay và có Hoàn tác.

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ node --test scripts/native/__tests__/generate-resources.test.mjs
ℹ pass 2 · ℹ fail 0
$ swift build            (apps/macos)
Build complete! (0,29 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.084 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.088 seconds.
```

Hai `native.json` giống hệt nhau (`cmp`). Không phải sửa test nào.

## Nghiệm thu bằng ảnh

Bản dev `.native-build/dev/Viezan.app`, macOS (Darwin 27.2), dữ liệu thật. Chế
độ được đổi Sáng → Tối trong Cài đặt rồi trả lại Sáng. Ảnh nằm ở
[`glass2-dot2/`](glass2-dot2/), thu 50 %:

- `compare-home-1280-light.png`, `compare-chat-empty-1280-light.png`,
  `compare-chat-active-1280-light.png`, `compare-chat-1280-dark.png`,
  `compare-history-1280-light.png`, `compare-history-archived-1280-light.png`:
  board | app.
- `app-light-1280-{palette,models,tools,quickhistory,activity}.png`: so với Overlays.png.
- `app-{light,dark}-820-{home,chat,chat-empty}.png`,
  `app-dark-1280-{home,models,palette,library}.png`.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Chưa chụp được hộp thoại "Xoá vĩnh viễn" và trạng thái Lưu trữ có dữ liệu. | Máy không có phiên đã lưu trữ; tôi không lưu trữ dữ liệu thật chỉ để chụp. Đường code đã build và test thư viện xanh. |
| Nút bật tắt Lưu trữ giữ nhãn "Lưu trữ" khi bật (board ghi "Khôi phục"). | "Khôi phục" là hành động trên từng phiên (đã có ở khung xem trước); dùng cùng chữ cho bộ lọc sẽ gây nhầm. Trạng thái bật thể hiện bằng chữ màu nhấn và trait selected. |
| Dòng giải thích "Khôi phục đưa phiên về…" dưới hàng nút của phiên lưu trữ chưa có. | Cần chuỗi mới; tooltip của nút Xoá vĩnh viễn đã nói "không thể hoàn tác". |
| ⌘K giữ nút Đóng (×) thay cho keycap "esc" của board; danh sách cao tối đa 420. | Test bàn phím yêu cầu vòng Tab ô tìm ↔ nút Đóng; chiều cao theo giới hạn sẵn có của shell. |
| Nút Sao chép dưới câu trả lời còn nhãn chữ (board chỉ có icon). | `CopyResponseButton` dùng chung với Phiên dịch, nơi test yêu cầu nhãn đầy đủ. |
| "Mở lại" có mũi tên đứng trước chữ; là kính phủ màu nhấn, không phải gradient. | Test cần đây là NSButton (`history-open`); `NativePanelButton` đặt icon ở đầu. |
| Composer ở trạng thái trống rộng 760 (board 640). | Không có token 640 cho cột composer; giữ cột đọc `reading`. |
| Nút "+" của composer là vòng trơn, chưa là kính trắng. | Nằm trong `ImageControls.swift`, file của Đợt 3. |
| Panel Hoạt động: đầu panel chưa ghi "· n việc", nút cao 32 (board 28). | Cần chuỗi mới có số đếm; giữ cỡ nút chung `compactControl`. |
| Chân panel model chỉ có "Tải lại model". | Đúng hành vi hiện có (direction.md); không thêm hành động. |
| Bong bóng 18/6, đệm 10/14, chip 22, ô kính 14: viết bằng phép cộng metric. | Không có token đúng các số này; giá trị lấy theo board. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, 640×480, Reduce Transparency / Increase Contrast
  trong app đang chạy.
- QtTest (Đợt 7).

Ghi chú vận hành: để chụp, app dev được thoát êm rồi dựng lại ba lần. Một phiên
Chat trống được tạo bằng "Chat mới" (theo quy tắc sẵn có, phiên trống sẽ được dọn
khi tạo phiên mới). Phiên đang mở của AI Chat đã được đặt lại về "1 dặm bằng bao
nhiêu km?…" như lúc bắt đầu; chế độ Sáng đã được khôi phục.
