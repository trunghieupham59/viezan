# Ứng dụng

> Mã nguồn: `src/pages/AppsPage.tsx`, `src/components/organisms/apps/`.
> Kế hoạch tổng thể: [`apps-module.md`](../../plans/apps-module.md).
> Board trạng thái: [`apps.html`](../specs/apps.html).

## 1. Mục đích

Xem trước ứng dụng và dữ liệu liên quan trên macOS, gỡ hoặc đặt lại từng ứng
dụng trong quyền người dùng, và khôi phục qua nhật ký. Kết quả nói số mục còn
trong phạm vi quét; không hứa tìm được mọi dấu vết trên ổ đĩa.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Điều hướng | Hệ thống → Ứng dụng | Module `apps`, mặc định bật trên macOS |
| Bảng lệnh | Ứng dụng; apps, applications, uninstall, reset, gỡ | Đọc chung catalog |
| Cài đặt → Module | Công tắc Ứng dụng | Tắt module làm IPC từ chối thao tác mới |
| Chi tiết | Hiện trong Finder | Main tra ID, không nhận đường dẫn renderer |

## 3. Bố cục

```text
PageHeader: Ứng dụng · mô tả                           [Quét lại]
Phạm vi và giới hạn · tiến trình/lỗi/kết quả
Kho ứng dụng + tìm kiếm          Chi tiết + Gỡ/Đặt lại
                                Các mục, dung lượng, bằng chứng, lý do giữ
                                Đã chọn N mục [Xem xác nhận]
Nhật ký và Hoàn tác: kết quả từng mục, số mục còn lại
```

`apps-grid` dùng hai cột khi vùng thực có đủ chỗ cho hai thẻ
`--vzn-system-card-min`; tự về một cột khi hẹp. Thân trang cuộn, header cố định.
Spacing, radius, màu, chữ và border dùng tokens. Không đổi trạng thái sidebar.

## 4. Thành phần và hành động

| Điều khiển | Kiểu | Kết quả | Khi tắt |
| --- | --- | --- | --- |
| Quét lại | `sm neutral outline` | Đọc kho app, làm hết hiệu lực plan cũ, đọc nhật ký | Đang xử lý |
| Hàng app | `sm neutral ghost`; chọn là `primary soft` | Quét dữ liệu theo app | Đang xử lý |
| Gỡ / Đặt lại | `sm`, `aria-pressed` | Đặt lại giữ bundle; chọn lại các mục exact đủ điều kiện | Đang xử lý |
| Checkbox | Native, label chứa đường dẫn | Chọn mục; dữ liệu/cài đặt lâu dài không tích sẵn; vendor/name/prefix bị khoá | Bundle theo chế độ; Containers, launch agents, shared, protected, needs-admin, unreadable |
| Hiện trong Finder | `sm neutral ghost` | Mở vị trí của mục đã quét | Đang xử lý |
| Xem xác nhận / Thoát rồi tiếp tục | `md danger outline` | Hộp thoại native liệt kê các mục được chọn; Huỷ nhận focus mặc định | Không chọn, app bị chặn, thiếu native binary, quét chưa đủ, đang xử lý |
| Hoàn tác | `sm neutral outline` | Khôi phục từng mục còn có thể trả về, không ghi đè | Không còn mục có thể khôi phục hoặc đang xử lý |

## 5. Trạng thái

- Đang tải: progress không xác định và nhãn `Đang xử lý…`; không chạy thao tác chồng nhau.
- Trống: chưa chọn app / không có kết quả tìm kiếm / chưa có nhật ký.
- Có plan: mỗi mục có dung lượng trên đĩa hoặc `Chưa đo được`, bằng chứng, hệ quả.
- App đang chạy: giải thích yêu cầu thoát bình thường; không force quit.
- Plan cũ, mục thay đổi, đang dùng, thiếu quyền: giữ mục và báo lỗi có thể hành động.
- Quét không đầy đủ: không kết luận đã sạch. Nhật ký giữ cả mục bỏ chọn/bị chặn/lỗi.
- Thiếu binary: xem trước được; không gỡ để tránh tạo giao dịch không có khả năng Hoàn tác.
- Module tắt / nền tảng khác: handler trả mã lỗi có bản dịch; trang ẩn khi module tắt.

## 6. Luồng tương tác chính

