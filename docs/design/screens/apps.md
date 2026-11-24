# Ứng dụng

> Mã nguồn: `src/pages/AppsPage.tsx`, `src/components/organisms/apps/`.
> Kế hoạch tổng thể: [`apps-module.md`](../../plans/apps-module.md).
> Board trạng thái: [`apps.html`](../specs/apps.html).

## 1. Mục đích

Xem trước ứng dụng và dữ liệu liên quan trên macOS, gỡ hoặc đặt lại từng ứng
dụng, chuyển mục cần xác thực qua Finder và khôi phục qua nhật ký. Kết quả nói số mục còn
trong phạm vi quét; không hứa tìm được mọi dấu vết trên ổ đĩa.

Windows/Linux có dịch vụ C++ gỡ theo nguồn cài đặt (B1, 2026-11-08), mô tả ở
mục 11. Luồng chọn dữ liệu/Đặt lại/nhật ký bên dưới vẫn là phạm vi macOS.
Màn QML hiện dùng dịch vụ này để liệt kê, xác nhận gỡ và hiển thị kết quả. Tình trạng B1 ban đầu và giao diện hiện tại được ghi riêng ở mục 11 và mục thông báo.

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

Trên macOS, danh sách và kế hoạch cuộn riêng. Phần tổng số mục đã chọn và nút
thao tác nằm dưới vùng cuộn của kế hoạch. Cách chia cột theo chiều rộng được
mô tả ở mục 7. Bố cục dùng token chung và tôn trọng trạng thái thanh điều hướng.

## 4. Thành phần và hành động

| Điều khiển | Kiểu | Kết quả | Khi tắt |
| --- | --- | --- | --- |
| Mở Quyền truy cập toàn bộ ổ đĩa (macOS) | `sm neutral outline`, biểu tượng `lock.shield` | Hiện ở thẻ quét khi quét gặp thư mục không đọc được, và cạnh dòng "Không đọc được mọi vị trí" của kế hoạch khi một thư mục Library bị từ chối quyền (tooltip nêu thư mục). Mở trang quyền tương ứng trong Cài đặt hệ thống để người dùng tự bật quyền rồi bấm Quét lại | Đang xử lý |
| Quét lại | `sm neutral outline` | Đọc kho app, làm hết hiệu lực plan cũ, đọc nhật ký | Đang xử lý |
| Hàng app | `sm neutral ghost`; chọn là `primary soft` | Quét dữ liệu theo app | Đang xử lý |
| Gỡ / Đặt lại | `sm`, `aria-pressed` | Đặt lại giữ bundle; chọn lại các mục exact đủ điều kiện | Đang xử lý |
| Checkbox | Native, label chứa đường dẫn | Chọn mục; dữ liệu/cài đặt lâu dài không tích sẵn; vendor/name/prefix bị khoá | Mục chỉ dành cho Gỡ khi đang Đặt lại, container, mục dùng chung, được bảo vệ hoặc chưa xác minh |
| Xem nhanh (macOS) | Nút biểu tượng mắt, cùng cỡ với Hiện trong Finder | Mở Quick Look cho mục trong kế hoạch. Nhãn trợ năng và chú giải chứa đường dẫn rút gọn | Đang xử lý hoặc mục chưa có snapshot |
| Hiện trong Finder | `sm neutral ghost` | Mở vị trí của mục đã quét | Đang xử lý |
| Chuyển vào Thùng rác | Nút phụ destructive sau Hiện trong Finder | Xác nhận tên, đường dẫn và phạm vi cho bundle hỏng, thư mục `.app` rỗng hoặc liên kết `.app` hỏng. Huỷ là mặc định | Đang xử lý. Chỉ hiện trong gốc cài đặt cho phép. Liên kết phải nằm ngay dưới gốc |
| Xem xác nhận / Thoát rồi tiếp tục | `md danger outline` | Hộp thoại native liệt kê các mục được chọn; Huỷ nhận focus mặc định | Không chọn, app bị chặn, thiếu native binary, quét chưa đủ, đang xử lý |
| Hoàn tác | `sm neutral outline` | Khôi phục từng mục còn có thể trả về, không ghi đè | Không còn mục có thể khôi phục hoặc đang xử lý |

