# Native code 39 — Review 18 UI/UX trên SwiftUI và Qt

Ngày: 2026-10-27. Nguồn thiết kế: prototype Desktop Review 18
(`docs/migration/desktop-review/`), người dùng chọn làm chuẩn. Lượt này build,
chụp ảnh từng màn native, đối chiếu với prototype rồi sửa chênh lệch.

## Thay đổi

| Phần | macOS (SwiftUI) | Windows/Linux (Qt) |
| --- | --- | --- |
| Bộ thành phần chung | `NativeKit.swift`: PageIntro, Eyebrow, CardSurface/CardSection, CardRow, KeyCap, StatusBadge, LanguageMenu, AdaptiveColumns, CardGroupBoxStyle | `qml/Kit.qml`: PageIntro, Eyebrow, SectionTitle, Card, CardBox, CardRow, KeyCap, StatusDot/Badge, PrimaryButton, IconButton, Columns |
| Điều hướng chính | Một danh sách làm việc, nhóm HỆ THỐNG kết thúc bằng Cài đặt; chân "Lưu trên thiết bị" | Như macOS; nút tìm kiếm dùng nhãn "Tìm kiếm" |
| Header | Breadcrumb "Không gian làm việc / Trang" cho trang hệ thống; Lịch sử + Tạo mới (soft) + vạch ngăn + Hoạt động; Launcher trên trang hệ thống; bỏ nút tìm trùng sidebar | Như macOS; sửa lỗi Trang chủ hiện "AI Chat / Chat mới" |
| Trang chủ | Không gian làm việc + Tạo mới; Đang diễn ra; Gần đây có bộ lọc; Bắt đầu nhanh; trạng thái Ollama + Quản lý | Như macOS |
| AI Chat | Composer một hàng: ＋ đính kèm, menu model, mic, menu tùy chọn (chế độ, suy luận, giọng đọc), Gửi; placeholder; chip ảnh | Như macOS |
| Dịch | Hàng Đầu vào ⇄ Đầu ra + model; hai panel ghép; header kiểu dịch; chân panel có Dịch văn bản, So sánh, nghe, sao chép | Như macOS |
| Từ điển | Ô tra cứu một dòng (Return gửi, bỏ qua IME), ngữ cảnh, kết quả đánh số, Lưu từ | Panel tra cứu cùng bố cục Dịch, nút Lưu từ |
| Phiên dịch | Hàng ngôn ngữ, thanh phiên (Đang nghe, nguồn âm thanh, Phụ đề nổi, Bắt đầu/Dừng), thanh Bản ghi (song ngữ, Tổng hợp, Lịch sử, Xuất), dòng thời gian + người nói | Như macOS (tổng hợp vẫn ở chân trang) |
| Dịch mọi nơi / Launcher | Tiêu đề trang, hai cột thẻ; hàng phím tắt có KeyCap + công tắc; thẻ Launcher | Như macOS; Qt giữ ô nhập phím tắt trong hàng |
| Ứng dụng | Danh sách + chi tiết dạng thẻ, biểu tượng app, Nhật ký & hoàn tác dạng popover | Danh sách + chi tiết; chỉ Mở/Hiện tệp/Cài đặt hệ thống (không gỡ) |
| Nhiệt độ & quạt | Ô số đo (cảm biến nóng nhất, từng quạt), thẻ Điều khiển quạt + hồ sơ, thẻ Cảm biến | Ô số đo và thẻ chỉ đọc; không có điều khiển quạt giả |
| Cài đặt | Điều hướng có biểu tượng, nhóm TÙY CHỈNH / ỨNG DỤNG; GroupBox thành thẻ | Nhóm TÙY CHỈNH / ỨNG DỤNG; GroupBox thành thẻ |

Chuỗi mới có đủ VI/EN/JA trong `src/i18n/locales/*.ts` (`nativePreview`).
`generate-resources.mjs` thêm tỷ lệ cỡ chữ (`captionScale`, `sectionScale`,
`titleScale`, `displayScale`) tính từ `--vzn-font-size-*`, và ánh xạ placeholder
`translate_placeholder`, `dictionary_term_placeholder`. Không thêm màu hay khoảng
cách literal. Tiêu đề phiên Từ điển chưa đặt tên đổi thành "Tra cứu mới".

## Lượt 2 — đối chiếu đo đạc (cùng chế độ tối, cùng khung)

