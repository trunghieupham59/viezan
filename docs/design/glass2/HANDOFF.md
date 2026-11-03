# Bàn giao thiết kế Liquid Glass 2.0 (2026-11-03)

Tài liệu này là đầu vào duy nhất cho agent (Claude Code, Codex) khi triển khai
bản thiết kế mới của Viezan trên macOS. Đọc theo thứ tự: `AGENTS.md` →
`.claude/rules/ui-ux.md` → `docs/design/direction.md` → tài liệu này → board
của đợt đang làm.

Canvas gốc (riêng tư, chỉ chủ tài khoản mở được):
<https://claude.ai/artifact/A39txAordDuiSCrtznFhrQ>. Mọi thứ cần thiết đã
được chép vào thư mục này, agent không cần mở canvas.

## 1. Nguồn trong thư mục này

| Đường dẫn | Vai trò |
| --- | --- |
| `boards/*.dc.html` | **Nguồn hình có số đo.** Mỗi board là một file HTML tự chứa; mọi màu, bo góc, bóng, blur, cỡ chữ, khoảng cách đều là giá trị literal trong `style` hoặc trong khối `<style>` của file. Lấy giá trị từ đây, không ước lượng từ ảnh. |
| `boards/*.png` | Ảnh render 1x của board tương ứng, dùng để đối chiếu bằng mắt và làm chuẩn nghiệm thu. |
| `boards/canvas.json` | Danh sách board, kích thước và tiêu đề. |
| `kit.css` | Bộ class dùng chung của các board (`.glass`, `.pane`, `.content`, `.float`, `.card`, `.field`, `.btn`, `.seg`, `.lens`, `.bubble`, `.composer`…). Đây là "từ điển vật liệu": mỗi class ánh xạ sang một thành phần NativeKit (bảng ở mục 3). |
| `Sidebar.dc.html` | Component sidebar, có logic hiển thị trạng thái mở rộng / rail / tối. Trong board màn hình, sidebar được nhúng bằng `<dc-import name="Sidebar" …>`; PNG đã render sẵn. |

Giá trị trong `resources/tokens.css` (preset `glass`, sáng và tối) đã được cập
nhật theo `kit.css` ngày 2026-11-03 và `native.json` đã sinh lại. Khi board và
token lệch nhau, **token thắng**; sửa board nếu cần, không sửa token theo board
mà không ghi lại.

## 2. Hướng thiết kế: cảnh ba lớp

1. **Nền** (`.win`): gradient 150° champagne `#EADFCF` → taupe `#C8B8AB` →
   lavender-slate `#9896AE` → xám thép `#B3BFCC`, quầng kem ở góc trên-trái,
   quầng thép ở góc dưới-phải. Token `--vzn-app-backdrop`. Không ảnh nền,
   không hạt, không motion.
2. **Mặt đọc** (`.content`): một pane trắng ấm 82 % + blur 30, bo 22, viền sáng
   1 px, bóng 18/48 px 10 %. Token `--vzn-canvas`. Chữ chỉ đứng trên mặt này.
   Bên trong chỉ còn thẻ phẳng (`.card`, viền hairline 8 %, bo 16) và vạch ngăn;
   **không lồng thêm pane bo góc**.
3. **Kính** (`.glass`, `.pane`, `.float`): sidebar, nút header, composer, bộ
   lọc, chip model, lớp nổi. Fill trắng 68→40 % nghiêng 135°, blur 18, viền
   sáng 1 px `rgba(255,255,255,.70)`, highlight trong 1 px, bóng
   `0 1px 1px 5 %` + `0 6px 18px 8 %`. Lens (đang chọn) fill 92→72 %.

Màu: chữ `#2A2622` / `#3F3A35` / phụ `#6F675F` / mờ `#7A7167`; nhấn
lavender-indigo `#5A5FA3` (tối `#A6AAEE`) chỉ cho *đang chọn · tạo mới · gửi ·
link*; đỏ `#C4473F` chỉ cho *dừng · xoá · đặt lại*. Chữ SF Pro theo thang
foundations: 22 / 18 / 16 / 15 / 14 / 13 / 12 / 11. Nhịp 4 · 8 · 12 · 16 · 24.
Chiều cao: 28 chip · 32 header và hàng công cụ · 36 form, nút gửi · 52
composer · 48 hàng cài đặt · 52 hàng danh sách.

