# Native code 76 — T4 · Helper quạt macOS

Cả hai chế độ thử lại các quạt còn chờ khi thoát qua `helper.exit`, tín hiệu dừng hoặc lỗi `accept`. Hàng đợi SMC giữ quyền điều khiển đến lúc thoát. Helper dừng thử ngay khi thành công, hoặc ghi một dòng log kèm ID còn chờ sau tối đa 12 nhịp 0,25 giây.

## Kiểm tra

**Nguồn.** Đã đối chiếu theo workflow và rule `native-migration`, skill `viezan-native-migration`. Các đoạn xác thực peer, quyền/chủ socket và phiên bản giao thức 1 khớp bản T3 đầu phiên. `status.uptime` vẫn tính từ lúc khởi động như T3. Riêng watchdog dùng đồng hồ đơn điệu của Darwin vì nó tính cả thời gian ngủ và không nhảy lùi khi chỉnh giờ lịch. [Tài liệu clock_gettime(3) của Apple](https://github.com/apple-oss-distributions/Libc/blob/main/gen/clock_gettime.3)

**Tự kiểm trước sửa.** T3 nguyên bản đạt 17/17. Chạy 9 ca mới với SMC giả trên bản sao T3, dùng hàm nối cho các quyết định trước đây nằm trong `main.swift`. Cả 9 ca mới đều thất bại, mã thoát 1.

| Điểm | Kết quả quan sát trên T3 |
| --- | --- |
| 1. Thoát | Cả lỗi tạm thời và lỗi kéo dài đều kết thúc sau lần khôi phục đầu. Hàm chờ không được gọi. |
| 2. Kết nối | Lệnh đã đọc vẫn chạy sau thu hồi. Dọn kết nối lần hai ghi đè `console-user`. |
| 3. Trần nhiệt | Khi chỉ còn quạt chờ, cả nhiệt độ 105 °C và mất số đo đều không tăng `restoreSeq`. |
| 4. Watchdog | Sau 16 giây đơn điệu, mô phỏng giờ lịch lùi 60 giây ở đầu vào `Date` của T3. Quạt vẫn thủ công dù hạn là 15 giây. |
| 5. Mặt nạ | `ui8` chấp nhận lệnh cho `fan8`. Một ca riêng làm lỗi đọc mặt nạ và thấy thiếu `status.lastError`. |

**Tự kiểm sau sửa.** Đạt 26/26, mã thoát 0, bằng tài khoản thường với SMC giả. Ca c cũ chuyển thời điểm làm mất số đo sang sau khi quạt đã hồi phục để giữ phép kiểm riêng cho nhịp thử lại và log. Hai ca mới kiểm cả hai lý do nhiệt qua hai đợt, đếm sự kiện và số lần ghi vào đúng quạt. Các ca thoát tiêm hàm chờ nên không cần ngủ thật.

```sh
swiftc -O native/common/SMC.swift native/fanhelper/FanController.swift native/fanhelper/tests/main.swift -o "$TMPDIR/fan-helper-self-check" -framework IOKit && "$TMPDIR/fan-helper-self-check"
```

```text
PASS a. target write rolls back mode and returns the original error
PASS b. failed rollback stays manual until the next successful retry
PASS c. partial restore retries only the failed fan and logs each transition once
PASS d. reject target with no sensor
PASS d. reject target with unreadable sensor
PASS e. normal target and restore preserve status and RPM
PASS watchdog restores for ceiling-unreadable
PASS watchdog restores for watchdog
PASS watchdog restores for ceiling
PASS unreadable initial target leaves the fan in automatic mode
PASS failed update keeps the previous override until automatic mode succeeds
PASS pending startup restore and a new override both receive watchdog protection
PASS Intel mask retry preserves the other manual fan
PASS ceiling is reported even when the client is also late
PASS target is refused while a sensor is at the ceiling
PASS a huge target is rejected without trapping
PASS a fan without a mode key is never left pending
PASS shutdown retries only the pending fan and stops on recovery
PASS shutdown bounds retries and logs the remaining fan once
PASS a buffered command from a revoked console client is dropped
PASS serve cleanup preserves the console restore and the next client
PASS pending fan reports one ceiling per episode while retrying
PASS pending fan reports one ceiling-unreadable per episode while retrying
PASS watchdog expires on Darwin continuous elapsed time
PASS ui8 force mask accepts bit 7 and refuses bit 8
PASS mask read failure updates status.lastError
```

**Build.** Lệnh dưới đây hoàn tất với mã 0 trên macOS arm64, Swift 6.4.2. `file` xác nhận executable Mach-O arm64. Module cache nằm trong `$TMPDIR`. `npm run check:docs` đạt.

```sh
swiftc -O native/common/SMC.swift native/fanhelper/FanController.swift native/fanhelper/main.swift -o "$TMPDIR/fan-helper-check" -framework IOKit -framework Security
```

**Chưa kiểm.** Chưa chạy helper bằng root, ghi SMC thật, đổi người dùng console, sleep/wake hoặc dừng daemon thật. Ba giây là ngân sách thử lại. Thời điểm tiến trình thoát còn phụ thuộc vào lần gọi IOKit đồng bộ đang chạy.

## Siết uỷ quyền, review độc lập và xử lý (Claude sửa, Antigravity review — 2026-11-24)

**Ràng buộc định danh (theo yêu cầu của Product Owner).** `clientRequirement` nay là `anchor apple generic and certificate leaf[subject.OU] = "<team>" and identifier "com.viezan.native.preview"`. Đối chiếu bằng `codesign -v -R` trên chữ ký thật: `.native-build/dev/Viezan.app` (team F22XW4W2R7, đúng định danh) thoả; binary `viezan-fan-helper` cùng team nhưng định danh khác không thoả. `viezan-helper-ctl` và `viezan-smc` không mở socket. Helper ký ad-hoc vẫn bỏ qua kiểm tra chữ ký như trước. Định danh ghi cứng ở `clientIdentifier`: đổi định danh ứng dụng thì phải đổi cả hằng này.

**Sửa sau review của Antigravity:**

- **Cửa sổ một giây khi đổi người dùng console.** `handle()` kiểm lại `isAllowedPeer` ngay trước mỗi lệnh ở chế độ daemon và ngắt client với lý do `console-user`, không chờ nhịp watchdog.
- **Sự kiện nhiệt khi quạt còn chờ khôi phục** phân biệt `ceiling` và `ceiling-unreadable`: chuyển thẳng giữa hai trạng thái vẫn được ghi, mỗi loại một lần (thêm một ca tự kiểm).
- **`status.uptime`** dùng đồng hồ đơn điệu.

Tự kiểm: **27/27 ca đạt**; helper thật và `viezan-smc` biên dịch được.

**Ghi nhận, chưa sửa:**

- **Client không bật Hardened Runtime vẫn qua được kiểm tra chữ ký.** `scripts/native/build.py` ký bằng chứng chỉ Apple Development mà không có `--options runtime`, nên một tiến trình cùng uid có thể chạy chính ứng dụng đã ký với `DYLD_INSERT_LIBRARIES` rồi kết nối. Muốn đóng phải bật Hardened Runtime cho cả ứng dụng và cho helper từ chối client không hardened; việc đó ảnh hưởng toàn bộ bản dựng nên chờ quyết định.
- Hai ca tự kiểm về lệnh của client bị ngắt gọi thẳng `beginCommand`/`disconnect`, không đi qua `handle()`/`serve()` trong `main.swift`; ca thoát không kiểm nhánh cắt theo hạn 3 giây.
- Chưa kiểm trên phần cứng với quyền root.

## T5

Helper và bộ tự kiểm cùng biên dịch `CommandHandler.swift`. Hai ca cũ về thu hồi kết nối đã gửi lệnh qua `handle()`. Năm ca mới kiểm fd sai, đổi người dùng console giữa hai lệnh, RPM hợp lệ, RPM dạng chuỗi và `helper.exit`. Ca thứ sáu tiêm đồng hồ vào `restoreBeforeExit`. Sau hai nhịp chờ, thời gian giả đã trôi 3,125 giây và log chỉ báo `fan1` còn thủ công đúng một lần.

Trên macOS arm64, hai lệnh trong `CONTRIBUTING.md` biên dịch được helper thật và chạy đạt **33/33** ca với SMC giả (đầu phiên **27/27**). Trên bản sao tự kiểm, bỏ riêng guard `beginCommand` làm ca (a) phát hiện fd sai ghi SMC. Bỏ riêng kiểm tra console làm ca (b) nhận phản hồi sau khi đổi người dùng. Bỏ cả hai làm cả (a) và (b) thất bại. Bỏ kiểm tra hạn 3 giây làm vòng lặp chạy đủ 12 nhịp. Cả bốn lần đều trả mã 1. Sau khi khôi phục, chạy lại đạt **33/33**, mã 0.

**Chưa kiểm.** Tự kiểm gọi trực tiếp `handle()`. Chưa chạy daemon bằng root để kiểm `serve()` qua socket thật, đổi người dùng console trên macOS hoặc ghi SMC trên phần cứng.

### Review T5 (Antigravity) và xử lý

Antigravity xác nhận `main.swift` nối đúng mọi phụ thuộc thật vào `CommandEnvironment`, `Options`/`parseOptions` không đổi, và `restoreBeforeExit` không thể lặp vô hạn hay thoát trước lần thử đầu. Đã sửa một lỗi có từ trước: `fans.setTarget` nhận `rpm` kiểu boolean JSON (bắc cầu thành `NSNumber` 0/1); nay trả `bad-request`, có ca tự kiểm. Tự kiểm: 33/33 ca đạt.

Ghi nhận, chưa sửa (độ chặt của tự kiểm): ca "fd sai" không phủ riêng điều kiện `current.fd == client` trong nhánh đổi người dùng console; ca `helper.exit` không phân biệt được trễ 0,2 giây với gọi ngay; ca `setTarget` hợp lệ không kiểm nội dung `result`.