## 5. Trạng thái

- Đang tải: progress không xác định và nhãn `Đang xử lý…`; không chạy thao tác chồng nhau.
- Trống: chưa chọn app / không có kết quả tìm kiếm / chưa có nhật ký.
- Có plan: mỗi mục có dung lượng trên đĩa hoặc `Chưa đo được`, bằng chứng, hệ quả.
- App đang chạy: giải thích yêu cầu thoát bình thường; không force quit.
- Plan cũ, mục thay đổi, đang dùng, thiếu quyền: giữ mục và báo lỗi có thể hành động.
- Khi Gỡ, Đặt lại hoặc Chuyển vào Thùng rác phát hiện mục đang được sử dụng, Viezan báo `appInUse` và ghi cùng lý do cho mục `failed` nếu đã lưu ý định vào nhật ký.
- Quét không đầy đủ: không kết luận đã sạch. Nhật ký giữ cả mục bỏ chọn/bị chặn/lỗi.
- Có mục chặn Gỡ/Đặt lại, thẻ cảnh báo hiển thị tổng số mục chặn. Nếu chỉ có thư mục `.app` không chứa ứng dụng, thẻ thông tin hiển thị số đường dẫn đã lưu cùng nút Quét lại.
- Sau khi chuyển một thư mục hoặc liên kết, kho tự quét lại. Toast kết quả có nút Hoàn tác. Nếu thư mục đã thành ứng dụng hợp lệ hoặc liên kết nay trỏ tới ứng dụng hợp lệ, Viezan dừng thao tác, báo lỗi và quét lại.
- Thiếu binary: xem trước được; không gỡ để tránh tạo giao dịch không có khả năng Hoàn tác.
- Module tắt / nền tảng khác: handler trả mã lỗi có bản dịch; trang ẩn khi module tắt.

## 6. Luồng tương tác chính

1. Mở trang: đọc metadata app và nhật ký local, không yêu cầu mạng.
2. Chọn app: quét các gốc hỗ trợ; chỉ bundle và cache/log/saved state exact được chọn sẵn, tối đa 5 phút cho plan.
   Mục có bằng chứng “Do ứng dụng khai báo” từ ID bundle con, app group trong chữ ký hoặc khoá `SMPrivilegedExecutables` của app chính không được chọn sẵn. Trong thư viện người dùng, các mục khai báo này bị khoá. Trong thư viện toàn máy, áp dụng quy tắc sở hữu dưới đây.
   Trên macOS, `Application Scripts`, `SyncedPreferences`, `Cookies`, `Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments` trong `~/Library` và `/private/var/db/receipts` chỉ nhận ID khớp chính xác của app chính hoặc bundle con. Recent Documents dùng ID viết thường. Tệp cookie và lịch sử tài liệu của app chính cho phép chọn thủ công khi thuộc riêng app.
3. Chọn Gỡ hoặc Đặt lại và các mục. Xem xác nhận native, mặc định Huỷ.
   Khi đã chọn ít nhất một mục dữ liệu cá nhân, hộp xác nhận hiển thị “Đã chọn {count} mục dữ liệu cá nhân; hãy chắc chắn trước khi chuyển vào Thùng rác.” ngay trước danh sách đường dẫn.
4. Main kiểm tra kho app lại (dữ liệu dùng chung có thể đổi), yêu cầu thoát nếu cần.
5. Ghi ý định trước thao tác; kiểm tra metadata cây, symlink, danh sách cấm và tệp đang mở.
6. Finder xử lý nhóm mục toàn máy trước các mục của người dùng. Preferences trong thư viện người dùng được export rồi defaults delete. Các container và launch agent của người dùng được giữ nguyên. Preferences có checksum backup và
   đối chiếu giá trị sau khi xoá/khôi phục; plist rỗng macOS giữ lại được ghi nhận.
7. Quét lại, ghi kết quả từng mục. Hoàn tác dùng đúng vị trí Thùng rác/backup, giữ
   nguyên mục bị đổi hoặc đường dẫn/domain đã được tạo lại.

### Chọn mục trong thư viện toàn máy