Người dùng báo UI chưa giống. So sánh lại prototype và native ở cùng chế độ,
đo bằng `getBoundingClientRect`/`getComputedStyle`, và đọc CSS nền tảng của
prototype (`macos-material-v6.css`, `platforms.css`). Sửa:

- **Khung cửa sổ:** bỏ dải titlebar riêng. macOS: đèn giao thông và nút thu gọn
  nằm trong hàng đầu sidebar (container titlebar được nới để căn giữa), header
  48 pt thẳng hàng. Qt: header chuyển vào cột nội dung, sidebar chạy hết chiều
  cao, nút thu gọn ở góc trên sidebar; ở rail nút này dẫn đầu header.
- **Hai lớp màu (macOS):** điều hướng/header dùng vật liệu Glass
  (`primary-nav-material`, `titlebar-material`, `material-border`, `chrome-fg`)
  trên vibrancy thật (`NSVisualEffectView` behind-window; Reduce Transparency về
  màu đặc); nội dung dùng bảng Graphite như prototype (`contentColor`).
- **Nút:** `VznButtonStyle` (viền / chính / nhẹ) thay `.bordered` tô xám của AppKit;
  header dạng pill 32 pt. Qt: nút header nhẹ, không viền (Windows/Linux).
- **Chữ và khoảng cách:** tỷ lệ cỡ chữ từ token (`headingScale` 22, `sectionScale` 16,
  `labelScale` 14, `smallScale` 12, `heroScale` 32); thẻ bo 12; hàng điều hướng
  bo `radius-control` của Glass; padding trang 44.
- **Điều khiển:** cặp ngôn ngữ thành hai nút có khung + nút đổi chiều; thanh lọc
  dạng tab; model là nút có khung; nút theo trang trên header (Dịch: Thêm hình ảnh;
  Từ điển: Từ đã lưu; Phiên dịch: Tổng hợp, Lịch sử, Phiên mới). Ô tìm Cài đặt lên header.
- **Cài đặt:** nội dung thành thẻ có hàng (tiêu đề, mô tả, điều khiển bên phải) trên
  cả Swift và Qt.
- Domain: `Interpretation.clearSelection()` (Swift và Qt) cho "Phiên mới".

## Lượt 3 — đối chiếu 1:1 từng vùng và tự review UX

Cắt ảnh prototype và native ở cùng tỷ lệ 1:1 theo từng vùng, đo thêm style của
prototype (`lp-choice`, `lw-model`, form tra từ, composer). Sửa:

- Sidebar: bỏ vạch dưới ô tìm, ô tìm không icon khi mở rộng, icon cỡ vừa, chân
  trang cỡ chữ nhỏ; nút header chữ 14.
- Nhãn model `provider:model` hiển thị "Ollama · model" (ID gốc trong tooltip), cả Swift và Qt.
- Hàng ngôn ngữ: nút ngôn ngữ không viền (nền khi hover), model là nhãn nhẹ "✦ Ollama · …".
- Composer Chat: bo 16, ô soạn một dòng và tự giãn, nút ＋/model/mic 36 pt; chế độ chat,
  suy luận cẩn thận và giọng đọc gộp vào menu ＋; chip hiện chế độ đang bật (bấm để về mặc định).
- Từ điển: ô tra 52 pt bo 16, chữ 16, nút Tra cứu; Qt chuyển từ hai panel sang thanh tra
  cứu + vùng kết quả. Trạng thái trống riêng: "Nhập một từ để xem nghĩa, phát âm và ví dụ."
- Dịch: khoảng cách hàng ngôn ngữ/panel, panel bo 16, chân panel chữ 12, ＋ chuyển lên header.
- Nội dung: bỏ câu "tác vụ mô phỏng" còn sót trong trạng thái trống Chat (VI/EN/JA).
- Qt: header có Thêm hình ảnh (Dịch) và Từ đã lưu (Từ điển).

Chế độ sáng chưa so được: máy đang ở chế độ tối và segmented control không nhận
click tự động; không sửa thiết lập của người dùng để thử.

## Lượt 4 — tự kiểm tra từng màn

Mỗi màn được chụp prototype và native ở cùng tỷ lệ 1:1 (chế độ tối), cắt vùng nội
dung và so trực tiếp. Bản Qt được so với biến thể **Windows/Linux** của prototype
(`platforms.js`), vì Dịch mọi nơi, Ứng dụng và Nhiệt độ có nội dung riêng cho hai
nền tảng này.

