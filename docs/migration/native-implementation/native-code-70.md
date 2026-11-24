# Native code 70 — T1 · Cảm biến nhiệt IOHID trên macOS

Reader khám phá các dịch vụ nhiệt một lần khi khởi động. Mỗi snapshot đọc lại từng dịch vụ, lọc nhiệt độ hữu hạn trong (0, 150) °C và lấy giá trị nóng nhất cho mỗi tên `Product`. Mục HID có `key`, `name`, `source` và `celsius`. Khóa dài được rút gọn về tối đa 64 ký tự với hậu tố ổn định từ tên đầy đủ và có kiểm tra trùng. Khi IOHID không khả dụng, reader tiếp tục với dữ liệu SMC.

Domain gộp HID và SMC cùng nhóm, cùng nhãn. Quy tắc quạt chỉ nhận HID khi chọn đúng khóa. Các nguồn tổng hợp, giá trị dự phòng và mẫu hiệu chuẩn chỉ dùng SMC vì helper đặc quyền kiểm trần nhiệt bằng SMC.

## Tên HID trên máy

IORegistry cho thấy **29 tên Product khác nhau** ở các dịch vụ có `PrimaryUsagePage = 65280` và `PrimaryUsage = 5`. Quan sát bằng `ioreg -r -c IOHIDEventService -d 1 -l` trong cùng sandbox. Số cảm biến thực sự trả về nhiệt độ hợp lệ trong một snapshot vẫn chưa xác minh được.

- `NAND CH0 temp`, `als-temp`, `gas gauge battery`
- `PMU TP0s`, `PMU TP1g`, `PMU TP1s`, `PMU TP2g`, `PMU TP2s`, `PMU TP3g`, `PMU tcal`
- `PMU tdev1`, `PMU tdev2`, `PMU tdev3`, `PMU tdev4`, `PMU tdev5`, `PMU tdev6`, `PMU tdev7`, `PMU tdev8`
- `PMU tdie0`, `PMU tdie1`, `PMU tdie2`, `PMU tdie3`, `PMU tdie4`, `PMU tdie5`, `PMU tdie6`, `PMU tdie7`, `PMU tdie8`, `PMU tdie9`, `PMU tdie10`

## Ánh xạ theo tên đầy đủ

| Chuỗi trong Product (không phân biệt hoa thường) | Nhóm | Nhãn hiện có | Bằng chứng trên máy |
| --- | --- | --- | --- |
| `pACC` | cpu | `thermal_label_cpu_performance_core` | Chỉ có trong fixture |
| `eACC` | cpu | `thermal_label_cpu_efficiency_core` | Chỉ có trong fixture |
| `GPU` | gpu | `thermal_label_gpu` | Chỉ có trong fixture |
| `NAND` | other | `thermal_label_storage` | `NAND CH0 temp` |
| `battery` | other | `thermal_label_battery` | `gas gauge battery` |
| Tên còn lại hoặc thiếu tên | other | `nil` | 26 tên `PMU …` và `als-temp` |

## Kiểm tra

- **Nguồn.** Đã đối chiếu năm nhãn trong cả ba locale EN/VI/JA và chạy `git diff --check` cho các tệp đã sửa. Hai đường build helper hiện có đều biên dịch `native/smc/main.swift`. Dùng workflow/rule `native-migration` và skill `viezan-native-migration`.
- **Test.** `swift test --package-path apps/macos --disable-sandbox --filter thermalHID` đạt 5/5 test mới, bao phủ giải mã hỗn hợp, phân loại, gộp hàng, chính sách quạt và hiệu chuẩn. Test SMC hiện có `thermalSensorsFoldIntoNamedRowsPerGroup` cũng đạt.
- **Reader với dữ liệu giả lập.** Qua hai snapshot, reader chỉ khám phá một lần và cập nhật đúng giá trị nóng nhất khi hai dịch vụ trùng tên. Fixture cũng đạt cho sự kiện thiếu, nhiệt độ ngoài khoảng hoặc không hữu hạn, client/danh sách dịch vụ thiếu và va chạm giữa khóa dài với khóa nguyên gốc 64 ký tự.
- **Build.** `swiftc -O native/common/SMC.swift native/smc/*.swift -o "$TMPDIR/viezan-smc-check" -framework IOKit` và `swift build --package-path apps/macos --disable-sandbox` đều đạt. Dùng `CLANG_MODULE_CACHE_PATH="$PWD/apps/macos/.build/out/ModuleCache.noindex"` vì cache mặc định bị chặn ghi.
- **Phần cứng (Claude chạy lại ngoài sandbox, MacBookPro18,2).** `viezan-smc` trả `ok: true` với 218 mục SMC và 28 mục `source == "hid"` (khoá dài nhất 21 ký tự): `NAND CH0 temp`, `gas gauge battery`, `PMU tcal`, `PMU tdev1–8`, `PMU tdie0–10`, `PMU TP0s…TP3g`. Chỉ hai tên đầu có nhãn (Ổ lưu trữ, Pin); 26 tên `PMU …` nằm ở hàng chưa nhận diện. Giá trị HID được làm tròn 0,1 °C như SMC. `swift build` đạt; `swift test` đạt 120 test domain (gồm 5 test `thermalHID…`) và 64 test native. Chưa kiểm trên máy Intel.