Trong kế hoạch Gỡ, mỗi mục đủ điều kiện trong `/Library` có ô chọn trống. Người dùng có thể chọn riêng dữ liệu và để lại gói ứng dụng. Chuyển sang Đặt lại sẽ bỏ chọn các mục toàn máy. Hộp xác nhận hiển thị từng đường dẫn đã chọn và giải thích rằng macOS có thể yêu cầu tài khoản quản trị viên.

Viezan so sánh tên tệp với ID chính hoặc ID thành phần thuộc không gian tên của ứng dụng. Với một số ứng dụng, tệp thực thi trong gói có chữ ký xác nhận ID và nhóm phát triển của helper. Tệp launchd phải có nhãn trùng ID và trỏ tới mã của ứng dụng. Nếu plist ghi thêm ứng dụng khác trong `AssociatedBundleIdentifiers`, Viezan khoá mục đó với lý do dùng chung. Mục chỉ giống tên, có bằng chứng dùng chung, là liên kết hoặc nằm ngoài các thư mục cho phép sẽ bị khoá.

Sau khi xác nhận, Viezan kiểm lại kho ứng dụng và các mục đã chọn. Các mục toàn máy cùng gói cần xác thực được gửi cho Finder trong một yêu cầu. Nếu Finder dừng giữa chừng, nhật ký ghi riêng từng mục đã đối chiếu trong Thùng rác. Nếu huỷ trước khi di chuyển, lựa chọn vẫn còn để sửa hoặc thử lại. Hoàn tác dữ liệu dùng vị trí gốc còn trống. Nếu thư mục gốc cần quyền quản trị hoặc mục là tệp khởi chạy hay helper đặc quyền, người dùng chọn **Tệp › Đưa trở lại** (Put Back) trong Finder rồi bấm **Khôi phục** để Viezan kiểm tra kết quả.

Kiểm chứng macOS ngày 25/11/2026 dùng workflow `ship-viezan-feature`, quy tắc `viezan-product-engineering`, `generate-code` và `ui-ux`, cùng các bước kiểm tra UX native, bảo mật, i18n và đồng bộ tài liệu. Bản Preview có chữ ký hợp lệ. Hai bộ Swift Testing của bản này đạt 125 và 243 bài. Kiểm thử AppKit thao tác checkbox qua API trợ năng ở 820/1200 pt, sáng/tối. Finder thật chuyển hai mục tạm trong một yêu cầu. Quét AdGuard ở chế độ xem trước xác nhận ba mục trong ảnh có thể chọn. Bước nhập mật khẩu quản trị và thao tác trên dữ liệu AdGuard thật chưa chạy.

## 7. Responsive

Trên macOS, khi vùng nội dung đủ rộng, danh sách ứng dụng dùng 236 pt và kế
hoạch gỡ lấy phần còn lại. Khi hẹp, danh sách và chi tiết dùng chung một cột.
Đường dẫn dài trong chi tiết và các mục của kế hoạch được xuống dòng. Khi
thiếu chỗ, dung lượng và các nút thao tác của mục chuyển xuống dưới. Nút
**Chuyển mục đã chọn vào Thùng rác** giữ nguyên nhãn và có hàng riêng khi cần.
Kiểm tra ở ba cỡ chữ, sáng/tối, VI/EN/JA. Dùng cửa sổ 1200, 820 và 640 pt
trên macOS, dùng vùng nội dung 560 pt để kiểm tra bố cục hẹp.
Trên thẻ quét macOS, khi thiếu chỗ, **Quét lại** xuống dưới phần mô tả cùng với **Mở Quyền truy cập toàn bộ ổ đĩa** nếu nút này đang hiện. **Hiện trong Finder** và **Chuyển vào Thùng rác** xuống cùng một hàng bên dưới đường dẫn và lý do, căn phải.

## 8. Bàn phím và trợ năng