| Màn | Chênh lệch đã sửa | Còn khác (có lý do) |
| --- | --- | --- |
| Trang chủ | Hàng Gần đây: tiêu đề đậm, icon lớn, mũi tên rõ; trang dùng hết bề ngang | Không có "Đang diễn ra" khi không có tác vụ chạy; dữ liệu là của máy |
| AI Chat | Tin nhắn người dùng nền muted bo 12; nhãn "✦ Viezan"; Sao chép + Thử lại dưới câu trả lời cuối; trạng thái trống lệch xuống giữa | Câu trả lời mô phỏng của provider preview không có markdown như mẫu |
| Dịch | (lượt 3) | — |
| Phiên dịch | Tab Song ngữ/Bản dịch dạng nhấn accent; "Xuất bản ghi"; header "Tổng hợp" | Chưa có phiên nên hiện trạng thái trống |
| Từ điển | (lượt 3) | Tab Ý nghĩa/Ví dụ của mẫu chưa có (kết quả thật hiển thị liền) |
| Dịch mọi nơi (macOS) | Phụ đề có phím tắt; thẻ Phím tắt / Quyền Trợ năng / Kết nối Chrome (mở bảng riêng) + ghi chú mô hình cục bộ; thẻ "Xem trước cửa sổ dịch nhanh" | — |
| Dịch mọi nơi (Qt) | Theo biến thể Windows/Linux: "Cách lấy nội dung" (Dán văn bản, Tiện ích trình duyệt, Phím tắt toàn hệ thống) + "Trạng thái quyền" (Chưa xác minh, lời giải thích theo Windows hoặc Wayland) | — |
| Ứng dụng (macOS) | Chọn sẵn ứng dụng đầu; nút "Xem trước thay đổi" + "Đặt lại dữ liệu" (nền đỏ nhạt); "Nhật ký & hoàn tác" | Danh sách là ứng dụng thật trên máy |
| Ứng dụng (Qt) | Thông báo quy tắc nền tảng; thẻ "Phạm vi thao tác" (ứng dụng, nguồn cài đặt, dữ liệu dùng chung) | Không có gỡ cài đặt (chưa có backend) — chỉ Mở/Hiện tệp/Cài đặt hệ thống |
| Nhiệt độ & quạt (macOS) | Tự đọc cảm biến khi mở trang (dừng khi rời nếu trang tự bật); thẻ "Chế độ điều khiển" + Hồ sơ quạt/Quy tắc (popover) + khối Điều khiển thủ công; cảm biến sắp nóng nhất, phần còn lại thu gọn | Số liệu thật của máy |
| Nhiệt độ & quạt (Qt) | Theo biến thể Windows/Linux: "Trạng thái cảm biến" (— khi chưa có backend), "Điều khiển quạt: Chưa hỗ trợ", Chế độ thủ công vô hiệu, "Xem lý do" | Linux hwmon hiện số thật khi có |
| Launcher & phím tắt | Launcher đứng đầu; mô tả từng phím tắt; keycap viền 32 pt; thẻ Launcher ba dòng + "Mở Launcher" | Mỗi phím tắt có công tắc bật/tắt (mẫu chỉ hiển thị) |
| Cài đặt | Thẻ có thanh tiêu đề + vạch ngăn sát mép, hàng có lề trong; ô tìm cỡ lớn | Nhóm mục theo cấu trúc cài đặt thật (8 mục) thay vì danh sách mẫu |

Chung: chữ đọc 14 (vai trò `lg`), bỏ vạch kẻ dưới header, nút xóa/đặt lại nền đỏ nhạt,
icon Hoạt động đổi sang dạng nhịp, chuỗi mới VI/EN/JA.

## Lượt 5 — chế độ sáng (2026-10-28)

Máy chuyển sang Light nên app chạy theo "Hệ thống" đã ở chế độ sáng; không đổi cài
đặt nào. So 10 màn macOS với prototype macOS sáng và 10 màn Qt với biến thể Windows
sáng, cùng tỷ lệ 1:1.

