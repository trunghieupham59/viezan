# Liquid Glass 2.0 · Đợt 6: cửa sổ phụ và cập nhật (macOS)

- **Ngày:** 2026-11-03
- **Nhánh:** `develop`, làm tiếp trên Đợt 1–5 (chưa commit). Không commit.
- **Nguồn:** [HANDOFF.md](../../design/glass2/HANDOFF.md) mục 2–4 và mục 5 "Cửa sổ phụ".
- **Board:** Launcher, QuickChat, QuickTranslate, UpdateSheet, UpdateSheet-States.

## Kiểm tra trước

Báo cáo Đợt 5 có: [native-migration-report-20261103-glass2-dot5.md](native-migration-report-20261103-glass2-dot5.md).

## Đã làm

| Phần | Thay đổi | File |
| --- | --- | --- |
| Launcher | Bề mặt `.float` (bo 20, bóng 24/64) thay cho thẻ viền. Ô tìm cao 60, chữ 18. Nhóm có tiêu đề viết hoa. Hàng cao 44, hàng đang chọn là lens. Lệnh có ô icon 28 tô màu (Hỏi AI nhấn, Dịch tím, Tra từ cam). Chân cao 36 có gợi ý phím. | `Launcher.swift` |
| Quick AI | Thẻ lượt hỏi đặt thẳng trên lớp kính, không còn dải nền mờ. Thẻ phẳng, nhãn "Hỏi" dạng capsule, câu hỏi 14 medium. Nút "+" là vòng kính, nút Gửi tròn gradient nhấn. Chân: chấm trạng thái, tên model ngắn ("Haiku 5.5 · n lượt"), "Mở trong Chat ⌘↵" dạng kính. | `LauncherChat.swift` (thêm `AnyButtonStyle` dùng tại chỗ) |
| Dịch nhanh | Thẻ `.float`: tiêu đề "Bản dịch sang …" 13 semibold, bản dịch 14, dòng meta tên model, rồi hàng nút riêng: "Mở trong Dịch" (nút lặng) · Sao chép · Dán thay vùng chọn (nút chính). Meta và nút không chung hàng ở mọi bề rộng, kể cả thẻ hẹp hơn 400 pt. | `QuickTranslate.swift` |
| Chat nhanh (cửa sổ phụ) | Ô soạn dùng bề mặt composer nổi như AI Chat. | `DesktopPanels.swift` (`QuickSessionPanel`) |
| Hộp thoại cập nhật | Glass: `BlockingDialog` ở giữa cửa sổ (nền phủ 22 %), rộng `dialog − large`. Các preset khác giữ sheet. Ba trạng thái: có bản mới (ghi chú dạng gạch đầu dòng), đang tải (thanh meter màu nhấn, "Huỷ" chữ đỏ), đã tải (Mở gói đã tải). Nội dung đầu: icon app, "Có bản cập nhật Viezan", dòng trạng thái. Chân: "Xem cập nhật ↗" màu nhấn · Nhắc sau 24 giờ · nút chính. | `UpdateSettings.swift` (`UpdatePrompt`), `ViezanApp.swift` (một chỗ trình bày, đã được anh/chị duyệt) |

Không thêm chuỗi mới. Phím tắt, vị trí 22 % từ đỉnh, ẩn khi mất focus và luồng cập nhật giữ nguyên.

## Kiểm chứng

```
$ npm run check:resources
Native resources verified: 3 locales, 78 metrics.
$ swift build            (apps/macos)
Build complete! (0,27 giây)
$ swift test             (apps/macos)
✔ Test run with 49 tests in 7 suites passed after 19.327 seconds.
✔ Test run with 60 tests in 0 suites passed after 0.082 seconds.
```

## Nghiệm thu bằng ảnh

Ảnh nằm ở [`glass2-dot6/`](glass2-dot6/):

- `compare-launcher-light.png`: board | Launcher với truy vấn "notion".
- `compare-quickchat-light.png`: board | Quick AI khi chưa có lượt nào.
- `app-*.png`: Launcher trống / có truy vấn, Quick AI.

Cách chụp:

- Quick AI được mở bằng Tab khi ô tìm trống, nên không có câu hỏi nào bị gửi đi.
- Chế độ app đã đổi sang Tối để chụp rồi trả lại Sáng.
- Sidebar vẫn ở trạng thái mở rộng.

## Chênh lệch còn lại

| Chênh lệch | Lý do |
| --- | --- |
| Ảnh "tối" của Launcher và Quick AI vẫn sáng. | Cửa sổ phụ theo giao diện hệ thống (đang Sáng), không theo chế độ trong app. Đây là hành vi sẵn có, đợt này không đổi. |
| Chưa chụp được hộp thoại cập nhật (cả ba trạng thái), thẻ Dịch nhanh và cửa sổ Chat nhanh. | Cần một bản phát hành mới thật, hoặc chọn văn bản rồi gọi AI. Không giả lập dữ liệu. Code đã build và test xanh. |
| Launcher rộng 760 (board 720). Thẻ Dịch nhanh rộng 456 (board 352). Quick AI nằm trong Launcher nên rộng 760 (board 480). | Không có token 720 / 352 / 480; giữ `reading` và `quickCard` sẵn có. |
| Kết quả "notion" không có Ứng dụng / Tệp. | Máy này không cài Notion. |
| Meta Dịch nhanh chưa có thời gian dịch ("0,8 giây"). Hộp cập nhật chưa có dung lượng gói hay "bạn đang dùng 2.5.0". | Dữ liệu này chưa có trong mô hình; không thêm dịch vụ. |
| Trạng thái Dịch nhanh (đang dịch, đã thay, cần quyền, lỗi) chỉ đổi bề mặt, giữ bố cục cũ. | Chỉ thẻ kết quả có board chi tiết; các thẻ còn lại đã gần board. |
| Chân Quick AI chưa có dòng phím (↵ Gửi · ⇧↵ …) ở đáy khi đã có lượt; nút Dừng là chữ đỏ trên nút lặng. | Giữ cấu trúc hiện có; gợi ý phím nằm ở trạng thái trống. |
| Màu nền ô icon lệnh = tone × 0,15 (`selectionOpacity × 1,5`). | Board dùng 12–16 %; cách tính giống ô Bắt đầu nhanh ở Đợt 2. |

## Chưa kiểm

- VoiceOver, ba cỡ chữ, EN/JA, Reduce Transparency / Increase Contrast.
- Dịch vùng chọn thật, tải bản cập nhật thật.
- QtTest (Đợt 7).