Button/checkbox/input native hỗ trợ Tab, Space, Enter. Nhãn checkbox chứa đường
dẫn. Chế độ có `aria-pressed`. Lỗi dùng `role=alert`, tiến trình/kết quả dùng
`role=status`. Nhật ký là `details/summary`; hộp xác nhận do hệ điều hành quản lý.
Trên macOS, mỗi ô chọn trong kế hoạch Gỡ/Đặt lại cung cấp cho VoiceOver đường dẫn
và trạng thái đã chọn hoặc chưa chọn. Người dùng có thể chọn và bỏ chọn ngay qua
VoiceOver. Với mục bị khóa, nhãn của ô chọn nêu lý do.
Hộp xác nhận chuyển vào Thùng rác của Classic hiển thị tên, đường dẫn đầy đủ và phạm vi thao tác. Escape và Return đều chọn **Huỷ** khi mở hộp. Cả hai giao diện đóng hộp nếu kết quả quét mất mục đó hoặc lý do thay đổi.

- Trên macOS, **⌘Z** khôi phục lần gỡ gần nhất còn bật nút **Khôi phục** trong nhật ký. Chú giải của **Nhật ký & hoàn tác** cho biết tên ứng dụng và phím tắt. Khi đang sửa văn bản, ⌘Z hoàn tác văn bản. Khi đang xử lý, đang xác nhận hoặc đã hết mục có thể khôi phục, ⌘Z bỏ qua nhật ký. Space giữ hành vi của checkbox.
- Có thể kéo từ Finder vào vùng danh sách, kể cả khi tìm kiếm cho kết quả rỗng. Viền nhấn bo góc đánh dấu vùng thả. Viezan xét mục `.app` đầu tiên, bỏ bộ lọc nếu nó đang ẩn ứng dụng rồi chọn ứng dụng và mở kế hoạch như khi bấm hàng. Ứng dụng bị chặn chỉ được chọn. Mục ngoài kho hiện toast cảnh báo. Khi đang xử lý hoặc có hộp thoại mở, danh sách bỏ qua thao tác thả.

## 9. Nội dung chữ (vi)

`nav_apps` = Ứng dụng; `apps.*` gồm nhãn, câu có placeholder, lý do giữ mục,
bằng chứng và trạng thái nhật ký. EN/JA cùng shape; số/ngày theo locale đang chọn.

## 10. Phạm vi chưa triển khai

- Gỡ nhiều app trong một phiên; kho app có icon/nguồn và bộ lọc nâng cao.
- Receipt `.bom` và `.plist` khớp chính xác ID của app chính hoặc bundle con được hiển thị nhưng luôn khoá. Gỡ gói pkg, điều khiển dịch vụ launchd, Dock/TCC, container dùng chung và ByHost vẫn ngoài phạm vi. Viezan không chạy mã quyền quản trị và không tự xin Full Disk Access; gói ứng dụng cần quyền quản trị và các mục toàn máy đủ điều kiện được chuyển qua Finder với xác thực của macOS. Chỉ khi gặp thư mục không đọc được mới hiện nút mở trang quyền này trong Cài đặt hệ thống (2026-11-24).
- Thiết bị MDM: chặn gỡ toàn bộ thay vì suy đoán app nào được quản lý.
- Trên macOS, kho quét `/Applications`, `~/Applications`, `/Users/Shared/Riot Games`
  và đọc `/System/Applications` để nhận diện ứng dụng hệ thống. Trong gốc Riot,
  bộ quét chỉ xét các mục `.app` ngay dưới gốc. Tệp và thư mục anh em như
  `RiotClientInstalls.json` và `Metadata` nằm ngoài phạm vi quét và gỡ.
  Dữ liệu Riot trong Library không khớp chính xác bundle ID được giữ lại.
- Bộ dò chỉ kiểm tra các gốc đã khai báo; không tìm bundle con bằng Spotlight
  hay symlink ngoài các gốc đó. Không khẳng định đã gỡ sạch toàn máy.
- P2 tệp sót/khởi động độc lập, P3 cập nhật và P4 root còn ở kế hoạch.
  P5 có dịch vụ gỡ Windows/Linux ở mục 11; UI và nghiệm thu máy Linux còn chờ.
- Hoàn tác cần mục còn trong Thùng rác và không thay đổi. Nếu tiến trình native
  chết giữa chuyển tệp và ghi biên nhận, nhật ký giữ trạng thái chưa xác minh;
  không suy diễn thành đã hoàn tất. Không xoá vĩnh viễn trong bản này.

