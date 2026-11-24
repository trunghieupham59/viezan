# Native code 72 — T2 · Tên cảm biến IOHID trên trang Nhiệt độ

Glass và Classic dùng tên Product trong tooltip hàng gộp và danh sách thô. Ví dụ, ô nóng nhất và bộ chọn nguồn hiện “Ổ lưu trữ · NAND CH0 temp” hoặc “PMU tdie1”. Bộ chọn lưu khóa gốc và hiện ghi chú về trần nhiệt SMC khi chọn HID.

## Kiểm tra

- **Nguồn.** Đã đối chiếu hai nhánh SwiftUI theo workflow và rule `native-migration`, skill `viezan-native-migration` và `viezan-native-ux`. Theo hướng dẫn trợ năng SwiftUI của UI UX Pro Max, mỗi hàng HID dùng một nhãn VoiceOver gồm tên, nhãn phân loại (nếu có) và nhiệt độ. Domain chỉ mở quyền đọc `isHID`.
- **Tài nguyên.** `npm run resources` và `npm run check:resources` đạt. So với trước T2, mỗi locale chỉ thêm `fanHidCeilingNote`. Hai bundle giống nhau từng byte và mỗi bundle chỉ thêm ba bản dịch.
- **Test.** `swift test --package-path apps/macos --filter ThermalSensorDisplayTests` đạt 4/4 test mới cho HID có nhãn, HID chưa phân loại, SMC và thứ tự danh sách thô. Khi trùng cả nhiệt độ lẫn tên hiển thị, khóa gốc quyết định thứ tự ngay cả khi đảo đầu vào. Sáu test hồi quy về HID và gộp hàng SMC cũng đạt.
- **Build.** Bản Debug macOS biên dịch và liên kết thành công. Lệnh `swift build --package-path apps/macos` mặc định gặp `sandbox_apply: Operation not permitted` khi đọc manifest. Build và test đạt với `--disable-sandbox --build-system native`, `--scratch-path` và `CLANG_MODULE_CACHE_PATH` trỏ vào thư mục tạm.
- **Chưa kiểm.** Theo phạm vi T2, chưa mở ứng dụng hoặc chụp ảnh. Việc cắt tên dài, tooltip, ghi chú dưới Picker và thứ tự đọc VoiceOver còn chờ kiểm trên bản chạy.

## Review độc lập và xử lý (Antigravity review, Claude xử lý — 2026-11-24)

Antigravity review T1 cùng hai thay đổi nhiệt độ trước đó (câu quạt dừng, khoá chế độ `F{n}md`). Đã xử lý:

- **SPI IOHID nạp lúc chạy.** `viezan-smc` dùng `dlopen`/`dlsym` thay cho `@_silgen_name`; thiếu một ký hiệu thì chỉ mất cảm biến HID, reader SMC vẫn chạy. Binary không còn nhập ký hiệu `IOHID*` nào (`nm -u`), và trên MacBookPro18,2 vẫn trả 218 mục SMC + 28 mục HID.
- **Bỏ khoá chế độ `F{n}md`.** Thay đổi này chưa từng được thử trên máy có khoá viết thường và sẽ làm helper đặc quyền ghi vào một khoá chưa rõ ngữ nghĩa mỗi lần khôi phục; `native/fanhelper/main.swift` đã trở về đúng trạng thái trước đó.
- **`stoppedBySystem` chặt hơn.** Cần quạt báo mục tiêu bằng 0; quạt không báo mục tiêu không bị gắn câu "Hệ thống đang dừng quạt vì máy mát.". Câu này cũng không hiện khi Viezan đang điều khiển quạt, và có tooltip khi bị cắt.

Ghi nhận, chưa sửa (có từ trước, ngoài phạm vi story):

- `FanController.setTarget` không hoàn tác chế độ thủ công nếu ghi mục tiêu lỗi; `restoreAll` xoá `overrides` kể cả khi một quạt khôi phục thất bại. Đóng kết nối vẫn kích hoạt khôi phục toàn bộ.
- Trần nhiệt của helper chỉ đọc SMC; máy không có khoá nhiệt SMC nào thì không có trần.
- `applyProfile` huỷ profile ngay khi cảm biến được nêu đích danh vắng một nhịp (an toàn nhưng nhạy).
- `FanPolicy` xếp `Tf*` vào `cpu` trong khi `ThermalSensors` xếp vào GPU; `rows` không có tiêu chí phá hoà khi hai hàng cùng nhiệt độ cao nhất.
