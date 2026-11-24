# Native code 65 — Model local: bytes khi tải; Launcher: loại và ngày sửa của tệp (2026-11-24)

Hai story nhỏ trên macOS (BACKEND-GAPS #62 và #65, mỗi mục một phần). Chỉ kiểm ở mức code.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanDomain/LocalModelManager.swift` | `PullStep.parse` đọc một dòng tiến độ của runtime (kích thước bị chặn, không âm, `completed` không vượt `total`); `LocalModelManager.transferred` giữ bytes của layer đang tải. |
| `ViezanNative/LocalModelSettings.swift` | Dòng trạng thái ghi "… · 2,1 / 4,9 GB" khi runtime báo kích thước, còn lại giữ phần trăm. |
| `ViezanDomain/LauncherTools.swift` | `LauncherFile.isDirectory`, `modified`; `LauncherFiles.file(at:home:)` gom điều kiện lọc cũ vào một hàm kiểm được. |
| `ViezanNative/Launcher.swift` | Hàng tệp: dòng phụ "~/Documents · hôm qua", nhãn loại "Tệp" / "Thư mục" ở mép phải (chuỗi có sẵn). |
| `scripts/native/generate-resources.mjs`, hai `native.json` | Metric `focusRingWidth`, `dialogSmall`, `disabledOpacity` lấy từ token chung; Qt bỏ đoạn đọc `tokens.css` trong CMake. |

## Review độc lập (Antigravity, chỉ đọc)

Đã sửa: nhãn loại và dòng phụ đặt đúng chỗ; chỉ lọc tên thư mục ở phần dưới thư mục nhà; gói (ứng dụng, tài liệu
dạng gói) đọc là tệp; dừng, xong hoặc lỗi thì xoá tiến độ và bytes; hai con số dùng chung một đơn vị, ghi một lần.

Không làm: cộng dồn bytes theo từng layer của Ollama; định dạng số theo ngôn ngữ của app thay vì của hệ thống
(`ByteCountFormatter` không nhận locale, các dòng dung lượng khác trong màn cũng vậy); dịch trạng thái thô của
runtime; bố cục hàng đang tải theo board (cần duyệt bằng mắt).

## Kiểm tra

- `swift test --package-path apps/macos`: 54 + 104 test đạt (mới: `PullStepTests`, `LauncherFileTests`).
- Qt: build Release, `ctest` 9/9 đạt sau khi chuyển ba metric sang bộ sinh tài nguyên.
- `npm run check:resources`, `npm run check:docs`, `node --test scripts/native/__tests__/domain.test.mjs` (11/11): đạt.
- `python3 -m unittest … test_*.py`: 7 đạt, 1 lỗi `test_package` vì máy này dùng Python 3.9 (`hashlib.file_digest` cần 3.11); không liên quan thay đổi này.

## Chưa kiểm

Chạy app: tải model thật để xem dòng bytes (Ollama báo theo từng layer, số có thể quay về đầu khi sang layer mới); dòng phụ của tệp ở VI/EN/JA.

## Còn lại

- #62: dung lượng model đã cài, tốc độ đo theo từng model; Qt chưa có bytes khi tải.
- #65: deep link trang con Cài đặt, nút Thử lại; Qt chưa có loại và ngày sửa.
