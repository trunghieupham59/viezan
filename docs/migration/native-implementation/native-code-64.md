# Native code 64 — AI Chat: ghim model và phím tắt mở panel (2026-11-24)

Làm trên `develop` (macOS), theo [direction.md](../../design/direction.md). Chỉ kiểm ở mức code;
chưa mở app, chưa chụp ảnh: người dùng duyệt giao diện sau.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanDomain/Models.swift` | `Workspace.pinnedModels` (tuỳ chọn). `validated()` từ chối danh sách quá 8, trùng lặp hoặc ID không hợp lệ. |
| `ViezanDomain/WorkbenchStore.swift` | `pinnedModels`, `canPinModel`, `togglePinnedModel`, `pinnedModelLimit = 8`; không ghi khi workspace bị chặn tải. |
| `ViezanDomain/ModelLineup.swift` | `sections(... pinned:)`: nhóm `pinned` sau Mục đích; Gần đây bỏ model đã ghim; khi tìm không có nhóm ghim. |
| `ViezanNative/ModelPanel.swift` | Nút ghim ở mép phải hàng model (hiện khi trỏ, khi hàng đang được phím mũi tên chọn, hoặc đã ghim), ⌘P, menu ngữ cảnh, hành động trợ năng, giá trị "Đã ghim". Vị trí bàn phím theo `nhóm/hàng`. |
| `ViezanNative/ComposerPanels.swift` | `PanelRow.trailingRoom`: chừa chỗ cho điều khiển phủ ở mép phải. |
| `ViezanNative/ViezanApp.swift`, `NativeFoundation.swift` | Menu Lệnh: Model ⌘⇧M (Chat, Dịch, Từ điển), Công cụ ô soạn ⌘⇧T (Chat); tắt khi thư viện hoặc hộp cập nhật đang mở; panel đang mở thì lệnh đóng nó; lệnh tìm nút `model-toggle` / `tools-toggle` đang hiện và bật bằng `shellControl` rồi bấm nút đó. |
| `resources/locales/*`, hai `native.json` | Chuỗi `pinnedModels`, `pinModel`, `unpinModel`, `pinModelNamed`, `unpinModelNamed`, `composerTools` (VI/EN/JA). |

## Lỗi có sẵn đã sửa

Một model nằm ở hai nhóm (Gần đây và nhóm nhà cung cấp) có cùng ID hàng; phím ↓ từ hàng thứ hai
quay về sau hàng thứ nhất nên không đi qua được. Ghim làm trường hợp này thường gặp hơn. Vị trí
bàn phím nay là `nhóm/hàng`. Lỗi nằm trong view, chưa có test tự động cho thao tác phím.

## Review độc lập (Antigravity, chỉ đọc)

Đã sửa: nút ghim ẩn không còn nhận click và không làm mất nền hover của hàng; ⌘P khi chưa chọn hàng
ghim model đang dùng, bỏ ghim thì vị trí bàn phím chuyển sang hàng thế chỗ; định danh trợ năng theo
`nhóm/hàng`; tên trợ năng dùng chuỗi có `{name}`; menu "+" có tên riêng; hai lệnh menu chỉ bật ở màn có
nút tương ứng; dấu ghim dùng `text-muted`, màu nhấn chỉ còn cho dấu ✓.

Không làm: đưa `pinnedModels` vào phần tuỳ chọn của sao lưu (đổi định dạng sao lưu dùng chung với Qt, ngoài
phạm vi); đặt nút ghim trước dấu ✓ và gợi ý `⌘P` + bộ đếm `n/8` ở chân panel (đề xuất thiết kế, chờ duyệt).

Chưa xác minh được ở mức code: ⌘P có bị mục In của hệ thống giành hay không.

## Kiểm tra

- `swift build --package-path apps/macos`: xong, không cảnh báo mới.
- `swift test --package-path apps/macos`: 54 test (9 suite AppKit) và 102 test domain, đều đạt.
  Test mới: `PinnedModelTests` (nhóm ghim, bật tắt, giới hạn, lưu và đọc lại, dữ liệu hỏng,
  workspace bị chặn) và `ShellControlTests` (chỉ tìm nút đang hiện và bật).
- `npm run check:resources`: đạt sau khi sinh lại.

## Chưa kiểm

- Chạy app: ⌘P khi ô tìm giữ focus, nút ghim khi trỏ, menu ngữ cảnh, ⌘⇧M / ⌘⇧T ở Chat, Dịch,
  Từ điển, Trang chủ; focus trả về nút sau Esc; VoiceOver đọc "Đã ghim" và hành động Ghim.
- Sáng/tối, preset khác Glass, cửa sổ 640×480.

## Còn lại

- Qt đã có ghim model và hai phím tắt (báo cáo qt-parity-2), chưa nghiệm thu sống.
- Nút "+" và panel của nó vẫn mang tên trợ năng "Đính kèm ảnh"; đổi sang "Công cụ ô soạn" là quyết định thiết kế riêng.
