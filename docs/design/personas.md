# Biến thể persona

Đặc tả cho trục "phong cách" (`data-theme`) trong [foundations.md §2](foundations.md#2-ba-trục-chủ-đề). Board: [specs/personas.html](specs/personas.html) vẽ Trang chủ, AI Chat, Dịch và Cài đặt › Giao diện ở cả 9 tổ hợp persona × chế độ, cùng 7 lựa chọn màu nhấn trên Graphite.

Giá trị nằm trong `src/styles/tokens.css`; danh sách persona và đặc tính nằm trong `src/constants/themePresets.ts` (`THEME_PRESETS`, `THEME_PRESET_TRAITS`); bảng màu cửa sổ native nằm trong `electron/windowPalette.ts`; mô tả hiển thị là các khoá `settings_theme_preset_*`.

## 1. Năm persona

| Persona | Dành cho | Đặc tính | Điểm khác chính |
| --- | --- | --- | --- |
| Graphite (mặc định) | Developer, công việc cần tập trung | — | Chrome xám trung tính, mục đang chọn là "thẻ trắng nổi" chữ xanh, nút xanh phẳng, bo 12, bóng rất nhẹ, chữ hệ thống |
| Glass | Người thích giao diện macOS hiện đại | `nativeMaterial` | Bề mặt trong mờ + `--vzn-blur`, viền sáng trong (`inset` trong `--vzn-shadow-*`), nút và bong bóng người dùng tô gradient xanh đại dương, bo lớn nhất (18), có `--vzn-shadow-glow`, `--vzn-app-backdrop` là hai vệt màu loang |
| Paper | Dịch giả, người viết, học giả | — | Nền giấy ngà ấm, nút đất nung, bo nhỏ nhất (6), bóng nâu nhạt, `--vzn-font-display` và `--vzn-font-reading` là serif, giãn dòng đọc 1.75 |
| Corporate | Đội nhóm doanh nghiệp | — | Chrome navy chữ sáng ở cả hai chế độ trên vùng làm việc trắng, viền rõ, bo vuông vức (8, điều khiển 6), giãn dòng đọc gọn 1.5 |
| Midnight | Làm việc đêm, power user, màn OLED | `darkOnly` | Nền đen tuyền, nhấn cyan với chữ tối trên nút (`--vzn-action-fg`), ánh sáng nhẹ `--vzn-shadow-glow`; khối `data-mode="light"` giống hệt khối tối |

## 2. Một persona đổi những gì

Mỗi khối `[data-theme="…"][data-mode="…"]` khai báo lại **cùng một bộ token** (hiện 83 token) cho cả sáng và tối:

| Nhóm | Token | Ghi chú |
| --- | --- | --- |
| Bề mặt | `--vzn-app-bg`, `--vzn-bg`, `--vzn-canvas`, `--vzn-titlebar-bg`, `--vzn-sidebar-bg`, `--vzn-chat-sidebar-bg`, `--vzn-surface*`, `--vzn-text*`, `--vzn-border*`, `--vzn-divider`, `--vzn-*-material`, avatar | Thang bề mặt ở foundations §3 vẫn đúng, chỉ đổi giá trị |
| Màu nhấn | `--vzn-action*`, `--vzn-focus-ring`, `--vzn-action-fill`, `--vzn-send-*`, `--vzn-accent-glow`, `--vzn-shadow-glow`, `--vzn-user-bubble-*` | `--vzn-action-fill` có thể là gradient (Glass); luôn dùng `background`, không dùng `background-color` |
| Chrome chính | `--vzn-chrome-fg*`, `--vzn-chrome-divider`, `--vzn-chrome-item-hover`, `--vzn-chrome-item-active`, `--vzn-chrome-item-active-fg`, `--vzn-chrome-accent` | Chỉ dành cho thanh tiêu đề và điều hướng chính |
| Tông minh hoạ | `--vzn-tone-*` | Icon thẻ, không phải màu trạng thái |
| Hình khối | `--vzn-radius-2xs` … `--vzn-radius-2xl` | `--vzn-radius-pill` không đổi |
| Chiều sâu, vật liệu | `--vzn-shadow-*`, `--vzn-blur`, `--vzn-blur-sm`, `--vzn-app-backdrop` | `--vzn-blur` là `none` ở mọi persona trừ Glass |
| Chữ | `--vzn-font-sans`, `--vzn-font-display`, `--vzn-font-reading`, `--vzn-line-reading` | Cỡ chữ (`--vzn-font-size-*`) không đổi |

Không đổi theo persona: bố cục, kích thước điều khiển, khoảng cách, cỡ chữ, màu trạng thái (`--vzn-success/warning/danger*`, theo chế độ), lớp chồng, chuyển động.

**Màu nhấn** (`data-accent`) đặt sau các persona và chỉ thay họ `--vzn-action-*`, `--vzn-surface-selected`, `--vzn-user-bubble-*`, `--vzn-chrome-accent`, `--vzn-chrome-item-active`. Khi có màu nhấn, `--vzn-action-fill` thành màu phẳng và glow tắt, kể cả trên Glass và Midnight.

## 3. Quy tắc

1. **Persona không phải là tô lại màu.** Một persona là một tính cách trọn vẹn (bề mặt, cường độ nhấn, chrome, hình khối, chiều sâu, chữ đọc). Không thêm persona chỉ khác màu nhấn; đó là việc của `data-accent`.
2. **Token chrome chỉ cho thanh tiêu đề và điều hướng chính.** Sidebar lịch sử chat, điều hướng trong Cài đặt, tab, segmented và mục đang chọn trong nội dung dùng `--vzn-action-soft`/`--vzn-action-text`/`--vzn-surface-*`. Lý do: Corporate có chrome navy chữ sáng trên vùng làm việc trắng; dùng nhầm `--vzn-chrome-fg` trong nội dung sẽ ra chữ trắng trên nền trắng.
3. **Luôn tối (`darkOnly`).** `resolveThemeMode` ép `html.dark` khi persona là Midnight, bất kể lựa chọn chế độ; nút chế độ trong Cài đặt vẫn giữ lựa chọn đã lưu để quay lại khi đổi persona. Ô Midnight mang nhãn "Luôn tối". Khối `[data-mode="light"]` của Midnight vẫn phải tồn tại (để bản xem trước và ô mẫu không bao giờ thừa hưởng giá trị lạ).
4. **Vật liệu native (`nativeMaterial`).** Glass bật `data-window-material="native"` trên `.app-shell` ở mọi chế độ (Windows: acrylic). Khi đó shell trong suốt, thanh tiêu đề dùng `--vzn-titlebar-material`, điều hướng chính dùng `--vzn-primary-nav-material`, và vật liệu cửa sổ của hệ điều hành (desktop phía sau, đã làm mờ) hiện qua. `--vzn-app-backdrop` chỉ được vẽ khi shell mờ đục, ví dụ trong bản xem trước. Trên macOS, mọi persona cũng dùng vật liệu native khi chế độ là "Theo hệ thống" (`App.tsx`, `useNativeMaterial`). Trên board không có desktop thật nên khung Glass vẽ `--vzn-app-backdrop` thay cho nó.
5. **Một mã, nhiều persona.** Thành phần không được biết mình đang ở persona nào: không có selector `[data-theme="paper"] .foo` trong mã thành phần. Nếu một persona cần khác biệt, thêm token vào cả 10 khối trong `tokens.css`.
6. **Tiêu đề và chữ đọc.** Tiêu đề trang, tiêu đề mục Cài đặt và tên thương hiệu dùng `--vzn-font-display`; tin nhắn chat và bản dịch dùng `--vzn-font-reading` + `--vzn-line-reading`. Chữ người dùng đang gõ và chữ điều khiển giữ `--vzn-font-sans`.

## 4. Kiểm tra khi thêm hoặc sửa một màn hình

- Mở màn hình ở cả 9 tổ hợp (Cài đặt › Giao diện, hoặc đặt `data-theme`/`data-mode` trên một khung board như `specs/personas.html`). Không khung nào được trông giống hệt Graphite; nếu giống, thành phần đang đọc một token mà persona không ghi đè (thường là `--vzn-neutral-*` hoặc lớp Tailwind `gray-*`).
- Tương phản WCAG AA cho chữ thân trong từng persona, đặc biệt: chữ trên `--vzn-action-fill` (Midnight và Corporate tối dùng chữ tối), chữ trên bong bóng gradient của Glass, chữ `--vzn-text-muted` trên bề mặt trong mờ của Glass đặt trên desktop sáng, chữ chrome của Corporate.
- Không màu, bo góc, bóng hay font literal (kể cả lớp Tailwind có màu và giá trị trong ngoặc vuông). Chạy `npm run check:design`, rồi tự rà các vùng script không quét (`src/pages`, `chat/`, `live/`, `translate/`, file `.css`).
- Thành phần nền đục đặt lên `--vzn-bg`: ở Glass `--vzn-bg` và `--vzn-surface` trong mờ, nên đừng chồng hai lớp nền trong mờ (sẽ thành đục và lệch màu); chỉ `.app-shell` và `.app-main` tô nền.
- Nút solid dùng `background: var(--vzn-action-fill)` để nhận gradient của Glass.
- Đổi màu nhấn trên Graphite sáng/tối: mọi điểm nhấn của màn hình phải đổi theo, không còn xanh cứng.

## 5. Chênh lệch với bản dựng hiện tại

Tìm thấy khi vẽ board (kiểm bằng grep ngày 2026-10-25):

1. **Lớp Tailwind xám bỏ qua persona.** `tailwind.config.mjs` ánh `gray`/`neutral` vào `--vzn-neutral-*`, là bảng màu nguyên thuỷ mà không persona nào khai báo lại. 23 file `.tsx` còn dùng `bg-/text-/border-gray|neutral|white|black` (nhiều nhất: `cost/CostOverviewCard`, `ProviderIcon`, `settings/BrowserIntegrationSection`, `translate/ImageTranslator`, `LiveTranslatePage`, `MarkdownText`, `chat/ResearchStepsPanel`, `chat/MessageBubble`, `chat/SystemPromptDropdown`). Trên Paper chúng ra xám lạnh trên giấy ngà; trên Midnight ra than chì thay vì đen. 20 file dùng biến thể `dark:` gắn với `html.dark`, nên không theo `data-mode` cục bộ của bản xem trước.
2. **`--vzn-sidebar-search-bg` chỉ có trong khối Graphite tối.** 9 khối còn lại thiếu, nên ở chế độ sáng ô "Tìm hoặc chạy lệnh" rơi về `--vzn-surface` (fallback trong `codex.css`). Trái với quy ước "mọi khối khai báo cùng một bộ token".
3. **Glow chỉ có ở lớp cũ.** `--vzn-shadow-glow` được dùng trong `ThemePreview` và các lớp `.btn-*` cũ trong `src/index.css`, nhưng atom `Button` (primary solid) và `.chat-send-button` (đặt `box-shadow: none`) không dùng. Bản xem trước của Midnight/Glass hứa ánh sáng mà màn hình thật không có. `--vzn-accent-glow` không được dùng ở đâu.
4. **Bo góc literal.** `chat.css` (13), `src/index.css` (14) và `codex.css` (7, ví dụ `.floating-panel` bo 12px) còn `border-radius` bằng px, không theo hình khối của Paper/Corporate/Glass.
5. **Board thay desktop bằng `--vzn-app-backdrop`.** Không vẽ được vật liệu native trong HTML; độ tương phản thật của Glass phụ thuộc hình nền desktop và cần QA trên máy macOS/Windows thật.