## Kiểm tra an toàn bổ sung

- Metadata app chưa xác minh hoặc quét chưa đủ: khoá thao tác; không suy ra sở hữu độc quyền.
- Kiểm tra toàn bộ lựa chọn trước mục đầu tiên và kiểm lại từng mục; lỗi thì dừng các mục sau.
- Undo dừng nếu bundle hoặc dữ liệu xung đột; không trộn dữ liệu cũ vào app mới.
- Phiên chưa xác minh sau gián đoạn chặn lần gỡ mới. Không hiển thị số mục còn lại cũ sau Undo.
- Bản draft chưa được duyệt cho dữ liệu thật; chưa kiểm chứng ma trận MDM/TCC/ổ ngoài hoặc ngắt nguồn.

- Inventory đọc các layout Contents/Info.plist, Info.plist và Wrapper một app; plist có kiểu không chuyển được sang JSON được đọc theo từng trường cần thiết. App iOS bọc và app Apple vẫn bị bảo vệ. Thư mục dữ liệu chỉ trùng đuôi `.app` ngoài gốc cài app không được coi là app. Trong gốc cài đặt, ngoại lệ duy nhất là thư mục `.app` thật, đọc được, có đường dẫn trùng với đường dẫn chính tắc và xác minh được cả `Contents/Info.plist`, `Info.plist` ở gốc và `Wrapper` đều vắng mặt. Thư mục đó không có bundle ID để sở hữu hoặc dùng chung dữ liệu khớp theo ID, nên kho vẫn cho phép thay đổi.
- Đã kiểm thử runtime thật từ inventory đến xác nhận, quét lại, gỡ, restart và Undo trên fixture riêng; callback xác nhận khoá đúng hai đường dẫn fixture. Không gỡ ứng dụng thật để thử.

## Native implementation follow-up — 2026-10-28

- Kho ứng dụng: symlink `.app` trỏ tới bundle hợp lệ (Safari nằm trong `/System/Cryptexes` và được
  link vào `/Applications` trên mọi máy hiện đại) được liệt kê là "được bảo vệ" để xét dữ liệu dùng chung nếu đích chưa có trong kho;
  chỉ symlink không trỏ tới bundle mới làm kho "chưa đầy đủ". Trước đó mọi app bị khoá trên mọi máy.
- Sau Gỡ/Đặt lại: dòng kết quả "Đã chuyển {count} mục vào Thùng rác." + Hoàn tác ngay tại chỗ, rồi
  "Đã khôi phục {count} mục."; hộp xác nhận có nút Huỷ bản địa hoá (mặc định); kế hoạch có "Đã chọn {count}
  mục · {size}"; đường dẫn trong nhà hiện `~/…`; lọc tìm thì khung chi tiết theo kết quả đầu tiên.
- Đã chạy thật trên ứng dụng giả riêng (`~/Applications`, cache, Application Support): xem trước → Thùng rác
  → Hoàn tác, tệp về đúng chỗ, mục không chọn được giữ. Không gỡ ứng dụng thật.

## Thông báo — macOS, 2026-11-24

Thay cho "dòng kết quả … ngay tại chỗ" ở mục 2026-10-28 và dải kết quả của `Apps-States`.

- Kết quả Gỡ, Đặt lại hoặc chuyển một mục vào Thùng rác là toast "Đã chuyển {count} mục vào Thùng rác." / "Đã đặt lại {count} mục." kèm Hoàn tác trong 8 giây. Sau đó Hoàn tác vẫn nằm trong "Nhật ký & hoàn tác"; khôi phục từ toast hay từ nhật ký đều báo toast "Đã khôi phục {count} mục." khi lần khôi phục và lần quét lại sau đó không để lại lỗi.
- Lỗi của một thao tác (`appActionError`, `appInUse`, `appHelperMissing`) là toast lỗi, ở lại đến khi đóng; lần Gỡ, Đặt lại, chuyển vào Thùng rác hoặc Hoàn tác kế tiếp chạy sạch thì toast lỗi cũ được gỡ (Quét lại thì không). Toast này chỉ có nút đóng, không có nút hành động, vì nó còn hiện khi người dùng đã sang màn khác.
- Lỗi còn hiệu lực vẫn là dải trong trang, nền trung tính với icon đỏ: `appJournalError` (còn nguyên sau khi quét lại thành công; nếu lần quét lại lỗi thì dải đổi sang `appIncomplete` dù thay đổi vẫn bị khoá) và `appIncomplete`.

