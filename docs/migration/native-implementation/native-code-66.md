# Native code 66 — Dung lượng model đã cài; đồng hồ Đang nghiên cứu (2026-11-24)

Hai story nhỏ trên macOS (BACKEND-GAPS #62 một phần, #14). Chỉ kiểm ở mức code.

## Thay đổi

| Phần | Thay đổi |
| --- | --- |
| `ViezanDomain/LocalProvider.swift` | `catalog()` trả model Ollama đã cài kèm dung lượng (0 khi runtime không báo); `parseCatalog` chặn kích thước âm, vô hạn hoặc quá lớn; `models()` dùng lại `catalog()`. |
| `ViezanNative/LocalModelSettings.swift` | Hàng model đã cài ghi "2,6 GB · ID"; đọc lại khi danh sách đổi. Không có dung lượng thì chỉ ghi ID. |
| `ViezanNative/Workspaces.swift`, `ResearchPanel.swift` | Board Chat-States: chip "Đang nghiên cứu · 1:42" thay chip "Đang trả lời…" khi tác vụ nghiên cứu đang chạy; thiếu `started` thì "Đang nghiên cứu…". Tên trợ năng cố định để không đọc lại mỗi giây. Cạnh chip có nút Dừng (`chat-research-stop`), nút Dừng ở ô soạn giữ nguyên. Chuỗi mới `researching`, `researchingElapsed`. |
| `ViezanDomain/Models.swift`, `ViezanNative/Launcher.swift` | `settingsJump(query:locale:)`: khi gõ từ 2 ký tự, tối đa ba mục Cài đặt có tiêu đề hoặc nhãn ngắn khớp ở đầu từ hiện trong nhóm Viezan và mở thẳng mục đó (#65). |

## Bổ sung cùng ngày (sprint kế)

- `LocalPerformance.headline` / `measured`: hàng model đã cài ghi thêm "<chế độ> · 48,2 token/giây" (kết quả của cấu hình đang áp dụng, không có thì kết quả nhanh nhất) hoặc "Chưa đo được"; đọc lại sau mỗi lần đo. Chuỗi mới `localModelMeasured`. Test `localModelHeadlineIsTheAppliedProfileOrTheFastest`.
- Thanh tiến độ tải model có tên trợ năng.

## Review độc lập (Antigravity, chỉ đọc)

Đã sửa: chip nghiên cứu hiện ngay cả khi tác vụ chưa lưu pha đầu (xét thêm chế độ của phiên), đồng hồ bám giây của
tác vụ, chữ số đều; Launcher chỉ khớp tiêu đề và nhãn ngắn ở đầu từ (`settingsJump`) và dùng callback mở Cài đặt sẵn
có; đọc dung lượng không làm mất model khi `size` sai kiểu, tên trùng giữ số lớn nhất, đọc lỗi giữ số đang hiện;
chuỗi tiếng Nhật dùng `・`.

Không làm: lưu dung lượng ngay trong bước khám phá nhà cung cấp (hiện đọc riêng một lần mỗi khi danh sách đổi).

## Kiểm tra

Test mới: `LocalCatalogTests` (dung lượng, `settingsJump`), `researchClockReadsMinutesAndClampsBadInput`. Kết quả đủ bộ: xem mục cuối sprint.

## Chưa kiểm

Chạy app với Ollama thật; đồng hồ khi nghiên cứu thật; VoiceOver.

## Còn lại

Ghi chú thiết kế của Antigravity được áp dụng sau khi bản đầu đặt đồng hồ sai chỗ (trên đầu bảng nghiên cứu).