Hai preset khác (Graphite, Paper, Corporate, Midnight) **không đổi**.

## 3. Từ điển vật liệu → NativeKit

| Class trong board | Thành phần native | Ghi chú |
| --- | --- | --- |
| `.win` | `WorkbenchView` nền cửa sổ | Vẽ `--vzn-app-backdrop`; macOS 26+ để vật liệu cửa sổ lộ qua. |
| `.pane` (sidebar) | `NativeNavigation` pane | Lề 8, bắt đầu dưới hàng 48, bo 22, rộng 236 / rail 68. `NSGlassEffectView` khi có, fallback material. |
| `.content` | workspace `WorkspacePage` | Lề trái 12 sau sidebar, lề phải 12, đáy 8, bo 22. |
| `.btn.glass` | `ShellToolbarButton` / `.vznOutline` | Pill 32, kính. |
| `.btn.glass.tint` | nút "Tạo mới" ở header | Chữ màu nhấn trên kính. |
| `.btn.primary` | `.vznPrimary` | Gradient 180° `#7B7FC6 → #5A5FA3`, chữ trắng, bóng nhấn 6/16. |
| `.btn` (không glass) | `.vznQuiet` | Trong suốt, hover thành kính. |
| `.btn.danger` | role `.destructive` | Chữ đỏ; nút đỏ đặc chỉ trong hộp thoại xác nhận. |
| `.seg` + `.on` | `FilterTabs` | Rãnh lõm 6 %, pill chọn là lens. |
| `.field` | `SearchBox`, ô nhập | Trắng 62 % lõm, viền 10 %, khi gõ 18 %, caret là chỉ báo chính, không vòng nhấn. |
| `.lens` | hàng đang chọn (nav, lịch sử, picker) | Không đổi màu chữ, chỉ semibold. |
| `.float` | `NativePanel` (⌘K, Hoạt động, Lịch sử nhanh, ModelPanel, picker) | Trắng 88 % + blur 40, bo 20, bóng 24/64 22 %. |
| `.bubble` | lượt người dùng trong transcript | `surface-muted` 6 %, bo 18/18/6/18, tối đa 75 % cột. |
| `.composer` | composer Chat | Capsule 52, trắng 92 %, viền sáng, bóng 12/32; nhóm model+mic là một kính 36 bên trong; Gửi là nút tròn 36. |
| `.card` + `.srow` | `CardSection` + `CardRow` | Hàng 48, nhãn 14, mô tả 12, vạch ngăn sát mép. |
| `.kbd` | `KeyCap` | 20 pt, mono 11. |
| `.chip` | `StatusBadge` | 24 pt, màu ngữ nghĩa luôn kèm chữ. |
| `.tog` | `Toggle` hệ thống | Giữ control hệ thống, chỉ đổi màu nhấn. |

## 4. Quyết định mới (đã ghi trong `docs/design/findings.md`)

- Bảng màu Glass đổi từ cyan sang champagne / taupe / lavender / thép; nhấn
  lavender-indigo. Bong bóng người dùng là trung tính, không gradient nhấn.
- Hộp thoại chặn (cập nhật, ghi phím tắt, xoá khoá, dọn lịch sử, xoá model, đo
  hiệu năng) nằm **giữa cửa sổ**, bo 18, nền phủ 22 %. Không dùng sheet treo
  mép trên.
- Thư viện lịch sử: "Phiên đã lưu trữ" là nút bật tắt cạnh ô tìm, lọc tại chỗ;
  khung xem trước đổi Lưu trữ → Khôi phục và Xoá → Xoá vĩnh viễn (có xác nhận).
- Cài đặt bỏ mục "Launcher & phím tắt"; mục Chung có hàng "Phím tắt toàn cục"
  dẫn sang trang ở sidebar. Trang sidebar là nơi duy nhất ghi phím tắt.
- So sánh mô hình: bấm "So sánh" mở bước chọn model (checkbox theo nhóm, model
  đang dùng khoá làm cột đầu, tối đa 4) rồi mới chạy; bảng kết quả có nút "Đổi
  model". Lần sau nhớ bộ đã chọn.