Qt (Windows/Linux), cùng ngày: kết quả của một lần gỡ là toast (thành công đã xác minh mức success, còn lại mức danger, cùng khoá nên lần sau thay lần trước); lần quét không phát toast kết quả. Thẻ trong trang chỉ hiện khi đang gỡ, thao tác chưa xác minh, có hướng dẫn Thùng rác hoặc còn lỗi kiểm kê.

## Follow-up macOS — 2026-11-24

Kho nhận diện `Riot Client.app` tại `/Users/Shared/Riot Games`. Gốc này có thể
vắng mặt. Gốc là symlink được bỏ qua. Nếu gốc là thư mục đáng tin nhưng có tổ tiên
là symlink, kho ghi một mục chặn tại gốc. Trong gốc hợp lệ, thư mục bundle hoặc chính
liên kết hỏng phải thuộc người dùng hiện tại mới được chuyển vào Thùng rác. Bundle hợp lệ
của người dùng khác có lý do `appNeedsAdmin`. Ở mọi gốc cài đặt, bundle mà tài khoản
hiện tại không ghi được vào thư mục gói (ví dụ ứng dụng App Store thuộc root) không bị
khoá: nó đi qua xem trước và xác nhận như ứng dụng thường. Mục gói trong kế hoạch ghi
“cần xác thực qua Finder” và hộp xác nhận có dải thông báo trung tính với biểu tượng chìa
khoá. Khi áp dụng, Viezan nhờ Finder chuyển gói và các mục toàn máy đã chọn trước dữ liệu người dùng, để
macOS tự hỏi mật khẩu hoặc Touch ID; Viezan không chạy mã quyền root cho việc này. Sau khi
Finder chuyển xong, gói trong Thùng rác phải khớp snapshot đã xem trước thì mới ghi là đã
chuyển. Huỷ trước khi Finder di chuyển mục nào sẽ không để lại dòng nhật ký. Khi tên gói
vẫn như cũ, Hoàn tác dùng Finder và macOS có thể hỏi xác thực lần nữa. Nếu Viezan chưa được phép điều khiển Finder,
thao tác dừng với hướng dẫn mở Cài đặt hệ thống › Quyền riêng tư & Bảo mật › Tự động hoá.
Đặt lại chỉ áp dụng cho dữ liệu người dùng. Kho gộp liên kết tượng trưng với đúng gói ứng dụng đã quét ở đường dẫn đích. Trong kế hoạch Gỡ, hàng “Lối tắt đến ứng dụng này” có ô chọn riêng, mặc định bỏ chọn. Liên kết ngay dưới gốc cài đặt được phép ghi có thể được chuyển và hoàn tác bằng helper xử lý liên kết. Hai bản cài riêng vẫn có hai hàng và được xét khi xác định dữ liệu dùng chung. Trình gỡ của hãng có gói ứng dụng riêng cũng có hàng riêng.
Gỡ và Đặt lại dùng các quy tắc khớp bundle ID, nhà cung
cấp và tên ứng dụng hiện có.

Khi hoàn tác gói cần xác thực, Viezan ghi ý định xuống đĩa trước khi di chuyển.
Nếu Thùng rác đã đổi tên, Viezan thử đưa gói về thẳng tên gốc bằng thao tác
không ghi đè. Nếu thiếu quyền, gói vẫn ở Thùng rác. Trong nhật ký, người dùng
có thể mở gói trong Finder, đưa về đường dẫn gốc rồi bấm Khôi phục lần nữa.
Với nhật ký 2.6.0 bị ngắt giữa chừng, Viezan đối chiếu snapshot ở Thùng rác,
tên trung gian và tên gốc trước khi tiếp tục. Chỉ đánh dấu đã khôi phục khi
gói nằm đúng tên gốc và khớp snapshot.

