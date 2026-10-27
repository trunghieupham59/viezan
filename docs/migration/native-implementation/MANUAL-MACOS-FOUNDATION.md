# Kiểm tra thủ công foundation trên macOS

Ngày 2026-10-27. **Chưa nghiệm thu, chưa chuyển sang Trang chủ.**
Làm trên Swift trước; lặp lại trên Qt để kiểm tra adapter. Không dùng ứng dụng
Electron tên “Viezan” để đánh giá bản native.

## 0. Một lượt kiểm tra theo thứ tự

Làm các bước dưới trên Swift trước, rồi Qt. Có thể chia thành nhiều lượt; bước
chưa thử ghi NOT RUN. Chi tiết và mẫu trả kết quả nằm ở các mục tương ứng.

1. Mở bundle đúng ở mục 1; ghi theme, ngôn ngữ app/nguồn nhập và trạng thái trợ
   năng ban đầu. Dùng ⌘N tạo phiên mẫu; không xóa các phiên đang có.
2. **Điều hướng/focus:** bấm AI Chat hai lần rồi Dịch hai lần. Trang hiện tại
   vẫn có dấu chọn. ⌘K → Tab → Shift+Tab → Escape; focus nhìn thấy, panel đóng.
   Quay Chat, mở ⌘⇧H và ⌘⇧A lần lượt; chỉ một panel, nút Đóng dùng được.
3. **IME thật:** làm mục 2 (Nhật rồi Việt). Return khi candidate mở chỉ chốt
   chữ; không gửi/đổi trang. Ngôn ngữ UI phải khớp tên lệnh muốn tìm.
4. **VoiceOver:** làm bảng mục 3; nghe tên/role, duyệt và Escape. Ghi nguyên lời
   đọc sai và tên control. Tắt lại nếu ban đầu tắt.
5. **Layout/theme:** làm mục 4 ở cửa sổ nhỏ/lớn; lặp EN/VI/JA, sáng/tối và cỡ
   chữ Lớn. Nếu không đo được point chính xác, ghi xấp xỉ, không đánh PASS cả
   matrix. Kiểm thêm Reduce Transparency theo mục 6 để nhìn rõ nền panel.
6. **Task/lifecycle:** làm mục 2b rồi mục 5 với model Mô phỏng chậm. Phím gửi
   lần hai không hủy task; Close/reopen Swift giữ công việc; Quit/reopen không
   tự chạy lại. Không force quit hoặc sửa snapshot để tạo lỗi lưu.
7. Khôi phục theme, text size, ngôn ngữ app, nguồn nhập và trợ năng ban đầu.
   Gửi mẫu ở cuối tài liệu. Nếu lỗi: ghi app + bước + mong đợi/thực tế; giữ lại
   bản nháp để tái hiện, không cần kiểm Trang chủ.

## 1. Mở đúng bản kiểm thử

Hai bundle đã có trên máy; mở bằng Finder (⌘⇧G rồi dán đường dẫn):

- Swift: `/Users/phamtrunghieu/Github/personal/viezan/apps/macos/.build/Viezan Native Preview.app`
- Qt: `/Users/phamtrunghieu/Github/personal/viezan/apps/desktop-qt/build/ViezanNativeQt.app`

Cả hai phải hiện nhãn **Provider mô phỏng / không gửi dữ liệu ra mạng**. Các model
là `demo.standard`, `demo.slow`, `demo.failure`. Tạo phiên mới bằng ⌘N để giữ
nguyên các phiên cũ. Chỉ dùng câu mẫu; không cần API key.

Trước khi thử, ghi lại theme hệ thống, nguồn nhập đang chọn và các tuỳ chọn trợ
năng để trả về đúng trạng thái đó sau cùng. Các lần kiểm tra trước đã khôi phục
Auto, Reduce Transparency Off, Reduce Motion Off và VoiceOver Off; kiểm tra lại
trạng thái hiện tại nếu bạn đã đổi chúng từ đó.

## 2. Ưu tiên: bộ gõ thật — F05

Automation marked-text đã pass, nhưng **dán chữ tiếng Việt/Nhật không phải kiểm
thử IME**. Phải gõ bằng bàn phím và quan sát chữ đang ghép/candidate.

