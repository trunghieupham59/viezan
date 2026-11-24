# Native code 81 — Glass là giao diện duy nhất

Ngày 2026-11-24. Product Owner quyết định hoàn thiện Glass trước khi có theme
mới, nên Graphite, Paper, Corporate và Midnight bị gỡ khỏi cả hai ứng dụng.
Chế độ Sáng/Tối/Hệ thống, màu nhấn và cỡ chữ giữ nguyên.

## Hành vi

- `resources/tokens.css` chỉ còn khối token Glass (sáng, tối, Reduce
  Transparency). `themePalettes` trong hai `native.json` chỉ có 7 khoá
  `glass:<accent>`.
- Cài đặt › Giao diện còn ba hàng: Chế độ → Màu nhấn → Cỡ chữ nội dung. Hàng
  "Kiểu giao diện" và các chuỗi `themePreset`, `presetDescription`, `preset_*`
  đã xoá. `accent_auto` đọc "Mặc định"; `accentDescription` viết lại.
- Dữ liệu cũ: trường `preset` vẫn nằm trong schema 1. Khi nạp workspace hoặc
  bản sao lưu, `graphite`, `paper`, `corporate`, `glass` và giá trị thiếu
  thành `glass` và giữ chế độ đã lưu; `midnight` thành `glass` + `dark`; giá
  trị lạ bị từ chối như trước. Swift: `Workspace.upgrading()`; Qt:
  `WorkbenchDomain::recover`. Không có thông báo cho người dùng.
- `setAppearance` (Swift) không còn tham số `preset`; lệnh `appearance` (Qt)
  bỏ qua khoá `preset` và luôn lưu `glass`.
- Mọi nhánh giao diện không phải Glass đã gỡ: macOS 345 điều kiện trong 26
  file `ViezanNative`; Qt 29 phép kiểm preset, 151 biểu thức `?:` và 116 điều
  kiện `&&`/`||` trong 16 file QML. `glassPreset` và các `glass` chỉ đọc
  preset không còn; tuỳ chọn chất liệu của từng control (`glassMaterial`,
  tham số `glass` của control) giữ nguyên.

## Khác biệt còn lại

- `WorkbenchDomain::validate` (C++) vẫn chấp nhận tên preset cũ vì `recover`
  gọi nó trước bước chuẩn hoá; `Workspace.validated()` (Swift) chỉ nhận
  `glass`. Mọi đường nạp phía Qt đều qua `recover` nên không có preset cũ nào
  được lưu lại.
- Các bản vẽ cũ trong `docs/design/` vẽ ở Graphite chỉ còn giá trị về bố cục.

- `ChromeSurface` trong `Kit.qml` có hai property `darkMode` và `themeColors`
  không ai dùng. Chúng đã thừa từ trước thay đổi này nên được để nguyên.

## Vai trò

Claude: chia story, kiểm chứng, tài liệu. Codex (`gpt-6.2-astra`, xhigh): S1
lõi dùng chung, S2 macOS, S3 Qt. Antigravity: ghi chú thiết kế mục Giao diện,
review S1 và S2/S3.

## Kiểm tra

Host: macOS 27.2, arm64. Chạy ngoài sandbox sau khi cả ba story xong.

| Lệnh | Kết quả |
| --- | --- |
| `swift test --package-path apps/macos` | 186 + 93 test đạt, 0 lỗi |
| `cmake --build .native-build/qt --config Release` | Thành công |
| `ctest --test-dir .native-build/qt -C Release --parallel 4` (offscreen, Fusion) | 9/9 nhóm đạt |
| `npm run check:resources` | Đạt: 3 locale, 84 metric |

Codex báo thêm (chưa được Claude chạy lại): 66/66 ảnh AppKit và 96/96 ảnh Qt
trước/sau khớp từng điểm ảnh ở sáng/tối, 820 và 1200, có và không Reduce
Transparency.

Chưa làm: chạy ứng dụng thật để xem bằng mắt, VoiceOver/trình đọc màn hình,
Windows và Linux, bộ render GPU của Qt (ca Glass tăng tốc bị bỏ qua ở
offscreen).