Glass và Classic dùng thẻ cảnh báo có biểu tượng tam giác khi có mục chặn Gỡ/Đặt lại. Plist hỏng, bundle ID thiếu hoặc không có dấu chấm, layout `Wrapper` chưa nhận diện được, đường dẫn không xác minh được, symlink hỏng, lỗi quyền và vượt giới hạn quét đều chặn thay đổi. Ngoại lệ: symlink hỏng mà tên đích vắng mặt trong một thư mục cha còn tồn tại và đọc được thì không chặn, vì ứng dụng đã bị gỡ và không còn sở hữu dữ liệu dùng chung nào. Thư mục cha vắng mặt (ổ chưa gắn) hoặc không đọc được vẫn chặn. Khi chỉ gặp thư mục `.app` không chứa ứng dụng hoặc liên kết tới ứng dụng đã gỡ, thẻ dùng biểu tượng thông tin, màu trung tính và tiêu đề “{count} mục .app không chứa ứng dụng”. Các ứng dụng thường vẫn cho phép Gỡ/Đặt lại.

Tiêu đề thẻ và lý do khoá ở chi tiết ứng dụng thường đếm tất cả các mục chặn, kể cả khi vượt giới hạn lưu 50 đường dẫn. Thẻ hiển thị tối đa ba dòng, ưu tiên mục chặn trước thư mục `.app` không chứa ứng dụng, rồi cho biết số đường dẫn đã lưu còn lại. Người dùng có thể hiện từng mục trong Finder và bấm **Quét lại**. Ứng dụng được bảo vệ vẫn hiển thị lý do bảo vệ riêng.

Với `invalidBundle`, `notAnApp` và `brokenLink` trong phạm vi được phép, người dùng có thể chọn **Chuyển vào Thùng rác** ngay trên dòng. Sau xác nhận, Viezan kiểm lại lý do, ghi ý định vào nhật ký và chuyển mục đã chọn. Với `brokenLink`, Glass và Classic giải thích rằng chỉ chính liên kết được chuyển. Liên kết phải nằm ngay dưới gốc cài đặt có đường dẫn chính tắc. Đích và dữ liệu liên quan được giữ nguyên. Khi quét lại không còn mục chặn, các ứng dụng thường mở lại Gỡ/Đặt lại. Có thể khôi phục từ toast kết quả hoặc **Nhật ký & hoàn tác**. Các dòng `unreadable` và `scanLimit` chỉ có hành động Hiện trong Finder.

Khi chuyển hoặc khôi phục liên kết ứng dụng trên macOS, helper kiểm lại thiết bị và inode tại đích. Nếu bước kiểm này lỗi, thao tác dừng và báo lỗi. Nếu chỉ việc công bố biên nhận lỗi, helper thử trả liên kết đã xác minh về tên gốc còn trống.

`notAnApp` chỉ dành cho thư mục `.app` thật, đọc được và hoàn toàn rỗng (bỏ qua `.DS_Store`). Thư mục còn bất kỳ nội dung nào, kể cả một app lồng bên trong, là `invalidBundle` và vẫn chặn Gỡ/Đặt lại cho tới khi được chuyển vào Thùng rác hoặc cài lại.

Gốc launcher `/Users/Shared/Riot Games` chỉ được dùng khi là thư mục thật thuộc người dùng hiện tại hoặc root và nhóm/người khác không ghi được; nếu không, gốc bị bỏ qua và không sinh issue. Kiểm tra đang-dùng bỏ qua descriptor theo dõi thư mục của tiến trình hệ thống (ví dụ `UserEventAgent`); tệp đang mở, thư mục làm việc và mã đã ánh xạ vẫn chặn thao tác.

## 11. Dịch vụ Qt Windows/Linux — B1, 2026-11-08

- API QML: `appUninstall.inventory()` bắt đầu quét bất đồng bộ; đọc `apps`,
  `busy`, `inventoryComplete`, `errors`; `finished(result)` thông báo kết quả.
  `appUninstall.uninstall(id, authorizeSystem)` chỉ nhận ID đã quét, không nhận
  lệnh hay đường dẫn từ QML. Luồng QML W3 phải có xác nhận trước hành động không
  thể hoàn tác, khóa thao tác khi bận và dịch các mã kết quả.