### Tiếng Nhật

Trước bước tìm lệnh, đổi **ngôn ngữ giao diện app sang 日本語** tại Cài đặt.
Tìm kiếm lệnh dùng tên theo ngôn ngữ giao diện; `履歴` không phải query để kiểm
PASS khi UI vẫn là tiếng Việt. Ghi ngôn ngữ UI ban đầu để khôi phục.

1. Trong menu nguồn nhập macOS, chọn Japanese–Romaji ở chế độ Hiragana. Nếu không
   thấy, vào Cài đặt hệ thống → Bàn phím → Nhập văn bản → Sửa. Máy đã có nguồn
   Japanese–Romaji ở lần kiểm tra trước; không cần cài phần mềm.
2. Ở ô soạn Chat, gõ `nihonn`, bấm Space để chuyển đổi thành `日本`. Khi candidate
   đang mở, bấm Return một lần. **Chỉ chốt chữ; không tạo message/task.**
3. Gõ thêm một từ, mở candidate rồi bấm Escape. **Chỉ hủy candidate/composition;
   không mất phần đã chốt.** Sau khi chốt xong, ⌘Return mới gửi yêu cầu mô phỏng.
4. Mở Bảng lệnh bằng ⌘K. Gõ `rireki`, chuyển thành `履歴`. Return đầu tiên chốt chữ,
   panel vẫn còn; Return tiếp theo mới thực thi lệnh lịch sử nếu kết quả đang chọn
   là Lịch sử. Up/Down khi candidate còn mở phải phục vụ bộ gõ, không đổi lệnh.
5. Lặp lại nhập/chốt/hủy ở tìm kiếm Lịch sử (⌘⇧H) và ô Nguyên bản của Dịch (⌘2).
   Dùng một phiên mẫu có chữ `日本` để kiểm tra kết quả tìm kiếm.

**FAIL nếu:** đang chọn candidate mà app gửi message, mở một lệnh/phiên khác,
đóng panel, bỏ dấu/ký tự hoặc nhân đôi chữ. Nếu vẫn ra `nihonn` Latin thì nguồn
nhập chưa đúng: ghi NOT RUN, chưa thể kết luận PASS/FAIL cho IME.

### Tiếng Việt

Đổi **ngôn ngữ giao diện app sang Tiếng Việt** trước bước tìm `lịch sử`.

1. Chọn bộ gõ Việt đang dùng; nếu chưa có, thêm Vietnamese–Telex trong cùng màn
   hình Nguồn đầu vào, ghi lại để gỡ nguồn vừa thêm sau thử nếu muốn giữ cấu hình cũ.
2. Gõ thật `tieengs vieetj` → `tiếng việt` trong Chat và Nguyên bản của Dịch.
   Kiểm tra dấu, Backspace, sửa chữ giữa câu, rồi chuyển trang và quay lại.
3. Trong Bảng lệnh, gõ `lichj suwr` → `lịch sử`; xác nhận tìm được Lịch sử.
   Xóa query, gõ `lich su` để xác nhận tìm không dấu vẫn hoạt động.
4. Khi bộ gõ còn đánh dấu composition, Return/Escape không được kích hoạt hành
   động của app. Một số bộ gõ Telex chốt ngay từng chữ và không có candidate;
   ghi tên bộ gõ và điều bạn quan sát, không giả định nó phải giống tiếng Nhật.

Chụp phần candidate/query nếu có lỗi. Khôi phục nguồn nhập và ngôn ngữ giao diện ban đầu sau thử.

## 2b. Phím gửi khi tác vụ đang chạy — F05/F07

Ở Qt, tạo một Chat mẫu, chọn Mô phỏng chậm và gửi một đoạn dài. Khi nút vẫn ghi
**Dừng**, click ô soạn rồi bấm ⌘Return lần nữa: tác vụ vẫn chạy, không chuyển sang
Đã dừng và không tạo yêu cầu mới. Nút **Dừng** mới hủy tác vụ. Lặp ở Dịch, không
sửa nguyên bản giữa hai lần bấm (sửa nguyên bản là một thao tác khác).
Nếu phản hồi đã xong trước lần bấm thứ hai, ghi NOT RUN và thử đoạn mẫu dài hơn.
Automation đã tái hiện FAIL trước sửa và PASS sau sửa trên QML, cả hai ô.

