# Hướng thiết kế duy nhất: Quiet Workbench (native)

Chốt ngày 2026-11-02. Viezan có **một** hướng thiết kế cho bản native macOS
(SwiftUI/AppKit) và sau này cho Qt: **Quiet Workbench**, tức Desktop Review 18
đã được chuyển thành bộ thành phần native trong `NativeKit.swift`. Mọi màn hình,
mọi lớp nổi và mọi cửa sổ phụ đều theo một bộ nguyên tắc dưới đây; không còn
"thử" hướng khác song song.

Bản vẽ chuẩn (Claude Design, từ 2026-11-03): <https://claude.ai/artifact/A39txAordDuiSCrtznFhrQ>
— Liquid Glass 2.0, 36 board, đã chép vào `docs/design/glass2/` kèm
[HANDOFF.md](glass2/HANDOFF.md). Bản vẽ cũ <https://claude.ai/artifact/VeqxUQ2GsC716JPr1vVreM>
— board hệ thống thiết kế (màu, chữ, khoảng cách, nút, chip, thẻ, hàng) và
năm màn hình chuẩn: AI Chat sáng 1400, Dịch tối 1400, Cài đặt sáng 1400, Dịch
hẹp 820 (rail), Launcher. Bản vẽ là tài liệu riêng tư cho tới khi được chia sẻ
từ menu Share của trang.

## Nguồn còn hiệu lực và nguồn đã lui về tham khảo

| Nguồn | Vai trò từ 2026-11-02 |
| --- | --- |
| `resources/tokens.css` → `native.json` (`metrics`, `palettes`) | **Giá trị.** Mọi số đo, màu, tỷ lệ chữ trong view đọc từ đây qua `metric()`, `contentColor()`, `chromeColor()`, `Font.vzn()`. |
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

## Liquid Glass 2.0 — hướng hiện hành (chốt 2026-11-03)