- Windows: đọc Uninstall HKLM 64-bit, HKLM WOW6432Node và HKCU.
  Hiển thị tên, phiên bản, nhà phát hành, vị trí, dung lượng ước tính; bỏ thành phần
  hệ thống, mục con và update/hotfix. Chạy `UninstallString` đã đăng ký, giữ tham số
  của nhà cung cấp; không dùng `QuietUninstallString`. MSI dùng `msiexec /x {GUID}`.
  Trình gỡ và UAC của nhà cung cấp tự hiện; không tự thử lại bằng quyền quản trị.
  Đường dẫn tương đối, đường dẫn có dấu cách không đặt trong ngoặc kép, lệnh không
  phải EXE hoặc thiếu thông tin được khóa với `invalidUninstallCommand`.
- Microsoft Store/MSIX: chỉ trả `action: openSettings` và
  `settingsUrl: ms-settings:appsfeatures`. QML mở đúng URI cố định khi người dùng
  chọn hành động. Danh sách package đọc được từ registry HKCU chỉ là bổ sung;
  luôn có mục mở Cài đặt vì không bảo đảm liệt kê mọi package/tài khoản.
- Linux: Flatpak tách `user` và `system`, nhận diện theo app/arch/branch; Snap;
  gói sở hữu `.desktop` qua `dpkg -S` hoặc `rpm -qf`; AppImage được `Exec` trỏ trực
  tiếp bằng đường dẫn tuyệt đối. Chỉ hỗ trợ Flatpak user và system mặc định,
  không dò installation có tên. Không coi shell/env wrapper là đường dẫn AppImage.
- Flatpak user không root. Flatpak system, Snap, apt-get/dnf dùng `pkexec` sau
  khi QML xác nhận và truyền `authorizeSystem=true`; mặc định trả
  `authorizationRequired`, không khởi chạy lệnh. Thiếu công cụ/Polkit thì khóa
  gỡ. Gói có thể chứa nhiều ứng dụng và trình quản lý có thể yêu cầu gỡ gói phụ
  thuộc; UI xác nhận phải giải thích hệ quả theo nguồn. Không purge dữ liệu, không
  chạy bước dọn tệp sót hay autoremove riêng.
- Không có Hoàn tác cho Win32/MSI, Flatpak, Snap, apt/dnf. AppImage có
  `canUndo=true`, `undoKind=systemTrash`: chỉ chuyển đúng tệp AppImage đã chọn
  qua `QFile::moveToTrash`; người dùng khôi phục trong Thùng rác hệ điều hành.
  Chưa có nút/API khôi phục trong Viezan hoặc nhật ký bền vững cho Qt. Giữ nguyên
  `.desktop` và dữ liệu ứng dụng. Từ chối symlink và tệp đã đổi sau khi quét.
- Quét lại trước/sau thao tác. Chỉ `removed` với `verifiedRemoved=true` mới là
  xác nhận gỡ trong phạm vi kho đã quét. Tiến trình chưa kết thúc, thiếu dữ liệu,
  lỗi quét lại, trình gỡ giao việc cho tiến trình con, hoặc MSI yêu cầu khởi động
  lại có trạng thái riêng; không báo đã gỡ sạch. Với apt/rpm, kiểm thêm trạng thái
  gói, không suy luận từ việc launcher biến mất.
  Nếu chưa biết tiến trình đã kết thúc, `operationUnverified` khóa gỡ tiếp trong
  phiên ứng dụng; quét lại vẫn khả dụng, không tự khởi chạy trình gỡ lần nữa.
- Kiểm chứng lượt này: QtTest chỉ dùng registry/runner/filesystem giả và build
  Windows; không mở app hoặc gỡ ứng dụng thật. Linux chưa nghiệm thu trên máy thật.

macOS tính khả năng chuyển một mục vào Thùng rác khi quét. Khi xác nhận, dịch vụ kiểm lại quyền, phân loại và danh tính mục trên đĩa. Trên Qt, lens đánh dấu ứng dụng được chọn, vòng focus riêng theo con trỏ bàn phím và lỗi kiểm kê dùng màu nguy hiểm.