## 2c. Undo/Redo và cách ly phiên

Trong một phiên QA mới, gõ `abc` vào Chat hoặc Nguyên bản. ⌘Z phải hoàn tác phần
vừa gõ; ⇧⌘Z phải làm lại. Tạo phiên mới bằng ⌘N rồi ⌘Z: không được xuất hiện
nội dung của phiên trước. Quay lại phiên cũ qua Lịch sử: draft vẫn được giữ.
Lịch sử Undo chỉ có trong editor hiện tại và được reset khi đổi phiên/relaunch;
không coi việc không có Undo của phiên trước là mất bản nháp. Không thực hiện
phép thử Undo trên công việc thật đang cần giữ; dùng phiên QA.

## 3. VoiceOver và focus — F04

Kiểm nhanh focus bằng mắt trước khi bật VoiceOver (Swift): ⌘K → ô tìm kiếm có
viền hệ thống → Tab sang kết quả → Shift+Tab về tìm kiếm → Escape đóng panel.
Lặp ở History. Nếu có bàn phím số, thử Enter của cụm số như Return; ở
Bảng lệnh gõ `hoat` trong UI Việt rồi Enter để mở Hoạt động: focus phải vào
nút Đóng. Thử cả sáng/tối; không nhầm vùng highlight của kết quả với focus
bàn phím. Nếu Tab bỏ qua nút, ghi trạng thái Keyboard Navigation trong macOS.

Bật VoiceOver tại Cài đặt hệ thống → Trợ năng → VoiceOver. Dùng modifier VO theo
cấu hình của bạn (thường Control+Option); VO+Right/Left để duyệt, VO+Space để
kích hoạt, VO+Shift+Down để vào nhóm khi VoiceOver yêu cầu.

| Bước | Kết quả mong đợi |
| --- | --- |
| Duyệt toolbar và điều hướng | Nghe đúng tên mở/thu thanh bên, Bảng lệnh, Lịch sử, Tạo mới, Hoạt động và các trang; không phải “button” vô danh |
| Mở Bảng lệnh bằng nút toolbar | Focus vào tìm kiếm; đọc được query và các kết quả; tên trang không bị lặp vô nghĩa |
| Chọn Lịch sử, duyệt các phiên | Phân biệt được phiên đang mở; đọc tiêu đề; không tự đổi phiên chỉ vì duyệt |
| Escape khi không composing | Panel đóng; focus về opener hợp lý, có thể tiếp tục dùng bàn phím |
| Mở liên tiếp Commands → History → Activity | Chỉ một panel hiện; focus không rơi vào vùng đã biến mất |
| Tab/Shift+Tab và các nút đóng | Focus nhìn thấy, không kẹt; các panel không modal vẫn cho phép quay về nội dung theo thứ tự hợp lý |
| Settings, ⌘N | Settings search dùng được; Tạo mới đưa focus vào ô soạn, không cần click lần hai |

Đọc bằng VoiceOver mới là bằng chứng; cây accessibility hoặc ảnh chụp riêng
không chứng minh phát âm/thứ tự đọc. Tắt lại VoiceOver nếu ban đầu đang tắt.

## 4. Cửa sổ và compact navigation — F01–F04

Thoát fullscreen/zoom nếu cần, kéo cạnh cửa sổ bằng chuột. Mốc cần kiểm:
**640, 820, 1200, 1440 points** bề rộng vùng app; chiều cao tối thiểu 480 points.
Thanh tiêu đề native có thể làm kích thước frame ngoài lớn hơn vùng nội dung.
Nếu chỉ ước lượng được bằng kéo chuột, ghi “xấp xỉ”; không đánh dấu PASS mốc
chính xác dựa trên ảnh có shadow hoặc quy đổi Retina không rõ. Ma trận render
đúng kích thước đã chạy tự động, nhưng chưa thay thế kiểm tra cửa sổ thật.

Lặp mỗi mốc với EN/VI/JA và light/dark; thử thêm cỡ chữ nội dung Lớn:

- Nội dung đọc/soạn và các nút vẫn dùng được, không tràn ngang, toolbar không
  che nút đóng/thu nhỏ/phóng to của macOS. Settings có thể cuộn dọc.