- Menu hệ thống còn lại ở Dịch / Từ điển / Phiên dịch (ngôn ngữ, loa, tuỳ chọn
  dịch, thiết lập phiên dịch) chuyển sang lớp nổi của shell như ModelPanel.
- Sidebar mở rộng giữ một hàng "Phím tắt toàn cục · n" trong nhóm chân; rail
  dùng chấm trên icon.
- Cửa sổ nổi hẹp hơn 400 pt: meta và nút không chung một hàng.

## 5. Từng màn hình

Mỗi mục: board → thay đổi so với bản dựng hiện tại → giữ nguyên → nghiệm thu.
"Bản dựng hiện tại" là develop tại commit `682a43f`.

### Shell (`Foundations`, `Sidebar`, mọi board 1280×800)
- Đổi: nền gradient; sidebar là pane kính mờ trắng; mục chọn là lens, icon màu
  nhấn, chữ semibold; ô tìm là capsule lõm; chân sidebar gồm nhóm "Đang chạy
  nền" + vạch + "Lịch sử lưu trên thiết bị". Header: breadcrumb tại x = mép mặt
  đọc + 16; khi rail, breadcrumb lùi sau nút thu gọn 12 pt. Nút header là pill
  kính 32, "Tạo mới" là tint, vạch ngăn trước "Hoạt động"; badge số việc chạy.
- Giữ: thứ tự route, breakpoint 900, 236/68, hàng 48, vị trí nút thu gọn, ⌘ phím.
- Nghiệm thu: `Home.png`, `Translate-Compact.png` (rail), `Chat-Dark.png`.

### Trang chủ (`Home`)
- Đổi: intro + chip trạng thái model (một dải kính, nút Quản lý lặng) + "Tạo
  mới" chính trên cùng một hàng; Bắt đầu nhanh là 4 ô kính 56 có itile màu
  tone; Gần đây là danh sách phẳng vạch ngăn, bộ lọc là `.seg` bên phải nhãn
  nhóm; không còn thẻ bao quanh lưới và không còn card model bên phải.
- Giữ: dữ liệu, bộ lọc, hành vi mở lại phiên, "Đang diễn ra" khi có.

### AI Chat (`Chat-Empty`, `Chat-Active`, `Chat-Dark`, `Overlays`)
- Đổi: composer trắng 92 % capsule 52; nhóm model+mic là một kính; Gửi tròn
  36 màu nhấn; bong bóng trung tính; meta chip "Haiku 5.5 · n token" 22 pt;
  nhãn "✦ Viezan" 12 semibold. Lớp nổi (⌘K, Hoạt động, Lịch sử nhanh, chọn
  model, "+") dùng `.float`, hàng 40, nhóm caps 11.
- Giữ: toàn bộ hành vi composer, IME, panel model/tools/instructions, danh
  sách lệnh ⌘K, toast.

### Thư viện lịch sử (`History`, `History-Archived`)
- Đổi: cột 376 với seg tính năng, ô tìm + nút "Lưu trữ" bật tắt; hàng hai
  dòng, chọn là lens; khung xem trước: tiêu đề 18, meta, hàng nút lặng + "Mở
  lại" chính bên phải, vạch, transcript.
- Giữ: phím ↑↓ ↩ ⌫ Esc, nhóm Hôm nay / Hôm qua / Tuần này / Cũ hơn, Hoàn tác.

### Dịch (`Translate`, `Translate-Compact`, `Overlays-Language`)
- Đổi: hàng ngôn ngữ dùng pill kính "Đầu vào · Tiếng Anh ▾"; pane nguyên bản là
  `.field` bo 16, pane bản dịch phẳng; footer 52 với Dịch văn bản chính kèm
  keycap ⌘↩; So sánh, Nghe, Sao chép là kính. Picker ngôn ngữ, Tuỳ chọn dịch,
  menu Nghe, So sánh mô hình (2 bước) là lớp nổi của shell. Cửa sổ hẹp: hai
  pane xếp dọc, header icon-only.
- Giữ: đếm ký tự và cảnh báo 5 000, ảnh, lịch sử, auto-dịch.

