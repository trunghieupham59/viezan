# Liquid Glass 2.0 · Đợt 4: trang hệ thống (macOS)

- **Ngày:** 2026-11-03
- **Nhánh:** `develop`, làm tiếp trên Đợt 1–3 (chưa commit). Không commit.
- **Nguồn:** [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Trang hệ thống".
- **Board:** Everywhere, Apps, Thermal, Shortcuts, Shortcuts-Recorder.

## Kiểm tra trước

Báo cáo Đợt 3 có: [native-migration-report-20261103-glass2-dot3.md](native-migration-report-20261103-glass2-dot3.md).

## Đã làm

### Hộp thoại chặn dùng chung (`HistoryViews.swift`)

Tách phần khung của hộp thoại thành `BlockingDialog { … }`: nền phủ 22 % (bấm vào là huỷ), thẻ nổi bo 18, Escape để đóng. Phần này chỉ được sửa sau khi anh/chị duyệt.

`ConfirmDialog` của Đợt 2 giờ dựng trên khung này và giữ nguyên giao diện. Hộp thoại ghi phím tắt và xác nhận của Ứng dụng cũng dùng khung này.

### Dịch mọi nơi (`DesktopWorkspace.swift`, `DesktopPanels.swift`)

- Thẻ "Dịch vùng chọn" có thanh tiêu đề, các hàng chạy sát mép thẻ.
- Thứ tự hàng: Quyền trợ năng → Phím tắt (keycap từng phím trên pill kính, kèm công tắc) → Ngôn ngữ chính / phụ → Model.
- Ghi chú mô hình cục bộ nằm trong thẻ.
- Bản xem trước cửa sổ dịch nhanh: lớp `.float` đặt trên một mảng nền cảnh, có chip cặp ngôn ngữ, nguyên bản, bản dịch 15 semibold và tên model.
- Dưới bản xem trước là dòng "Chỉ minh hoạ…" kèm liên kết "Mở trong Dịch". Không vẽ nút Sao chép / Dán giả, theo quyết định đã chốt.

### Launcher & phím tắt (`DesktopWorkspace.swift`, `DesktopPanels.swift`)

- Thẻ "Phím tắt" có thanh tiêu đề, mở đầu bằng hàng Quyền trợ năng.
- Launcher và Chat nhanh có nút "Thử" (chạy đúng hành động sẵn có), keycap từng phím và công tắc.
- Hàng Bảng lệnh hiện keycap ⌘ K.
- Thẻ giới thiệu bên phải: tiêu đề 18, danh sách gạch đầu dòng, ô Launcher minh hoạ có keycap phím hiện tại, nút chính "⌘ Mở Launcher".

### Hộp thoại ghi phím tắt (`DesktopPanels.swift`, `DesktopWorkspace.swift`)

- Mở ở giữa trang, dùng `BlockingDialog`.
- Nội dung: tiêu đề "Phím tắt cho {name}", câu hướng dẫn, ô ghi phím có viền nhấn khi đang ghi và keycap ở giữa.
- Nếu tổ hợp không dùng được: hiện lý do kèm chấm đỏ.
- Chân hộp thoại: "Mặc định · ⌥ Space" · Đóng · Áp dụng.
- Trong Cài đặt và ở các preset khác vẫn dùng popover cũ.

### Ứng dụng (`ApplicationsWorkspace.swift`)

- "Nhật ký & hoàn tác" chuyển lên hàng giới thiệu, dạng kính.
- Danh sách phẳng có ô tìm capsule và nút tải lại tròn; hàng đang chọn là lens.
- Đầu khung chi tiết: icon 48, tên 18, đường dẫn · phiên bản (mono), hai nút "Xem trước thay đổi" và "Đặt lại dữ liệu" (chữ đỏ).
- Thẻ kế hoạch:
  - Tiêu đề "Kế hoạch gỡ {name}" và công tắc đặt lại ở đầu thẻ.
  - Các nhóm mục, mỗi hàng có checkbox, đường dẫn mono, căn cứ khớp, dung lượng và "Hiện trong Finder" màu nhấn.
  - Chân thẻ: tổng đã chọn, công tắc "Cho phép ứng dụng thoát bình thường", nút đỏ đặc.
- Xác nhận dùng `ConfirmDialog` ở giữa trang, thay cho sheet hệ thống.

### Nhiệt độ & quạt (`ThermalWorkspace.swift`)

- Nút Dừng ở đầu trang mang vai trò nguy hiểm (chữ đỏ).
- Ba ô số liệu: số 28 kèm đơn vị nhỏ, dòng chi tiết (khoảng vòng quay của quạt), thanh meter 6.
- Thẻ điều khiển:
  - Chip trạng thái ở đầu thẻ, câu gợi ý.
  - Nút kính "Cấu hình quạt ▾" và "Quy tắc ▾".
  - Một vạch ngăn, rồi "Điều khiển thủ công" với chip helper.
  - Mỗi quạt một hàng: thanh trượt, số RPM, nút Áp dụng.
  - "Thiết lập helper" ở chân thẻ.
- Thẻ cảm biến: "Hiệu chuẩn làm mát" ở đầu thẻ, nhóm có nhãn viết hoa, hàng chạy sát mép thẻ, giá trị tô màu theo ngưỡng.

### Chuỗi mới (VI/EN/JA)

`shortcutTry`, `previewIllustrative`, `shortcutFor`, `appPlanTitle` (trong `resources/locales/*.json` và cả hai `native.json`).

### Không đổi

- Các preset Graphite / Paper / Corporate / Midnight giữ bố cục cũ.
- Dịch vụ, helper, quyền, nhật ký hoàn tác và mặc định chọn tệp giữ nguyên.

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ node --test scripts/native/__tests__/generate-resources.test.mjs
ℹ pass 2 · ℹ fail 0
$ swift build            (apps/macos)
Build complete! (0,30 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.783 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.096 seconds.
```

- Hai `native.json` giống hệt nhau.
- Không phải sửa test nào.

## Nghiệm thu bằng ảnh

- **Môi trường:** bản dev, macOS (Darwin 27.2), dữ liệu thật.
- **Chế độ:** đổi Sáng → Tối rồi trả lại Sáng.
- **Thao tác trong lúc chụp:** hộp thoại ghi phím chỉ được mở rồi huỷ bằng Esc, không đổi phím nào.

Ảnh nằm ở [`glass2-dot4/`](glass2-dot4/), thu nhỏ 50 %:

- **Đặt cạnh board (board | app):** `compare-everywhere-1280-light.png`, `compare-apps-1280-light.png`, `compare-thermal-1280-light.png`, `compare-shortcuts-1280-light.png`, `compare-shortcuts-recorder-1280-light.png`.
- **Ảnh app khác:**
  - `app-light-820-{everywhere,apps,thermal,utilities}.png`
  - `app-dark-1280-{everywhere,apps,thermal,utilities,recorder}.png`
  - `app-dark-820-{everywhere,thermal}.png`

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Chưa chụp được thẻ kế hoạch gỡ của Ứng dụng. | Trên máy này mọi app đều bị khoá (🔒), nhiều khả năng do chưa cấp Full Disk Access. "Xem trước thay đổi" bị vô hiệu đúng theo hành vi hiện có. |
| Tiêu đề thanh của thẻ (`CardSection(flush:)`) là 13 semibold; board dùng 15. | Thành phần nằm trong `NativeKit.swift`, ngoài danh sách đợt này. |
| Ngôn ngữ chính / phụ vẫn là Picker popup của hệ thống, chưa phải pill kính; khi chật, hàng xuống dòng. | Theo direction.md, hàng trong thẻ cài đặt dùng Picker hệ thống. |
| Hàng Model của Dịch mọi nơi chưa có liên kết "Đổi trong Cài đặt" và vẫn ghi mã model đầy đủ. | Không thêm hành động mới; giữ cách hiển thị sẵn có. |
| Thứ tự phím tắt: Launcher · Dịch vùng chọn · Chat nhanh (board: Launcher · Chat nhanh · Dịch vùng chọn). | Giữ thứ tự hiện có của `DesktopSettings`, Settings cũng dùng thứ tự này. |
| Mỗi quạt có nút Áp dụng riêng; board chỉ có một nút chung. | Giữ luồng xác nhận theo từng quạt sẵn có. |
| Các xác nhận helper / hiệu chuẩn / quạt vẫn là sheet hệ thống. | Board của đợt chỉ yêu cầu hộp thoại ghi phím ở giữa; có thể chuyển sang `BlockingDialog` ở đợt sau. |
| Danh sách Ứng dụng rộng theo tỷ lệ `inventorySplit` (0,45), không cố định 320. | Không có token 320. |
| Thẻ Launcher không có quầng sáng nền; câu hướng dẫn trong hộp thoại ghép từ hai câu có sẵn (`pressKeys` + `shortcutNeedsModifier`). | Quầng sáng không có token; hai câu đều đã có đủ VI/EN/JA. |
| Hộp thoại ghi phím căn giữa theo mặt đọc, không theo cả cửa sổ. | Overlay thuộc trang. Trên board, tâm mặt đọc gần trùng tâm cửa sổ. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, cửa sổ 640×480, Reduce Transparency / Increase Contrast.
- Ghi một phím tắt thật rồi bấm Áp dụng (cố ý không làm, để không đổi phím của máy).
- QtTest (Đợt 7).
