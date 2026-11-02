# Hướng thiết kế duy nhất: Quiet Workbench (native)

Chốt ngày 2026-11-02. Viezan có **một** hướng thiết kế cho bản native macOS
(SwiftUI/AppKit) và sau này cho Qt: **Quiet Workbench**, tức Desktop Review 18
đã được chuyển thành bộ thành phần native trong `NativeKit.swift`. Mọi màn hình,
mọi lớp nổi và mọi cửa sổ phụ đều theo một bộ nguyên tắc dưới đây; không còn
"thử" hướng khác song song.

Bản vẽ chuẩn (Claude Design): <https://claude.ai/artifact/VeqxUQ2GsC716JPr1vVreM>
— board hệ thống thiết kế (màu, chữ, khoảng cách, nút, chip, thẻ, hàng) và
năm màn hình chuẩn: AI Chat sáng 1400, Dịch tối 1400, Cài đặt sáng 1400, Dịch
hẹp 820 (rail), Launcher. Bản vẽ là tài liệu riêng tư cho tới khi được chia sẻ
từ menu Share của trang.

## Nguồn còn hiệu lực và nguồn đã lui về tham khảo

| Nguồn | Vai trò từ 2026-11-02 |
| --- | --- |
| `src/styles/tokens.css` → `native.json` (`metrics`, `palettes`) | **Giá trị.** Mọi số đo, màu, tỷ lệ chữ trong view đọc từ đây qua `metric()`, `contentColor()`, `chromeColor()`, `Font.vzn()`. |
| `AGENTS.md`, `.claude/rules/ui-ux.md` | **Luật.** Button semantics, một composer, không literal, focus, bản địa hoá. |
| `docs/design/foundations.md` | Nguyên tắc nền (bậc bề mặt, vai trò chữ, trạng thái chung). |
| **Tài liệu này + bản vẽ Claude Design** | **Hình hài native.** Khi spec Electron và bản native khác nhau về bố cục, bản native thắng. |
| `docs/design/screens/*.md` | **Hành vi** từng màn (hành động, trạng thái, trợ năng). Vẫn là tham chiếu hành vi; phần bố cục/CSS trong đó là của bản Electron đã nghỉ. |
| `docs/migration/desktop-review/` (Review 18) | Prototype gốc của hướng này; dùng để đối chiếu 1:1 khi cần. Không thêm tính năng vào prototype nữa. |
| `docs/design/boards/` (quiet workbench Electron) | Tham khảo lịch sử. Không dùng làm chuẩn cho native. |
| `docs/migration/macos27/` (Review 02 Liquid Glass), Figma `AXNXvFbXPr5CK1K5Vjhz6b` | **Đã lui.** Không cập nhật, không dùng để nghiệm thu. |

Thứ tự ưu tiên khi mâu thuẫn: giá trị (`tokens.css`) → luật (`AGENTS.md`,
`ui-ux.md`) → `foundations.md` → **direction.md + bản vẽ** → spec màn hình →
prototype Review 18.

## Tinh thần

Một bàn làm việc yên tĩnh. Canvas trung tính, điều hướng là một cột vật liệu hệ
thống liền (không phải thẻ kính nổi), nội dung đọc trên bề mặt đục có viền
mảnh. Một màu nhấn xanh cho *đang chọn / tạo mới / gửi*; đỏ chỉ cho *dừng /
xoá / đặt lại*. Mỗi vùng tối đa một nút solid. Không dashboard KPI, không
gradient, không bóng đổ nặng. Chữ hệ thống (SF), mọi cỡ là tỷ lệ trên cỡ gốc.

## Khung ứng dụng

- Hai cột: điều hướng 236 pt (rail 60 pt khi thu gọn hoặc cửa sổ < 900 pt) và
  vùng làm việc. Không có dải titlebar riêng: nút cửa sổ và nút thu gọn nằm ở
  hàng đầu của sidebar (40 pt), header ngữ cảnh 48 pt thẳng hàng với nó.
- Sidebar: logo + "Viezan", ô "Tìm kiếm mọi thứ ⌘K", danh sách làm việc
  (Trang chủ, AI Chat, Dịch, Phiên dịch, Từ điển, Dịch mọi nơi), nhóm HỆ THỐNG
  (Ứng dụng, Nhiệt độ & quạt, Launcher & phím tắt, Cài đặt), chân "Lưu trên
  thiết bị". Mục đang chọn: nền `chrome-item-active`, chữ semibold.
- Header: một tiêu đề ngữ cảnh bên trái (`Tính năng / tên phiên`, hoặc
  breadcrumb `Không gian làm việc / Trang` ở trang hệ thống). Bên phải, cùng
  một thứ tự ở mọi tính năng: *nút theo trang* (Thêm hình ảnh, Từ đã lưu, Tổng
  hợp) · **Lịch sử** · **Tạo mới** (soft accent) · vạch ngăn · **Hoạt động**
  (có số việc đang chạy). Trang hệ thống: Launcher · Hoạt động. Cài đặt: ô tìm
  · Hoạt động. Mọi nút header là pill 32 pt; ở bề rộng hẹp chỉ còn icon nhưng
  giữ accessible name và tooltip.
- Lớp nổi (Lịch sử nhanh, Hoạt động, bảng lệnh ⌘K): bề mặt đọc đục
  `surface`, bo 20 pt, viền hệ thống, bóng nhẹ; neo theo nút mở; Escape đóng
  lớp nổi trước, không huỷ tác vụ; focus trả về nút mở. Hoạt động liệt kê mọi
  việc chạy nền (tác vụ văn bản **và** phiên dịch đang nghe), mỗi việc có Mở và
  Dừng/Thử lại riêng.

## Trang và cột đọc