### Phiên dịch (`Interpret`, `Interpret-Summary`, `Overlays-Interpret`)
- Đổi: thanh phiên có chip "Đang nghe · mm:ss", level meter 7 vạch, "Phụ đề
  nổi" kính, Dừng đỏ; cột bản ghi với hàng mốc giờ mono + người nói + nguyên
  bản 13 mờ + bản dịch 14; panel phải 280 gồm "Phiên này" (Tổng hợp nội dung
  chính), "Bản ghi của bạn", "Các phiên trước". Thẻ Tổng hợp có tab ở đầu cột
  bản ghi khi phiên dừng; menu ✦, Xuất, popover lịch sử, phụ đề nổi tối 78 %.
- Giữ: toàn bộ luồng thu âm, nguồn âm thanh, quyền, Undo.

### Từ điển (`Dictionary`)
- Đổi: ô tra 36 + ô ngữ cảnh 32 xếp dọc, "Tra từ" chính bên phải; kết quả trong
  cột 760: headword 28, hàng phiên âm + chip + loa + Dịch / AI Chat kính; seg
  Ý nghĩa / Ví dụ; nghĩa đánh số 01 02 mono; thẻ Ví dụ.
- Giữ: giới hạn 120 / 500 ký tự, Từ đã lưu, bàn giao sang Dịch / Chat.

### Trang hệ thống (`Everywhere`, `Apps`, `Thermal`, `Shortcuts`, `Shortcuts-Recorder`)
- Đổi: intro 22 + câu mục đích; thẻ `.card` với `.srow`; chip trạng thái; Ứng
  dụng có danh sách 320 + kế hoạch có checkbox và nút đỏ đặc; Nhiệt độ có 3
  tile số liệu + thẻ điều khiển + thẻ cảm biến; Phím tắt có hộp thoại ghi phím
  giữa cửa sổ.
- Giữ: mọi hành vi helper, quyền, nhật ký hoàn tác, mặc định chọn tệp.

### Cài đặt (`Settings-*`, `Overlays-Settings`)
- Đổi: cột mục 292 với lens; 9 mục (bỏ Launcher & phím tắt); mỗi mục intro 22 +
  thẻ một cột; picker là lớp nổi của shell; hộp thoại xác nhận giữa cửa sổ;
  tìm trong Cài đặt thả kết quả dưới ô tìm; dưới 760 cột mục thành picker.
- Giữ: mọi hàng và hành vi theo `NativeSettings.swift`; Keychain; sao lưu.

### Cửa sổ phụ (`Launcher`, `QuickChat`, `QuickTranslate`, `UpdateSheet*`)
- Đổi: Launcher 720 kính trắng 84 %, ô tìm 60 chữ 18, nhóm caps, hàng 44, chân
  36 với hint phím; Quick AI 480 với thẻ lượt hỏi và chân model; Dịch nhanh thẻ
  352 với meta một dòng và hàng nút riêng; cập nhật là hộp thoại giữa cửa sổ 520
  với ba trạng thái.
- Giữ: phím tắt, vị trí 22 % từ đỉnh, ẩn khi mất focus, luồng cập nhật.

## 6. Thứ tự triển khai và prompt sẵn dùng

Làm **đúng thứ tự 1 → 7**, mỗi đợt một phiên agent mới, không gộp. Đợt sau
dựa vào thành phần của đợt trước (style chung ở Đợt 1, lớp nổi shell ở Đợt 2,
hộp thoại chặn ở Đợt 2/4). Chỉ chuyển đợt khi anh/chị đã xem báo cáo và ảnh
đối chiếu của đợt trước và hài lòng.

| # | Đợt | Điều kiện bắt đầu | Xong khi |
| --- | --- | --- | --- |
| 1 | Tokens và shell | develop sạch, test xanh | Sidebar, header, nền khớp Home.png |
| 2 | Trang chủ, AI Chat, lớp nổi shell, lịch sử | Đợt 1 duyệt | Chat-*, History-*, Overlays khớp |
| 3 | Dịch, Từ điển, Phiên dịch | Đợt 2 duyệt | Translate*, Dictionary, Interpret* khớp |
| 4 | Trang hệ thống | Đợt 3 duyệt | Everywhere, Apps, Thermal, Shortcuts* khớp |
| 5 | Cài đặt | Đợt 4 duyệt | Settings-*, Overlays-Settings khớp |
| 6 | Cửa sổ phụ và cập nhật | Đợt 5 duyệt | Launcher, QuickChat, QuickTranslate, UpdateSheet* khớp |
| 7 | Qt | Đợt 6 duyệt, có máy Windows/Linux | QtTest xanh, ảnh đối chiếu |

