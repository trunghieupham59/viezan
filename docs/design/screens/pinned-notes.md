# Ghi chú ghim (macOS)

Mã nguồn của [thẻ nổi](../../../apps/macos/Sources/ViezanNative/PinnedNotePanels.swift) và [kho ghi chú](../../../apps/macos/Sources/ViezanDomain/PinnedNotes.swift).

## 1. Mục đích

Giữ một bản dịch, câu trả lời hoặc vài dòng tự viết bên cạnh ứng dụng đang dùng. Mỗi ghi chú là một thẻ nổi có thể sửa độc lập với phiên nguồn.

## 2. Điểm vào và điểm ra

| Từ | Thao tác | Kết quả |
| --- | --- | --- |
| Thanh menu | Chọn **Ghi chú ghim mới** | Thẻ trống nhận con trỏ soạn thảo. Chọn một ghi chú trong menu để đưa thẻ đó lên trước. |
| Dịch nhanh | Chọn **Ghim thành ghi chú** trước **Sao chép** trên kết quả dịch vùng chọn hoặc vùng màn hình | Thẻ mới chứa bản dịch. Nhãn ghi tên ngôn ngữ nguồn → đích hoặc chỉ tên ngôn ngữ đích nếu chưa nhận dạng được nguồn. Thẻ kết quả đóng sau khi ghim. |
| AI Chat | Chọn **Ghim thành ghi chú** sau **Sao chép** dưới câu trả lời đã hoàn tất | Nội dung câu trả lời xuất hiện trong thẻ mang nhãn **AI Chat**. Cửa sổ chính báo **Đã ghim ghi chú**. |

## 3. Bố cục

`PinnedNoteCard` có hai hàng. Trên cùng là nhãn nguồn ở trái, hai nút **Sao chép** và **Xoá** ở phải. Bên dưới là `ComposerEditor` dùng phông đọc và chiếm phần còn lại của thẻ. Preset Glass dùng `ReadingPanelSurface`. Các preset khác dùng nền và viền theo giao diện.

## 4. Thành phần và hành động

| Thao tác | Phản hồi |
| --- | --- |
| Sửa nội dung | Tự lưu sau khi ngừng gõ, tối đa 20.000 ký tự mỗi thẻ. Khi rời ô soạn, phần vừa sửa được ghi ngay. |
| Sao chép | Chép nội dung đang thấy, kể cả phần vừa gõ, vào clipboard. Thẻ vẫn mở. |
| Xoá hoặc ⌘W | Đóng thẻ sau khi xoá thành công. Chọn **Hoàn tác** trong thông báo ở cửa sổ chính, hoặc **Khôi phục ghi chú vừa xoá** ở thanh menu, để lấy lại thẻ cuối cùng vừa xoá cùng vị trí của nó. |
| Kéo nhãn nguồn | Di chuyển thẻ. Khi thả gần mép trái hoặc phải của vùng màn hình khả dụng, thẻ hít vào mép đó, chừa một khoảng lề. |
| Kéo cạnh hoặc góc | Thay đổi kích thước và lưu khung thẻ. |
| Esc | Rời ô soạn và nhả focus. Thẻ vẫn hiện. |

## 5. Trạng thái

| Trạng thái | Người dùng thấy gì |
| --- | --- |
| Thẻ trống | Ô soạn gợi ý **Nhập ghi chú…**. Ghi chú tạo từ thanh menu còn trống sẽ được bỏ qua khi mở lại ứng dụng. |
| Có ghi chú | Thanh menu liệt kê từng thẻ theo dòng đầu, dùng **Ghi chú ghim** nếu dòng này trống. Khi mở lại ứng dụng, thẻ được khôi phục trong vùng màn hình khả dụng. |
| Đủ 5 thẻ | Mục tạo mới ở thanh menu bị tắt. Ghim từ kết quả hoặc khôi phục khi đã đầy sẽ báo **Tối đa 5 ghi chú ghim.** Các thẻ hiện có được giữ lại. |
| Lỗi ghi | Kho giữ nguyên dữ liệu đã lưu. Tạo, xoá hoặc khôi phục thất bại sẽ báo lỗi lưu trữ. Nếu chưa ghi được phần vừa sửa, thẻ vẫn giữ bản đang soạn. |
| Không đọc được `notes.json` | Kho giữ nguyên tệp và chặn mọi lần ghi. Mục tạo mới ở thanh menu bị tắt. |

**Quyền riêng tư.** Nội dung và vị trí thẻ được lưu trên máy trong `notes.json`, ngoài phạm vi sao lưu hiện tại. Cửa sổ đặt `sharingType = .none` để yêu cầu macOS loại thẻ khỏi chụp và chia sẻ màn hình.

## 6. Luồng tương tác chính

1. Ghim kết quả Dịch nhanh khi đang làm việc trong một ứng dụng khác. Thẻ xuất hiện gần góc trên bên phải của màn hình có con trỏ, giữ focus ở ứng dụng đang dùng và giữ nguyên clipboard.
2. Kéo thẻ sang mép thuận tay. Bấm vào nội dung để sửa, rồi nhấn Esc khi muốn tiếp tục công việc.
3. Khi dùng xong, xoá thẻ. Nếu đóng nhầm, khôi phục ngay từ thanh menu.

## 7. Responsive

Các thẻ mới xếp dọc từ góc trên bên phải. Khi đổi kích thước hoặc màn hình, khung được giữ trong vùng hiển thị khả dụng. Khi mở lại, ưu tiên màn hình có phần giao lớn nhất với khung đã lưu.

## 8. Bàn phím và trợ năng

Cửa sổ có tên **Ghi chú ghim: {source}**. Ô soạn có nhãn riêng, các nút biểu tượng có tên trợ năng và gợi ý theo hành động. Việc tạo thẻ có thông báo cho trình đọc màn hình. Esc và ⌘W nhường cho bộ gõ khi đang ghép chữ. Thẻ hít mép ngay khi người dùng bật Giảm chuyển động.

## 9. Nội dung chữ (vi)

| Khoá | Nhãn |
| --- | --- |
| `newPinnedNote` | Ghi chú ghim mới |
| `pinAsNote` | Ghim thành ghi chú |
| `pinnedNoteBody` | Nội dung ghi chú ghim |
| `pinnedNoteCopy` / `pinnedNoteDelete` | Sao chép ghi chú ghim / Xoá ghi chú ghim |
| `pinnedNoteRestore` | Khôi phục ghi chú vừa xoá |

## 10. Chênh lệch với bản dựng hiện tại

Windows và Linux (Qt) chưa có ghi chú ghim.

### Đợt sau

Nút Ghim ở trang Dịch, lệnh tạo ghi chú trong Launcher, phím tắt toàn cục, tuỳ chọn hiện thẻ khi chia sẻ màn hình và thao tác mở lại phiên nguồn từ thẻ.