Người dùng bác bản Glass cyan ngày 2026-11-02 ("mọi lớp cùng một tông, kính
không có gì để khúc xạ, bốn lớp bo góc lồng nhau") và duyệt bản vẽ mới. Từ
ngày này, preset Glass theo **cảnh ba lớp**; chi tiết số đo, màu và từng màn
hình nằm trong [`glass2/HANDOFF.md`](glass2/HANDOFF.md), là nguồn hình hiện
hành cho macOS. Các mục "Tinh thần", "Áp dụng bộ ảnh tham chiếu" và "AI Chat
với Glass" phía dưới mô tả vòng cyan và chỉ còn giá trị lịch sử ở phần màu và
vật liệu; phần hành vi, kích thước khung (236/68, hàng 48, breakpoint 900) và
quy tắc nút vẫn hiệu lực.

1. **Nền**: gradient 150° champagne → taupe → lavender-slate → xám thép với hai
   quầng sáng (`--vzn-app-backdrop`). Không ảnh, không hạt, không motion.
2. **Mặt đọc**: một pane trắng ấm 82 % bo 22 cho mỗi cửa sổ (`--vzn-canvas`).
   Bên trong chỉ còn thẻ phẳng viền hairline và vạch ngăn, không lồng pane.
3. **Kính** chỉ ở sidebar, pill header, composer, bộ lọc, chip model và lớp
   nổi: fill trắng 68→40 %, blur 18, viền sáng 1 px, bóng thấp; lens 92→72 %
   cho mục đang chọn.

Màu nhấn là lavender-indigo `#5A5FA3` (tối `#A6AAEE`), lấy từ ảnh tham chiếu
của người dùng; đỏ chỉ cho dừng / xoá / đặt lại. Bong bóng người dùng trung
tính. Hộp thoại chặn nằm giữa cửa sổ, bo 18, nền phủ 22 %; lớp nổi không chặn
neo theo nút mở. Mọi menu hệ thống còn lại của Dịch / Từ điển / Phiên dịch
chuyển sang lớp nổi của shell. Cài đặt còn 9 mục; phím tắt chỉ quản lý ở
trang Launcher & phím tắt. Thư viện lịch sử lọc phiên lưu trữ tại chỗ. So sánh
mô hình chọn model trước khi chạy.

## Tinh thần

Một bàn làm việc yên tĩnh, với phân lớp rõ ở Glass sáng: nền cyan, pane
điều hướng xanh nhạt, workspace xanh băng và card trắng xanh. Chữ hệ thống,
vùng đọc/nhập đục và một màu nhấn cho *đang chọn / tạo mới / gửi*; đỏ chỉ cho
*dừng / xoá / đặt lại*. Không thêm dashboard KPI, dữ liệu giả hay bóng nặng.

Ảnh dashboard cyan được người dùng chọn lại ngày 2026-11-02 **thay thế quyết
định kính liền sky/sage của vòng Finder trước**. Bản trước phẳng vì nền trang
và card cùng màu. `app-bg` giờ lộ ra quanh pane; `canvas` là workspace,
`surface` là card sáng hơn. Nền chuyển cyan rất nhẹ để tạo ánh sáng của cả
cảnh; card chỉ có cạnh sáng mềm và bóng thấp. Không thêm ảnh nền hay blur
cho vùng văn bản.

Pane điều hướng có lề `small` (8 pt), góc `chromeSurfaceRadius` (26 pt), bắt
đầu dưới header 48 pt cộng `small`; không chạm nút cửa sổ. Workspace bắt
đầu cùng cao độ, lề ngang `inset` (16 pt) ở desktop / `gap` (12 pt) ở cửa
sổ hẹp, đáy `gap`. `WorkspacePage` trừ lề ngoài khỏi đệm trong 44 pt cũ để
giữ ngân sách chiều ngang. Trang chủ gom bắt đầu nhanh, việc gần đây và
trạng thái mô hình thật thành các panel; không thêm route hay rail trùng.

Giữ hàng nút cửa sổ và nút thu gọn cố định, bề rộng điều hướng 236/68 pt,
logo 28 pt và đệm trong phía trên 12 pt. Mục chọn sáng hơn, chữ semibold,
icon xanh; focus bàn phím là trạng thái riêng. Glass sáng dùng accent xanh
dương có chữ trắng rõ; mode, preset và accent người dùng vẫn độc lập.

macOS giữ vật liệu native ở chrome; Qt dùng các lớp màu đục tương ứng,
không tuyên bố có khúc xạ Apple hay blur desktop. Reduce Transparency /
Increase Contrast dùng nền đục và cạnh rõ. Glass tối giữ pane nổi và bảng
màu cũ, các preset khác giữ hình học và màu của chúng. Mặc định desktop
1044 × 760, tối thiểu 640 × 480, breakpoint 900; cửa sổ co giãn tự do,
không khoá tỷ lệ. Runtime Windows/Linux cần nghiệm thu riêng.

### Áp dụng bộ ảnh tham chiếu Liquid Glass (2026-11-02)

- Thanh điều hướng capsule và mẫu Finder: Glass sáng dùng pane cyan tách lớp theo
  tinh chỉnh mới ở trên, Glass tối giữ pane nổi; mục đang
  chọn là lớp nền trung tính sáng hơn, nhãn semibold và icon theo accent hiện có.
  Focus bàn phím vẫn là trạng thái riêng. Tìm kiếm có icon ở cả hai bề rộng;
  khi rail, nút tìm là một hình tròn riêng. Giữ thứ tự route và breakpoint 900.
- Các mẫu thẻ sáng/tối: dùng `chromeCardRadius` (18 pt) cho thẻ nội dung ở Glass,
  `chromeControlRadius` (16 pt) cho nút SwiftUI và toolbar Qt; các control Qt
  thông thường giữ hành vi và nội dung native của toolkit. Ánh sáng chỉ nằm trên viền; vùng chữ,
  bảng, lịch sử và composer giữ nền đục. Các preset khác giữ hình học của chúng.
- Bộ lọc SwiftUI và Qt dùng một nền nhóm nhẹ và pill kính nổi cho mục đang chọn,
  lấy tinh thần của thanh capsule; Qt dùng chung `Kit.FilterGroup`/`FilterButton`.
- Các mẫu widget màu gợi ý nhấn trạng thái bằng màu ngữ nghĩa. Không thêm widget,
  dữ liệu KPI, ảnh nền hay motion trang trí vào luồng làm việc của Viezan.

## Khung ứng dụng

- Hai cột: điều hướng 236 pt (rail 68 pt khi thu gọn hoặc cửa sổ < 900 pt, đủ
  chỗ cho ba nút đèn kết thúc ở 59 pt) và
  vùng làm việc. Không có dải titlebar riêng: nút cửa sổ và nút thu gọn nằm
  giữa cùng hàng đầu 48 pt, thẳng hàng với header ngữ cảnh.
- Nút thu gọn (quy tắc Finder, chốt 2026-11-02 sau khi hướng cũ bị loại): một
  vị trí cửa sổ duy nhất, ngay sau ba nút đèn (`trafficLights + gap`), ở mọi
  trạng thái và bề rộng. Mở rộng thì nó thuộc hàng đầu sidebar; rail thì nó
  đè lên đầu header và breadcrumb lùi sau nó; lớp nổi ở bề rộng hẹp chừa hàng
  đầu trống cho nó và bấm lại là đóng lớp nổi. Nút đổi hình thái theo trạng
  thái: cột đang mở → `rectangle.leadinghalf.inset.filled` (nửa trái tô
  đầy), đã thu → `sidebar.leading` (viền rỗng), cross-fade `durationFast`;
  giữ chuột thì nền `chrome-item-active`. Bấm chuột không để lại vòng
  focus (focus chỉ giữ khi kích hoạt bằng bàn phím hoặc trợ năng). Đổi bề
  rộng chạy `durationNormal` (easeOut), nhãn mờ dần; Reduce Motion chuyển
  tức thì. Hàng đầu sidebar là nơi duy nhất căn ba nút cửa sổ; theo dõi cả
  thay đổi frame của nút và titlebar do AppKit thực hiện muộn, kể cả khi cửa
  sổ không resize. Sau khi kích hoạt lại hoặc thoát toàn màn hình phải giữ
  cùng trục dọc, không làm nút thu gọn nhảy theo sidebar.
- Sidebar: logo + "Viezan" (viết hoa chữ đầu), ô "Tìm ⌘K", danh sách làm việc
  (Trang chủ, AI Chat, Dịch, Phiên dịch, Từ điển, Dịch mọi nơi), nhóm HỆ THỐNG
  (Ứng dụng, Nhiệt độ & quạt, Launcher & phím tắt, Cài đặt), dải "Đang chạy
  nền", chân "Lịch sử lưu trên thiết bị" tách bằng vạch ngăn, dùng icon ổ lưu
  trữ trung tính, không dùng chấm trạng thái. Chú giải và tên mô tả trợ năng nói
  rõ AI xử lý trên thiết bị hoặc qua cloud, tuỳ mô hình. Mục đang chọn dùng
  chữ semibold; Glass dùng nền trung tính và icon accent theo bộ ảnh tham chiếu
  ở trên, các preset khác giữ `chrome-item-active`. Focus bàn phím vẫn theo
  control native. Lề trái mục là `gap` 12 pt trong Glass và `inset` 16 pt ở
  các preset khác, giữ trục icon trùng tâm rail. Hàng thương hiệu cao tối thiểu `compactControl` 32 pt,
  không thêm spacer trước mục Trang chủ; giữ nguyên chiều cao các mục điều hướng.
  Logo 28 pt ở cả hai trạng thái, tâm trùng trục icon nên không nhảy khi đổi.
  Nội dung Glass có thêm `gap` (12 pt) ở phía trên để logo và tên cách hàng
  nút cửa sổ, đồng thời tránh góc bo của pane tối; áp dụng cả mở rộng, rail và overlay.
  Trong Glass, tìm kiếm ở rail là nút tròn 32 pt có viền sáng nhẹ;
  các preset khác giữ icon lặng cùng cỡ các mục. Trạng thái chạy nền là chấm trên icon của route đó
  (có nhãn trợ năng), không có dải hay chân riêng.
- Header: một tiêu đề ngữ cảnh bên trái (`Tính năng / tên phiên`, hoặc
  breadcrumb `Không gian làm việc / Trang` ở trang hệ thống). Bên phải, cùng
  một thứ tự ở mọi tính năng: *nút theo trang* (Thêm hình ảnh, Từ đã lưu, Tổng
  hợp) · **Lịch sử** · **Tạo mới** (soft accent) · vạch ngăn · **Hoạt động**
  (có số việc đang chạy). Trang hệ thống: Launcher · Hoạt động. Cài đặt: ô tìm
  · Hoạt động. Mọi nút header là pill 32 pt; ở bề rộng hẹp chỉ còn icon nhưng
  giữ accessible name và tooltip.
- Lớp nổi (Lịch sử nhanh, Hoạt động, bảng lệnh ⌘K): bề mặt đọc đục
  `surface`, bo 20 pt, viền hệ thống, bóng nhẹ; neo theo nút mở; Escape đóng
  lớp nổi trước, không huỷ tác vụ; focus trả về nút mở **chỉ khi lớp được mở
  bằng bàn phím hoặc trợ năng**; mở bằng chuột thì đóng xong không control nào
  nhận focus, nên không có vòng focus thừa. Hoạt động liệt kê mọi
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

Ô nhập chữ thông thường: viền `border`, khi focus đổi sang `border-strong`
và hiện con trỏ. Composer Chat là một bề mặt duy nhất, viền hairline, không
khung ngoài. Glass giữ viền focus trung tính và caret cho mặt nhập;
nút điều khiển có chỉ báo focus bàn phím riêng.

### Nút Glass toàn ứng dụng — sửa vật liệu 2026-11-03

Người dùng xác nhận áp dụng cho toàn bộ Viezan. Lượt trước chỉ sơn nền đục
và viền sáng nên nút còn phẳng; không coi đó là hoàn tất chất liệu kính.
SwiftUI dùng `ControlGlass` với `glassEffect` trên macOS 26+, AppKit dùng
`NSGlassEffectView` sau chính NSButton hiện có. Không đặt fill đục trước
vật liệu. macOS cũ dùng material dự phòng; Reduce Transparency/Increase
Contrast giữ bề mặt đặc. Qt dùng mặt bán trong, phản sáng hai mép và bóng
cục bộ; đây là mô phỏng quang học trong scene, không phải kính Apple hay
blur desktop.

- Primary, secondary và icon/quiet actions kế thừa vật liệu qua thành phần
  chung. Menu ngôn ngữ, nhóm bộ lọc và trigger trước đây bỏ qua style chung
  cũng dùng kính. Control ở trạng thái disabled còn hình dáng kính trung
  tính nhưng không tương tác; hành động nguy hiểm giữ màu và semantics riêng.
- Nhóm model/thu âm Chat chỉ có một vật liệu chung; các nút con không thêm
  lớp kính thứ hai. Bộ lọc dùng một nền nhóm lõm nhẹ, pill chọn là lớp kính nổi;
  mục nghỉ để trong và hover nhẹ hơn trạng thái chọn.
- Hàng nội dung đọc, danh sách lịch sử và control chọn của hệ thống giữ đúng
  vai trò; không biến mọi vùng click được thành một capsule nổi. Nền soạn,
  transcript và card nội dung không nhận blur của control.
- Xác nhận chất liệu bằng app đang chạy; ảnh cache AppKit có thể bỏ mất
  lớp compositor của `glassEffect`. Kiểm tra bố cục đạt không đồng nghĩa
  người dùng đã chấp nhận hình ảnh.

### AI Chat với Glass — cấu trúc theo ảnh tham chiếu 2026-11-02

- Dùng hình học và hướng ánh sáng của bốn ảnh nút/menu/composer/thanh công cụ:
  mặt kính sạch, mép sáng trên-trái và dưới-phải, lòng nút có chuyển sắc nhẹ.
  Màu theo preset và accent hiện tại. Không đưa nền neon, hạt lấp lánh hoặc
  model minh hoạ trong ảnh vào sản phẩm.
- Composer một dòng cao 52 pt, bo 26 pt: nút `+` tròn 36 pt, vùng nhập linh
  hoạt, model và thu âm chung một capsule, Gửi/Dừng là nút 36 pt riêng. Khi
  nhiều dòng, có ảnh hoặc vùng composer hẹp hơn 504 pt, hàng công cụ xuống
  dưới; giữ cùng editor, bản nháp, con trỏ và cơ chế IME. Trần vẫn là 5 dòng.
- Nút Gửi dùng `action` ở sáng, `action-active` ở tối và chữ `action-fg`;
  không phủ trắng làm nhạt màu nền nút chính. Nút chưa dùng được giữ trạng
  thái disabled gốc. Waveform tĩnh là nút thu âm sẵn có, không phải tính năng
  voice chat mới; lúc ghi âm vẫn dùng trạng thái Dừng/đang ghi thật.
- Mặt nhập và danh sách model đục để chữ giữ độ tương phản. Viền kính chỉ
  trang trí, không bắt chuột. Focus mặt nhập dùng caret và viền trung tính
  `border-strong`; nút vẫn có focus riêng. Reduce Transparency hoặc Increase
  Contrast dùng bề mặt đặc và viền rõ thay hiệu ứng mép sáng.
- Model đang dùng có một lớp kính sáng thường trực và dấu ✓. Hàng đang đi
  tới bằng bàn phím có viền riêng; hover, selected và disabled phân biệt.
  Model/tools/instructions của macOS dùng bề mặt bo 26 pt; mỗi hàng bo 16 pt.
  Qt giữ popup của ComboBox và cơ chế model hiện có, áp dụng cùng lớp sáng
  cho hàng chọn. Chưa coi đây là hoàn tất parity chức năng ModelPanel.
- Cấu trúc Chat giữ một composer và các bảng điều khiển đã chọn. Vật liệu
  nút đã mở rộng toàn app theo yêu cầu 2026-11-03; bản ghi vẫn dùng nền đọc
  ổn định, shell/Home cyan và các preset khác giữ hướng đã chọn.

Chi tiết phân tích và mức kiểm chứng nằm trong
[báo cáo Chat Glass](../migration/reports/native-migration-report-20261102-chat-glass.md).

## AI Chat: trạng thái trống và composer (chốt 2026-11-02, vòng 2)

- Chưa có tin nhắn và không có việc đang chạy: logo 48 pt (`hero`), câu "Chúng ta bắt
  đầu từ đâu?" (`headingScale`, không đậm) và composer đứng ở khoảng 40 % chiều
  cao vùng làm việc; dưới composer là "Tiếp tục": tối đa ba phiên gần nhất của
  mọi tính năng, hàng chữ lặng có icon và thời gian, bấm mở đúng phiên. Không
  bịa gợi ý: không có phiên thì không có danh sách.
- Composer một hàng khi bản nháp một dòng: [+] · chữ · model · mic · Gửi, cao
  một `control`; từ dòng thứ hai (hoặc có ảnh đính kèm) chữ lên trên, hàng nút
  xuống dưới. Nở theo nội dung tới `--vzn-composer-max-lines` (5) rồi cuộn
  bên trong. Enter gửi, Shift+Enter xuống dòng, ⌘↩ vẫn gửi; đang gõ IME (có
  marked text) thì Enter không gửi.
- Gửi tin đầu tiên: composer trượt xuống đáy (`durationNormal`), bản ghi
  hiện ở cột đọc; vẫn một bề mặt `chat-composer`.
- Bản ghi: lượt của người dùng là bong bóng co theo chữ, căn phải, rộng tối
  đa `--vzn-native-bubble-fraction` (0,75) cột đọc, nền `surface-muted`, bo
  `largeRadius`; câu trả lời là văn bản trần bên trái có nhãn "Viezan". Meta
  dưới câu trả lời đọc tên model ngắn như chip ("GPT-6.1 Sol · 109 token"),
  ID đầy đủ trong tooltip. Khung xem trước lịch sử dùng cùng bong bóng.
- Gợi ý theo thói quen tầng 2 (hành động lặp ≥ 3 lần trong 30 ngày, có suy
  giảm theo thời gian) và tầng 3 (giờ trong ngày) là việc còn mở.

## Chọn model (chốt 2026-11-02)

- Nút trong composer đọc tên ngắn suy từ ID (`ModelLineup.shortName`: "Sonnet
  5.5", "GPT-5.5 Mini", "GPT-6 Astra", "Gemini 3 Pro"; mọi từ sau phiên bản
  viết hoa chữ đầu như nhau; local giữ nguyên tên); khi đang bật suy luận kỹ
  chip đọc "Kỹ · GPT-6.1 Sol". Tooltip và nhãn trợ năng đọc ID đầy đủ. Không
  có danh mục tên viết tay. "GPT-6" giữ gạch nối theo cách viết của OpenAI.
- Bộ chọn là **một lớp nổi của shell** (`ModelPanel`, cùng cơ chế với Lịch sử
  nhanh và ⌘K: bề mặt đọc, bo 20, viền hệ thống, neo trên chip model trong
  composer, Escape đóng, focus trả về nút mở), không phải menu hệ thống. Ô
  tìm đứng đầu: gõ là lọc toàn bộ model chat của mọi nhà cung cấp (snapshot
  có ngày gộp, tối đa sáu mỗi nhà), gõ "provider:model" chưa có trong listing
  vẫn chọn được; ↑↓ di chuyển, Return chọn. Hàng đang dùng có dấu chọn; hàng
  "Thiết lập…" mờ.
- Nhóm, từ trên xuống: **Mục đích** (Nhanh · Cân bằng · Kỹ, mỗi mức là một
  model của nhà cung cấp hiện tại; thế hệ xếp trước cỡ: Kỹ là bản mới nhất
  trong các cỡ từ dòng chính trở lên kèm suy luận kỹ, không bao giờ là Pro cũ
  hơn bản đang dùng; Cân bằng là dòng chính mới nhất, Sonnet/GPT/Flash; Nhanh
  là cỡ nhỏ mới nhất, cùng thế hệ thì cỡ nhỏ nhất; ẩn khi nhà cung cấp local
  hoặc chỉ có một cỡ) · **Gần đây** (tối đa ba model của các phiên có
  nội dung mới nhất, tên ngắn, bỏ model đã có trong Mục đích) · một nhóm cho
  mỗi nhà cung cấp cloud với **một model mỗi cỡ** (tối đa bốn, mạnh nhất
  trước; dòng chính GPT thắng dòng o cùng cỡ; loại model không phải chat và
  bí danh "latest"; bản có ngày thua bản không ngày; ID có tên mã như
  `gpt-6-astra` đọc thành "GPT-6 Astra" và vẫn xếp theo phiên bản) · **Trên
  máy** liệt kê model đã cài. Không có submenu hay danh sách thô. Nhà cung
  cấp chưa có khoá hay runtime chưa chạy hiện một dòng "Thiết lập…" mở Cài
  đặt, không ẩn. Chân panel: Tải lại model, Cấu hình model.
- Còn mở: ghim model; phím tắt mở panel.
- **Mọi dropdown trong AI Chat là lớp nổi của shell, không dùng menu hệ
  thống.** Nút "+" mở panel công cụ (`ComposerToolsPanel`, cùng bề rộng 376
  pt, neo và phím như panel model): bốn nhóm ngăn bằng vạch hairline, không
  tiêu đề nhóm: Đính kèm ảnh · Chụp màn hình · Trích chữ (icon; mờ khi hết
  chỗ ảnh) | AI Chat · Tìm kiếm trên web · Nghiên cứu sâu · Tạo hình ảnh (dấu
  chọn, mô tả ngắn bên phải, Tạo ảnh ghi nhà cung cấp sẽ vẽ) | Suy luận cẩn
  thận (hàng có công tắc) | Nghe · Dừng đọc. Nhà cung cấp nhận dạng giọng nói
  chỉ ở Cài đặt › Giọng nói. Panel ôm sát nội dung, không cuộn ở cỡ cửa sổ
  thường; khi mở lên trên thì mép dưới tựa vào nút, mở xuống thì mép trên.
- Lớp nổi và sidebar không hiện thanh cuộn kiểu cũ (rãnh dày khi macOS đặt
  "luôn hiện thanh cuộn"): `scrollIndicators(.hidden)`, bánh xe vẫn cuộn;
  composer quá trần dòng dùng thanh cuộn mỏng overlay.
- Lịch sử nhanh: chỉ phiên có nội dung (tin nhắn, kết quả hoặc bản nháp),
  mỗi phiên một hàng hai dòng cố định: tiêu đề + thời gian tương đối ở mép
  phải, dưới là một dòng mờ (lượt trao đổi gần nhất, bản nháp, hoặc tên
  model; "Đang xử lý" khi đang chạy). Phiên hiện tại: dấu chọn mảnh ở đầu
  hàng và tiêu đề semibold, không nền hay chữ màu nhấn; highlight bàn phím là
  `surface-hover`. Chân panel "Xem tất cả lịch sử →" là nút lặng. Cùng hàng
  này dùng trong thư viện lịch sử. Hàng: dòng một chỉ tiêu đề; dòng hai là
  dòng mờ và thời gian ở mép phải; danh sách nhiều tính năng hiện icon tính
  năng ở đầu hàng.
- Thư viện lịch sử (AI Chat → Lịch sử → Xem tất cả): bộ lọc Tất cả · AI Chat
  · Dịch · Từ điển (mở ở tính năng đang đứng), rồi Lịch sử · Đã lưu trữ; danh
  sách theo lần cập nhật mới nhất, không có phiên trống. Khung xem trước là
  cuộc trao đổi theo cột đọc (lượt người dùng trên nền `surface-muted` như
  bản ghi), đầu khung: tiêu đề, dòng meta "model · thời gian · n lượt", hàng
  nút lặng Đổi tên · Xuất JSON · Lưu trữ · Xoá, và "Mở lại" là nút chính bên
  phải. Xoá không hỏi: toast Hoàn tác vài giây (cả phiên đã lưu trữ). Phím:
  ↑↓ chọn, Return mở, ⌫ xoá, Escape về trang. Mở phiên của tính năng khác
  thì chuyển sang tính năng đó.
- Danh sách thư viện rộng 376 pt (`sidebar + editor`) khi cửa sổ đủ rộng,
  nhóm theo Hôm nay · Hôm qua · Tuần này · Cũ hơn (`HistoryBucket`); tab lọc
  không bao giờ gãy dòng. Hàng phiên Dịch/Từ điển: dòng hai là kết quả, hoặc
  cặp ngôn ngữ khi chưa có, không in lại nguyên bản; khung xem trước của
  phiên Dịch cắt tiêu đề còn một dòng và meta ghi "model · Tiếng Anh → Tiếng
  Việt · thời gian". Tiêu đề phiên có ảnh lấy tên ảnh, không lấy đường dẫn.
- Chỉ dẫn cho phiên (hướng dẫn hệ thống) là lớp nổi `InstructionsPanel`,
  mở từ hàng "Chỉ dẫn cho phiên" trong nhóm Suy luận của panel "+", neo cùng
  nút "+": ô soạn nhiều dòng (font đọc, nền/viền như ô tìm, tới tám dòng), áp
  dụng tức thì khi gõ, không có nút Áp dụng; dưới là "Chỉ dẫn đã lưu" bằng
  hàng có dấu chọn ở chỉ dẫn đang áp dụng, "Lưu thành chỉ dẫn mới…" mở ô tên
  tại chỗ, "Xoá chỉ dẫn đã lưu" có Hoàn tác. Hàng trong panel "+" ghi tên chỉ
  dẫn đang dùng; "+" ở trạng thái chọn khi phiên có chỉ dẫn. Không còn
  popover "Cấu hình model" hay ô nhập ID model (ô tìm của panel model nhận ID
  gõ tay).
- Dữ liệu: tạo "Chat mới" dọn các phiên trống trước đó của cùng tính năng;
  tiêu đề nhập từ bản cũ bị đọc sai bảng mã ("Gi·∫£i th√≠ch") được sửa một
  lần lúc nạp (`TextRepair`).
- Một ô tìm duy nhất cho cả app (`SearchBox`: kính lúp của app, chữ trần
  trên nền `surface-subtle`, bo `controlRadius`, viền hairline `border` và
  `border-strong` khi đang nhập, không vòng focus hệ thống; cao một `control`,
  trong header là `compactControl`). Lịch sử nhanh, thư viện, lịch sử Phiên
  dịch, chọn model, ⌘K và Cài đặt dùng chung. "Tìm ⌘K" ở sidebar là nút
  mở bảng lệnh; preset Glass dùng capsule hoặc nút tròn khi thu gọn.
  Hàng composer không
  thêm chip cho chế độ hay suy luận: chế độ Web/Nghiên cứu/Tạo ảnh đổi
  placeholder ("Tìm trên web rồi trả lời…") và nút "+" sang trạng thái chọn;
  suy luận kỹ đọc trên chip model; lỗi đính kèm là toast, không có biểu tượng
  cảnh báo trong hàng. Chân panel model chỉ
  còn "Tải lại model" (một nút, làm mới mọi nhà cung cấp) và "Cấu hình
  model". Hàng của mọi panel dùng chung `PanelRow`. Menu hệ thống còn lại chỉ
  ở Dịch (chọn ngôn ngữ, loa) và thanh menu app; chuyển sau.

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
đến [native-code-57](../migration/native-implementation/native-code-57.md), mỗi báo cáo có mục "Còn lại";
[native-code-58](../migration/native-implementation/native-code-58.md) chốt lại nút thu gọn và rail sau
khi người dùng loại hướng cũ; [native-code-59](../migration/native-implementation/native-code-59.md) làm
lại trạng thái trống và composer AI Chat; [native-code-60](../migration/native-implementation/native-code-60.md)
rút gọn menu chọn model theo mục đích, gần đây và dòng mới nhất. Còn mở ở AI Chat: gợi ý theo thói quen tầng 2 và 3, menu "+"
có mô tả từng chế độ, mức nỗ lực suy luận nhiều bậc.
Tổng hợp: Qt trên Windows/Linux (làm khi có máy Windows); các luồng cần API hoặc phần cứng thật để chạy
(so sánh model, nghiên cứu web, tổng hợp phiên dịch, tải và đo model local, helper quạt, bản cập nhật mới);
nghiệm thu trợ năng (VoiceOver, ba cỡ chữ, 640 pt); cài đặt cập nhật tại chỗ.
