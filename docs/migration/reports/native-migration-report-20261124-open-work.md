# Việc còn mở sau ngày 2026-11-24

Tổng hợp từ `native-code-63…82`, `qt-parity-1…19`, `SPRINT-DESIGN-NOTES-20261124.md`,
`QT-DESIGN-AUDIT-20261124.md` và phần thêm hôm nay của `docs/design/findings.md`.
Mục đã được một báo cáo sau xác nhận là xong thì không còn ở đây. "Chưa rõ" nghĩa
là không báo cáo nào xác nhận đã xong.

Các mục về Classic hoặc preset khác Glass trong 63/64/71/73/78 không còn áp dụng
(Classic đã gỡ ở native-code-79, 81).

## Mốc trước thay đổi cục bộ (macOS arm64, 2026-11-24)

- `swift test --package-path apps/macos`: đạt (212 + 116 test).
- Fan helper: build đạt, self-check đạt.
- Qt 6.12 offscreen/Fusion: build đạt, `ctest` 9/9 shard đạt.
- `npm run check:resources`, `npm run check:docs`, `domain.test.mjs` (11/11): đạt.
- `test_*.py`: 8/8 đạt với Python 3.13; Python hệ thống 3.9 lỗi `hashlib.file_digest`.
- Chưa chạy: app thật trên cả hai nền tảng, Windows/Linux, Qt 6.8.3, trình đọc màn hình.

## Kiểm tra lại sau phát hành