1. Mở trang: đọc metadata app và nhật ký local, không yêu cầu mạng.
2. Chọn app: quét các gốc hỗ trợ; chỉ bundle và cache/log/saved state exact được chọn sẵn, tối đa 5 phút cho plan.
3. Chọn Gỡ hoặc Đặt lại và các mục. Xem xác nhận native, mặc định Huỷ.
4. Main kiểm tra kho app lại (dữ liệu dùng chung có thể đổi), yêu cầu thoát nếu cần.
5. Ghi ý định trước thao tác; kiểm tra metadata cây, symlink, danh sách cấm và tệp đang mở.
6. Tệp vào Thùng rác; preferences được export rồi defaults delete; Containers và launch agents được giữ nguyên. Preferences có checksum backup và
   đối chiếu giá trị sau khi xoá/khôi phục; plist rỗng macOS giữ lại được ghi nhận.
7. Quét lại, ghi kết quả từng mục. Hoàn tác dùng đúng vị trí Thùng rác/backup, giữ
   nguyên mục bị đổi hoặc đường dẫn/domain đã được tạo lại.

## 7. Responsive

Hai cột tự xếp dọc theo kích thước vùng nội dung. Đường dẫn dài xuống dòng;
toolbar được wrap. QA ở ba cỡ chữ và cửa sổ 1200/820/560 px, sáng/tối, VI/EN/JA.

## 8. Bàn phím và trợ năng

Button/checkbox/input native hỗ trợ Tab, Space, Enter. Nhãn checkbox chứa đường
dẫn. Chế độ có `aria-pressed`. Lỗi dùng `role=alert`, tiến trình/kết quả dùng
`role=status`. Nhật ký là `details/summary`; hộp xác nhận do hệ điều hành quản lý.

## 9. Nội dung chữ (vi)

`nav_apps` = Ứng dụng; `apps.*` gồm nhãn, câu có placeholder, lý do giữ mục,
bằng chứng và trạng thái nhật ký. EN/JA cùng shape; số/ngày theo locale đang chọn.

## 10. Phạm vi chưa triển khai

- Gỡ nhiều app trong một phiên; kho app có icon/nguồn và bộ lọc nâng cao.
- Receipt/pkg, helper/daemon toàn máy, Dock/TCC, container dùng chung và ByHost:
  chưa xử lý. Không tự nâng quyền, không xin Full Disk Access.
- Thiết bị MDM: chặn gỡ toàn bộ thay vì suy đoán app nào được quản lý.
- Bộ dò chỉ kiểm tra các gốc đã khai báo; không tìm bundle con bằng Spotlight
  hay symlink ngoài các gốc đó. Không khẳng định đã gỡ sạch toàn máy.
- P2 tệp sót/khởi động độc lập, P3 cập nhật, P4 root, P5 đa nền tảng còn ở kế hoạch.
- Hoàn tác cần mục còn trong Thùng rác và không thay đổi. Nếu tiến trình native
  chết giữa chuyển tệp và ghi biên nhận, nhật ký giữ trạng thái chưa xác minh;
  không suy diễn thành đã hoàn tất. Không xoá vĩnh viễn trong bản này.

## Kiểm tra an toàn bổ sung

- Metadata app chưa xác minh hoặc quét chưa đủ: khoá thao tác; không suy ra sở hữu độc quyền.
- Kiểm tra toàn bộ lựa chọn trước mục đầu tiên và kiểm lại từng mục; lỗi thì dừng các mục sau.
- Undo dừng nếu bundle hoặc dữ liệu xung đột; không trộn dữ liệu cũ vào app mới.
- Phiên chưa xác minh sau gián đoạn chặn lần gỡ mới. Không hiển thị số mục còn lại cũ sau Undo.
- Bản draft chưa được duyệt cho dữ liệu thật; chưa kiểm chứng ma trận MDM/TCC/ổ ngoài hoặc ngắt nguồn.

- Inventory đọc các layout Contents/Info.plist, Info.plist và Wrapper một app; plist có kiểu không chuyển được sang JSON được đọc theo từng trường cần thiết. App iOS bọc và app Apple vẫn bị bảo vệ. Thư mục dữ liệu chỉ trùng đuôi `.app` ngoài gốc cài app không được coi là app. Bundle hỏng trong gốc cài đặt vẫn chặn thay đổi.
- Đã kiểm thử runtime thật từ inventory đến xác nhận, quét lại, gỡ, restart và Undo trên fixture riêng; callback xác nhận khoá đúng hai đường dẫn fixture. Không gỡ ứng dụng thật để thử.
