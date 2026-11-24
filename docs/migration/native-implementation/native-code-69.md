# Native code 69 — macOS: hai kho dữ liệu đổi cùng nhau hoặc không đổi (2026-11-24)

Đợt đối chiếu domain trên Qt (qt-parity-12, qt-parity-15) cho thấy hai thứ tự ghi có thể làm mất dữ liệu; Codex nêu
rằng bản Swift có thứ tự tương tự. Viết test tái hiện trước: cả hai đều đỏ trên macOS, rồi sửa.

## Lỗi và cách sửa

| Hàm | Trước đây | Nay |
| --- | --- | --- |
| `WorkbenchStore.clearHistory()` | Lưu workspace đã xoá và dọn tệp đính kèm, rồi mới xoá kho Phiên dịch. Ghi kho Phiên dịch lỗi thì lịch sử Chat / Dịch / Từ điển đã mất còn cuộc họp vẫn còn. | Xoá kho Phiên dịch trước; lưu workspace lỗi thì đưa các cuộc họp trở lại đúng nguyên trạng, kể cả cuộc họp đang chọn (`Interpretation.restoreAll`, không qua bước kiểm hợp lệ để dữ liệu cũ không bị loại); tệp đính kèm chỉ dọn sau khi cả hai xong. |
| `WorkbenchStore.importBackup(_:restorePreferences:)` | Ghi các cuộc họp trong bản sao lưu trước, rồi mới lưu workspace. Lưu workspace lỗi thì cuộc họp đã nhập còn phiên thì không. | Hỏi trước kho Phiên dịch có nhận không (`Interpretation.checkImport`: không bận, không bị chặn, dữ liệu hợp lệ), rồi lưu workspace, rồi ghi cuộc họp; ghi cuộc họp lỗi thì lưu lại workspace cũ. |

Việc đưa lại (cuộc họp hoặc workspace cũ) là nỗ lực tốt nhất: nếu chính lần ghi phục hồi cũng lỗi (đĩa hỏng hẳn) thì
vẫn có thể lệch; hàm vẫn báo lỗi cho người gọi trong mọi trường hợp.

## Review độc lập (Antigravity, chỉ đọc)

Đã sửa: hoàn tác xoá lịch sử từng dùng `importArchive`, có thể loại dữ liệu cũ không qua kiểm hợp lệ và đổi cuộc họp
đang chọn; nhập sao lưu từng ghi workspace trước khi biết kho Phiên dịch có nhận không. Thêm test cho hai nhánh hoàn
tác và cho việc không dọn tệp đính kèm khi thất bại.

Không làm: dời bước ghi tệp ảnh của bản sao lưu xuống sau khi hai kho đã lưu (tệp mồ côi khi nhập lỗi; vùng đính kèm
đang do phiên khác sửa); đặt `storageError` khi chính lần hoàn tác cũng lỗi.

## Kiểm tra

Test mới `StorageOrderTests`: lưu workspace lỗi khi xoá lịch sử; kho Phiên dịch không ghi được khi xoá lịch sử (thư mục
chỉ đọc); lưu workspace lỗi khi nhập sao lưu, rồi nhập lại thành công. Ba ca đầu đỏ trước khi sửa (4 chỗ sai), xanh sau; thêm hai ca cho nhánh hoàn tác sau review.

## Chưa kiểm

Mất điện giữa hai lần ghi; tệp ảnh của bản sao lưu đã được ghi ra trước khi nhập thất bại (còn lại như tệp mồ côi).

## Bổ sung: "Dùng làm nguồn" có Hoàn tác (macOS)

`ViezanNative/Workspaces.swift`: `useResultAsSource` hiện toast `usedAsSource` với Hoàn tác, khôi phục bản nháp và cặp
ngôn ngữ cũ của đúng phiên; `TranslateSwap.target` chọn đích mới để không tạo cặp nguồn trùng đích khi nguồn là Tự động
(trước đây Tự động → Tiếng Việt với giao diện tiếng Việt cho ra vi → vi). Test
`useAsSourceNeverTranslatesALanguageIntoItself`. Hoàn tác chưa có test tự động (cần chạy app). Chuỗi mới `usedAsSource`.

## Ghi chú

`WorkbenchStore.swift` cũng đang được các phiên khác của người dùng sửa; thay đổi ở đây chỉ nằm trong hai hàm trên.
