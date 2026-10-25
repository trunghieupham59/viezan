# Nhiệt độ & quạt

> Bản vẽ gốc: `boards/Thermal.dc.html`, `boards/ThermalExtras.dc.html` (luồng quạt), `boards/Popovers.dc.html` (popover tuỳ chọn), `boards/SmallSurfaces.dc.html` (mục thanh menu), `boards/States.dc.html` (lỗi helper) · Board chi tiết: `specs/thermal.html` · Mã nguồn: `src/pages/ThermalPage.tsx`

Luật chung (token, hợp đồng Button, bậc bề mặt, responsive, trạng thái chung) nằm ở [`../foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của trang Nhiệt độ & quạt và số đo trên thanh menu / khay.

Tệp liên quan:

| Vai trò | Tệp |
| --- | --- |
| Page (nối hook, toast, dialog) | `src/pages/ThermalPage.tsx` |
| Bảng quạt (profile, chế độ, tham số, dialog cảm biến thô) | `src/components/organisms/thermal/ThermalFanPanel.tsx` |
| Bảng nhiệt độ (nhóm, hàng gộp) | `src/components/organisms/thermal/ThermalSensorTable.tsx` |
| Nút bánh răng + popover tuỳ chọn | `src/components/organisms/thermal/ThermalOptionsConfiguration.tsx` (dùng `AIConfigurationPopover`) |
| Mục thanh menu / khay trong popover | `src/components/organisms/thermal/ThermalTrayOptions.tsx` |
| Dialog xác nhận (miễn trừ, nhận diện) | `src/components/organisms/thermal/ThermalFanDisclaimer.tsx` |
| Hook | `src/hooks/useThermalMonitor.ts`, `useThermalSettings.ts`, `useFanControl.ts`, `useFanProfiles.ts`, `useFanCalibration.ts` |
| Gộp hàng, ngưỡng màu | `src/utils/thermalSensorRows.ts` (ấm ≥ 70 °C, nóng ≥ 90 °C) |
| Xem trước thanh menu | `src/utils/trayPreview.ts` (bản sao chữ của `electron/thermal/trayTitle.ts`) |
| Kiểu dữ liệu | `shared/thermalApi.d.ts` |
| CSS | `src/styles/thermal.css` |
| Kiểm thử | `src/pages/__tests__/ThermalPage.test.tsx` |

## 1. Mục đích

Cho người dùng thấy máy đang nóng tới đâu và quạt đang quay thế nào, ngay khi mở trang: một bảng nhiệt độ gọn (vài chục hàng thay vì hàng trăm khoá SMC) và một bảng quạt có tốc độ trực tiếp. Trên macOS có helper đặc quyền, người dùng có thể giành quyền điều khiển quạt: áp dụng profile (Yên tĩnh, Mát, Gaming, AI local…), giữ một quạt ở tốc độ cố định, hoặc cho quạt theo một cảm biến, và luôn quay về tự động bằng một nút. Ngoài cửa sổ, một số đo nhỏ có thể nằm trên thanh menu (macOS) hoặc trong chú thích biểu tượng khay (Linux). Thành công là: đọc được nhiệt độ nóng nhất trong một cái liếc, đổi chế độ quạt mà không sợ làm hỏng máy, và tin rằng quạt sẽ tự về tự động khi có sự cố.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng | Mục "Nhiệt độ & quạt" (`nav_thermal`) trong nhóm HỆ THỐNG | Định nghĩa ở `src/modules/catalog.ts` (`id: 'thermal'`, `space: 'system'`, icon `ThermometerIcon`) |
| Bảng lệnh ⌘K | Lệnh "Nhiệt độ & quạt", mô tả `command_palette_thermal_description` | Từ khoá tìm: thermal, temperature, heat, fan, rpm, cpu, gpu, sensor |
| Trang chủ | Thẻ hệ thống `HomeSystemCard` (nóng nhất, tải CPU, từng quạt) → mở trang | `src/pages/HomePage.tsx`, chỉ hiện khi module bật |
| Việc chạy nền ở đáy thanh điều hướng | Hàng "Quạt · {profile}" / "Quạt · tuỳ chỉnh" khi helper đang `ready` | `useBackgroundStatus.ts`, `PrimaryNavigationSidebar.tsx` |
| Mục thanh menu (macOS) | Menu ngữ cảnh: "Mở Viezan" mở cửa sổ chính (không nhảy thẳng vào trang này); "Ẩn nhiệt độ khỏi thanh menu" tắt số đo | `electron/trayManager.ts` `createStatusItemTray`; nhãn theo ngôn ngữ hệ điều hành |
| Phím tắt | Không có phím tắt riêng | — |
| Module tắt | Cài đặt › Module tắt `thermal` → mục điều hướng, lệnh và thẻ Trang chủ ẩn | `modulesSlice.ts` (mặc định bật) |

Ra: chuyển trang bất kỳ. Khi rời trang (unmount) hoặc cửa sổ bị ẩn (`visibilitychange`), renderer tắt theo dõi 2 giây; nếu số đo thanh menu bật, main tiếp tục đọc chậm hơn (5 giây) cho mục thanh menu. Helper quạt **không** dừng khi rời trang: quạt giữ chế độ đã chọn, hàng "Quạt · …" ở đáy thanh điều hướng nhắc điều đó.

## 3. Bố cục

Ở 1200 px (thanh điều hướng 236 px, vùng nội dung khoảng 964 px). Trang dùng khung "full-bleed": `PageHeader` sát mép, thân trên canvas, hai bảng là thẻ.

```
┌ PageHeader (.page-header, min 56 px) ────────────────────────────────────────────────────────┐
│ Nhiệt độ & quạt          [● Helper đã kết nối (v1.2)] [■ Tắt] [⚙]                              │
├ .thermal-notice (chỉ khi helper tự khôi phục) ─────────────────────────────────────────────────┤
│ Helper đã trả quạt về tự động (máy đi ngủ).                                                    │
├ .thermal-panels-body (padding 16, cuộn dọc) ───────────────────────────────────────────────────┤
│ ┌ ThermalFanPanel (.thermal-panel) ───────────┐ ┌ Nhiệt độ (.thermal-panel) ──────────────────┐ │
│ │ Quạt [Profile: Mát ▾][✕][Lưu profile] [Về tự động] │ Nhiệt độ   Tải CPU 17% · Nóng nhất 58,7°C · 218 cảm biến │
│ │ (.thermal-calibration khi đang nhận diện)   │ │ ▾ CPU 57                                      │ │
│ │ Quạt trái              [Tự động][Cố định][Theo cảm biến] │ ┌ Nhân hiệu năng  30 cảm biến · TB 46,6°C  58,2°C ┐ │
│ │ 2.250 RPM                                   │ │ │ Nhân tiết kiệm   3 cảm biến · TB 50,2°C  58,7°C │ │
│ │ 1.499 ━━━━━━|━━━━━━━━━━━━━━━━━━━ 5.348      │ │ └──────────────────────────────────────────┘ │ │
│ │ ┌ .thermal-fan__params (surface-muted) ──┐  │ │ ▾ GPU 8                                       │ │
│ │ │ Cảm biến [CPU (cảm biến nóng nhất) ▾] │  │ │ ▸ Cảm biến khác 153                  52,6°C   │ │
│ │ │ Tăng tốc từ [50] °C  tối đa tại [90] °C│  │ │                                               │ │
│ │ │ Hiện 58,2°C → 2.300 RPM               │  │ │                                               │ │
│ │ └────────────────────────────────────────┘  │ │                                               │ │
│ │ Quạt phải  0 RPM       [Tự động*][Cố định][Theo cảm biến] │                                    │ │
│ └─────────────────────────────────────────────┘ └───────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component / class | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header trang | `PageHeader` (`.page-header`) | `--vzn-page-header-min-height`; lề `--vzn-space-6` (≤ 559 px: `--vzn-space-4`); tiêu đề `--vzn-font-size-title-lg`; hành động `md` (36 px) | Không |
| Thông báo khôi phục | `.thermal-notice` | Một dòng `--vzn-font-size-caption`, `--vzn-text-muted`, đường kẻ `--vzn-divider` | Không |
| Thân | `.thermal-panels-body` | padding `--vzn-space-4`, gap `--vzn-space-2` | Dọc (cả thân cuộn, hai bảng cao theo nội dung) |
| Lưới hai bảng | `.app-panel-grid.thermal-panels` | 2 cột khi vùng nội dung (`app-main`) ≥ 900 px, 1 cột dưới đó (`src/index.css`); gap `--vzn-panel-gap`; `align-items: start` | — |
| Bảng quạt | `ThermalFanPanel` (`.glass-panel.thermal-panel`) | Toolbar `.live-panel-toolbar` (padding `--vzn-space-2`/`--vzn-space-3`, `nowrap`); thân padding `--vzn-space-3` | Theo thân |
| Hàng quạt | `.thermal-fan` | Tên `--vzn-font-size-sm`; tốc độ `--vzn-font-size-title` semibold, số bảng (`tabular-nums`), màu `--vzn-action` khi app đang giữ quạt; `Meter` cao `--vzn-space-1-5` | — |
| Ô tham số | `.thermal-fan__params` | Nền `--vzn-surface-muted`, bo `--vzn-radius-sm` | — |
| Bảng nhiệt độ | `section.thermal-panel` + `ThermalSensorTable` | Toolbar giống bảng quạt; nhóm cách nhau `--vzn-space-4`; danh sách hàng viền `--vzn-border`, bo `--vzn-radius-md` | Theo thân |
| Hàng cảm biến | `.thermal-row` | padding `--vzn-space-2`/`--vzn-space-3`; giá trị `--vzn-font-size-md` semibold; ấm `--vzn-warning`, nóng `--vzn-danger` | — |
| Thành viên của hàng | `.thermal-row__members` | Lưới `minmax(--vzn-thermal-summary-min-inline, 1fr)`, nền `--vzn-surface-muted`, mã `--vzn-font-mono` | — |
| Popover tuỳ chọn | `AIConfigurationPopover` | Rộng `--vzn-ai-configuration-inline`, cao tối đa `--vzn-ai-configuration-max-block`, `--vzn-shadow-md` | Thân popover cuộn |
| Dialog | `DialogShell size="sm"` | `--vzn-dialog-sm-max-inline`; footer nút `md` | Thân dialog |
| Danh sách cảm biến thô | `.thermal-raw__list` | Cao tối đa `--vzn-thermal-raw-list-max-block` | Dọc |
| Xem trước thanh menu | `.thermal-tray-preview` | Cao `--vzn-control-height-xs`, rộng tối thiểu `--vzn-control-height-sm`, nền `--vzn-surface-muted` | — |

Thứ tự nhóm cảm biến cố định: CPU → GPU → Cảm biến khác (`THERMAL_GROUPS`). "Cảm biến khác" mặc định thu gọn (`COLLAPSED_SENSOR_GROUPS`), khi thu gọn vẫn hiện số đo nóng nhất của nhóm trên dòng tiêu đề. Trong mỗi nhóm, hàng xếp theo nhiệt độ nóng nhất giảm dần; hàng "Cảm biến chưa nhận diện" luôn cuối nhóm.

## 4. Thành phần và hành động

"Bận" = `busy` chung của trang: `fanControl.busy || fanProfiles.busy || fanCalibration.busy` (`ThermalPage.tsx`). Trong lúc nhận diện, mọi điều khiển hàng quạt cũng bị tắt.

### 4.1 Header trang

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Chip trạng thái helper | `StatusChip`: `neutral` "Điều khiển quạt đang tắt" · `info` + spinner "Đang khởi chạy helper…" · `ok` "Helper đã kết nối (v{version})" · `danger` "Không khởi chạy được helper" · `warning` "Thiếu helper" | Chỉ hiển thị | — | Chi tiết lỗi / đường dẫn thiếu nằm trong `title` (tooltip) và trong `CapabilityNotice` dưới header (helper `missing` hoặc `error`) | Không hiện khi không có điều khiển quạt (Linux, macOS đọc lỗi) |
| H2 | "Bật điều khiển quạt" (`thermal_fan_enable`) | `md` · `primary` · `solid`, chữ nhật | Click / Enter / Space, khi helper `idle` | Lần đầu: mở dialog miễn trừ (mục 6.2). Đã đồng ý: khởi chạy helper, macOS hỏi mật khẩu quản trị | Chip chuyển "Đang khởi chạy helper…", nút tắt; thất bại → toast lỗi (khoá `thermal-fan`) | `disabled` khi bận; trong trạng thái `starting` nút hiện nhưng luôn tắt |
| H3 | "Thử lại" (`thermal_fan_retry`) | `md` · `primary` · `solid` | Click, khi helper `error` | Như H2 (vẫn qua dialog nếu chưa đồng ý) | Như H2 | Bận |
| H4 | "Tắt điều khiển quạt" (`thermal_fan_disable`) có icon dừng | `md` · `danger` · `outline` | Click, khi helper `ready` | Trả mọi quạt về tự động và bỏ helper (helper tự thoát sau đó) | Chip về "Điều khiển quạt đang tắt", hàng quạt về "Tự động (hệ thống)"; lỗi → toast | Bận |
| H5 | Bánh răng "Tùy chọn nhiệt độ" | `md` · `neutral` · `ghost`, icon vuông; khi mở `primary` · `soft`. `aria-expanded`, `aria-haspopup="dialog"`, `aria-label` = `thermal_options_title` | Click; đóng bằng Esc, click ra ngoài, nút đóng | Mở `AIConfigurationPopover` neo dưới nút: mục "Nhận diện cảm biến" (chỉ khi có điều khiển quạt) và mục "Thanh menu" / "Khay hệ thống" | Focus vào điều khiển đầu tiên trong popover; đóng thì focus về nút | Không hiện khi không có `trayPlacement` (Windows, lần chạy không có khay, cảm biến không đọc được) hoặc settings chưa tải |

Chỉ một nút `solid` trong header tại một thời điểm (H2 hoặc H3); H4 là `outline` vì là hành động dừng.

### 4.2 Bảng quạt (`ThermalFanPanel`)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Chọn profile (`SelectField`, nhãn "Profile" chỉ cho trình đọc màn hình) | `SelectField` (menu nổi neo vào nút) | Click / Enter mở menu; mũi tên chọn; chỉ khi helper `ready` | Áp dụng profile cho mọi quạt và ghi nhớ; "Tùy chỉnh" là mục không chọn được, hiện khi profile chưa áp dụng hoặc vừa chỉnh tay | Ô hiện tên profile; hàng quạt đổi chế độ theo trạng thái main gửi về; lỗi → toast `thermal_fan_profile_error` (khoá `thermal-fan-profile`) | Bận |
| F2 | Xoá profile "Xóa profile {name}" | `sm` · `danger` · `ghost`, icon ✕ vuông, có `aria-label` | Click; chỉ hiện khi profile đang áp dụng là của người dùng | Xoá ngay, **không hỏi lại** | Ô chọn về "Tùy chỉnh"; lỗi → toast | Bận |
| F3 | "Lưu profile" | `sm` · `neutral` · `outline` | Click | Thay nút bằng form nội tuyến: ô "Tên profile" (`sm`, tối đa 40 ký tự, tự focus) + "Lưu" + "Hủy" | Ô nhập có focus | Bận |
| F3a | "Lưu" | `sm` · `primary` · `solid`, `type="submit"` | Click / Enter trong ô | Lưu trạng thái quạt hiện tại thành profile mới (tên đã cắt khoảng trắng) | Form đóng, profile mới xuất hiện trong F1; lỗi → toast | Bận hoặc tên rỗng |
| F3b | "Hủy" | `sm` · `neutral` · `ghost` | Click | Đóng form, xoá tên | Nút "Lưu profile" trở lại | Không bao giờ tắt |
| F4 | "Về tự động" (`thermal_fan_restore_all`) | `sm` · `neutral` · `outline` | Click; chỉ khi helper `ready` | Mọi quạt về tự động, helper vẫn kết nối | Mọi hàng quạt về "Tự động", vạch mục tiêu biến mất; lỗi → toast | Bận, đang nhận diện, hoặc không quạt nào bị app giữ |
| F5 | Chế độ quạt: "Tự động" · "Cố định" · "Theo cảm biến" (trong `fieldset`, `legend` = tên quạt) | Mỗi nút `sm` · pill; đang chọn `primary` · `soft` + `aria-pressed="true"`, còn lại `neutral` · `ghost` | Click | Tự động: trả quạt cho hệ thống. Cố định: giữ ở tốc độ hiện tại làm tròn bước 50 RPM. Theo cảm biến: quy tắc mặc định "CPU nóng nhất, 50→90 °C" (hoặc "Cảm biến gần {quạt}" nếu đã nhận diện) | Tốc độ to đổi sang màu nhấn, `Meter` đổi `emphasis="action"`, xuất hiện vạch mục tiêu và ô tham số; profile chuyển "Tùy chỉnh" | Bận hoặc đang nhận diện. Khi helper không `ready`: thay bằng chữ "Tự động (hệ thống)" |
| F6 | "Tốc độ mục tiêu" (`SliderField`: ô số + thanh trượt, đơn vị RPM) | Molecule `SliderField`, bước 50, min/max của quạt | Kéo rồi thả; hoặc gõ số rồi Enter / rời ô; Esc trả về giá trị cũ | Gửi lệnh cố định một lần khi thả / Enter; giá trị ngoài khoảng được sửa về biên | Vạch mục tiêu trên `Meter` di chuyển; tốc độ thật bắt kịp sau vài lần đọc | Bận |
| F7 | "Cảm biến" (`SelectField`) | Molecule `SelectField` | Chọn | Theo nhóm (CPU / GPU / toàn máy, nóng nhất), theo loại (một mục mỗi loại có trên máy, kèm số lượng), "Cảm biến gần {quạt}" sau nhận diện, mục cảm biến thô đang dùng, và "Chọn cảm biến cụ thể…" | Mỗi mục kèm số đo hiện tại làm mô tả; chọn "Chọn cảm biến cụ thể…" mở F10 | Bận |
| F8 | "Tăng tốc từ" / "tối đa tại" (`NumberField`, °C) | Molecule `NumberField` | Gõ rồi Enter / rời ô; Esc khôi phục | Cập nhật quy tắc; giới hạn 20–110 °C, ngưỡng dưới luôn nhỏ hơn ngưỡng trên (max/min của ô kia tự co) | Dòng "Hiện {°C} → {RPM}" cập nhật ở lần đọc sau | Bận |
| F9 | Dòng trạng thái quy tắc | Chữ `--vzn-font-size-caption` | — | "Hiện 58,2°C → 2.300 RPM"; nếu cảm biến nguồn không có trong lần đọc: "Cảm biến này không có trong lần đọc hiện tại; quạt giữ mục tiêu gần nhất." | — | — |
| F10 | Dialog "Cảm biến cụ thể" (`DialogShell sm`) | Ô lọc `FilterInput sm` (tự focus, nút xoá bộ lọc); danh sách nút gốc `.thermal-raw__item` với `aria-pressed` | Gõ để lọc theo tên hoặc mã; click một hàng | Quạt theo đúng cảm biến đó; dialog đóng | Hàng đang dùng tô `--vzn-action-soft`; không khớp → "Không có cảm biến nào khớp." | Không có trạng thái tắt; đóng bằng nút ✕ "Đóng" hoặc Esc |
| F11 | Thanh tiến trình nhận diện (`.thermal-calibration`, `role="status"`) | `ProgressBar` + chữ "{quạt} ({i}/{n}) · {pha} · {s} s" + "Dừng nhận diện" `xs` · `danger` · `ghost` | Chỉ hiện khi đang nhận diện | Dừng: hủy, quạt về tự động | Chữ "Đã dừng nhận diện; quạt về tự động." trong popover | Bận |

Nút gốc `.thermal-raw__item`, `.thermal-row__main--button` và `.thermal-table__toggle` là ngoại lệ có chủ ý cho hàng danh sách bấm được toàn dòng (không phải nút thanh công cụ).

### 4.3 Bảng nhiệt độ

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Chỉ số toolbar | Chữ: "Tải CPU {n}%" (từ lần đọc thứ hai), "Cảm biến nóng nhất {°C}" (tooltip = tên cảm biến), "{n} cảm biến" | — | — | Cập nhật mỗi 2 giây | — |
| S2 | Tiêu đề nhóm (CPU / GPU / Cảm biến khác + số lượng) | Nút gốc trong `h3`, `aria-expanded`, `aria-controls`; tooltip "Mở nhóm {group}" / "Thu gọn nhóm {group}" | Click / Enter / Space | Mở / thu gọn nhóm | Chevron xoay; khi thu gọn hiện giá trị nóng nhất có màu theo ngưỡng | — |
| S3 | Hàng gộp (nhiều cảm biến cùng ý nghĩa) | Nút toàn dòng, `aria-expanded`; tooltip "Hiện từng cảm biến" / "Ẩn các cảm biến" | Click / Enter / Space | Mở lưới cảm biến thô (tên driver hoặc mã SMC + giá trị, nóng nhất trước) | Chú thích "{n} cảm biến · TB {avg}" | — |
| S4 | Hàng đơn | Không bấm được; chú thích là mã cảm biến (mono) | — | — | — | — |

### 4.4 Popover "Tùy chọn nhiệt độ"

Mô tả popover: `thermal_options_desc_fans` khi có điều khiển quạt, nếu không `thermal_options_desc`.

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| O1 | "Nhận diện cảm biến" (đã có kết quả: "Nhận diện lại") | `sm` · `primary` · `solid` | Click | Đóng popover, mở dialog xác nhận nhận diện (mục 6.5) | — | Bận hoặc helper chưa `ready` (tooltip "Bật điều khiển quạt để áp dụng profile.") |
| O2 | "Dừng nhận diện" | `sm` · `danger` · `outline` | Click, thay O1 khi đang chạy | Hủy nhận diện | Dòng trạng thái đổi | Bận |
| O3 | "Quên kết quả" | `sm` · `neutral` · `ghost` | Click; chỉ khi có kết quả và không đang chạy | Xoá kết quả nhận diện; mục "Cảm biến gần {quạt}" biến mất | — | Bận |
| O4 | Dòng trạng thái nhận diện (`role="status"`) | Chữ caption; `done` màu `--vzn-success`, `error` màu `--vzn-danger` | — | "Nhận diện lúc {date} · Quạt trái: 74 cảm biến · …" / tiến độ / "Đã dừng…" / "Nhận diện thất bại. {lỗi}" | — | — |
| T1 | "Hiện số đo trực tiếp" | `ToggleSwitch` (`aria-labelledby`, `aria-describedby` = mô tả theo vị trí) | Click / Space | Bật / tắt mục thanh menu (macOS) hoặc chú thích khay (Linux) | Mục thanh menu hiện "…" rồi số đo; các hàng chi tiết hiện ra | Khi đang lưu (`settingsBusy`) |
| T2 | "Số đo" | `SelectField`: Cảm biến nóng nhất · CPU · GPU | Chọn | CPU/GPU lấy cảm biến nóng nhất của nhóm, rơi về nóng nhất toàn máy khi nhóm trống | Xem trước đổi ngay | Đang lưu |
| T3 | "Kèm tốc độ quạt" | `ToggleSwitch` | Click | Thêm RPM của quạt nhanh nhất | Hiện T4 (chỉ thanh menu) và T5 | Đang lưu |
| T4 | "Bố cục": "Một dòng" · "Xếp chồng" | Hai nút `sm` · pill, đang chọn `primary` · `soft` + `aria-pressed` | Click | Xếp chồng: nhiệt độ trên, RPM dưới trong một ảnh hẹp | Xem trước thành hai dòng | Chỉ hiện khi macOS và đã bật T3; đang lưu thì tắt |
| T5 | "Tốc độ quạt": "Đầy đủ (2374)" · "Rút gọn (2.4k)" | `SelectField` | Chọn | Định dạng RPM | Xem trước đổi | Chỉ hiện khi bật T3 |
| T6 | "Dấu độ (°)" | `ToggleSwitch` | Click | `58°` ↔ `58` | Xem trước đổi | Đang lưu |
| T7 | "Xem trước" | `output.thermal-tray-preview`, `aria-label` | — | Đúng chữ mục thanh menu sẽ hiện; "…" trước lần đọc đầu | — | — |

Mọi thay đổi T1–T6 đi một vòng qua main (`useThermalSettings.update`), lưu trong `thermal.json`, và đồng bộ ngược khi đổi từ menu thanh menu. Lỗi → toast `thermal_tray_error` (khoá `thermal-tray`).

### 4.5 Dialog xác nhận (`ThermalFanDisclaimer`)

| # | Điều khiển | Loại | Kết quả |
| --- | --- | --- | --- |
| D1 | "Hủy" | `md` · `neutral` · `outline` | Đóng, không làm gì |
| D2 | "Tôi hiểu, tiếp tục" / "Bắt đầu nhận diện" | `md` · `primary` · `solid` | Miễn trừ: ghi `fanControl.acknowledged = true` rồi khởi chạy helper. Nhận diện: bắt đầu chạy |
| D3 | ✕ đóng (đầu dialog) | Nút đóng của `DialogShell`, nhãn "Hủy" | Như D1 |

### 4.6 Mục thanh menu / khay (ngoài cửa sổ)

| Nền tảng | Hiển thị | Menu |
| --- | --- | --- |
| macOS | Status item riêng, chữ số đơn cách (`monospacedDigit`): `61°`, `61° 2374`, `61 2.4k`; xếp chồng = ảnh template hai dòng, tự đổi màu theo thanh menu sáng/tối; tooltip nhiều dòng (tiêu đề app, `Max/CPU/GPU 61.0°C (mã)`, từng quạt, `CPU n%`) | Click phải: "Mở Viezan" · ngăn cách · "Ẩn nhiệt độ khỏi thanh menu" (tắt T1) |
| Linux (khay của app) | Chỉ tooltip của biểu tượng khay có số đo | Menu khay chung của app, không có mục nhiệt độ |
| Windows | Không có (không đọc được cảm biến) | — |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Đang tải (trang) | Main chưa trả lời `getSupport` | `FeatureLoadingState` layout `list`: skeleton header + danh sách, `role="status"` nhãn "Nhiệt độ & quạt" | Không |
| Đang đọc lần đầu | Hỗ trợ nhưng chưa có snapshot, chưa lỗi | Ô viền nét đứt `.thermal-empty` "Đang đọc cảm biến…", `role="status"` | Header: chip helper, bánh răng (nếu có) |
| Có dữ liệu | Snapshot mỗi 2 giây | Hai bảng như mục 3 | Mọi hành động mục 4 |
| Không hỗ trợ nền tảng | `reason: 'unsupported-platform'` (Windows, hoặc API không có trong cửa sổ) | `CapabilityNotice` vàng "Chưa khả dụng trên hệ thống này" + giải thích macOS/Linux | Không; không bắt đầu theo dõi |
| Thiếu trình đọc | `reason: 'reader-missing'` (bản mã nguồn chưa build `viezan-smc`) | `CapabilityNotice` vàng "Thiếu trình đọc cảm biến" + hướng dẫn `npm run build:native` | Không |
| Không có cảm biến | `reason: 'no-sensors'` | `CapabilityNotice` "Không tìm thấy cảm biến nhiệt độ" + "Máy này không báo cáo cảm biến nhiệt độ nào mà Viezan đọc được…" | Không |
| Bảng trống trong snapshot | Snapshot không có quạt / không có cảm biến | Ô nét đứt "Máy này không báo cáo quạt nào." / "Không tìm thấy cảm biến nhiệt độ nào." | Bảng còn lại vẫn dùng được |
| Lỗi đọc | `onError` hoặc `setMonitoring` thất bại | `CapabilityNotice` đỏ "Không đọc được cảm biến" + thông điệp lỗi + nút "Thử lại" (primary) | Thử lại: đọc một lần; thành công thì xoá lỗi. Nếu đã có snapshot cũ, hai bảng vẫn hiện số cũ bên dưới |
| Điều khiển quạt: không có | Linux / snapshot không đến từ SMC / helper `unsupported` | Không chip, không nút; hàng quạt chỉ đọc "Tự động (hệ thống)"; popover không có mục nhận diện | Chỉ đọc |
| Helper: thiếu | `missing` | Chip vàng "Thiếu helper", tooltip đường dẫn / lệnh build; `CapabilityNotice` vàng cùng nội dung dưới header | Không có nút bật |
| Helper: tắt | `idle` | Chip trung tính "Điều khiển quạt đang tắt" + "Bật điều khiển quạt" | H2 |
| Helper: đang khởi chạy | `starting` (đang chờ mật khẩu / kết nối) | Chip spinner "Đang khởi chạy helper…" + nút bật đã tắt | Chờ |
| Helper: lỗi | `error` (huỷ mật khẩu, không kết nối) | Chip đỏ "Không khởi chạy được helper" (tooltip lỗi) + "Thử lại"; `CapabilityNotice` đỏ ghi lỗi; toast lỗi | H3 |
| Helper: sẵn sàng | `ready` | Chip xanh lá + "Tắt điều khiển quạt"; toolbar quạt có profile và "Về tự động"; hàng quạt có công tắc chế độ | Mọi hành động F* |
| Helper tự khôi phục | `lastRestoreReason` ∈ watchdog, ceiling, sleep, can-sleep, wake, disconnect | Dòng `.thermal-notice` "Helper đã trả quạt về tự động ({lý do})." dưới header | Chọn lại profile / chế độ thủ công |
| Đang nhận diện | `calibration.status === 'running'` | Thanh tiến trình dưới toolbar quạt; mọi điều khiển quạt và "Về tự động" tắt; popover đổi O1 thành O2 | Dừng nhận diện |
| Nhận diện xong / dừng / lỗi | `done` / `cancelled` / `error` | Dòng trạng thái trong popover (xanh lá / thường / đỏ); thất bại cũng bắn toast | Nhận diện lại, Quên kết quả |
| Lệnh thất bại | Bất kỳ lệnh quạt / profile / tuỳ chọn | Toast lỗi; mỗi nguồn một khoá (`thermal-fan`, `thermal-fan-profile`, `thermal-tray`) nên toast mới thay toast cũ; khoá được `dismiss` trước mỗi lần thử | Thử lại thao tác |
| Thiếu khoá / model | Không áp dụng (trang không dùng AI) | — | — |
| Module tắt | Cài đặt › Module tắt `thermal` | Trang, lệnh ⌘K, thẻ Trang chủ và hàng nền "Quạt" ẩn | — |
| Không có quyền hệ thống | Hộp mật khẩu quản trị bị huỷ | Rơi vào "Helper: lỗi" | Thử lại |

Ngưỡng màu nhiệt độ (`thermalTone`): dưới 70 °C chữ thường; 70–89,9 °C `--vzn-warning`; từ 90 °C `--vzn-danger`. Màu chỉ đổi chữ của giá trị, không tô nền hàng; con số luôn hiện nên màu không phải tín hiệu duy nhất.

## 6. Luồng tương tác chính

### 6.1 Đọc nhanh nhiệt độ

1. Mở trang → skeleton (`FeatureLoadingState`) trong lúc hỏi main có hỗ trợ không.
2. Hỗ trợ → renderer bật theo dõi; thân hiện "Đang đọc cảm biến…".
3. Snapshot đầu tiên → hai bảng xuất hiện. CPU và GPU mở, "Cảm biến khác" thu gọn với số nóng nhất trên tiêu đề.
4. Người dùng bấm một hàng gộp (ví dụ "Nhân hiệu năng · 30 cảm biến") → lưới mã thô mở bên dưới, nóng nhất trước.
5. Tải CPU xuất hiện từ lần đọc thứ hai. Ẩn cửa sổ → dừng đọc; hiện lại → đọc tiếp.

### 6.2 Bật điều khiển quạt (lần đầu, qua dialog miễn trừ)

1. Helper `idle`: header có chip "Điều khiển quạt đang tắt" và nút solid "Bật điều khiển quạt". Hàng quạt chỉ đọc "Tự động (hệ thống)".
2. Bấm nút → vì `acknowledged` còn `false`, dialog "Trước khi điều khiển quạt" mở: một câu giới thiệu (helper quyền quản trị, hệ thống sẽ hỏi mật khẩu), ba dấu ✓ xanh lá (chỉ đặt tốc độ trong giới hạn; tự về tự động khi thoát app / mất kết nối / ngủ / dậy; tự về tự động khi một cảm biến vượt 105 °C), một hộp cảnh báo vàng về rủi ro. Focus vào nút đóng của dialog; Tab bị giữ trong dialog.
3. "Hủy" / Esc / ✕ → đóng, focus về nút bật, không có gì thay đổi.
4. "Tôi hiểu, tiếp tục" → dialog đóng, ghi nhận đã đồng ý (lần sau không hỏi), helper khởi chạy: chip "Đang khởi chạy helper…" có spinner, nút bật bị tắt; macOS hiện hộp mật khẩu quản trị.
5a. Nhập mật khẩu → chip "Helper đã kết nối (v…)", nút đổi thành "Tắt điều khiển quạt" (danger outline). Toolbar quạt hiện ô Profile và "Về tự động"; mỗi quạt có ba nút chế độ. Nếu đã có profile ghi nhớ, main áp dụng lại và ô hiện tên profile.
5b. Huỷ mật khẩu / lỗi → chip đỏ "Không khởi chạy được helper", nút "Thử lại", toast lỗi.

### 6.3 Đổi profile quạt

1. Helper `ready`. Ô Profile đang hiện "Tùy chỉnh" (hoặc profile hiện tại).
2. Mở ô → danh sách: "Tùy chỉnh" (mờ, không chọn được), các profile có sẵn kèm mô tả (Theo hệ thống, Yên tĩnh, Mát, Gaming, AI local), rồi profile người dùng.
3. Chọn "Mát" → mọi điều khiển tắt trong lúc gửi; khi main trả lời, ô hiện "Mát", mỗi quạt chuyển "Theo cảm biến" với quy tắc của profile (tăng từ 45 °C, tối đa 75 °C theo CPU), vạch mục tiêu xuất hiện, hàng nền ở đáy thanh điều hướng đổi thành "Quạt · Mát".
4. Chỉnh tay một quạt bất kỳ → ô Profile về "Tùy chỉnh" (profile không còn `applied`).
5. Muốn giữ cấu hình tay: "Lưu profile" → nhập tên → Enter / "Lưu" → profile mới được chọn sẵn trong danh sách; khi đang chọn profile của người dùng, nút ✕ xoá xuất hiện cạnh ô.
6. Lỗi → toast "Không áp dụng được profile." (hoặc thông điệp của main); trạng thái quạt giữ nguyên như main báo.

### 6.4 Đặt tốc độ cố định

1. Helper `ready` (nếu chưa, đi qua 6.2 trước, kể cả dialog miễn trừ).
2. Ở hàng "Quạt trái", bấm "Cố định" → app giữ quạt ở tốc độ hiện tại (làm tròn 50 RPM, kẹp trong min/max). Nút "Cố định" thành soft + `aria-pressed`, số RPM to đổi màu nhấn, vạch mục tiêu xuất hiện trên thanh đo, ô "Tốc độ mục tiêu" hiện trong vùng xám.
3. Kéo thanh trượt (bước 50) hoặc gõ số rồi Enter → lệnh gửi một lần khi thả / Enter; số lẻ được làm tròn và kẹp, không báo lỗi.
4. Tốc độ thật (`RPM` to và phần tô của thanh đo) tiến dần về vạch mục tiêu qua vài lần đọc 2 giây.
5. Nếu helper tự khôi phục (máy ngủ, quá 105 °C, mất nhịp) → quạt về tự động và dòng "Helper đã trả quạt về tự động (…)" hiện dưới header.

### 6.5 Cho quạt theo cảm biến và nhận diện cảm biến

1. Bấm "Theo cảm biến" → quy tắc mặc định: CPU nóng nhất, tăng từ 50 °C, tối đa tại 90 °C (nếu đã nhận diện: "Cảm biến gần {quạt}").
2. Đổi "Cảm biến" trong danh sách, hoặc "Chọn cảm biến cụ thể…" → dialog lọc toàn bộ cảm biến thô; chọn một hàng → dialog đóng, ô hiện "{mã} (cảm biến cụ thể)".
3. Sửa ngưỡng → dòng "Hiện {°C} → {RPM}" cập nhật.
4. Nhận diện (tuỳ chọn): bánh răng → "Nhận diện cảm biến" → popover đóng, dialog "Nhận diện cảm biến của từng quạt" (ba chấm trung tính: vài phút và hơi ồn; chỉ tăng tốc; đặt máy trên mặt phẳng) → "Bắt đầu nhận diện" → thanh tiến trình dưới toolbar quạt, mọi điều khiển quạt tắt. Xong → popover ghi "Nhận diện lúc … · Quạt trái: 74 cảm biến · …" và mỗi quạt có mục "Cảm biến gần {quạt}".

### 6.6 Về tự động

1. Còn ít nhất một quạt bị app giữ → "Về tự động" trong toolbar quạt bật được.
2. Bấm → mọi quạt về "Tự động", vạch mục tiêu biến mất, số RPM về màu chữ thường; helper vẫn kết nối (chip xanh lá giữ nguyên). Ô Profile giữ giá trị main báo.
3. Muốn trả cả helper: "Tắt điều khiển quạt" trên header → quạt về tự động và helper thoát; chip "Điều khiển quạt đang tắt", hàng nền "Quạt · …" biến mất.
4. Một quạt riêng: bấm "Tự động" ở hàng đó.

### 6.7 Cấu hình số đo trên thanh menu

1. Bấm bánh răng → popover "Tùy chọn nhiệt độ" neo dưới nút; mục "Thanh menu" (macOS) / "Khay hệ thống" (Linux).
2. Bật "Hiện số đo trực tiếp" → mục thanh menu xuất hiện với "…", rồi `58°` ở lần đọc sau; các hàng chi tiết hiện trong popover; mọi điều khiển tắt trong lúc main lưu.
3. "Số đo" = CPU; bật "Kèm tốc độ quạt" → xuất hiện "Bố cục" (macOS) và "Tốc độ quạt".
4. Chọn "Xếp chồng" + "Rút gọn (2.4k)" → "Xem trước" thành chip hai dòng `58°` / `2.4k`, giống hệt mục thanh menu.
5. Tắt "Dấu độ (°)" → `58` / `2.4k`.
6. Đóng popover (Esc / click ra ngoài / ✕) → focus về bánh răng. Ẩn cửa sổ: mục thanh menu vẫn cập nhật mỗi 5 giây.
7. Từ thanh menu: click phải → "Ẩn nhiệt độ khỏi thanh menu" → công tắc trong popover tự tắt (đồng bộ qua `onSettingsChanged`).

## 7. Responsive

Lưới hai bảng của trang này dùng `.app-panel-grid` với container query theo vùng nội dung (`@container app-main (min-width: 900px)`, `src/index.css`).

| Bề rộng | Thay đổi |
| --- | --- |
| Vùng nội dung ≥ 900 px | Hai bảng cạnh nhau, mỗi bảng cao theo nội dung, thân cuộn chung |
| Vùng nội dung < 900 px | Một cột: bảng Quạt trên, bảng Nhiệt độ dưới |
| Cửa sổ < 900 px | Điều hướng chính thành rail 60 px (quy tắc chung) |
| Vùng nội dung < 560 px | Lề header còn `--vzn-space-4`. Hàng chế độ quạt và hàng ngưỡng tự xuống dòng (`flex-wrap`); hành động header xuống dòng dưới tiêu đề (`.page-header` wrap) |
| Cửa sổ ≤ 720 px rộng hoặc ≤ 600 px cao | Popover tuỳ chọn thành hộp thoại giữa cửa sổ dưới thanh tiêu đề (`ai-configuration.css`) |
| Mọi bề rộng | Toolbar bảng quạt **không** xuống dòng (`.thermal-panel .live-panel-toolbar { flex-wrap: nowrap }`): ô Profile co lại (`flex: 0 1 --vzn-thermal-tile-min-inline`); khi form "Lưu profile" mở ở bề rộng hẹp có nguy cơ tràn (mục 10) |

## 8. Bàn phím và trợ năng

- **Thứ tự Tab:** header (nút bật/tắt/thử lại → bánh răng) → toolbar quạt (Profile → ✕ xoá → Lưu profile → Về tự động) → từng quạt (Tự động → Cố định → Theo cảm biến → tham số) → toolbar nhiệt độ (không có điểm dừng) → tiêu đề nhóm → hàng gộp.
- **Phím tắt:** không có phím tắt riêng của trang. Ô số: Enter ghi, Esc khôi phục; thanh trượt: mũi tên đổi theo bước 50, mỗi lần nhả phím (hoặc nhả chuột) gửi một lệnh.
- **ARIA:** nút chế độ và nút bố cục có `aria-pressed`; nhóm chế độ là `fieldset` với `legend` ẩn = tên quạt; tiêu đề nhóm và hàng gộp có `aria-expanded` + `aria-controls`; bánh răng có `aria-label`, `aria-expanded`, `aria-haspopup="dialog"`; nút ✕ xoá profile có `aria-label` "Xóa profile {name}"; `Meter` là `<meter>` với `aria-label` = tên quạt, `aria-valuetext` = "{n} RPM" (vạch mục tiêu `aria-hidden`, chỉ có tooltip "Mục tiêu {rpm} RPM"); công tắc thanh menu nối nhãn qua `aria-labelledby` / `aria-describedby`; bảng nhiệt độ là `section` có `aria-label`; mỗi nhóm là `section` có `aria-label`.
- **Vùng trực tiếp:** "Đang đọc cảm biến…", tiến trình nhận diện (bảng quạt) và dòng trạng thái nhận diện (popover) đều `role="status"`; `FeatureLoadingState` `role="status"`. Bảng nhiệt độ **không** là vùng live (tránh đọc lại mỗi 2 giây).
- **Lớp phủ:** popover focus vào điều khiển đầu tiên, Esc / click ngoài đóng và trả focus về bánh răng. `DialogShell` focus nút đóng, giữ Tab, Esc đóng, trả focus về nơi mở; dialog cảm biến thô tự focus ô lọc.
- **Không chỉ dùng màu:** giá trị nhiệt độ luôn là số; chế độ quạt có `aria-pressed` và chữ; trạng thái helper có chữ trên chip.
- **Trạng thái helper đọc được:** lỗi helper và đường dẫn thiếu hiện trong `CapabilityNotice` dưới header, không chỉ trong `title` của chip.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `nav_thermal`, `thermal_title` | Nhiệt độ & quạt |
| `command_palette_thermal_description` | Theo dõi nhiệt độ, tốc độ quạt và tải CPU |
| `thermal_fans_title` | Quạt |
| `thermal_sensors_title` | Nhiệt độ |
| `thermal_group_cpu` / `thermal_group_gpu` / `thermal_group_other` | CPU / GPU / Cảm biến khác |
| `thermal_group_expand` / `thermal_group_collapse` | Mở nhóm {group} / Thu gọn nhóm {group} |
| `thermal_sensor_row_caption` | {count} cảm biến · TB {avg} |
| `thermal_sensor_unlabeled` | Cảm biến chưa nhận diện |
| `thermal_sensor_expand` / `thermal_sensor_collapse` | Hiện từng cảm biến / Ẩn các cảm biến |
| `thermal_cpu_load` / `thermal_hottest` / `thermal_sensor_count` | Tải CPU / Cảm biến nóng nhất / {count} cảm biến |
| `thermal_waiting` | Đang đọc cảm biến… |
| `thermal_no_fans` / `thermal_no_sensors` | Máy này không báo cáo quạt nào. / Không tìm thấy cảm biến nhiệt độ nào. |
| `thermal_no_sensors_title` / `_desc` | Không tìm thấy cảm biến nhiệt độ / Máy này không báo cáo cảm biến nhiệt độ nào mà Viezan đọc được… |
| `thermal_unsupported_title` / `_desc` | Chưa khả dụng trên hệ thống này / Viezan đọc cảm biến trên macOS qua trình đọc SMC đi kèm và trên Linux qua hwmon. Windows chưa được hỗ trợ. |
| `thermal_reader_missing_title` / `_desc` | Thiếu trình đọc cảm biến / Không tìm thấy tệp viezan-smc bên cạnh ứng dụng… |
| `thermal_error_title` / `thermal_retry` | Không đọc được cảm biến / Thử lại |
| `thermal_fan_helper_idle_title` | Điều khiển quạt đang tắt |
| `thermal_fan_helper_starting` | Đang khởi chạy helper… |
| `thermal_fan_helper_ready` | Helper đã kết nối (v{version}) |
| `thermal_fan_helper_error_title` | Không khởi chạy được helper |
| `thermal_fan_helper_missing_short` / `thermal_fan_helper_missing` | Thiếu helper / Không tìm thấy tệp viezan-fan-helper bên cạnh ứng dụng… |
| `thermal_fan_enable` / `thermal_fan_disable` / `thermal_fan_retry` | Bật điều khiển quạt / Tắt điều khiển quạt / Thử lại |
| `thermal_fan_restore_all` | Về tự động |
| `thermal_fan_mode_auto` / `_fixed` / `_sensor` / `_system` | Tự động / Cố định / Theo cảm biến / Tự động (hệ thống) |
| `thermal_fan_target_label` / `thermal_fan_target` | Tốc độ mục tiêu / Mục tiêu {rpm} RPM |
| `thermal_fan_sensor_source` / `_low` / `_high` | Cảm biến / Tăng tốc từ / tối đa tại |
| `thermal_fan_sensor_now` / `thermal_fan_sensor_missing` | Hiện {celsius} → {rpm} / Cảm biến này không có trong lần đọc hiện tại; quạt giữ mục tiêu gần nhất. |
| `thermal_fan_source_group_cpu` / `_gpu` / `_all` | CPU (cảm biến nóng nhất) / GPU (cảm biến nóng nhất) / Cảm biến nóng nhất toàn máy |
| `thermal_fan_source_advanced` / `thermal_fan_source_raw` | Chọn cảm biến cụ thể… / {code} (cảm biến cụ thể) |
| `thermal_fan_source_dialog_title` / `_desc` | Cảm biến cụ thể / Toàn bộ cảm biến thô máy này báo cáo. Quạt sẽ chỉ theo đúng một cảm biến này. |
| `thermal_fan_source_filter` / `_filter_clear` / `_no_match` / `_close` | Lọc theo tên hoặc mã / Xóa bộ lọc / Không có cảm biến nào khớp. / Đóng |
| `thermal_fan_source_affinity` / `_affinity_desc` | Cảm biến gần {fan} / làm mát {sensors} |
| `thermal_fan_profiles_title` / `thermal_fan_profile_custom` | Profile / Tùy chỉnh |
| `thermal_fan_profile_save` / `_name_placeholder` / `_save_confirm` / `_save_cancel` | Lưu profile / Tên profile / Lưu / Hủy |
| `thermal_fan_profile_delete` / `thermal_fan_profile_error` | Xóa profile {name} / Không áp dụng được profile. |
| `thermal_fan_profile_builtin_*` | Theo hệ thống · Yên tĩnh · Mát · Gaming · AI local (kèm mô tả `_desc`) |
| `thermal_fan_restored_reason` + `thermal_fan_reason_*` | Helper đã trả quạt về tự động ({reason}). — không nhận được nhịp từ app / chạm trần nhiệt độ / máy đi ngủ / máy vừa dậy / mất kết nối |
| `thermal_fan_disclaimer_title` / `_intro` | Trước khi điều khiển quạt / Viezan sẽ chạy một helper nhỏ với quyền quản trị cho phiên này. Hệ thống sẽ hỏi mật khẩu. |
| `thermal_fan_disclaimer_point_range` / `_restore` / `_ceiling` | Chỉ đặt tốc độ trong giới hạn máy cho phép / Tự trả quạt về tự động khi thoát app, mất kết nối, máy ngủ hoặc dậy / Tự trả về tự động khi một cảm biến vượt {ceiling}°C |
| `thermal_fan_disclaimer_warning` | Cho quạt chạy chậm hơn hệ thống có thể làm máy nóng hơn và giảm tuổi thọ linh kiện. Bạn tự chịu trách nhiệm khi dùng. |
| `thermal_fan_disclaimer_accept` / `_cancel` | Tôi hiểu, tiếp tục / Hủy |
| `thermal_fan_calibrate` / `_desc` | Nhận diện cảm biến / Cho từng quạt chạy tối đa một lúc và ghi lại cảm biến nào mát đi… |
| `thermal_fan_calibrate_confirm_title` / `_intro` / `_accept` | Nhận diện cảm biến của từng quạt / Viezan cho từng quạt chạy tối đa khoảng một phút… / Bắt đầu nhận diện |
| `thermal_fan_calibrate_progress` + `_phase_*` | {fan} ({current}/{total}) · {phase} · {seconds} s — đo lúc nghỉ / chạy tối đa / chờ ổn định |
| `thermal_fan_calibrate_cancel` / `_clear` / `_cancelled` / `_error` / `thermal_fan_calibrated_at` | Dừng nhận diện / Quên kết quả / Đã dừng nhận diện; quạt về tự động. / Nhận diện thất bại. / Nhận diện lúc {date} |
| `thermal_options_title` / `thermal_options_desc` / `thermal_options_desc_fans` | Tùy chọn nhiệt độ / Số đo bên ngoài cửa sổ này. / Nhận diện cảm biến cho quạt và số đo bên ngoài cửa sổ này. |
| `thermal_tray_section_menu_bar` / `_tray` | Thanh menu / Khay hệ thống |
| `thermal_tray_enable` + `_desc_menu_bar` / `_desc_tray` | Hiện số đo trực tiếp — Nhiệt độ nằm trên thanh menu và tiếp tục cập nhật mỗi năm giây khi cửa sổ này đang ẩn. |
| `thermal_tray_metric` / `thermal_tray_show_fan` / `thermal_tray_layout` (+ `_inline` / `_stacked`) | Số đo / Kèm tốc độ quạt / Bố cục — Một dòng / Xếp chồng |
| `thermal_tray_fan_format` (+ `_rpm` / `_short`) | Tốc độ quạt — Đầy đủ (2374) / Rút gọn (2.4k) |
| `thermal_tray_show_unit` / `thermal_tray_preview` / `thermal_tray_error` | Dấu độ (°) / Xem trước / Không lưu được tuỳ chọn thanh menu. |
| `nav_background_fans_profile` / `nav_background_fans_custom` | Quạt · {profile} / Quạt · tuỳ chỉnh |
| Menu thanh menu (main, `electron/trayManager.ts`, không qua i18n renderer) | Mở Viezan · Ẩn nhiệt độ khỏi thanh menu |

Lưu ý chính tả: chuỗi hiện có trộn "Tùy/Hủy/Xóa" và "tuỳ" (`thermal_tray_error`, `nav_background_fans_custom`). Đặc tả giữ nguyên chữ của mã; thống nhất là việc của i18n.

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ gốc ↔ mã:

1. **Công tắc chế độ:** board `Thermal` vẽ segmented control nền xám; mã dùng ba nút pill `sm` (`primary·soft` khi chọn, `neutral·ghost` khi không). Đặc tả theo mã (đúng hợp đồng Button).
2. **Tiêu đề bảng nhiệt độ:** board "Cảm biến"; mã "Nhiệt độ" (`thermal_sensors_title`). Giữ mã.
3. **Câu "Hệ thống đang dừng quạt vì máy mát."** dưới quạt 0 RPM (board `Thermal`) — **đề xuất**, mã chưa có.
4. **Thông báo khôi phục có hành động "Bật lại profile Mát?"** (board `States`) — mã chỉ có dòng chữ `.thermal-notice`, không nút. **Đề xuất:** thêm nút `xs · primary · outline` "Bật lại {profile}" khi có profile ghi nhớ.
5. **Menu thanh menu:** board `SmallSurfaces` có dòng tóm tắt "CPU 58,2°C · Quạt …", "Mở Nhiệt độ & quạt", "Ẩn số đo"; mã có "Mở Viezan" (mở cửa sổ chính, không vào trang) và "Ẩn nhiệt độ khỏi thanh menu". **Đề xuất:** thêm dòng tóm tắt và mục mở thẳng trang.
6. **Popover:** board `Popovers` vẽ "Tốc độ quạt" dạng segmented; mã dùng `SelectField`.
7. **Thông số dialog nhận diện:** board ghi "khoảng 3 phút 30 giây với hai quạt"; mã ghi chung "Mất vài phút và hơi ồn". Giữ mã (không bịa thời lượng).

Thiếu sót trong mã (không có trong bản vẽ):

8. **Khoá i18n không dùng:** `thermal_subtitle` (header không có mô tả), `thermal_fan_control_title`, `thermal_fan_control_desc`, `thermal_fan_helper_idle_desc` ("Bật sẽ hỏi mật khẩu quản trị…"), `thermal_fan_helper_unsupported`, `thermal_fan_profiles_desc`, `thermal_history_hint`, `thermal_fan_range`, `thermal_fan_reason_client`. **Đề xuất:** dùng `thermal_subtitle` làm `description` của `PageHeader` và `thermal_fan_helper_idle_desc` làm tooltip/mô tả nút bật, hoặc xoá.
9. **Lịch sử / sparkline:** `useThermalMonitor` giữ 90 mẫu mỗi cảm biến và quạt nhưng trang không vẽ. **Đề xuất** (nếu cần): sparkline trong hàng cảm biến.
10. **Xoá profile không xác nhận và không hoàn tác.** **Đề xuất:** toast có "Hoàn tác" hoặc xác nhận nhỏ.
11. **Nút đang chạy không có spinner:** khi bận, mọi nút chỉ bị `disabled` (trừ chip "Đang khởi chạy helper…"). Nền tảng yêu cầu nhãn "Đang …" — **đề xuất** cho áp dụng profile và Về tự động.
12. **Toolbar quạt `nowrap`:** khi helper `ready` và form "Lưu profile" mở (ô tên + Lưu + Hủy) cạnh ô Profile, nút ✕ và "Về tự động", toolbar có thể tràn ở vùng hẹp. Chưa kiểm chứng bằng QA hình ảnh; **đề xuất** cho form xuống một hàng riêng dưới toolbar.
13. **Hai vùng `role="status"` cho cùng tiến trình nhận diện** (bảng quạt và popover) có thể đọc trùng khi popover mở.
14. **Đồng ý miễn trừ:** trang ghi `acknowledged` mà không chờ kết quả; nếu lưu thất bại, dialog sẽ hỏi lại lần sau (an toàn, nhưng im lặng).
15. **Chuỗi lỗi từ main chưa qua i18n:** các hook đã bỏ chuỗi dự phòng tiếng Anh, nhưng thông báo lỗi đọc cảm biến và lỗi lệnh quạt do main gửi về (`error`, `res.error`, `control.error`) vẫn hiển thị nguyên văn, nên người dùng tiếng Việt có thể thấy câu tiếng Anh trong `CapabilityNotice` và toast. **Đề xuất:** ánh xạ mã lỗi sang khoá i18n, chỉ giữ chi tiết kỹ thuật làm dòng phụ.
