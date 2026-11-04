# Liquid Glass 2.0 · Đợt 5 — Cài đặt (macOS)

Ngày 2026-11-03, nhánh `develop`, làm tiếp trên Đợt 1–4 (chưa commit). Đợt này không commit.

Nguồn: [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Cài đặt";
board Settings-General, -Appearance, -Models, -Local, -Speech, -Modules, -Data,
-Update, -About, Overlays-Settings.

## Kiểm tra trước

- Báo cáo Đợt 4 có: [native-migration-report-20261103-glass2-dot4.md](native-migration-report-20261103-glass2-dot4.md).
- Hộp thoại chặn giữa cửa sổ đã có: `BlockingDialog` / `ConfirmDialog` (Đợt 2, tách ra ở Đợt 4).

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| 9 mục | Bỏ `desktop` (Launcher & phím tắt) khỏi `settingsSections`. Mục Chung nhận thêm từ khoá `hotkeys`, `utilities`, `launcher`, `quickChat`, `translateSelection` để tìm "phím tắt / Launcher" vẫn ra. | `scripts/native/generate-resources.mjs` → 2 × `native.json` (qua `npm run resources`) |
| Cột mục | Rộng 292 pt, chia nhóm TUỲ CHỈNH / ỨNG DỤNG. Mục đang chọn là lens: chữ 14 semibold, icon màu nhấn; mục khác icon mờ. Câu "Thay đổi áp dụng ngay…" nằm ở chân cột, ngăn với nội dung bằng một vạch. | `NativeSettings.swift` |
| Đầu mục | Tiêu đề 22 semibold kèm mô tả màu mờ. | `NativeSettings.swift` |
| Phím tắt toàn cục | Hàng mới trong Chung: mô tả liệt kê các phím đang bật (Launcher ⌘ Space · …). Nút "Launcher & phím tắt" mở trang sidebar đó. | `NativeSettings.swift` |
| Picker là lớp nổi | `SettingsPicker` + `SettingsPickerHost`: nút pill kính, bấm vào mở danh sách `.float` neo dưới nút. Danh sách có `PanelRow` cao 40 (mục đang dùng là lens + ✓), nhóm có tiêu đề, ↑↓ ↩, Escape hoặc bấm ra ngoài thì đóng. Đã thay cho: ngôn ngữ giao diện, thời gian chờ dịch, kiểu giao diện, màu nhấn, nhà cung cấp nhận dạng, giọng đọc (giọng hệ thống nhóm theo ngôn ngữ), tốc độ đọc, số mục lịch sử, song song và context của runtime. | `NativeSettings.swift`, `VoiceSettings.swift`, `DataSettings.swift`, `LocalModelSettings.swift` |
| Chế độ / Cỡ chữ | Rãnh `.seg` (`FilterTabs`) thay cho segmented control hệ thống. | `NativeSettings.swift` |
| Xác nhận | `SettingsConfirm` qua environment, hiện bằng `BlockingDialog` ở giữa trang: xoá khoá, dọn lịch sử, xoá model (nút đỏ đặc). Đo hiệu năng hỏi trước bằng nút chính "Bắt đầu", sau đó thẻ kết quả hiện như cũ. | `NativeSettings.swift`, `ProviderSettings.swift`, `DataSettings.swift`, `LocalModelSettings.swift` |
| Tìm trong Cài đặt | Khi có từ khoá, danh sách mục khớp thả xuống dưới ô tìm ở header (tên mục, mô tả, mũi tên). Chọn một dòng thì mở mục đó và xoá từ khoá. Không có mục nào khớp thì hiện "Không có mục cài đặt nào khớp." | `NativeSettings.swift` |
| Dưới 760 | Cột mục thay bằng picker "icon · tên mục ⌄", danh sách có nhóm. | `NativeSettings.swift` |
| Dữ liệu | Chia thành thẻ Lịch sử (số mục giữ lại, Dọn lịch sử), thẻ Sử dụng và thẻ Sao lưu (Xuất, Xem trước, khối xác nhận nhập). | `DataSettings.swift`, `NativeSettings.swift` |
| Spec | Thêm mục "Liquid Glass 2.0 trên macOS" vào spec và cập nhật dòng tìm kiếm ở mục 10. | `docs/design/screens/settings.md` |

Các preset Graphite / Paper / Corporate / Midnight vẫn dùng popup, segmented, sheet
xác nhận và Picker menu hẹp của hệ thống. Không thêm chuỗi mới.

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ node --test scripts/native/__tests__/generate-resources.test.mjs
ℹ pass 2 · ℹ fail 0
$ swift build            (apps/macos)
Build complete! (3,75 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.309 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.092 seconds.
```

Hai `native.json` giống hệt nhau. Không phải sửa test nào.

## Nghiệm thu bằng ảnh

Chụp trên bản dev, macOS (Darwin 27.2), dữ liệu thật. Ảnh nằm ở
[`glass2-dot5/`](glass2-dot5/), thu nhỏ 50 %:

- **Board | app (sáng, 1280):** `compare-settings-{general,appearance,models,local,speech,modules,data,update,about}.png`.
- **Lớp nổi và hộp thoại:** `app-light-1280-picker-language.png`, `app-light-1280-search.png` (từ khoá "launcher" → Chung, Giới thiệu), `app-light-1280-confirm.png`. Hộp "Dọn lịch sử" đã được Huỷ, không dọn gì.
- **820:** `app-light-820-general.png`, `app-light-820-section-picker.png`.
- **Tối:** `app-dark-1280-{general,appearance,picker-language}.png`.

Trong lúc chụp, một cú bấm thử làm cỡ chữ đổi sang Nhỏ; tôi đã trả về Vừa. Chế độ
Sáng, cỡ chữ Vừa, ngôn ngữ vi và sidebar mở rộng đều giữ như lúc đầu.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Header chỉ ghi "Cài đặt"; board ghi "Cài đặt / Chung". | Breadcrumb do `ViezanApp.swift` vẽ, nằm ngoài danh sách file của đợt. |
| Tìm kiếm chỉ ra mục, chưa ra từng hàng ("Phím tắt toàn cục · Chung › Ứng dụng"); chưa cuộn tới hàng, chưa nháy hàng; Return trong ô tìm chưa mở dòng đầu. | Chưa có chỉ mục theo hàng. Ô tìm và phím Return thuộc header (`ViezanApp.swift`). |
| Picker kiểu giao diện chưa có ô màu và mô tả từng kiểu; danh sách nhà cung cấp nhận dạng chưa có chip trạng thái khoá. | Chưa có chuỗi mô tả. Palette của preset khác không đọc được từ view (hàm `paletteColor` là private trong `NativeFoundation.swift`). |
| Mục Nhà cung cấp AI giữ bố cục hàng hiện có (nhãn mô tả, nút "Lấy API key", popover nhập khoá). Board có nhóm Cloud / Tìm kiếm và giọng nói, logo màu, ô nhập khoá ngay trong hàng. | Chỉ đổi hộp xác nhận xoá khoá; bố cục và luồng nhập khoá là việc riêng. |
| Thẻ Sử dụng và chi phí vẫn là một mục thu gọn được (DisclosureGroup); board là các hàng đơn giá kèm nút Áp dụng. | `UsageSettings` giữ nguyên hành vi. |
| Hàng "Phím tắt toàn cục" đứng ngay sau Ngôn ngữ, trước Khởi động khi đăng nhập. | Các hàng hệ thống nằm trong `SystemSettings`; giữ nguyên khối đó. |
| Hộp thoại căn giữa theo vùng Cài đặt, chưa theo cả cửa sổ. | Overlay thuộc trang. |
| Ảnh tối của Nhà cung cấp và Giọng nói chưa có. | Cú bấm tổng hợp vào cột mục không ăn ở lượt chụp tối. Bố cục giống bản sáng, chỉ đổi màu. |
| Qt mất mục phím tắt trong Cài đặt (`SettingsWorkspace.qml` đọc cùng `settingsSections`). | Hệ quả của việc bỏ section theo yêu cầu đợt. Qt cần hàng "Phím tắt toàn cục" tương ứng ở Đợt 7. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, 640×480, Reduce Transparency / Increase Contrast.
- Bấm thật các hành động không hoàn tác được (xoá khoá, dọn lịch sử, xoá model) và
  đo hiệu năng: chỉ mở hộp thoại rồi Huỷ.
- QtTest (Đợt 7).