- **Trang tính năng** (Chat, Dịch, Từ điển, Phiên dịch) không có tiêu đề trang
  lớn: header đã mang ngữ cảnh. Nội dung đọc (hội thoại, mục từ, composer) cap
  ở `reading` 760 pt và căn giữa; bề mặt công cụ (hai panel Dịch, bản ghi, hàng
  ngôn ngữ) dùng hết bề rộng.
- **Trang hệ thống** (Trang chủ, Dịch mọi nơi, Ứng dụng, Nhiệt độ, Launcher &
  phím tắt) mở bằng `PageIntro`: tiêu đề 22 pt + một câu mục đích (các câu này
  là copy đã chọn từ Review 18), rồi thẻ và lưới `AdaptiveColumns`/`UniformGrid`.
- **Cài đặt** là workspace: cột mục 292 pt (nhóm TUỲ CHỈNH / ỨNG DỤNG, có
  icon) và cột nội dung cap 760 pt; mỗi mục có tiêu đề 22 pt + mô tả, rồi các
  thẻ `CardSection(flush:)` với hàng `CardRow` (nhãn 14, mô tả 12, điều khiển
  bên phải, vạch ngăn sát mép). Sheet chỉ cho hành động hữu hạn.

## Bộ thành phần (NativeKit) và cách dùng

| Thành phần | Dùng cho | Không dùng cho |
| --- | --- | --- |
| `VznButtonStyle` `.vznPrimary` / `.vznOutline` / `.vznQuiet` | Mọi nút trong nội dung. Primary = solid duy nhất trong vùng; outline = thứ cấp có khung; quiet = tiện ích thanh công cụ. Role `.destructive` đọc màu `danger`. | Nút header (dùng `ShellToolbarButton`), nút trong lớp nổi (`NativePanelButton`). |
| `ShellToolbarButton` (pill 32) | Header và hàng đầu sidebar. | Nội dung trang. |
| `CardSection` / `CardSection(flush:)` + `CardRow` | Thẻ nội dung; thẻ cài đặt có thanh tiêu đề. | Lồng thẻ trong thẻ. |
| `LanguageMenu` | Cặp ngôn ngữ ở hàng ngôn ngữ của Dịch, Từ điển, Phiên dịch (nhãn vai trò + ngôn ngữ + chevron, có hover). | Hàng trong thẻ cài đặt: dùng `Picker` hệ thống (popup). |
| `StatusBadge` / `StatusDot` | Trạng thái sống (Đã cấp, Đang nghe, Đang chạy, Chưa cấp, Không chạy). Chữ luôn mang nghĩa, màu chỉ phụ hoạ. | Nhãn tĩnh. |
| `FilterTabs` | Bộ lọc loại trừ nhỏ (Tất cả / Chat / Dịch…; Song ngữ / Chỉ bản dịch với `accent: true`). | Điều hướng. |
| `KeyCap` | Phím tắt bên trong điều khiển mà nó kích hoạt. | Chip rời cạnh nút. |
| `ProviderNotice` / `SpeechProviderNotice` | Một dòng dưới hàng ngôn ngữ hoặc trên composer khi model/khoá không dùng được, kèm nút sửa. | Khung quanh composer. |
| `Font.vzn("…Scale", weight)` | Mọi cỡ chữ: caption 11 · small 12 · body 13 · label 14 · subtitle 15 · section 16 · title 18 · heading 22 · display 28 · hero 32. | `.callout`, `.caption`, `.headline`, `.title2`… của hệ thống (đã thay toàn bộ 2026-11-02). |
| `contentColor(role)` / `chromeColor(role)` | Mọi màu. | `Color(nsColor: .systemRed)`, `.accentColor.opacity(…)`. |

Ô nhập chữ: viền `border`, khi focus chỉ đổi sang `border-strong` và hiện con
trỏ; không bao giờ có viền màu nhấn. Composer Chat là một bề mặt duy nhất bo
20 pt với bóng nhẹ; không khung ngoài.

## Quyết định đã chốt trong đợt này (2026-11-02)

- Review 18 là hướng duy nhất; Review 02/Figma/boards Electron lui về tham khảo.
- Trang hệ thống giữ tiêu đề kiểu câu của Review 18 ("Hiểu ngay, ở bất cứ
  đâu."); Trang chủ giữ "Không gian làm việc". Không thêm kiểu tiêu đề thứ ba.
- Gần đây ở Trang chủ gộp cả phiên Phiên dịch (lọc riêng), mở lại đúng phiên.
- Hoạt động đếm và liệt kê phiên dịch đang nghe như một việc chạy nền.
- Bảng lệnh ⌘K ẩn lệnh của module đã tắt.
- Thẻ "Xem trước cửa sổ dịch nhanh" chỉ minh hoạ: không sao chép, không gieo
  văn bản mẫu vào phiên; nút duy nhất mở trang Dịch.
- Ô ngữ cảnh của Từ điển là ô có khung như ô từ, không phải dòng chữ trần.
- Menu helper quạt chỉ hiện hành động hợp với trạng thái helper.
- "Quản lý" ở Trang chủ mở đúng mục Cài đặt sở hữu model đang dùng.

## Việc còn mở theo hướng này

Loạt 2026-11-02 gồm chín đợt, báo cáo [native-code-49](../migration/native-implementation/native-code-49.md)
đến [native-code-57](../migration/native-implementation/native-code-57.md), mỗi báo cáo có mục "Còn lại".
Tổng hợp: Qt trên Windows/Linux (làm khi có máy Windows); các luồng cần API hoặc phần cứng thật để chạy
(so sánh model, nghiên cứu web, tổng hợp phiên dịch, tải và đo model local, helper quạt, bản cập nhật mới);
nghiệm thu trợ năng (VoiceOver, ba cỡ chữ, 640 pt); cài đặt cập nhật tại chỗ.
