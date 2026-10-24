# Cài đặt

> Bản vẽ gốc: `boards/Settings.dc.html` (Mô hình AI), `boards/SettingsSections.dc.html` (Chung, Giọng nói, Chat, Module, Cập nhật), `boards/SettingsAppearance.dc.html`, `boards/SettingsAbout.dc.html`, `boards/Providers.dc.html` (AI local, khoá API) · Board chi tiết: `specs/settings.html` · Mã nguồn: `src/pages/SettingsPage.tsx`, `src/pages/settings/*.tsx`

Luật chung (token, nút, bề mặt, responsive, trạng thái) nằm ở [`../foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng của trang Cài đặt.

## 1. Mục đích

Cài đặt là nơi duy nhất người dùng cấu hình những gì dùng chung cho cả ứng dụng: ngôn ngữ và hành vi dịch mặc định, giao diện (chế độ, phong cách, màu nhấn, cỡ chữ), nguồn AI (runtime local, khoá đám mây, tìm kiếm web, chi phí), giọng nói (nhận dạng và đọc to), chat (preset lời nhắc, phím gửi, ảnh đã lưu), bật tắt module, cập nhật và thông tin ứng dụng. Người dùng đến đây khi lần đầu thêm khoá hoặc tải model, khi một trang báo thiếu khoá/model, khi có bản cập nhật, hoặc khi muốn đổi diện mạo. Thành công là: thay đổi áp dụng ngay (không có nút "Lưu" cấp trang), trạng thái của từng hàng nói rõ điều gì đã sẵn sàng, và mọi kết quả bất đồng bộ (xác minh khoá, tải model, cập nhật) được báo bằng toast có khoá chủ riêng để không chồng lên nhau.

Trang là một cột cuộn duy nhất chứa tám mục theo thứ tự cố định (`SettingsPage.tsx`, mảng `sections`): **Chung** (`preferences`) · **Giao diện** (`appearance`) · **Mô hình AI** (`api`) · **Giọng nói** (`voice`) · **Chat** (`chat`) · **Module** (`modules`) · **Cập nhật** (`updates`) · **Giới thiệu** (`about`). Danh sách mục bên trái là mục lục có scroll-spy, không phải các trang riêng.

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng chính | Mục "Cài đặt" (ghim đáy) | `openSettings()` — mở ở đầu trang, `settingsInitialSection: null` (`src/store/slices/coreSlice.ts`) |
| Bảng lệnh ⌘K | Lệnh "Cài đặt" (mô tả `command_palette_settings_description`) | `src/components/organisms/CommandPalette.tsx` gọi `openSettings()` |
| Launcher / popup hỏi nhanh | Hành động "settings" | `window.api.quickChat.openSettings()` → main gửi `quick-chat:open-settings` → `App.tsx` gọi `openSettings()` |
| Trang chủ | Nút "Quản lý mô hình" (`home_ai_manage`) ở thẻ AI | `openSettingsAt('api')` (`src/pages/HomePage.tsx`) |
| Tin nhắn lỗi trong AI Chat | Nút "Đổi model hoặc khoá" (`chat_error_change_model`) trên tin trả lời cuối | `openSettingsAt('api')` (`src/components/chat/MessageBubble.tsx`) |
| Popup cập nhật / toast cập nhật | Nút mở Cài đặt | `openSettingsAt('updates')` (`src/components/organisms/UpdateNotification.tsx`, sự kiện `updater:openSettings`) |
| Toast lỗi ở Từ điển, Phiên dịch | Hành động "Mở Cài đặt" (`translate_error_open_settings`) | `openSettings()` — mở ở đầu trang, không cuộn tới mục khoá |
| Popover cấu hình AI của Chat | Link tới Cài đặt | `openSettings()` rồi đóng popover (`src/pages/ChatPageV2.tsx`) |
| Giới thiệu › "Kiểm tra cập nhật" | Nội bộ trang | Đặt `settingsInitialSection: 'updates'` để cuộn tới mục Cập nhật rồi gọi `updater.check()` |

**Liên kết sâu.** `SettingsSectionTarget = 'updates' | 'api' | 'appearance' | 'modules'`. Khi `settingsInitialSection` có giá trị, `SettingsPage` gọi `scrollToSection(id)` (cuộn, đánh dấu mục, focus `<section tabIndex={-1}>`) rồi đặt lại `null`. Nếu ô tìm kiếm đang lọc mất mục đích, liên kết không cuộn được (mục không tồn tại trong DOM).

**Điểm ra.** Cài đặt không có nút đóng; người dùng rời trang bằng thanh điều hướng. Các link ngoài (lấy khoá, ghi chú phát hành, Jina, trang tải runtime) mở bằng `window.api.openExternal`. "Cài đặt & khởi động lại" thoát ứng dụng để cài.

## 3. Bố cục

Sơ đồ ở cửa sổ 1200 px, thanh điều hướng chính mở rộng (236 px):

```
┌ Title bar 40 ───────────────────────────────────────────────────────────────────────┐
├ Primary nav 236 ┬ PageHeader 56 (--vzn-page-header-min-height) ────────────────────┤
│                 │ Cài đặt                                  [⌕ Tìm trong cài đặt ×]  │
│                 ├ SettingsTemplate (.settings-shell) ─────────────────────────────────┤
│                 │ aside 240          │ .settings-scroll-viewport (cuộn độc lập)       │
│                 │ (SettingsNavigation│  ┌ cột tối đa 768 (max-w-3xl), lề 24/24 ──┐   │
│                 │  mode="sidebar")   │  │ h2 Chung · mô tả                      │   │
│                 │ ▸ Chung  (đang đọc)│  │ ┌ ui-settings-card ─────────────────┐ │   │
│                 │   Giao diện        │  │ │ Nhãn hàng · mô tả     [điều khiển]│ │   │
│                 │   Mô hình AI       │  │ │ ───────────────────────────────── │ │   │
│                 │   Giọng nói        │  │ │ …                                 │ │   │
│                 │   Chat             │  │ └───────────────────────────────────┘ │   │
│                 │   Module           │  │ (khoảng 32 giữa các mục — space-y-8) │   │
│                 │   Cập nhật         │  │ h2 Giao diện …                        │   │
│                 │   Giới thiệu       │  └───────────────────────────────────────┘   │
└─────────────────┴────────────────────┴────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header trang | `PageHeader` (`src/components/templates/PageHeader.tsx`) | `--vzn-page-header-min-height` (56), nền `--vzn-surface`, tiêu đề `--vzn-font-size-title-lg` | Không |
| Ô tìm kiếm | `FilterInput size="sm"` (`wrapperClassName="settings-search"`) | Cao `--vzn-control-height-sm` (32); có nút xoá `xs` khi có chữ | Không |
| Khung trang | `SettingsTemplate` (`.settings-shell`) | Lưới `240px minmax(0,1fr)` (`src/index.css`), nền `--vzn-bg` (`src/styles/codex.css`) | — |
| Danh sách mục | `SettingsNavigation mode="sidebar"` (`src/components/organisms/SettingsNavigation.tsx`) | Mỗi mục là `Button size="md" shape="rect"`; icon bị ẩn trong cột này (`.settings-shell aside .btn-nav-item > svg { display: none }`); nền trong suốt, không viền phải | Riêng (`overflow-auto`) |
| Tab mục (cửa sổ < 768) | `SettingsNavigation mode="tabs"` | Hàng nút `md` có icon 14, cuộn ngang, đường kẻ dưới | Ngang |
| Vùng nội dung | `.settings-scroll-viewport` | Container `settings-content` (container query); `overscroll-behavior: contain` | Dọc |
| Cột nội dung | `div.max-w-3xl.mx-auto` | Tối đa 768; lề `px-6 py-6` (24) ở ≥ 768, `px-4 py-5` dưới đó; các mục cách nhau 32 (`space-y-8`) | — |
| Một mục | `<section data-settings-section aria-label tabIndex={-1}>` + `.settings-section-stack` | Tiêu đề `.settings-section-title` (`--vzn-font-size-title-lg`, semibold), mô tả `.settings-section-desc` (`--vzn-font-size-md`, muted); thẻ cách nhau `--vzn-space-4` | — |
| Thẻ | `SettingsCard` / `.ui-settings-card` (`src/components/ui/molecules/SettingsCard.tsx`, `src/styles/molecules.css`) | Viền `--vzn-border`, bo `--vzn-radius-md`, nền `--vzn-surface`; header lề 16, tiêu đề `--vzn-font-size-subtitle` | — |
| Hàng | `SettingsRow` (`.ui-settings-row`) | Lề `--vzn-space-3` × `--vzn-space-4`; nhãn `--vzn-font-size-lg`; mô tả `--vzn-font-size-sm`; cột chữ ưu tiên `--vzn-settings-row-copy-basis` (220) rồi điều khiển xuống dòng; vùng `below` cho phần mở rộng | — |
| Trạng thái | `StatusLabel` (`.ui-status-label`) | Chấm `StatusDot` + chữ; tone `ok` / `warning` / `danger` / `neutral` | — |
| Xem trước giao diện | `.appearance-preview` | Cột `--vzn-appearance-preview-width` (300), `position: sticky` | Dính khi cuộn |

## 4. Thành phần và hành động

Ký hiệu loại nút: `size · variant · appearance`. Mọi công tắc là `ToggleSwitch` (`role="switch"`, `aria-checked`, `src/components/ui/ToggleSwitch.tsx`). Nhóm lựa chọn ngắn là `ButtonGroup` (`<fieldset aria-label>` với các nút `aria-pressed`, `src/components/ui/ButtonGroup.tsx`). Ô chọn là `SelectField` (`aria-haspopup="listbox"`, menu nổi neo vào nút, `src/components/ui/molecules/SelectField.tsx`).

### 4.0 Khung trang

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Ô "Tìm trong cài đặt" | `FilterInput sm` | Gõ | Lọc mục theo `label + description` của mục (không lọc theo nhãn hàng), không phân biệt hoa thường | Danh sách mục và nội dung cùng thu lại ngay; 0 kết quả hiện "Không có mục cài đặt nào khớp." (`role="status"`) | — |
| P2 | Nút xoá tìm kiếm | `xs` icon (trong `FilterInput`), `aria-label="Xoá tìm kiếm"` | Bấm | Xoá chuỗi | Hiện lại đủ 8 mục | Ẩn khi ô trống |
| P3 | Mục điều hướng (×8) | `md · primary · soft` khi đang đọc, `md · neutral · ghost` khi không; `aria-current="true"`; `title` = mô tả mục | Bấm | Cuộn vùng nội dung tới đầu mục, focus `<section>` (không cuộn lần hai) | Mục được đánh dấu ngay và giữ 600 ms (`SCROLL_LOCK_MS`) để scroll-spy không đổi giữa chừng | — |
| P4 | Scroll-spy | Tự động | Cuộn vùng nội dung | Mục đang đọc là mục cuối có đỉnh vượt qua "đường đọc" ở 25 % chiều cao khung (`ACTIVE_SECTION_LINE_RATIO`); chạm đáy thì mục cuối thắng | `aria-current` chuyển; ở chế độ tab, tab đang chọn được cuộn vào tầm nhìn | — |

### 4.1 Chung (`PreferencesSection.tsx`)

Một thẻ không tiêu đề (`.ui-settings-card`), tiêu đề mục "Chung" và mô tả `settings_prefs_card_desc`.

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Ngôn ngữ ứng dụng | `OptionPicker` (nút `md`, `aria-haspopup="dialog"`) — "Theo hệ thống" + EN/VI/JA | Chọn | "Theo hệ thống": `setLocaleAuto(true)` + `setLocaleFromSystem(detectSystemLocale())`; ngôn ngữ cố định: `setLocale()` | Toàn bộ giao diện đổi ngôn ngữ ngay | — |
| G2 | Khởi động cùng hệ thống | Công tắc | Bật/tắt | `window.api.setLoginItemSettings(enabled)`; giá trị thật lấy từ hệ điều hành | Công tắc bị tắt trong lúc lưu; lỗi → toast đỏ `settings_launch_at_login_error` (khoá `settings-login-item`), công tắc giữ giá trị cũ | Cả hàng **ẩn** khi bản dựng/nền tảng không hỗ trợ (`supported: false`) hoặc main chưa trả lời |
| G3 | Tự động dịch | Công tắc | Bật/tắt | `setAutoTranslate` | Hàng G4 hiện/ẩn ngay | — |
| G4 | Độ trễ dịch | `ButtonGroup sm`: Ngắn 500 ms · Vừa 800 ms · Dài 1500 ms | Chọn | `setAutoTranslateDelay(ms)`; giá trị lưu cũ được làm tròn về lựa chọn gần nhất | Nút chọn `aria-pressed` | Chỉ hiện khi G3 bật |
| G5 | Phiên âm | Công tắc | Bật/tắt | `setPhoneticMode('standard' | 'off')` | — | — |
| G6 | Dự phòng khi dịch ảnh | Công tắc (mặc định tắt) | Bật/tắt | `setImageProviderFallback` — cho phép gửi ảnh sang nhà cung cấp khác đã có khoá | — | — |

### 4.2 Giao diện (`AppearanceSection.tsx`)

Hai cột: các thẻ (`.appearance-cards`) bên trái, xem trước (`.appearance-preview`, 300) bên phải. Ba trục độc lập theo `AGENTS.md` và `foundations.md` §2.

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Chế độ: Sáng · Tối · Hệ thống | `ButtonGroup sm` ở `aside` của thẻ "Chế độ" | Chọn | `setTheme('light' | 'dark' | 'system')` | Cả cửa sổ đổi ngay; "Hệ thống" theo `prefers-color-scheme` (bắt sự kiện thay đổi) | **Bị khoá** khi phong cách đang lưu là `darkOnly` (Midnight): mô tả đổi thành "Phong cách đang chọn chỉ có bản tối" |
| A2 | Phong cách: Graphite · Glass · Paper · Corporate · Midnight | `ThemePresetPicker` — `role="radiogroup"`, mỗi ô `role="radio"` `aria-checked`, `Button size="lg"`; Midnight có nhãn "Luôn tối" | Bấm / phím mũi tên | `setThemePreset` | Di chuột hoặc focus vào ô → xem trước đổi theo ô đó (`onPreview`), cửa sổ vẫn giữ lựa chọn đã lưu; dòng ghi chú `aria-live="polite"` đọc "Tên · mô tả" của ô đang xem | — |
| A3 | Màu nhấn: Theo phong cách · Tím · Hồng · Xanh ngọc · Xanh lá · Hổ phách · Đỏ | `AccentPicker` — `role="radiogroup"`, chấm tròn `role="radio"` `aria-label` | Bấm / phím mũi tên | `setThemeAccent` (`'auto'` không đặt `data-accent`) | Hover/focus → xem trước màu; chấm vẽ theo chế độ thật của cửa sổ | — |
| A4 | Cỡ chữ: Nhỏ · Vừa · Lớn | `FontSizePicker` → `ButtonGroup sm` ở `aside` thẻ "Cỡ chữ" | Chọn | `setFontSize` | Cả ứng dụng đổi cỡ ngay | — |
| A5 | Xem trước | `ThemePreview` (`aside aria-label="Xem trước"`) | Theo hover/focus của A2/A3 | Vẽ một cảnh AI Chat thu nhỏ (tiêu đề, tin trợ lý, tin người dùng, ô soạn) bằng persona đang xem | Tối nếu persona `darkOnly` hoặc cửa sổ đang tối | — |

### 4.3 Mô hình AI (`ApiKeysSection.tsx`)

Bốn thẻ theo thứ tự: **AI local**, **Nhà cung cấp đám mây**, **Tìm kiếm web**, **Theo dõi chi phí**.

#### Thẻ AI local (`LocalAiProviderCard`)

Header: tiêu đề "AI local", mô tả `settings_local_ai_desc + engine · endpoint` khi chạy (hoặc "Chưa phát hiện runtime local"), `aside` là `StatusLabel` "Đang chạy" (tone `ok`) / "Chưa chạy" (`neutral`). Khi mở trang, `refreshLocalAi()` gọi `ensureLocalAiRuntime()` (tự khởi động Ollama nếu có) hoặc `discoverLocalAi(true)`.

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | "Mở trang tải runtime" (hàng "Thiết lập runtime local") | `sm · primary · solid` | Bấm | `window.api.installOllama()` chỉ **mở trang tải**; người dùng tự cài rồi quay lại bấm L4 | Toast xanh `settings_local_ai_manual_install_opened` hoặc toast đỏ lỗi (khoá `settings-local-ai`) | Hàng chỉ hiện khi engine không phải `ollama`; nút tắt trong lúc đang mở trang |
| L2 | Hàng model gợi ý (tối đa 5) — "Tải" | `sm · neutral · outline` + icon tải | Bấm | `downloadLocalAiModel(id)`; tiến độ đến qua `onLocalAiModelDownloadProgress` | Nút đổi thành spinner + "54%"; vùng `below` hiện "Đang tải model: [thông điệp]" và "x/y GB · 54%" cùng `Meter` (`aria-valuetext`); xong → toast "Đã tải: [model]" và danh mục được làm mới | Tắt khi **bất kỳ** model nào đang tải hoặc đang gỡ |
| L3 | Hàng model đã cài — "Gỡ" | `sm · danger · ghost` | Bấm (không hỏi xác nhận) | `uninstallLocalAiModel(id)` | Spinner + "Đang gỡ..."; xong → toast "Đã gỡ: [model]"; lỗi → toast đỏ | Như L2 |
| L2' | Hàng model khi chưa có Ollama | Chữ tĩnh `.local-ai-model-state` "Chờ runtime" | — | — | — | Không có nút |
| L4 | Làm mới (hàng "Hiệu năng") | `sm · neutral · ghost` icon, `aria-label="Tải lại"` | Bấm | Gọi lại `refreshLocalAi()`; cập nhật `keyStatus.local`, danh sách model, và chỉ đổi model local đã chọn khi model cũ không còn | Icon thành spinner | Tắt khi đang làm mới |
| L5 | "Đo hiệu năng" | `sm · neutral · outline` | Bấm | `benchmarkLocalAi()` → chỉ số tốc độ/độ trễ/GPU | Spinner + "Đang đo máy..." | Tắt khi đang đo |
| L6 | "Chi tiết" | `sm · neutral · ghost` (thành `soft` khi mở), `aria-expanded` | Bấm | Mở vùng `below`: ô chỉ số (`.local-ai-metrics`: Tốc độ model tok/s hoặc Thời gian đo, Trên GPU %, Độ trễ ms), cảnh báo vàng khi GPU < 100 % (`CapabilityNotice`), và khối "So sánh hiệu năng AI cục bộ" | — | Chỉ hiện khi có chỉ số hoặc engine là `ollama` |
| L7 | Khối so sánh: ô "Model đã cài" | `SelectField` | Chọn | Nạp trạng thái hiệu năng của model đó (`getLocalAiPerformance`) | — | Tắt khi đang đo/đang tải; cả khối ẩn khi chưa có model đã cài |
| L8 | "So sánh GPU / CPU + GPU" | `md · primary · outline` | Bấm | Mở hộp xác nhận nội tuyến (`role="alertdialog"`) với cảnh báo nạp lại model | — | Tắt khi đang đo/tải hoặc chưa có model |
| L9 | "Cho phép nạp lại và đo" / "Để sau" | `md · primary · solid` / `md · neutral · outline` | Bấm | Chạy `compareLocalAiPerformance({ consentToReload: true })` / đóng hộp | Dòng `role="status"` "Đang so sánh hai chế độ…"; nút L8 đổi nhãn "Đang đo máy..."; kết quả là bảng Chế độ · Tốc độ · Token đầu tiên · VRAM/RAM, có "Nhanh nhất đã đo", "Chưa đủ điều kiện" + `<details>` "Chi tiết lỗi" | — |
| L10 | "Dừng so sánh" | `md · danger · outline` | Bấm | `cancelLocalAiPerformance()` | — | Chỉ hiện khi đang đo |
| L11 | Cấu hình đã chọn: Mặc định runtime · GPU · CPU + GPU | Nhóm `md`, chọn = `primary · soft` + `aria-pressed`, còn lại `neutral · outline` | Bấm | `selectLocalAiPerformance(model, mode)`; áp dụng ở yêu cầu tiếp theo | — | GPU / CPU + GPU tắt cho đến khi có kết quả đo `ok` và `qualityPassed` cho chế độ đó |

#### Thẻ Nhà cung cấp đám mây (`ApiKeyInput` → `CredentialCard`)

Header: "Nhà cung cấp đám mây", mô tả "Khoá được lưu trong Keychain của hệ điều hành.", `aside` "Tổng chi phí: [số tiền]" (cộng dồn `apiKeyUsageTotals`, theo đơn vị tiền đã chọn). Một hàng cho mỗi nhà cung cấp có `requiresApiKey` (OpenAI GPT, Anthropic Claude, Gemini — `src/constants/providers.ts`).

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | "Lấy API key ↗" | Link chữ `.settings-inline-link` (ngoại lệ `<button>` gốc có ghi chú trong mã) | Bấm | Mở `provider.docsUrl` | — | — |
| K2 | Trạng thái | `StatusLabel`: "Đã có khoá" (`ok`) · "Chưa có khoá" (`neutral`) · "Không khả dụng" (`danger`, khi xác minh lỗi) | — | — | — | — |
| K3 | "Sửa" (đã có khoá) / "Thêm khoá" (chưa có) | `sm · neutral · outline`, thành `soft` khi trình sửa mở; `aria-expanded`, `aria-controls` | Bấm | Mở/đóng trình sửa nội tuyến dưới hàng | Trình sửa luôn mở khi đang có chữ, đang xác minh hoặc vừa lỗi | — |
| K4 | Ô khoá | `input type="password"` `.field-input-mono`, `autoComplete="off"` | Gõ / dán; Enter = gửi | Lưu tạm trong state; gõ lại sẽ xoá trạng thái lỗi | Viền xanh khi thành công, đỏ khi lỗi | Với khoá đã lưu: ô hiện giá trị che (`masked`) và **chỉ đọc** (xem §10) |
| K5 | "Xác minh" | `md · primary · solid` (thành `danger · solid` "Thử lại" sau lỗi) | Bấm hoặc Enter | `window.api.verifyKey(provider, key)` rồi lưu vào Keychain và tải danh mục model | Spinner + "Đang xác minh…" → "✓ Đã xác minh!" (5 s, `VERIFY_STATUS_RESET_DELAY_MS`) và trình sửa đóng | Tắt khi ô trống hoặc đang xác minh |
| K6 | Xoá khoá | `xs · danger · soft` icon thùng rác trong ô che, `aria-label="Xóa"` | Bấm → `confirm()` của hệ thống | `keychain.delete`; xoá model động và đặt lại chi phí của nhà cung cấp | Spinner trong nút; lỗi → toast đỏ `settings_key_store_failed` | Tắt khi đang xoá |
| K7 | Thống kê chi phí (`ProviderCostStats`) | Huy hiệu "Tổng chi phí ~x", Lượt gọi, Tokens, Lần cuối (vừa xong / n phút / giờ / ngày trước) + nút "Reset" `sm · danger · soft` | Bấm "Reset" → `confirm("Reset thống kê chi phí cho {name}?")` | `resetProviderUsageCost` | Huy hiệu biến mất | Cả cụm ẩn khi chưa có lượt gọi |

**Kết quả xác minh (K5)** — toast khoá chủ `settings-api-key-{provider}`:

| Mã | Lưu khoá? | Toast | Thời gian toast |
| --- | --- | --- | --- |
| hợp lệ | Có | Xanh `settings_msg_valid` "Key hợp lệ & đã lưu vào OS Keychain!" | 5 s |
| `RATE_LIMIT` | Có | Vàng `settings_msg_rate_limited` | 5 s |
| `BILLING` | Có | Vàng `settings_msg_billing` | 5 s |
| `PERMISSION` | Có | Vàng `settings_msg_permission` | 5 s |
| `INVALID_KEY` | Không | Đỏ `settings_msg_invalid`; hàng chuyển "Không khả dụng" | Đến khi đóng |
| `NETWORK` | Không | Vàng `settings_msg_network` | Đến khi đóng |
| lỗi khác | Không | Đỏ, thông điệp gốc | Đến khi đóng |

Lưu khoá thành công luôn tách khỏi việc tải danh mục model: lỗi tải model chỉ ghi `modelsError` cho nhà cung cấp, không biến lần lưu thành thất bại (`handleSaveKey`, test `ApiKeysSection.anthropic.test.tsx`).

#### Thẻ Tìm kiếm web (`DeepResearchApiSection.tsx`)

Mô tả: "Mặc định dùng [Jina AI ↗] miễn phí. Thêm key Tavily hoặc Brave để nâng chất lượng kết quả tìm kiếm." Thứ tự thử: Tavily → Brave Search → Jina.

| # | Điều khiển | Loại | Kết quả | Phản hồi |
| --- | --- | --- | --- | --- |
| W1 | Link "Jina AI" trong mô tả | Link chữ | Mở `JINA_DOCS_URL` | — |
| W2 | Hàng Tavily, Brave Search | `CredentialCard` như K1–K6 | Xác minh bằng `webSearchVerify` (nếu IPC không có thì lưu thẳng), rồi `keychain.save`; cập nhật `hasTavilyKey` / `hasBraveKey` | Toast xanh/đỏ khoá `settings-web-search-key-{id}`; lỗi giữ đến khi đóng |
| W3 | Hàng Jina | `SettingsRow` chỉ có nhãn "Jina" + "Không cần khoá · dự phòng" | Không có điều khiển | — |

#### Thẻ Theo dõi chi phí (`CostOverviewCard.tsx`)

| # | Điều khiển | Loại | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- |
| C1 | Đơn vị tiền tệ | `CurrencyPicker`, `aria-label="Đơn vị tiền tệ"` | `setCostCurrency`; mọi số tiền trên trang đổi đơn vị | Ngay | — |
| C2 | "Reset tất cả" | `md · danger · outline` | `confirm(settings_cost_reset_all_confirm)` → `resetAllUsageCost` (chỉ xoá thống kê cục bộ) | Thẻ về trạng thái trống | Ẩn khi chưa có dữ liệu |
| C3 | Số liệu | Chỉ đọc: "Tổng chi phí ước tính ~x", ba ô Lượt gọi · Tokens · TB / lượt, thanh "Theo tính năng" (Chat, Dịch, Live, Từ điển) | — | — | Trống: "Chưa có dữ liệu" + "Hãy dịch, chat hoặc tra từ để bắt đầu thống kê chi phí." |

### 4.4 Giọng nói (`VoiceSection.tsx` = `SttSection` + `TtsSection` trong một thẻ)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | Nhận dạng giọng nói — trạng thái | `StatusLabel`: "Sẵn sàng" (`ok`) hoặc "Cần OpenAI key" / "Cần Gemini key" / "Cần Groq key" (`warning`) | — | Tính từ `keyStatus` và khoá Groq | Đổi ngay khi đổi engine hoặc thêm khoá | — |
| V2 | Engine STT: Tự động · OpenAI Whisper · Gemini STT · Groq Whisper (Miễn phí) | `SelectField` (`.settings-select-field`, nhãn ẩn cho trình đọc) | Chọn | `setSttProvider` | Dòng gợi ý dưới mô tả đổi theo engine (vd "Tự chọn provider khả dụng: Whisper → Gemini STT → Groq.") | — |
| V3 | Khoá Groq | `CredentialCard` (không xác minh, chỉ lưu Keychain) | "Thêm khoá" → dán → "Xác minh" | `keychain.save('groq')`, `bumpSttCredentialsRevision()` | Toast xanh "Đã lưu Groq key!" / đỏ (khoá `settings-groq-key`) | Xoá **không hỏi xác nhận** |
| V4 | Đọc to: Tiết kiệm · Tự động · Chất lượng cao | `ButtonGroup sm` | Chọn | `setTtsMode` | Gợi ý dưới mô tả đổi theo chế độ | — |
| V5 | Giọng đọc: Alloy · Echo · Fable · Onyx · Nova · Shimmer | `SelectField` | Chọn | `setTtsVoice` (chỉ dùng ở Chất lượng cao với OpenAI) | — | — |
| V6 | Khoá ElevenLabs ("Cho chế độ Cao cấp") | `CredentialCard` (không xác minh) | Như V3 | `keychain.save('elevenlabs')` | Toast khoá `settings-elevenlabs-key` | Xoá hỏi `confirm("Xóa ElevenLabs API key?")` |

### 4.5 Chat (`ChatPresetsSection.tsx`, `ChatImageStorageCard.tsx`)

Một thẻ "Preset lời nhắc hệ thống" chứa: các preset, hàng thêm, phím gửi, phím chat mới, ảnh trong chat.

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Đặt làm mặc định | `sm · neutral · ghost` icon ✓ | Bấm | `setDefaultSystemPromptPreset` + áp nội dung vào lời nhắc chat hiện tại | Thẻ "Mặc định" chuyển sang preset này | Ẩn trên preset đang mặc định |
| H2 | Dùng prompt này | `sm · neutral · ghost` icon clipboard | Bấm | `setChatSystemPrompt(content)` | Không có phản hồi hiển thị (xem §10) | — |
| H3 | Chỉnh sửa | `sm · neutral · ghost` icon bút | Bấm | Mở form dưới hàng: `Input sm` tên + `Textarea` 3 dòng + "Hủy" `sm · neutral · outline` / "Lưu" `sm · primary · solid` | Form điền sẵn | "Lưu" tắt khi tên hoặc nội dung trống |
| H4 | Xóa | `sm · danger · soft` icon thùng rác | Bấm (không hỏi) | `deleteSystemPromptPreset` | Hàng biến mất | — |
| H5 | "Thêm preset" | `sm · neutral · outline` + icon +, `soft` khi form mở, `aria-expanded` | Bấm | Mở form thêm (đóng form sửa đang mở) | — | "Lưu" tắt khi thiếu tên/nội dung |
| H6 | Phím gửi: Enter · Cmd+Enter (Ctrl trên Windows/Linux) | `ButtonGroup sm` | Chọn | `setChatSendShortcut` — áp dụng cho Chat và popup hỏi nhanh | — | — |
| H7 | Chat mới — ô ghi phím | `HotkeyRecordButton` `md`, `neutral · outline` → `primary · soft` khi ghi, chữ mono | Bấm → nhấn tổ hợp | Ghi tổ hợp có Cmd/Ctrl/Alt/Shift hoặc F1–F24; Esc huỷ; mất focus huỷ | Nhãn "Bấm phím… (Esc để hủy)" khi ghi | — |
| H8 | Xoá phím chat mới | `sm · danger · ghost` icon ×, `aria-label="Xóa"` | Bấm | Đặt phím rỗng | Ô hiện "Chưa cài" | Ẩn khi chưa có phím hoặc đang ghi |
| H9 | "Mặc định" (khôi phục phím) | `sm · neutral · outline` | Bấm | Đặt `DEFAULT_CHAT_NEW_SESSION_SHORTCUT` | — | Chỉ hiện khi chưa có phím |
| H10 | Ảnh trong chat — "Dọn ảnh cũ" | `sm · neutral · outline` | Bấm | Xoá ảnh không còn cuộc trò chuyện nào tham chiếu | Toast xanh "Đã xoá {count} ảnh"; dòng dung lượng (`aria-live`) cập nhật | Tắt khi đang chạy hoặc không có ảnh |
| H11 | Ảnh trong chat — "Xoá hết" | `sm · danger · ghost` | Bấm → `confirm(settings_chat_images_clear_confirm)` | Xoá mọi ảnh đã lưu; văn bản giữ nguyên | Như H10 | Như H10 |

### 4.6 Module (`ModulesSection.tsx`)

Một danh sách: năm module không gian làm việc theo `APP_MODULES` (AI Chat, Dịch, Phiên dịch, Từ điển, Nhiệt độ & quạt — nhãn và mô tả lấy từ `nav_*` / `command_palette_*_description`), rồi hai dịch vụ hệ thống (Launcher, Tiện ích trình duyệt).

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Công tắc mỗi module | `ToggleSwitch` có `aria-labelledby` (nhãn hàng) và `aria-describedby` (mô tả) | Bật/tắt | `setModuleEnabled(id, enabled)` — main dừng phím tắt, máy chủ, cửa sổ rồi lưu; trang chỉ phản chiếu kết quả | Mọi công tắc tắt trong lúc chờ main; lỗi → toast đỏ "Không thể thay đổi module. Hãy thử lại." (khoá `settings-modules`), giữ trạng thái cũ | Module không gian làm việc **cuối cùng còn bật** bị khoá, kèm gợi ý "Luôn giữ ít nhất một module không gian làm việc đang bật." |

### 4.7 Cập nhật (`UpdaterSection.tsx`)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | "Ghi chú phát hành" (hàng Phiên bản hiện tại `v[x.y.z]` mono) | `sm · neutral · ghost` | Bấm | Mở `GITHUB_RELEASES_URL` | — | — |
| U2 | "Kiểm tra cập nhật" | `CheckUpdateButton`: `sm · neutral · outline` (thành `primary · solid` khi đã tải xong) | Bấm | Đặt trạng thái `checking`, gọi `updater.check()` | Spinner + "Đang kiểm tra cập nhật…" | Tắt khi `checking` hoặc `downloading` |
| U3 | Thông báo cập nhật | Công tắc | Bật/tắt | `updater.setNotificationPreferences({ enabled })` — chỉ ảnh hưởng cửa sổ thông báo tự phát hiện; kiểm tra thủ công vẫn chạy | Công tắc tắt khi lưu; lỗi → toast đỏ `update_notification_action_error` (khoá `settings-update-preference`) | Hàng ẩn đến khi đọc được giá trị |
| U4 | Hàng Trạng thái — có bản mới | Chữ `role="status"` "Có bản cập nhật: v{version}" + nút "Tải bản cập nhật" / "Tải bản cài đặt" (khi có `downloadUrl`) `sm · primary · solid` | Bấm | `updater.download()` | — | — |
| U5 | Đang tải | "Đang tải… {percent}%" + `Meter` dưới hàng | — | — | Cập nhật theo sự kiện `onStatus` | U2 tắt |
| U6 | Đã tải | "Sẵn sàng cài đặt: v{version}" + "Cài đặt & khởi động lại" `sm · primary · solid` (hoặc "Mở bộ cài thủ công" khi `installMode: 'open-installer'`); với `installMode: 'restart'` có thêm "Mở bộ cài thủ công" `sm · neutral · outline` | Bấm | `updater.install()` / `updater.openInstaller()` | — | — |
| U7 | Đã mới nhất | "Bạn đang dùng phiên bản mới nhất (v{version})" | — | — | — | — |
| U8 | Lỗi | Không có hàng; toast (khoá `settings-update-error`): đỏ "Kiểm tra cập nhật thất bại: …"; vàng khi `error-codesign`; đỏ `update_notification_action_error` khi tải lỗi trong lúc vẫn còn bản mới | — | Store giữ trạng thái `available`/`downloaded` khi lỗi đến sau, nên nút U4 vẫn dùng để thử lại | Toast rời đi khi rời Cài đặt và hiện lại khi mở lại | — |

### 4.8 Giới thiệu (`AboutSection.tsx`)

Không có tiêu đề mục nhìn thấy (`<h2 className="sr-only">`).

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Thẻ giới thiệu (`.about-hero`) | Logo 48, "Viezan", "Phiên bản v[x]" (+ "· Đã là bản mới nhất" khi trạng thái là `not-available`), câu giới thiệu, ba ô tính năng (Riêng tư trước · Ở mọi nơi · Bật tắt theo module) | — | — | — | — |
| B2 | "Kiểm tra cập nhật" | `sm · neutral · outline` | Bấm | Cuộn tới mục Cập nhật (`settingsInitialSection: 'updates'`) và gọi `updater.check()` | Kết quả hiện ở mục Cập nhật | — |
| B3 | "Ghi chú phát hành" | `sm · neutral · ghost` | Bấm | Mở trang phát hành | — | — |
| B4 | "Sao chép" (aside thẻ Thông tin hệ thống) | `sm · neutral · ghost` → `primary · soft` "✓ Đã sao chép!" trong 1,5 s | Bấm | Chép "Viezan vX" + các dòng Nền tảng · AI local · Nhà cung cấp hỗ trợ · Dữ liệu vào clipboard | Nhãn đổi; lỗi clipboard bị bỏ qua im lặng | — |
| B5 | Thông tin hệ thống | Hàng chỉ đọc: Nền tảng (macOS / Windows / Linux / web), AI local ("Ollama · [model]" mono hoặc "-"), Nhà cung cấp hỗ trợ (tên mọi provider), Dữ liệu "Lưu trên máy này" | — | — | — | — |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống (tìm kiếm) | Chuỗi tìm không khớp nhãn/mô tả của mục nào | Danh sách mục rỗng; nội dung chỉ còn câu "Không có mục cài đặt nào khớp." (`role="status"`) | Xoá tìm kiếm (P2) |
| Trống (preset) | Chưa có preset | Hàng thêm mang nhãn "Chưa có preset. Bấm "Thêm Preset" để tạo." | "Thêm preset" |
| Trống (chi phí) | Chưa có lượt gọi nào | Khung viền đứt + "Chưa có dữ liệu"; ẩn "Reset tất cả"; hàng nhà cung cấp không có huy hiệu chi phí | Đổi đơn vị tiền |
| Trống (ảnh chat) | Không có ảnh lưu | "Chưa có ảnh nào được lưu"; hai nút tắt | — |
| Đang tải | Mở trang | AI local: trạng thái "Chưa chạy" cho đến khi khám phá xong, icon làm mới quay; ảnh chat hiện "…"; Khởi động cùng hệ thống / Thông báo cập nhật **ẩn** đến khi main trả lời. Không có skeleton (xem §10) | Điều hướng, cuộn |
| Đang chạy | Xác minh khoá, tải/gỡ model, đo, so sánh, kiểm tra/tải cập nhật, đổi module | Nút có spinner + nhãn "Đang …"; tiến độ dùng `Meter`; các nút xung đột bị tắt | Dừng so sánh (L10) |
| Có dữ liệu | Bình thường | Như §4 | Như §4 |
| Lỗi | Mọi thao tác thất bại | **Toast** trong `NotificationViewport` với khoá chủ riêng cho từng nguồn; hàng khoá lỗi chuyển "Không khả dụng" + nút "Thử lại" đỏ; không có banner lỗi trong trang | Thử lại tại chỗ |
| Thiếu khoá / model | Không có khoá đám mây, runtime chưa chạy, engine STT thiếu khoá | "Chưa có khoá" (xám), "Chưa chạy", "Cần … key" (vàng); hàng "Thiết lập runtime local" với nút chính | Thêm khoá, Mở trang tải runtime |
| Module tắt | Một module bị tắt | Trong Cài đặt chỉ thấy công tắc tắt; trang/lệnh của module ẩn ở nơi khác. Module cuối bị khoá | Bật lại |
| Không có quyền hệ thống | — | Trang Cài đặt không có hàng xin quyền (quyền Trợ năng/Ghi màn hình nằm ở `HotkeySection`, trang Launcher & phím tắt) | — |
| Phong cách luôn tối | Midnight đang được lưu | Nhóm Chế độ bị tắt, mô tả đổi; xem trước tối | Chọn phong cách khác |

## 6. Luồng tương tác chính

### 6.1 Thêm và xác minh một khoá API (Claude)

1. Người dùng vào Cài đặt › Mô hình AI (hoặc từ "Đổi model hoặc khoá" trong Chat → trang cuộn tới mục, mục "Mô hình AI" được đánh dấu). Hàng "Anthropic Claude" hiện "Chưa có khoá" và nút "Thêm khoá".
2. Bấm "Thêm khoá" → nút chuyển `soft`, `aria-expanded="true"`, trình sửa mở dưới hàng: ô mật khẩu với placeholder "Dán API key Anthropic Claude vào đây…" và nút "Xác minh" (đang tắt).
3. Dán khoá → nút "Xác minh" bật. Bấm hoặc nhấn Enter.
4. Nút hiện spinner "Đang xác minh…", ô bị khoá theo trạng thái bận; toast cũ của hàng bị gỡ.
5. a. Hợp lệ → khoá vào Keychain; nút "✓ Đã xác minh!", viền ô xanh; toast xanh 5 s; trình sửa đóng; hàng thành "Đã có khoá"; danh mục model được tải và model đã chọn được thay nếu không còn trong danh mục. b. `RATE_LIMIT`/`BILLING`/`PERMISSION` → vẫn lưu, toast vàng 5 s. c. `INVALID_KEY` → không lưu; hàng "Không khả dụng" (đỏ), nút "Thử lại" đỏ, toast đỏ giữ đến khi đóng; gõ lại xoá trạng thái lỗi. d. `NETWORK` → không lưu, toast vàng giữ đến khi đóng.
6. Gỡ khoá: mở "Sửa" → bấm icon thùng rác trong ô che → hộp `confirm` của hệ thống → khoá bị xoá, model động và thống kê chi phí của nhà cung cấp bị đặt lại, hàng về "Chưa có khoá".

### 6.2 Tải một model local

1. Mở Mô hình AI: thẻ AI local gọi `ensureLocalAiRuntime()`; trong lúc đó icon làm mới quay.
2. Nếu chưa có Ollama: header "Chưa chạy", hàng "Thiết lập runtime local" có nút chính "Mở trang tải runtime"; các hàng model chỉ ghi "Chờ runtime". Bấm → trình duyệt mở trang tải, toast "Đã mở trang tải runtime…". Người dùng cài, quay lại, bấm làm mới.
3. Khi Ollama chạy: header "Đang chạy" + engine · endpoint; tối đa 5 model gợi ý, mỗi hàng ghi "Đã cài / Đề xuất / ~x GB · tên".
4. Bấm "Tải" trên một hàng → nút "◌ 1%", mọi nút tải/gỡ khác bị tắt; dưới hàng hiện thông điệp, "x/y GB · n%" và thanh `Meter`.
5. Rời Cài đặt rồi quay lại: tiến độ được dựng lại từ `getLocalAiActiveDownloads()`; nếu bấm "Tải" lần nữa và main báo đang tải thì không báo lỗi.
6. Xong → toast "Đã tải: qwen3:4b", danh mục làm mới, hàng chuyển "Đã cài" với nút "Gỡ" đỏ. Lỗi → toast đỏ, hàng trở lại "Tải".

### 6.3 Đổi giao diện

1. Vào Giao diện (từ điều hướng mục hoặc liên kết sâu `appearance`).
2. Rê chuột qua ô "Paper" → khung xem trước bên phải đổi sang Paper (bề mặt ngà, chữ đọc serif), dòng ghi chú đọc "Paper · Giấy ngà và chữ serif…"; cửa sổ chưa đổi.
3. Bấm "Paper" → `setThemePreset('paper')`, cả cửa sổ đổi persona ngay; ô có dấu ✓ và `aria-checked="true"`.
4. Rê qua các chấm màu nhấn → xem trước đổi màu; bấm "Xanh ngọc" → `html[data-accent="teal"]`.
5. Chọn "Midnight" → cửa sổ luôn tối, nhóm Chế độ bị khoá với mô tả "Phong cách đang chọn chỉ có bản tối". Chọn lại phong cách khác → nhóm Chế độ mở lại và chế độ đã lưu được áp dụng.
6. Chọn cỡ chữ "Lớn" → toàn ứng dụng đổi cỡ.

### 6.4 Thiết lập giọng nói

1. Vào Giọng nói. Hàng "Nhận dạng giọng nói" hiện engine đang chọn và trạng thái: với "Tự động", "Sẵn sàng" nếu có bất kỳ khoá OpenAI, Gemini hoặc Groq.
2. Muốn dùng miễn phí: chọn "Groq Whisper (Miễn phí)" → trạng thái vàng "Cần Groq key".
3. Ở hàng "Groq" bấm "Thêm khoá" → dán → "Xác minh" (thực chất chỉ lưu Keychain) → toast "Đã lưu Groq key!", trạng thái chuyển "Sẵn sàng", `sttCredentialsRevision` tăng để các trang đang ghi âm dùng khoá mới.
4. Đọc to: chọn "Tiết kiệm" (chỉ Edge TTS), "Tự động" hoặc "Chất lượng cao"; gợi ý dưới mô tả đổi theo lựa chọn.
5. Với Chất lượng cao: chọn giọng (áp dụng cho OpenAI) hoặc thêm khoá ElevenLabs.

### 6.5 Thêm một preset lời nhắc

1. Vào Chat. Bấm "Thêm preset" → nút `soft`, form mở dưới hàng: ô tên ("VD: Trợ lý lập trình"), ô nội dung ("Bạn là trợ lý hữu ích…"), "Hủy" / "Lưu".
2. "Lưu" chỉ bật khi cả hai ô có chữ. Bấm "Lưu" → preset thêm vào danh sách, form đóng.
3. Bấm ✓ "Đặt làm mặc định" → thẻ "Mặc định" chuyển sang preset mới và nội dung được áp vào lời nhắc chat hiện tại.
4. Sửa: bấm bút → form điền sẵn dưới hàng → "Lưu". Xoá: bấm thùng rác (xoá ngay).

### 6.6 Kiểm tra và cài bản cập nhật

1. Vào Cập nhật (hoặc từ popup cập nhật → `openSettingsAt('updates')`). Hàng đầu: "Phiên bản hiện tại v[x]" + "Ghi chú phát hành" + "Kiểm tra cập nhật".
2. Bấm "Kiểm tra cập nhật" → nút tắt, spinner "Đang kiểm tra cập nhật…".
3. a. Không có bản mới → hàng Trạng thái "✓ Bạn đang dùng phiên bản mới nhất (v[x])"; mục Giới thiệu thêm "· Đã là bản mới nhất". b. Có bản mới → "Có bản cập nhật: v[y]" + nút chính "Tải bản cập nhật". c. Lỗi → toast đỏ "Kiểm tra cập nhật thất bại: …".
4. Bấm "Tải bản cập nhật" → "Đang tải… n%" + thanh tiến độ; nút kiểm tra bị tắt.
5. Xong → "Sẵn sàng cài đặt: v[y]" + "Cài đặt & khởi động lại" (hoặc "Mở bộ cài thủ công" với bản cần mở DMG). Bấm → ứng dụng thoát và cài.
6. Tải lỗi giữa chừng → trạng thái quay về "Có bản cập nhật", nút tải vẫn dùng để thử lại, toast đỏ báo lỗi.

## 7. Responsive

| Bề rộng | Thay đổi | Nguồn |
| --- | --- | --- |
| Cửa sổ ≥ 900 | Thanh điều hướng chính theo lựa chọn đã lưu (236 / 60) | `foundations.md` §8 |
| Cửa sổ < 900 | Điều hướng chính thành rail 60 px | `foundations.md` §8 |
| Cửa sổ ≥ 768 (`md` của Tailwind) | Lưới hai cột: danh sách mục 240 + nội dung; lề nội dung 24 | `SettingsTemplate.tsx` (`md:grid`, `hidden md:flex`) |
| Cửa sổ < 768 | Danh sách mục ẩn; thanh tab ngang (có icon) dưới header, cuộn ngang, tab đang chọn tự cuộn vào tầm nhìn; lề nội dung 16 × 20 | `SettingsTemplate.tsx`, `SettingsNavigation.tsx` |
| Vùng nội dung > 768 | Cột nội dung dừng ở 768 và căn giữa | `max-w-3xl mx-auto` |
| Vùng nội dung ≤ 760 | Giao diện: một cột, xem trước lên trên và hết dính | `@container settings-content (max-width: 760px)` trong `codex.css` |
| Hàng hẹp | Khi cột chữ không còn 220 px, điều khiển xuống dòng dưới nhãn, căn phải | `.ui-settings-row__main { flex-wrap: wrap }`, `--vzn-settings-row-copy-basis` |
| Ô tính năng Giới thiệu | Tự xếp cột với bề rộng tối thiểu 150 | `--vzn-about-feature-min` |
| Bảng so sánh hiệu năng | Cuộn ngang trong khung | `overflow-x-auto` (`LocalAiPerformanceSection.tsx`) |

## 8. Bàn phím và trợ năng

- **Thứ tự Tab:** ô tìm kiếm → nút xoá tìm kiếm (khi có) → các mục điều hướng (hoặc tab) → nội dung theo thứ tự đọc của từng mục.
- **Điều hướng mục:** bấm/Enter trên một mục cuộn tới và focus `<section aria-label="[tên mục]" tabIndex={-1}>`, nên trình đọc màn hình đọc tên mục và Tab tiếp theo đi vào nội dung mục đó. Mục đang đọc mang `aria-current="true"`. `<nav aria-label="Cài đặt">`.
- **Kết quả tìm kiếm:** câu rỗng có `role="status"`. Ô tìm có `aria-label` "Tìm trong cài đặt".
- **Nhóm radio** (Phong cách, Màu nhấn): `role="radiogroup"` + `role="radio"`/`aria-checked`; phím mũi tên đi một bước (vòng lại), Home/End nhảy đầu/cuối (`radioStripNavigation.ts`); focus cũng kích hoạt xem trước. Ghi chú phong cách có `aria-live="polite"`.
- **Nhóm nút** (`ButtonGroup`): `<fieldset aria-label>` + `aria-pressed` từng nút.
- **Công tắc:** `role="switch"`, `aria-checked`, `disabled` gốc khi đang lưu hoặc bị khoá; công tắc module có `aria-labelledby`/`aria-describedby` trỏ về nhãn và mô tả hàng.
- **Khoá API:** nút "Sửa/Thêm khoá" có `aria-expanded` và `aria-controls`; Enter trong ô khoá gửi xác minh; nút xoá chỉ có icon có `aria-label="Xóa"`. Xác nhận xoá là `confirm()` của hệ thống (focus do hệ điều hành quản lý).
- **Tiến độ:** `Meter` có `label` và `valueText` ("54%"); trạng thái cập nhật có `role="status"`; dòng dung lượng ảnh có `aria-live="polite"`.
- **So sánh hiệu năng:** hộp xác nhận nội tuyến `role="alertdialog"`; dòng đang đo `role="status"`; nhóm chế độ có `aria-pressed`.
- **Ghi phím:** khi đang ghi, Esc huỷ; rời focus cũng huỷ.
- **Lỗi:** mọi lỗi là toast (`role="alert"` cho lỗi), đúng `foundations.md` §11.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `settings_title` | Cài đặt |
| `settings_search_placeholder` | Tìm trong cài đặt |
| `settings_search_clear` | Xoá tìm kiếm |
| `settings_search_empty` | Không có mục cài đặt nào khớp. |
| `settings_prefs` / `settings_prefs_card_desc` | Chung / Ngôn ngữ, khởi động, hành vi dịch mặc định |
| `settings_app_language` / `settings_locale_auto` | Ngôn ngữ ứng dụng / Theo hệ thống |
| `settings_launch_at_login` | Khởi động cùng hệ thống |
| `settings_launch_at_login_error` | Không thể thay đổi cài đặt khởi động cùng hệ thống. Vui lòng thử lại. |
| `settings_auto_translate` / `settings_translate_delay` | Tự động dịch / Độ trễ dịch |
| `settings_delay_short` · `_medium` · `_long` | Ngắn · Vừa · Dài |
| `settings_furigana` | Phiên Âm |
| `settings_image_provider_fallback` | Dự phòng khi dịch ảnh |
| `settings_appearance` / `settings_appearance_desc` | Giao diện / Chế độ sáng/tối, phong cách hiển thị và cỡ chữ. |
| `settings_theme_mode` · `settings_theme_light` · `_dark` · `_system` | Chế độ · Sáng · Tối · Hệ thống |
| `settings_theme_dark_only_hint` / `settings_theme_dark_only_badge` | Phong cách đang chọn chỉ có bản tối / Luôn tối |
| `settings_theme_palette` / `settings_theme_accent` | Phong cách / Màu nhấn |
| `settings_theme_accent_auto` | Theo phong cách |
| `settings_font_size` · `_small` · `_medium` · `_large` | Cỡ chữ · Nhỏ · Vừa · Lớn |
| `settings_theme_preview_heading` | Xem trước |
| `settings_api_keys` / `settings_api_keys_desc` | Mô hình AI / Model chạy trên máy và khoá của nhà cung cấp đám mây. Từng tính năng chọn model riêng ngay tại trang của nó. |
| `settings_local_ai_title` · `_running` · `_not_running` | AI local · Đang chạy · Chưa chạy |
| `settings_local_ai_install_runtime_title` / `settings_local_ai_install_ollama` | Thiết lập runtime local / Mở trang tải runtime |
| `settings_local_ai_download` · `_uninstall` · `_uninstalling` · `_waiting_runtime` | Tải · Gỡ · Đang gỡ... · Chờ runtime |
| `settings_local_ai_downloading_model` · `_downloaded` | Đang tải model · Đã tải |
| `settings_local_ai_performance` · `_details` · `_benchmark` · `_benchmarking` | Hiệu năng · Chi tiết · Đo hiệu năng · Đang đo máy... |
| `settings_local_perf_compare` · `_start` · `_dismiss` · `_stop` | So sánh GPU / CPU + GPU · Cho phép nạp lại và đo · Để sau · Dừng so sánh |
| `settings_local_perf_auto` · `_gpu` · `_hybrid` | Mặc định runtime · GPU · CPU + GPU |
| `settings_cloud_providers` / `settings_cloud_providers_desc` | Nhà cung cấp đám mây / Khoá được lưu trong Keychain của hệ điều hành. |
| `settings_cost_total` | Tổng chi phí |
| `settings_get_key` | Lấy API key ↗ |
| `settings_key_saved` · `settings_no_key` · `settings_key_invalid` | Đã có khoá · Chưa có khoá · Không khả dụng |
| `settings_key_edit` · `settings_key_add` | Sửa · Thêm khoá |
| `settings_verify_save` · `settings_verifying` · `settings_verified` · `settings_try_again` | Xác minh · Đang xác minh… · Đã xác minh! · Thử lại |
| `settings_key_placeholder_paste` / `settings_key_placeholder_new` | Dán API key {name} vào đây… / Nhập key mới để thay thế… |
| `settings_msg_valid` | Key hợp lệ & đã lưu vào OS Keychain! |
| `settings_msg_invalid` | API key không hợp lệ. Vui lòng kiểm tra lại. |
| `settings_msg_network` | Không có kết nối internet. Không thể xác minh. |
| `settings_web_search_section` · `settings_web_search_jina_desc` | Tìm kiếm web · Không cần khoá · dự phòng |
| `settings_cost_section_title` · `settings_cost_reset_all` · `settings_cost_overview_no_data` | Theo dõi chi phí · Reset tất cả · Chưa có dữ liệu |
| `settings_voice_section` / `settings_voice_section_desc` | Giọng nói / Nhận dạng giọng nói và đọc to |
| `settings_stt_section` · `settings_stt_ready` · `settings_stt_needs_groq` | Nhận dạng giọng nói · Sẵn sàng · Cần Groq key |
| `settings_tts_section` · `settings_tts_mode_free` · `_auto` · `_premium` | Đọc to · Tiết kiệm · Tự động · Chất lượng cao |
| `settings_tts_voice` | Giọng đọc |
| `settings_chat_section` · `settings_chat_presets` | Chat · Preset lời nhắc hệ thống |
| `settings_chat_preset_add` · `_save` · `_cancel` · `_is_default` | Thêm preset · Lưu · Hủy · Mặc định |
| `settings_chat_shortcut_send` · `settings_chat_shortcut_new_chat` | Phím gửi · Chat mới |
| `settings_hotkey_recording` · `settings_hotkey_none` | Bấm phím… (Esc để hủy) · Chưa cài |
| `settings_chat_images_title` · `_prune` · `_clear` · `_usage` | Ảnh trong chat · Dọn ảnh cũ · Xoá hết · {count} ảnh · {size} trên máy |
| `settings_modules_section` / `settings_modules_section_desc` | Module / Tắt một module sẽ ẩn trang, lệnh và phím tắt của nó, và dừng mọi việc chạy nền của nó. |
| `settings_modules_last_page_hint` | Luôn giữ ít nhất một module không gian làm việc đang bật. |
| `settings_modules_error` | Không thể thay đổi module. Hãy thử lại. |
| `settings_update_section` · `settings_update_current_version` · `settings_update_release_notes` | Cập nhật · Phiên bản hiện tại · Ghi chú phát hành |
| `settings_update_check` · `settings_update_checking` | Kiểm tra cập nhật · Đang kiểm tra cập nhật… |
| `settings_update_available` · `_downloading` · `_downloaded` · `_not_available` | Có bản cập nhật: v{version} · Đang tải… {percent}% · Sẵn sàng cài đặt: v{version} · Bạn đang dùng phiên bản mới nhất (v{version}) |
| `settings_update_download` · `_download_installer` · `_install` · `_open_installer` | Tải bản cập nhật · Tải bản cài đặt · Cài đặt & khởi động lại · Mở bộ cài thủ công |
| `update_popup_enabled` | Thông báo cập nhật |
| `settings_about` · `settings_about_system_info` · `settings_about_up_to_date` | Giới thiệu · Thông tin hệ thống · Đã là bản mới nhất |
| `translate_copy` / `translate_copied` | Sao chép / Đã sao chép! |

## 10. Chênh lệch với bản dựng hiện tại

Đã đối chiếu từng mục với mã nguồn (đường dẫn kèm theo). "Đề xuất" nghĩa là bản vẽ gốc có nhưng app chưa hỗ trợ; chưa được làm.

### Bản vẽ có, app chưa có

| Bản vẽ | Mã hiện tại | Ghi chú |
| --- | --- | --- |
| Nút **"Dừng"** runtime AI local ở header thẻ (`boards/Settings.dc.html`) | Không có API dừng runtime; header chỉ có `StatusLabel` (`ApiKeysSection.tsx`) | Đề xuất |
| Trình cài **"Đang cài AI local"** nhiều bước (tải Ollama, khởi động dịch vụ, tải model, đo lần đầu, "Chạy nền") (`boards/Providers.dc.html`) | `installOllama()` chỉ mở trang tải; không có tiến độ hay huỷ (chú thích trong `handleInstallOllama`) | Đề xuất |
| Huỷ một lượt tải model | Không có nút huỷ; các nút khác bị tắt cho đến khi xong | Đề xuất |
| **"Chi phí tháng này"** ở header thẻ đám mây và trong hộp sửa khoá | "Tổng chi phí" cộng dồn từ lần reset gần nhất (`apiKeyUsageTotals`), không theo tháng | Đề xuất |
| Hộp **sửa khoá** riêng: nhãn "Khoá API", nút **"Hiện"** khoá, "Khoá hợp lệ · đã thử với [model]", "Lấy khoá ở đâu?", "Xoá khoá / Huỷ / Lưu" (`boards/Providers.dc.html`) | Trình sửa nội tuyến `CredentialCard`; không hiện được khoá; kết quả xác minh chỉ ở toast 5 s, hàng chỉ ghi "Đã có khoá" kể cả khi `BILLING`/`PERMISSION` | Đề xuất phần "Hiện" và lưu kết quả xác minh trên hàng |
| **"Nghe thử"** giọng đọc (`boards/SettingsSections.dc.html`) | Hàng Giọng đọc chỉ có `SelectField` (`TtsSection.tsx`) | Đề xuất |
| Gợi ý STT "Whisper local, Groq, Google" | Engine "Tự động" là Whisper (OpenAI, đám mây) → Gemini STT → Groq; không có Whisper chạy máy | Bản vẽ sai, sửa theo mã |
| "Dự phòng dịch ảnh" là ô chọn nhà cung cấp ("Gemini") | Công tắc bật/tắt (`imageProviderFallback`) | Mã đúng; bản vẽ cần sửa |
| Cập nhật: **"Tự kiểm tra · Hỏi trước khi tải về"** và **"Lần kiểm tra gần nhất [thời gian]"** + "Kiểm tra ngay" `primary` | Chỉ có công tắc "Thông báo cập nhật" (cửa sổ báo bản mới) và nút "Kiểm tra cập nhật" `outline`; không lưu thời điểm kiểm tra (`UpdaterSection.tsx`) | Đề xuất "Lần kiểm tra gần nhất" |
| Giới thiệu: **"Xem lại màn hình chào mừng"** | Không có (`AboutSection.tsx`) | Đề xuất |
| Giới thiệu: dòng **"Máy [mã máy]"** và kiến trúc ("macOS · Apple Silicon") | Chỉ có tên nền tảng | Đề xuất |
| Giới thiệu: **"Mở thư mục"** dữ liệu | Chỉ có chữ "Lưu trên máy này" | Đề xuất |
| Tính năng "Dịch nhanh ⌥T" ghi phím tắt | Chuỗi `settings_about_feature_everywhere_desc` không có phím | Giữ mã (phím có thể đổi) |
| Preset: mỗi hàng chỉ một nút "Sửa" | Bốn nút icon: Đặt mặc định, Dùng, Sửa, Xoá (`PresetActions.tsx`) | Giữ mã; cân nhắc gom vào menu |
| Danh sách mục rộng 200 | 240 (`src/index.css`, giá trị cứng ngoài `tokens.css`) | Nên thành token |
| Tìm kiếm ngụ ý tìm theo từng cài đặt | Chỉ lọc theo tên + mô tả của **mục**; gõ "Groq" ra rỗng (`SettingsPage.tsx`) | Đề xuất tìm theo nhãn hàng |

### App có, bản vẽ chưa vẽ

- Hàng "Chat mới" (ghi phím tắt, xoá, khôi phục mặc định) trong mục Chat.
- Khoá Groq trong Giọng nói; huy hiệu thống kê chi phí và nút "Reset" trên từng hàng nhà cung cấp; thẻ "Theo dõi chi phí" (đơn vị tiền, KPI, theo tính năng).
- Khối "So sánh hiệu năng AI cục bộ" đầy đủ (chọn model, xác nhận nạp lại, dừng, phục hồi runner) — bản vẽ chỉ có bảng và ba nút.
- Trạng thái cập nhật "Mở bộ cài thủ công" và cảnh báo `error-codesign`.

### Lệch so với nền tảng (`foundations.md`) và lỗi phát hiện khi đối chiếu

1. **Không thay được khoá đã lưu.** Với khoá đã có, ô trong trình sửa hiện giá trị che và `readOnly`; `onClick` gọi `onInputChange('')` nên vẫn ở chế độ che, không có nút "Xác minh". Muốn thay phải xoá rồi thêm lại; placeholder "Nhập key mới để thay thế…" không bao giờ hiện (`src/components/ui/CredentialCard.tsx`, `CredentialSecretInputRow`).
2. **Câu xác nhận xoá khoá lẫn tiếng Anh:** `` `${t.settings_remove} API key for ${provider.name}?` `` → "Xóa API key for Anthropic Claude?" (`ApiKeyInput.tsx`, `DeepResearchApiSection.tsx`).
3. **Xoá khoá ElevenLabs bỏ qua kết quả:** `handleElDelete` không kiểm `success` và không bắt lỗi, nên hàng vẫn báo đã xoá dù Keychain thất bại (`TtsSection.tsx`); khoá Groq thì có kiểm nhưng **không hỏi xác nhận** (`SttSection.tsx`).
4. **Khoá Groq/ElevenLabs không được xác minh** nhưng nút vẫn ghi "Xác minh".
5. **Dọn/xoá ảnh chat không bắt lỗi:** nếu `pruneUnusedChatImages`/`clearAllChatImages` ném lỗi, `busy` không được trả về `false` và hai nút bị tắt mãi (`ChatImageStorageCard.tsx`).
6. **Xoá preset không hỏi và không hoàn tác được**; "Dùng prompt này" không có phản hồi nào (`ChatPresetsSection.tsx`).
7. **Gỡ model local không hỏi xác nhận** (tải lại có thể mất nhiều GB).
8. **Thẻ "Theo dõi chi phí" dùng màu Tailwind cứng** (`bg-gray-*`, `dark:bg-neutral-*`, `rounded-2xl`) thay vì `SettingsCard` và token — vi phạm luật `tokens.css` là nguồn duy nhất và không đổi theo persona (`CostOverviewCard.tsx`, `ProviderCostStats.tsx`). Nút "Reset" `sm` nằm trong dòng mô tả của hàng.
9. **Hai nút `solid` trong một hàng** khi đã tải bản cập nhật: `CheckUpdateButton` tự đổi sang `primary · solid` trong khi "Cài đặt & khởi động lại" cũng `solid` (`CheckUpdateButton.tsx`).
10. **Kích thước trộn trong một hàng:** ô ghi phím `md` (36) cạnh nút xoá/khôi phục `sm` (32) ở hàng "Chat mới"; mục điều hướng Cài đặt là `md` trong khi nền tảng ghi điều hướng dùng `sm`; khối so sánh hiệu năng dùng `md` trong thẻ có các nút `sm`.
11. **Tab thu hẹp theo cửa sổ, không theo vùng chứa:** danh sách mục thành tab ở cửa sổ < 768 (`md:` của Tailwind) chứ không phải "vùng nội dung < 760" như `foundations.md` §8; khi điều hướng chính mở rộng, vùng nội dung có thể hẹp hơn 760 mà vẫn có cột mục.
12. **`FontSizePicker` không truyền `label`** cho `ButtonGroup`, nên `<fieldset>` cỡ chữ không có tên truy cập.
13. **Không có skeleton** cho AI local và các hàng chờ main (Khởi động cùng hệ thống, Thông báo cập nhật bị ẩn rồi bật ra, làm nhảy bố cục).
14. **"Kiểm tra cập nhật" ở Giới thiệu** gọi `updater.check()` trực tiếp mà không đặt trạng thái `checking` như ở mục Cập nhật, nên nút ở mục Cập nhật chỉ quay khi main gửi trạng thái.
15. **AI local ở Giới thiệu luôn ghi "Ollama · …"** dù engine được phát hiện có thể khác (`AboutSection.tsx`).
16. `DeepResearchApiSection` gọi `useAppStore()` không selector, nên render lại theo mọi thay đổi của store.
17. Lớp `.settings-choice-row` trong `codex.css` không còn được dùng.