Copy nguyên khối prompt của đợt đang làm; không cần sửa gì.

### Đợt 1 · tokens và shell

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: git status chỉ có thay đổi của gói bàn giao; `swift test` xanh trước khi sửa.

Việc: triển khai Đợt 1 của Liquid Glass 2.0 trên macOS — tokens và shell.
Nền cửa sổ gradient, sidebar pane kính (mở rộng, rail, overlay hẹp), mục chọn
lens, header pill kính và vị trí breadcrumb, mặt đọc một pane, và các style
chung: .vznPrimary / .vznOutline / .vznQuiet, FilterTabs, SearchBox, CardSection
+ CardRow, KeyCap, StatusBadge, NativePanel (lớp nổi). Chưa sửa nội dung từng màn.

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
Foundations, Sidebar, Home, Translate-Compact, Chat-Dark

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
NativeKit.swift, NativeFoundation.swift, ViezanApp.swift, InsetInputSurface.swift

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```
### Đợt 2 · Trang chủ, AI Chat, lớp nổi shell, thư viện lịch sử

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: báo cáo Đợt 1 tồn tại và shell đã khớp Home.png ở phần sidebar / header / nền.

Việc: triển khai Đợt 2 của Liquid Glass 2.0 trên macOS — Trang chủ, AI Chat, lớp nổi shell, thư viện lịch sử.
Bố cục Trang chủ mới, composer và transcript Chat, ⌘K / Hoạt động / Lịch sử
nhanh / chọn model / menu +, toast, thư viện lịch sử với nút Lưu trữ lọc tại
chỗ (Khôi phục, Xoá vĩnh viễn có xác nhận giữa cửa sổ).

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
Home, Chat-Empty, Chat-Active, Chat-Dark, History, History-Archived, Overlays

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
HomeWorkspace.swift, Workspaces.swift (phần Chat), ComposerPanels.swift, ModelPanel.swift,
ResearchPanel.swift, HistorySearch.swift, các view lịch sử, NativeToasts.swift

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```
### Đợt 3 · Dịch, Từ điển, Phiên dịch

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: báo cáo Đợt 2 tồn tại; lớp nổi shell (NativePanel) đã dùng được cho picker.

Việc: triển khai Đợt 3 của Liquid Glass 2.0 trên macOS — Dịch, Từ điển, Phiên dịch.
Hàng ngôn ngữ, hai pane Dịch, picker ngôn ngữ / Tuỳ chọn dịch / menu Nghe là
lớp nổi shell, So sánh mô hình hai bước (chọn model rồi chạy, nhớ bộ đã chọn),
Từ điển, Phiên dịch với thẻ Tổng hợp có tab, menu ✦, Xuất, các phiên trước,
phụ đề nổi.

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
Translate, Translate-Compact, Dictionary, Interpret, Interpret-Summary,
Overlays-Language, Overlays-Interpret

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
Workspaces.swift (phần Dịch / Từ điển), ComparisonPane.swift, ImageControls.swift,
InterpretationWorkspace.swift, DictionaryResultView

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```
### Đợt 4 · trang hệ thống

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: báo cáo Đợt 3 tồn tại.

Việc: triển khai Đợt 4 của Liquid Glass 2.0 trên macOS — trang hệ thống.
Dịch mọi nơi, Ứng dụng, Nhiệt độ & quạt, Launcher & phím tắt, hộp thoại ghi
phím tắt giữa cửa sổ (dùng chung thành phần hộp thoại chặn).

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
Everywhere, Apps, Thermal, Shortcuts, Shortcuts-Recorder

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
DesktopWorkspace.swift, ApplicationsWorkspace.swift, ThermalWorkspace.swift, DesktopPanels.swift

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```
### Đợt 5 · Cài đặt

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: báo cáo Đợt 4 tồn tại; hộp thoại chặn giữa cửa sổ đã có từ Đợt 2 hoặc 4.

