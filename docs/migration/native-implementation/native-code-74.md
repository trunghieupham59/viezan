# Native code 74 — T3 · Khôi phục an toàn cho helper quạt macOS

Ghi mục tiêu lỗi sẽ kích hoạt hoàn tác riêng quạt và trả lại lỗi ghi ban đầu. Quạt khôi phục lỗi nằm trong `pendingRestore` đến khi ghi chế độ tự động thành công. Watchdog thử lại mỗi giây, chỉ ghi log khi bắt đầu lỗi hoặc hồi phục. Một nhịp thử lại giữ nguyên `restoreSeq` và `lastRestoreReason`. Helper theo phiên chờ khôi phục xong mới thoát lúc rảnh.

## Kiểm tra

- **Nguồn.** Đã đối chiếu theo workflow và rule `native-migration`, skill `viezan-native-migration`. Timer xét người dùng console, hạn watchdog rồi trần nhiệt. Mất toàn bộ số đo SMC trước khi bật thủ công trả `unsupported`. Mất số đo khi đang áp mục tiêu kích hoạt `ceiling-unreadable`. `ThermalMonitor.swift` chỉ xét `activeOverrides` có rỗng hay không. Bản sửa giữ giao thức 1 và đường xác thực peer.
- **Trạng thái.** `activeOverrides` vẫn trả ID và RPM dạng số cho quạt đã bật thủ công. Khi chưa có RPM đã biết, helper đọc mục tiêu hiện tại trước khi đổi chế độ. Lỗi đọc ở bước này trả `smc-error`. Khi một quạt đang chờ khôi phục, lệnh đặt lại RPM cho quạt đó cũng trả `smc-error`. Với mặt nạ Intel `FS! `, đọc lỗi sẽ hoãn ghi để bảo toàn bit của quạt khác.
- **Tự kiểm trước sửa.** Chỉ tách controller, tiêm SMC giả và chuyển hai nhánh cũ của timer vào `tick`. Chạy chương trình tự kiểm trước khi sửa logic, mã thoát 1. Trích kết quả thực tế bên dưới.

```text
FAIL a. target write rolls back mode and returns the original error — F0Md is still 1
FAIL c. partial restore retries only the failed fan and logs each transition once — status lost the failed fan
FAIL d. reject target with no sensor — expected unsupported, command succeeded
FAIL d. reject target with unreadable sensor — expected unsupported, command succeeded
PASS e. normal target and restore preserve status and RPM
```

- **Tự kiểm sau sửa.** Lệnh một dòng trong mục Verification của `CONTRIBUTING.md` chạy bằng tài khoản thường với SMC giả. Đạt 13/13, mã thoát 0.

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
```

- **Build.** Hai lệnh sau đạt trên macOS arm64 với Swift 6.4.2 và `CLANG_MODULE_CACHE_PATH` trong `$TMPDIR`. Reader có cảnh báo SDK về macro `_SwiftifyImport` do sandbox, vẫn liên kết thành công. Chạy thêm `scripts/build-native.mjs` trên bản sao nguồn trong thư mục tạm, `lipo -archs` của helper trả `x86_64 arm64`. `npm run check:docs` đạt. Bộ test Python của script đạt 8/8 với Python 3.13. Python hệ thống 3.9.6 thiếu `hashlib.file_digest` ở test đóng gói.

```sh
swiftc -O native/common/SMC.swift native/fanhelper/*.swift -o "$TMPDIR/fan-helper-check" -framework IOKit -framework Security
swiftc -O native/common/SMC.swift native/smc/main.swift -o "$TMPDIR/viezan-smc-t3-check" -framework IOKit
```

- **Chưa kiểm.** Theo phạm vi T3, chưa chạy helper với quyền root, ghi SMC thật hoặc đăng ký daemon. Khả năng đọc RPM ban đầu, chuyển chế độ quạt thực tế và vòng đời phiên qua sleep/wake, đổi người dùng hoặc thoát lúc rảnh còn chờ kiểm trên máy thật.

## Review độc lập và xử lý (Antigravity review, Claude xử lý — 2026-11-24)

Antigravity xác nhận ba lỗi gốc đã kín (không có đường nào để quạt thủ công nằm ngoài `overrides` lẫn `pendingRestore` trong `FanController`) và không ca tự kiểm nào luôn đạt. Phát hiện thêm, Claude đã kiểm lại trong mã và sửa:

- **Sập tiến trình root với mục tiêu rất lớn.** Thông báo `out-of-range` dùng `Int(rpm)`; client gửi `1e30` làm Swift trap, helper chết mà không khôi phục quạt. Nay định dạng bằng `%.0f`.
- **Khe hở khi thoát.** `shutdown` khôi phục trong hàng đợi rồi thoát ở ngoài, nên một `fans.setTarget` có thể chen vào giữa. Nay thoát ngay trong hàng đợi.
- **Trần nhiệt trước hạn watchdog**, và `fans.setTarget` bị từ chối (`ceiling`) khi một cảm biến đã ở trần.
- **Quạt không có khoá chế độ** không còn nằm mãi trong `pendingRestore` (trước đó khiến helper theo phiên không bao giờ thoát lúc rảnh).

Tự kiểm sau các sửa này: **17/17 ca đạt** (thêm 4 ca: trần nhiệt thắng watchdog, từ chối ở trần, mục tiêu `±1e30`, quạt không khoá chế độ). Helper thật biên dịch được.

Ghi nhận, chưa sửa:

- Ở chế độ phiên, `helper.exit` và tín hiệu dừng vẫn thoát khi khôi phục chỉ thành công một phần (không có launchd khởi động lại để thử tiếp).
- Sau khi watchdog ngắt client đổi console, một lệnh đã đọc sẵn vẫn có thể chạy trước khi `serve()` thoát; `restoreAll("disconnect")` ngay sau đó trả quạt về tự động nhưng ghi đè lý do `console-user`.
- `tick` không ghi sự kiện `ceiling` khi mọi quạt thủ công đều đang chờ khôi phục (phần cứng vẫn được thử khôi phục mỗi giây).
- Hạn watchdog dùng đồng hồ tường; mặt nạ `FS! ` kiểu `ui8 ` với quạt chỉ số ≥ 8.
- Tài liệu §4.3 ghi kiểm tra chữ ký có `identifier`, mã chỉ kiểm Team ID — chưa đối chiếu bên nào đúng.
- **Chưa kiểm trên phần cứng với quyền root** (đăng ký daemon, sleep/wake, khôi phục thật).