| Màn | Chênh lệch đã sửa | Ghi chú |
| --- | --- | --- |
| Nhiệt độ & quạt (macOS) | Ô số đo dùng `UniformGrid` (`NativeKit.swift`) theo `.grid.three`: ba cột đều lấp hàng thay cho `.adaptive` chừa cột trống; hẹp thì một cột (prototype không có trạng thái 2+1) | Lỗi có cả ở chế độ tối |
| Trang chủ (macOS) | "Đang diễn ra" dùng `UniformGrid(maxColumns: 2)` theo `.grid.equal` | Chỉ hiện khi có tác vụ chạy |
| Cài đặt (Qt) | `Kit.CardBox`: tiêu đề thành thanh đầu thẻ, vạch ngăn sát mép (như `CardSection(flush:)` macOS); điều hướng mục có biểu tượng | Icon mới sinh từ registry renderer (`generate-icons.mjs`: appearance, providers, localModels, data, about) |
| Dịch (Qt) | Hai panel nằm trong một thẻ có viền bo; panel kết quả nền phụ bo đúng góc chung với thẻ, xếp dọc thì có vạch ngăn trên | Lỗi có cả ở chế độ tối |

Không phải lỗi: thanh đo Nhiệt độ và ô tìm Cài đặt xám khi cửa sổ macOS không active
(quy ước AppKit); khi active thanh đo màu accent. Sidebar macOS là vật liệu thật nên
màu theo hình nền, không cố định xanh như ảnh prototype.

Harness: `prototype.mjs` phục vụ prototype trực tiếp từ đĩa qua `page.route`
(`http.server` rớt request song song làm prototype thiếu script/style; đã đối chiếu
ảnh tối hôm qua với bản nạp sạch — giống hệt, nên kết quả các lượt trước vẫn đúng);
`capture-plat.mjs` nhận thêm `dark|light`; `qtnav.sh` đưa app Qt lên trước vì Qt
không vẽ lại cửa sổ bị che.

## Lượt 6 — lớp nổi và trạng thái tương tác (2026-10-28)

Lượt 5 chỉ so màn mặc định của từng route; lượt này mở phiên có nội dung và các lớp
nổi (Lịch sử, Hoạt động, ⌘K) rồi so với prototype.

| Lỗi | Sửa |
| --- | --- |
| Lớp nổi macOS trong suốt: chữ trang bên dưới lộ qua danh sách (Glass `canvas` alpha 50%, không blur) | `ReadingPanelSurface` dùng `contentColor("surface")` (đặc ở mọi preset); thẻ Hoạt động dùng `cardSurface()` để còn viền trên nền đặc |
| Bảng lệnh macOS hiện "⌘" trơ trọi cho lệnh không có phím tắt | Chỉ hiện phím tắt khi có |
| Thứ tự lệnh lộn xộn | `generate-resources.mjs`: điểm đến theo thứ tự sidebar rồi đến thao tác (Swift và Qt) |
| Qt bảng lệnh: "Nhiệt độ _quạt" (`&` thành mnemonic), dòng chọn xanh đặc | `ItemDelegate` dùng `Label` riêng + nền chọn nhạt như điều hướng Cài đặt |
| Qt Lịch sử: tooltip đè ô tìm khi mở; model ID gốc; nút "Xem tất cả" có viền | Tooltip chỉ khi tiêu đề bị cắt; `modelLabel()` (cả Hoạt động); dòng liên kết có vạch ngăn |
| Phiên dịch (macOS) lệch trái 12 pt | Lề ngang `large + gap` như các màn khác |
| Từ điển (macOS) gợi ý trống trôi trong cột đọc | Trạng thái trống căn giữa có biểu tượng |
| Dịch (macOS) văn bản nguồn dính sát tiêu đề | Đệm trên `small`, thẳng hàng với cột kết quả |

Test `japaneseDarkCommandsOpenTheRowSelectedByHomeEndAndWrap` cập nhật mục đầu từ
`apps` thành `home` theo thứ tự mới. Kiểm tra: build `r18-v16-mac` + Qt; `swift test`
29 + 17, Qt `ctest`, domain 10, `generate-resources --check` pass. Ảnh
`macos-light-{palette,history,activity}.jpg`, `qt-light-{palette,history}.jpg`.

Chưa xử lý (cần quyết định): báo trạng thái provider ngay tại chip model/khung soạn
khi Ollama không chạy (Trang chủ báo "chưa khả dụng" nhưng nút Gửi/Dịch vẫn bật).

## Lượt 7 — trạng thái provider tại chỗ thao tác (2026-10-28)

Trước đây Trang chủ báo "Ollama chưa khả dụng" nhưng Chat/Dịch/Từ điển/Phiên dịch vẫn
hiện "Ollama · model" và nút Gửi bật, người dùng chỉ biết khi gửi lỗi.