Việc: triển khai Đợt 5 của Liquid Glass 2.0 trên macOS — Cài đặt.
Cột mục 292 với 9 mục, hàng "Phím tắt toàn cục" trong Chung dẫn sang trang
sidebar, picker là lớp nổi shell, hộp thoại xác nhận, đo hiệu năng, tìm trong
Cài đặt, picker mục dưới 760. Cập nhật spec docs/design/screens/settings.md.

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
Settings-General, Settings-Appearance, Settings-Models, Settings-Local, Settings-Speech,
Settings-Modules, Settings-Data, Settings-Update, Settings-About, Overlays-Settings

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
NativeSettings.swift và các *Settings.swift; apps/macos/Sources/ViezanDomain/Resources/native.json
chỉ qua resources + `npm run resources` (bỏ section shortcuts)

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```
### Đợt 6 · cửa sổ phụ và cập nhật

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: báo cáo Đợt 5 tồn tại.

Việc: triển khai Đợt 6 của Liquid Glass 2.0 trên macOS — cửa sổ phụ và cập nhật.
Launcher, Quick AI, Dịch nhanh (meta và nút không chung hàng dưới 400 pt),
hộp thoại cập nhật giữa cửa sổ với ba trạng thái.

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
Launcher, QuickChat, QuickTranslate, UpdateSheet, UpdateSheet-States

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
Launcher.swift, LauncherChat.swift, QuickTranslate.swift, DesktopPanels.swift (QuickSessionPanel),
view của update prompt

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```
### Đợt 7 · Qt (Windows / Linux)

```
Đọc AGENTS.md, .claude/rules/ui-ux.md, docs/design/direction.md và
docs/design/glass2/HANDOFF.md (mục 2, 3, 4, và mục 5 của các màn bên dưới).

Kiểm tra trước: Đợt 1–6 xong trên macOS; có máy Windows hoặc Linux để chạy thử.

Việc: triển khai Đợt 7 của Liquid Glass 2.0 trên macOS — Qt (Windows / Linux).
Ánh xạ cùng bảng ở mục 3 sang Kit.qml; kính là mặt bán trong + phản sáng trong
scene, không tuyên bố blur desktop. Chạy QtTest theo CONTRIBUTING.md.

Board (đọc cả .dc.html và .png trong docs/design/glass2/boards/):
toàn bộ board, theo thứ tự Đợt 1 → 6

File được sửa (apps/macos/Sources/ViezanNative/ trừ khi ghi khác):
apps/desktop-qt/qml/* và apps/desktop-qt/tests/*

Luật chung cho đợt này:
- Lấy số đo, màu, bo góc, bóng từ resources/tokens.css (preset glass, đã
  cập nhật) và từ file HTML của board; không tự chọn giá trị khác, không đổi
  preset Graphite / Paper / Corporate / Midnight.
- Chỉ sửa các file liệt kê ở trên; cần đụng file khác thì dừng và hỏi.
  Không đổi hành vi, dữ liệu, dịch vụ, route, phím tắt hay chuỗi đã có.
- Chuỗi mới thêm vào resources/locales/{vi,en,ja}.json rồi chạy
  `npm run resources`; giữ cả hai native.json đồng bộ.
- Chạy `swift build` và `swift test` trong apps/macos, dán tổng kết nguyên văn.
- Nghiệm thu: chụp app ở 1280×800 và 820×640, sáng và tối, đặt cạnh PNG của
  từng board; liệt kê mọi chênh lệch còn lại kèm lý do.
- Thêm một báo cáo docs/migration/reports/native-migration-report-<ngày>-glass2-dot<n>.md.
- Không commit. Dừng và báo cáo khi xong đợt.
```

## 7. Tiêu chí hoàn thành chung

- `swift build`, `swift test` xanh; `npm run check:resources` xanh.
- Reduce Transparency / Increase Contrast: mọi kính thành bề mặt đặc, viền rõ.
- Chữ phụ đạt 4,5:1 trên mặt đọc; chữ trắng trên nút nhấn đạt 4,5:1.
- Focus bàn phím là vòng riêng 2 px màu nhấn, không trùng trạng thái chọn.
- Ba cỡ chữ, EN/VI/JA không gãy header một hàng ở 1280.
- Cửa sổ 640×480 không tràn ngang.