- Dưới 900: luôn rail; bấm mở navigation tạo lớp tạm, không đẩy nội dung.
  Chọn trang, Escape và click ngoài đều đóng lớp tạm.
- Từ 900 trở lên: collapsed/expanded là lựa chọn đã lưu, độc lập với trang.
  Mở rộng ở 1200 → thu về 820 → trở lại 1200 phải trở về expanded. Làm lại với
  collapsed; resize không được ghi đè preference.
- Khi navigation tạm đang mở, mở Commands/History/Activity: không chồng hai
  panel. Khi resize qua 900, navigation tạm đóng.
- Các panel nằm trong vùng cửa sổ; search và nút đóng không bị che. Bản nháp,
  model của phiên và tác vụ đang chạy không bị đổi khi chuyển trang/panel.

Ghi mốc nào chưa đo được. Kết quả gần 900 không thay thế hai phía của breakpoint.

## 5. Close khác Quit và phục hồi — F08

Automation đã quan sát Close/reopen giữ stream và bản nháp ở Swift. Có thể dùng
chuỗi này để bạn xác nhận trực tiếp:

1. Tạo Chat mới, chọn **Mô phỏng chậm**. Dán khoảng 1.000 ký tự mẫu rồi gửi.
   Gõ thêm bản nháp `Chưa gửi — 日本語` khi phản hồi còn chạy.
2. **Swift:** đóng bằng nút đỏ/⌘W; mở lại bằng Dock hoặc Finder. App vẫn resident;
   stream tiếp tục (hoặc đã hoàn tất), cùng phiên/model/bản nháp.
3. Tạo một lượt chạy chậm khác; chọn Quit/⌘Q khi còn chạy. Mở lại: giữ kết quả
   từng phần và bản nháp, tác vụ bị gián đoạn, không tự gửi/chạy lại. Chỉ nút
   Thử lại mới chạy một attempt mới. Nếu đợi hoàn tất trước Quit, trạng thái
   thành công là đúng nhưng chưa kiểm được tình huống interruption.
4. **Qt trên macOS:** đóng cửa sổ cuối có thể thoát app theo adapter; kiểm tra
   save/restore và không tự retry, không áp kỳ vọng resident của Swift lên Qt.

Không force-quit để tạo lỗi lưu. Kiểm thử save/load failure đã dùng storage giả
hoặc thư mục tạm riêng; **không cần sửa/xóa/chmod workbench.json của bạn**.
Lỗi lưu phải giữ draft, cho retry; lỗi đọc phải khóa thao tác đổi công việc,
giữ file gốc và vẫn vào được Settings.

## 6. Theme và trợ năng hiển thị — F06

Live system theme và Reduce Transparency đã có bằng chứng Foundation 06.
Khi kiểm tra lại với window nhỏ: bật Reduce Transparency → sidebar/panel có nền
đục, nội dung không biến mất; bật Reduce Motion → mở/đóng panel không có chuyển
động dư thừa, điều khiển vẫn hoạt động. Light/dark theo hệ thống phải đổi trực
tiếp khi app chọn System, giữ nguyên phiên/draft. Khôi phục cài đặt ban đầu.

## Gửi kết quả

Chỉ cần trả lời theo mẫu; mục chưa làm ghi NOT RUN:

```text
App: Swift / Qt
macOS: ...
M01 JA IME: PASS / FAIL / NOT RUN — bộ gõ, bước, quan sát
M02 VI IME: PASS / FAIL / NOT RUN — bộ gõ, bước, quan sát
M03 VoiceOver/focus: PASS / FAIL / NOT RUN — tên control hoặc lời đọc sai
M04 Window/compact: PASS / FAIL / NOT RUN — width, locale, theme, text size
M05 Close/Quit: PASS / FAIL / NOT RUN — còn chạy hay đã xong lúc đóng
M06 Appearance: PASS / FAIL / NOT RUN
Lỗi: thao tác → mong đợi → thực tế; ảnh/video nếu có
Đã khôi phục cài đặt: ...
```

Nếu có lỗi, dừng ở bước đó, giữ bản nháp và gửi kết quả. Chưa cần kiểm Trang chủ.