GitHub đã chạy lại job macOS trên `develop` tại `3b14b195` sau lần thiếu runner arm64. Bộ Swift chạy 328 test, một test Hoàn tác ứng dụng báo `invalidData`. Bản sửa trong checkout đã qua test hồi quy bằng fixture. Còn xác nhận trên runner Swift 6.2.4 và với Finder thật. [Job macOS](https://github.com/trunghieupham59/viezan/actions/runs/45436525092/job/138607970039) · [Báo cáo triển khai](../native-implementation/native-code-84.md)

Đợt kế tiếp đã đóng các story về ghim model, Ollama, Từ điển, Launcher, Lịch sử, helper tệp giả và các màn Qt. Kết quả build, test và quyết định sản phẩm nằm trong [báo cáo 85](../native-implementation/native-code-85.md) và [báo cáo 86](../native-implementation/native-code-86.md). [Báo cáo 87](../native-implementation/native-code-87.md) ghi kết quả kiểm cuối trong checkout.

## Ngoài mã nguồn

- `git stash@{0}` (`a11y-63-before-ff-20261124`, 26 tệp, chủ yếu spec trong
  `docs/design/screens/`) chưa được áp lại hay bỏ.
- `.vscode/launch.json` và `docs/agents/reports/vscode-problems-report-20261104-0907.md`
  để nguyên, chưa commit.
- Bản phát hành: [workflow v2.6.0](https://github.com/trunghieupham59/viezan/actions/runs/45435744608) đã đóng gói bốn nền tảng và ký manifest thành công. [Release v2.6.0](https://github.com/trunghieupham59/viezan/releases/tag/v2.6.0) đã công bố bốn manifest và chữ ký tương ứng. Cài đặt và cập nhật trên máy thật vẫn chờ kiểm.

## 1. macOS — chờ kiểm trên máy thật

- Giữ tên driver của 26 cảm biến `PMU …` và `als-temp` cho đến khi có đối chứng trên đúng mẫu máy. Các ánh xạ `pACC`/`eACC`/`GPU` mới có fixture.
- Helper quạt ký theo team đã kiểm Hardened Runtime của tiến trình client trong mã. Cần xác nhận bản ký Apple Development và Developer ID trên máy thật, gồm cấp quyền micro và Apple Events. [Báo cáo 87](../native-implementation/native-code-87.md)
- Hàng S7 đã qua fixture EN/VI/JA ở chiều rộng nội dung 400 và 900 pt. Còn kiểm điểm xuống hàng ở các cỡ cửa sổ thực ghi tại mục 4. Khi mất danh tính sau di chuyển, helper tệp dừng. Fixture dùng cùng mã đã tái hiện lỗi trước khi sửa. [Báo cáo 87](../native-implementation/native-code-87.md)

## 2. Windows/Linux Qt — chờ xác minh

- Fixture dùng cùng mã xử lý văn bản đã kiểm UTF-16, setter báo nhận nhưng không sửa, trường hợp bản dịch giống nguyên văn và Hoàn tác. Còn xác nhận adapter COM UI Automation trên Windows thật. [Báo cáo 86](../native-implementation/native-code-86.md)
- Hai job Qt 6.8.3 đã build và chạy CTest trên `develop` tại `3b14b195`. Cần chạy cùng cấu hình cho thay đổi cục bộ sau khi có PR. [Windows](https://github.com/trunghieupham59/viezan/actions/runs/45436525092/job/138595806670) · [Ubuntu](https://github.com/trunghieupham59/viezan/actions/runs/45436525092/job/138595805681)
- Cần trình đọc màn hình để xác minh giả thuyết đọc lặp số đo nhiệt độ. Cần IME thật để kiểm cửa sổ ứng viên khi giữ preedit. QtTest đã kiểm preedit tổng hợp và các phím tắt.
- Ghim model và Ctrl+Shift+M/T còn chờ nghiệm thu trên desktop thật.
- Chip gợi ý đã dùng `modelData` và có test khi nhập nháp, nhận chunk và gửi. `TypeError` từng được báo trên bản cũ chưa tái hiện riêng. [Báo cáo qt-parity-9](native-migration-report-20261124-qt-parity-9.md)

## 3. Thiết kế/UX

Các mục đã có thiết kế đã được cập nhật trong nguồn. Danh sách nghiệm thu theo nền tảng ở mục 4. [Chi tiết từng màn](../native-implementation/native-code-86.md)

## 4. Kiểm tra chưa chạy

- Các quyết định Finder, Full Disk Access, dữ liệu cá nhân, liên kết gãy, thẻ ghim, toast và cập nhật đã được đối chiếu với nguồn trong [báo cáo 85](../native-implementation/native-code-85.md). Cần kiểm hộp xác thực Finder, che thẻ ghim khi chia sẻ màn hình, hít mép, khôi phục từ menu, VoiceOver/Narrator/Orca và bộ cài thật.

- Checklist trợ năng macOS 8 màn × 6 mục đều NOT RUN: Trang chủ, AI Chat, Dịch, Từ điển, Phiên dịch, Cài đặt, Thư viện lịch sử, Chat nhanh/Dịch nhanh; gồm VoiceOver, Tab/Esc/IME, ba cỡ chữ, 640×480 và 1280, Increase Contrast/Reduce Transparency, Reduce Motion (native-code-63)
- macOS: tương phản 4,5:1 của chữ phụ, native halo của focus ring, phụ đề nổi ở cửa sổ phụ thật (native-code-63)
- macOS: ba cỡ chữ với nội dung dài/CJK; tràn ngang hàng ngôn ngữ/footer Dịch ở 640; toast Announcement có đọc lịch sự và không lặp (native-code-63)
- macOS chưa chạy app cho mọi story hôm nay: sáng/tối, 640×480, VoiceOver, focus sau Esc (native-code-64–68, 71–73, 78, 79, 81, 82)
- ⌘P có bị mục In của hệ thống giành không; ⌘⇧C có trùng "Show Colors" không, kể cả khi gõ IME Việt/Nhật (native-code-64, 68)
- Tải model Ollama thật (dòng bytes), đồng hồ nghiên cứu thật, hộp cập nhật khi có bản mới thật (native-code-65, 66, 68)
- Ứng dụng macOS: Gỡ/Đặt lại/Chuyển vào Thùng rác/Hoàn tác thật qua `viezan-fs`, ghi receipt, phục hồi sau gián đoạn; chạy lại sau khi sửa `inUse` (`lsof`); bản cài Riot thật và UID khác thật (native-code-73, 75, 77, 79)
- Ứng dụng macOS: hộp xác nhận (Esc/Return chọn Huỷ, Tab, VoiceOver), quét lại khi hộp đang mở, bố cục 1200/820/560 × VI/EN/JA × ba cỡ chữ (native-code-78, 79)
- Helper quạt chưa chạy với quyền root trên phần cứng: đăng ký daemon, ghi SMC thật, sleep/wake, đổi người dùng console, `serve()` qua socket thật, thoát lúc rảnh (native-code-74, 76)
- Quạt macOS trên máy thật: giữ RPM thủ công, về tự động, ngắt khi mất cảm biến, vòng đời xác nhận sau khởi động lại, cửa sổ mở từ thanh menu, cột ~400 pt tiếng Nhật, thứ tự Tab/VoiceOver của popover Quy tắc (native-code-80, 82)
- Nhiệt độ macOS: màn khi bộ đọc dừng hoặc helper chờ phê duyệt; cắt tên HID dài, tooltip, ghi chú dưới Picker; máy Intel (native-code-68, 70, 72)
- Mất điện giữa hai lần ghi kho (macOS và Qt), giữa rename và công bố receipt; lỗi thiết bị khiến cả bước hoàn tác thất bại (native-code-69, 79, qt-parity-15)
- 66/66 ảnh AppKit và 96/96 ảnh Qt trước/sau khớp điểm ảnh là do Codex báo, chưa chạy lại độc lập (native-code-81)
- Qt đã có kết quả Fusion/offscreen trên macOS arm64 6.12.0 và CI Windows/Linux 6.8.3 cho mã tại `3b14b195`. Còn kiểm app thật trên Windows/Linux và FluentWinUI3 (qt-parity-1–19, native-code-81).
- Ca `acceleratedGlassSurfacesSurviveAppearanceChanges` luôn bị bỏ qua vì offscreen thiếu RHI; bộ render GPU của Qt chưa kiểm (qt-parity-1–19)
- Checklist trình đọc màn hình Qt 6 hàng × Narrator/NVDA/Orca đều NOT RUN (qt-parity-10)
- Qt: IME Việt/Nhật thật, bàn phím số vật lý, Segoe UI 125–150%, High Contrast, Reduce Motion, cuộn quán tính, ba cỡ chữ đọc trên màn thật (qt-parity-9, 10, 13, 16, 18)
- Qt: micro, phát giọng, STT, provider thật, Ollama thật, endpoint tỷ giá thật, kiểm tra cập nhật qua mạng, chạy bộ cài thật, `gsettings` trên desktop Linux (qt-parity-1, 2, 5, 7, 8, 11, 17)
- Qt trên Windows thật: NTFS junction và thư mục Documents chuyển sang ổ khác trong tìm tệp Launcher (qt-parity-8, 17)
- Qt: focus danh sách Ứng dụng và menu hệ thống macOS trực tiếp (qt-parity-2, 9)

## 5. Rủi ro/giới hạn đã biết

- Phục hồi khi ghi hai kho thất bại là nỗ lực tốt nhất: nếu chính lần ghi phục hồi cũng lỗi thì dữ liệu có thể lệch, hàm vẫn báo lỗi (native-code-69)
- Trần nhiệt của dịch vụ quạt chỉ đọc SMC: chọn nguồn HID thì quạt không tự về tự động khi cảm biến đó quá nóng (native-code-72, 82)
- `clientIdentifier` của helper quạt ghi cứng `com.viezan.native.preview`; helper ký ad-hoc bỏ qua kiểm tra chữ ký (native-code-76)
- Khi thoát, helper quạt thử khôi phục tối đa 12 nhịp (3 giây) rồi chỉ ghi log quạt còn thủ công (native-code-76)
- Gốc `/Users/Shared/Riot Games` không đáng tin (symlink, tài khoản khác sở hữu, cho ghi rộng) bị bỏ qua im lặng (native-code-75)
- Liên kết `.app` đứt, mục `unreadable` và `scanLimit` có giới hạn thao tác riêng; kho chỉ lưu 50 đường dẫn chặn dù đếm đủ (native-code-71, 73, 79)
- Sandbox Codex chặn ghi module cache; vài test chỉ đỏ trong sandbox (dán ảnh, OCR, `Notes.rtfd`, `updateReplacesTheAppFromADiskImage`), ngoài sandbox đạt (native-code-63, 71, 73, 75, 77–79)
- Fixture AppKit không thấy toàn bộ nội dung SwiftUI thuần, nên test bố cục 572 pt không chứng minh mọi text frame (native-code-63)
- Qt không có API ghi một workspace tuỳ ý như `FilePersistence` của Swift; test round-trip đi qua đường đọc (qt-parity-12)
- Audit thiết kế Qt và review của Antigravity là đọc tĩnh, chưa mở app (QT-DESIGN-AUDIT, SPRINT-DESIGN-NOTES)
- Qt 6.8.3 cần nhánh dự phòng cho `motionPreference` và `styleHints.accessibility`. CI build và chạy offscreen thành công; hành vi khi thay đổi tuỳ chọn trợ năng của desktop thật vẫn cần kiểm (qt-parity-10, 17).