- `LocalRuntime.checked` (Swift + Qt): đúng sau lần dò đầu, để không cảnh báo sớm.
- Dòng báo dùng chung — `ProviderNotice` (`NativeKit.swift`) và `Kit.ProviderNotice`
  (`Kit.qml`): chấm đỏ, "Ollama chưa chạy trên máy này. Gửi lúc này sẽ báo lỗi.",
  "Kiểm tra lại" (dò lại), "Mở Model AI local". Chỉ cho model `ollama:` khi đã dò và
  không trả lời; dò lại mỗi khi đổi model. Nút Gửi vẫn bật.
- Vị trí: Chat ngay trên composer, cùng cột đọc (không thêm khung quanh composer);
  Dịch/Từ điển/Phiên dịch dưới hàng ngôn ngữ. Chip model có chấm đỏ (badge thay ✦),
  nhãn trợ năng thêm ", Chưa khả dụng".
- "Mở Model AI local" mở Cài đặt đúng mục: macOS qua `.viezanOpenSettings` +
  `ShellPresentation.settingsSection`; Qt qua `openSettingsSection()` +
  `SettingsWorkspace.requestedSection` (báo đã nhận bằng `Qt.callLater` để tránh vòng binding).
- Chuỗi mới VI/EN/JA: `runtimeOfflineNotice`, `checkAgain`, `openLocalModels`.

Test mới: Swift `localRuntimeReportsCheckedOnlyAfterAProbe`,
`commandPaletteListsDestinationsInNavigationOrderBeforeActions`; Qt
`providerNoticeFollowsRuntimeAndOpensLocalModels` (đã kiểm: test fail khi đổi lại thành
reset đồng bộ). `swift test` 29 + 19, Qt `ctest`, domain 10, `generate-resources --check`
pass. Build `r18-v19-mac` + Qt. Ảnh `*-provider-notice-*`; Chat 640 xuống dòng gọn.

Còn lại: Phiên dịch Qt vẫn hiện model ID gốc `ollama:llama3.2` (chưa dùng `modelLabel`);
tiêu đề cửa sổ Qt ghi "Cài đặt" khi ở các trang hệ thống (có từ trước). Provider đám mây
chưa có dò trước — chỉ báo lỗi sau khi gửi.

## Lượt 8 — harness trạng thái, chế độ tối, bề rộng hẹp (2026-10-28)

Harness mới: `mac-capture-states.sh` / `qt-capture-states.sh` (5 route có phiên đang
mở × 1400/820/640, lớp nổi Lịch sử/Hoạt động/⌘K ở 1400 và 640) và
`capture-overlays.mjs` (lớp nổi prototype theo nền tảng/chế độ). Chế độ tối lấy bằng
Cài đặt › Giao diện › Tối trong từng app (tham số `-AppleInterfaceStyle` không có tác
dụng vì app đặt `preferredColorScheme` từ tuỳ chọn riêng).

| Lỗi tìm thấy | Sửa |
| --- | --- |
| Dịch (macOS) ở 820/640: hai cột đứng cạnh nhau, nút "Dịch văn bản"/"So sánh" bị cắt chữ | Xếp một cột dưới bề rộng `reading` (như `.preview-narrow` của prototype); nút `fixedSize()` |
| Qt ở 640: hàng ngôn ngữ (ComboBox theo chữ dài nhất + chip model) tràn, cắt cả trang | Dịch/Từ điển/Phiên dịch: dưới `reading` chip model xuống dòng riêng (GridLayout); panel Dịch xếp một cột dưới `reading` |
| Qt: Phiên dịch và Trang chủ hiện model ID gốc | `Kit.ModelLabel` là bộ định dạng duy nhất; `Main.modelLabel()` dùng lại |
| Qt: tiêu đề cửa sổ ghi "Cài đặt" ở trang hệ thống | Dùng tên route hệ thống |
| Qt: gợi ý trống Từ điển canh trái | Căn giữa |

Chế độ tối macOS (1400) khớp prototype ở 5 màn và 3 lớp nổi; Qt tối ở 1400/820/640 vừa
khung. Ảnh `*-dark-*` trong evidence.

