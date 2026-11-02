# Native code 61 — Thư viện lịch sử (2026-11-02)

Review màn AI Chat → Lịch sử → Xem tất cả lịch sử trên dev-21: ba lỗi dữ liệu và năm điểm giao diện.
Quyết định ghi ở [direction.md](../../design/direction.md) mục "Thư viện lịch sử". Không chạy QA; người dùng
review tay.

## Lỗi

| Lỗi | Sửa |
| --- | --- |
| Phiên trống ("Chat mới · Haiku 4.5", kể cả phiên hiện tại) liệt kê trong thư viện. | `Session.hasWork`; thư viện và Lịch sử nhanh chỉ hiện phiên có việc. `newSession()` dọn các phiên trống, không lưu trữ, không chạy, không tiêu đề của cùng tính năng trước khi chèn phiên mới. |
| Thứ tự theo lúc tạo. | `history(query:archived:features:)` sắp xếp theo `updated` giảm dần. |
| Tiêu đề hỏng mã "Gi·∫£i th√≠ch". | `TextRepair` (domain): phát hiện chuỗi điển hình, mã hoá lại Mac Roman → UTF-8, chỉ nhận khi bớt ký tự lạ; áp một lần trong `reload()`. |

## Giao diện

| Phần | Thay đổi |
| --- | --- |
| Hàng (`SessionRow`, dùng chung với Lịch sử nhanh) | Dòng một chỉ tiêu đề; dòng hai: trao đổi gần nhất/bản nháp/model + thời gian ở mép phải; `showsIcon` khi danh sách gộp nhiều tính năng. |
| Bộ lọc | `FilterTabs` Tất cả · AI Chat · Dịch · Từ điển (module bật), mặc định tính năng đang đứng; `history(features:)` với `[]` = mọi tính năng bật. |
| Khung xem trước | Đầu khung: tiêu đề (heading), "Mở lại" nút chính bên phải, meta "model ngắn · thời gian · n lượt", hàng nút lặng Đổi tên · Xuất JSON · Lưu trữ/Khôi phục · Xoá. Thân: `SessionPreview` theo cột đọc, lượt người dùng trên nền `surface-muted` như bản ghi. Bỏ thanh nút ở đáy. |
| Xoá | `WorkbenchStore.removeSession` (trả phiên + vị trí, giữ phiên hoạt động hợp lệ) và `restoreSession`; toast Hoàn tác; bỏ hộp thoại "Xoá vĩnh viễn". |
| Phím | Return mở, ⌫ xoá, Escape đóng thư viện; mở phiên tính năng khác gửi `.viezanOpenRoute`. |
| Chuỗi | `deleteSession`, `sessionDeleted`, `turnsCount`, `deleteUndoHint`. |
| Test | `historyOrdersByLatestChangeAcrossFeatures`, `newSessionSweepsEarlierEmptySessionsOfItsFeature`, `removingASessionIsUndoableAndKeepsAnActiveSession`, `importedTitlesReadThroughMacRomanAreRepaired`. |

## Vòng 2 — review dev-24 (rail thu gọn)

| Nhận xét | Sửa |
| --- | --- |
| Tab "Tất cả", "AI Chat" gãy dòng; cột trái 284 pt. | `FilterTabs` nhãn `lineLimit(1)` + `fixedSize`; cột danh sách `sidebar + editor` (376). |
| Hàng phiên Dịch in lại nguyên bản ở dòng hai. | `SessionRow.summary(for:running:)`: Dịch/Từ điển → kết quả (ảnh: chữ dịch; từ điển: nghĩa), chưa có thì cặp ngôn ngữ "Tiếng Anh → Tiếng Việt"; Chat → bản nháp/tin cuối/model. Test `sessionRowSummaryShowsTheResultNotTheSourceAgain`. |
| Tiêu đề "file:///private/tmp/…". | `Session.derivedTitle(draft:images:)`: bản nháp trống hoặc là đường dẫn → tên ảnh; đường dẫn không ảnh → tên file (giải mã percent); dùng khi gửi và sửa một lần lúc nạp cho tiêu đề bắt đầu bằng `file://`. Test `derivedTitlesPreferTheImageOverADroppedPath`. |
| Danh sách dài toàn "5 ngày trước". | `HistoryBucket.of(_:now:calendar:)` (Hôm nay · Hôm qua · Tuần này · Cũ hơn) làm `Section` với `Eyebrow`. Test `historyBucketsFollowTheCalendar`. |
| Xem trước phiên Dịch lặp câu nguồn. | Tiêu đề một dòng cho phiên không phải Chat; meta thêm cặp ngôn ngữ. |

Chuỗi: `group_today/yesterday/week/older`.

## Vòng 3 — bản ghi chat (dev-26)

| Nhận xét | Sửa |
| --- | --- |
| Tin của người dùng là dải nền kéo hết cột đọc, cùng căn trái với câu trả lời. | Lượt người dùng vẽ bằng `Text` (chọn được) co theo chữ, căn phải, tối đa `reading × bubbleFraction` (token `--vzn-native-bubble-fraction: 0.75`), bo `largeRadius`; câu trả lời vẫn `TranscriptText` bên trái. Xem trước thư viện dùng cùng bong bóng. |
| Meta in "OpenAI · gpt-6.1-sol" trong khi chip đọc "GPT-6.1 Sol". | Meta dùng `ModelLineup.shortName`, ID trong tooltip; thêm lề ngang `gap` để tách khỏi Sao chép/Thử lại. |

## Còn lại

Chưa kiểm chứng bằng mắt: bong bóng với tin dài và tin có ảnh, nhóm ngày trong List, cột 376 ở cửa sổ 1200, hàng Dịch với kết quả dài, Hoàn
tác xoá, ⌫ khi focus ở ô tìm. Khoá `deletePermanently*` không còn dùng ở native.

## Kiểm tra

`swift build` PASS; `swift test` 39 + 59 PASS (sau khi sửa xung đột truy cập trong `newSession`); `generate-resources --check`, `native.json` hai bản giống
nhau, `documentation.mjs` PASS.