**Dừng giữa chừng vì xung đột:** một agent khác (ghi `native-code-40.md`) cùng lúc sửa
`DictionaryResult.qml`, `HomeWorkspace.swift`, `NativeSettings.swift`, Cài đặt Qt, README
và chạy bản `r18-audit40-final-mac` trên cùng bundle id/dữ liệu preview. Qt `ctest` hiện
fail ở `qmlLoadsWithRealBridge(translation*)` do TypeError trong `DictionaryResult.qml`
(`flatMap`, dòng 34/87/88 — phần thêm của agent kia). Swift `swift test` 29 + 19 pass.
Tuỳ chọn giao diện preview đã trả lại ở lượt 9.

## Lượt 9 — làm tiếp sau khi agent kia dừng (2026-10-28)

Build `r18-v21-mac` + Qt từ mã hiện tại (gồm thay đổi native-code-40). Chụp lại toàn bộ
bằng harness: 42 ảnh tối + 42 ảnh sáng (5 route × 3 bề rộng + 3 lớp nổi × 2 bề rộng,
hai app) cùng prototype macOS/Windows hai chế độ. Bố cục cả hai app ở mọi bề rộng vừa
khung; macOS khớp prototype ở màn chính và lớp nổi.

| Lỗi | Sửa |
| --- | --- |
| Qt: bộ máy JS V4 không có `Array.prototype.flatMap` (cũng thiếu `flat`, `at`, `findLast`, `replaceAll`, `Object.fromEntries`). `DictionaryResult.qml` (thêm ở native-code-40) ném TypeError → `examples` undefined → tab Ví dụ hỏng và nhãn "VÍ DỤ" hiện lơ lửng trong màn Dịch; Qt `ctest` fail | `reduce`/`concat` |
| `NativeChart.qml` (có từ trước) dùng `flatMap` → biểu đồ trong Chat hỏng trên Qt | `reduce`/`concat` |
| Không có gì chặn tái phạm | Test node `QML avoids JavaScript APIs missing from the Qt V4 engine` |

Kiểm tra: `swift test` 30 + 19, Qt `ctest` pass (trước sửa: 3 fail), domain 11, 
`generate-resources --check` pass; log Qt khi chạy harness không còn TypeError.
Giao diện preview đã trả về như trước: macOS "Sáng", Qt "Hệ thống".

## Kiểm tra đã chạy

- `scripts/native/build.py --target macos` và `--target qt` (Qt 6.12 Homebrew,
  sau khi người dùng cho phép cài `qtmultimedia`; `qtspeech`, `qtwebsockets` cài
  thêm cho cùng mục đích build Qt).
- `swift test --package-path apps/macos`: 29 + 17 test pass (lượt 2).
- Qt `BUILD_TESTING=ON`, `ctest` offscreen: `native-qt-bridge` pass.
- `node --test scripts/native/__tests__/domain.test.mjs`: 10 pass.
- `generate-resources.mjs --check`, `documentation.mjs`: pass.
- Lượt 5: build `r18-v14-mac` và Qt `r18-base-qt`; `swift test` 29 + 17, Qt `ctest`,
  domain 10, `generate-resources --check` đều pass; ảnh sáng `*-light-*` trong evidence;
  Nhiệt độ kiểm ở cửa sổ 1400, 820, 640.
- Ảnh chạy thật trên máy Mac (chế độ tối): 9 màn macOS và 9 màn Qt ở 1400×860,
  kèm ảnh prototype macOS và Windows cùng chế độ tại
  [evidence/native-ui-39](evidence/native-ui-39/). Màn Ứng dụng của macOS không
  lưu vì liệt kê ứng dụng thật trên máy.

## Chưa chứng minh

- Qt chỉ chạy trên macOS; Windows/Linux thật (DPI, Wayland, Narrator/Orca, IME)
  NOT RUN. Không suy ra parity từ ảnh Qt trên Mac.
- Ba cỡ chữ, VI/EN/JA trên giao diện mới, VoiceOver đầy đủ: NOT RUN. Chế độ sáng đã
  so ở lượt 5 (macOS 10 màn, Qt 10 màn); chế độ tối của Qt sau lượt 5 chưa chụp lại.
- Không gọi provider thật, không thu âm, không gỡ ứng dụng, không ghi quạt.
- Cảnh báo QML có sẵn từ trước vẫn còn: `ChatTranscript.qml:33` (Qt.callLater khi
  hủy component) và `Keys` gắn vào Popup lịch sử Phiên dịch.
- Nút điều hướng sidebar SwiftUI không có AXDescription khi đọc bằng System Events;
  cần kiểm tra với VoiceOver.
