# Dịch mọi nơi

> Bản vẽ gốc: `boards/Everywhere.dc.html` (cùng `boards/Providers.dc.html` phần token Chrome, `boards/States.dc.html`, `boards/SmallSurfaces.dc.html` phần chỉ báo Dịch nhanh) · Board chi tiết: `specs/everywhere.html` · Mã nguồn: `src/pages/EverywherePage.tsx`, `src/pages/settings/HotkeySection.tsx` (`part="quickTranslate"`), `src/pages/settings/BrowserIntegrationSection.tsx`

Luật chung (token, Button, bề mặt, responsive, trạng thái) ở [`../foundations.md`](../foundations.md). Tài liệu này chỉ ghi phần riêng.

## 1. Mục đích

Trang gom hai cách Viezan dịch **bên ngoài cửa sổ của nó**: (1) **Dịch nhanh vùng chọn** — bôi đen chữ trong ứng dụng bất kỳ, nhấn phím tắt toàn cục (mặc định `Alt+T`, hiển thị ⌥T trên macOS), bản dịch thay vào chỗ cũ; (2) **Tiện ích Chrome** — tiện ích trình duyệt nói chuyện với máy chủ cục bộ của Viezan bằng token. Người dùng đến đây để bật/tắt và đổi phím Dịch nhanh, chọn cặp ngôn ngữ riêng cho nó, cấp quyền Trợ năng (macOS), cài tiện ích và quản lý token. Thành công là: công tắc Dịch nhanh bật, quyền Trợ năng "Đã cấp", tiện ích Chrome có ít nhất một token còn hạn ("Đã có token").

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng | Mục "Dịch mọi nơi" (nhóm NGÔN NGỮ, icon `GlobeIcon`) | Trang hệ thống, không phải module bật/tắt được (`SYSTEM_PAGES` trong `src/modules/catalog.ts`) |
| Bảng lệnh ⌘K | Lệnh "Dịch mọi nơi" — mô tả `command_palette_everywhere_description`; từ khoá: quick translate, selection, hotkey, chrome, extension, browser | — |
| Hàng "việc chạy nền" ở đáy thanh điều hướng | Hàng "Tiện ích Chrome · Sẵn sàng" (`nav_background_browser`) | Chỉ hiện khi cầu nối trình duyệt đang chạy (`PrimaryNavigationSidebar.tsx`) |
| Trang Launcher & phím tắt | Không có link trực tiếp | Danh sách "Tất cả phím tắt" chỉ đọc, hiện hàng "Dịch nhanh vùng chọn" nhưng không dẫn về đây (xem §10) |
| Điểm ra | Nút "Tải về từ GitHub" mở `GITHUB_RELEASES_URL` trong trình duyệt; "Mở Cài đặt hệ thống" mở hộp thoại quyền Trợ năng của macOS | |

## 3. Bố cục

Bề rộng mặc định 1200 px cửa sổ (vùng nội dung ≈ 964 px khi thanh điều hướng mở 236 px).

```
┌ PageHeader (56 px, --vzn-surface) ──────────────────────────────────────────┐
│ Dịch mọi nơi · Dịch trong ứng dụng khác và trong trình duyệt, không cần…    │
├ .system-page-body (cuộn, padding --vzn-space-4) ────────────────────────────┤
│ ┌ SettingsCard "Dịch nhanh vùng chọn" ─────────────────────── [công tắc] ┐ │
│ │ mô tả 1 dòng                                                           │ │
│ ├ StepList "Cách hoạt động" ─────────────────────────────────────────────┤ │
│ │ [1 Bôi đen chữ] [2 Nhấn ⌥ T] [3 Bản dịch thay vào chỗ cũ]              │ │
│ ├ (CapabilityNotice "Module Dịch đang tắt" — chỉ khi module tắt) ────────┤ │
│ │ Phím tắt                                       [✕] [  Alt+T / ⌥T  ]    │ │
│ │ Cặp ngôn ngữ                     [Ngôn ngữ chính ▾] [Ngôn ngữ phụ ▾]   │ │
│ │ Model                                    Claude · claude-sonnet-…      │ │
│ │ Quyền Trợ năng (macOS)       ● Chưa cấp  [Mở Cài đặt hệ thống]         │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌ SettingsCard "Tiện ích Chrome" ───────────────────── ● Đã có token ─────┐ │
│ ├ StepList "Cài tiện ích" ───────────────────────────────────────────────┤ │
│ │ [1 Tải tiện ích  (Tải về từ GitHub)] [2 Nạp vào Chrome] [3 Dán token (+ Tạo token mới)] │
│ │ Token đang dùng                                                        │ │
│ │   (form tạo) (ô hiện token một lần) (danh sách token)                  │ │
│ │ Máy chủ cục bộ                                    127.0.0.1:<port>      │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header trang | `PageHeader` (`src/components/templates`) | `--vzn-page-header-min-height` (56), nền `--vzn-surface` | Không |
| Thân trang | `.system-page-body` › `.system-page-stack` (`src/styles/system-pages.css`) | Padding `--vzn-space-4` (16; 12 khi vùng nội dung < 560 px); lưới 1 cột, khoảng cách thẻ `--vzn-space-4` | Có (dọc) |
| Thẻ | `SettingsCard` (`headingLevel={2}`) | Viền `--vzn-border`, bo `--vzn-radius-md`, header padding `--vzn-space-4`, tiêu đề `--vzn-font-size-subtitle` | Không |
| Bước | `StepList` | Lưới `auto-fit, minmax(--vzn-step-min = 180px, 1fr)`, ô `--vzn-surface-muted`, bo `--vzn-radius-sm`, số tròn `--vzn-icon-xl` (24) | Không |
| Hàng cài đặt | `SettingsRow` | Padding `--vzn-space-3` `--vzn-space-4`; cột chữ `flex-basis: --vzn-settings-row-copy-basis` (220), điều khiển dồn phải và xuống dòng khi hẹp | Không |
| Ô chọn ngôn ngữ | `SelectField` + `.everywhere-language-field` | `min-inline-size: --vzn-settings-select-min` (180) | Menu nổi riêng |
| Model / máy chủ | `.everywhere-model`, `.everywhere-server` | `--vzn-font-mono`, `--vzn-font-size-sm`, màu `--vzn-text-muted` | Không |
| Trạng thái | `StatusLabel` | Chấm + chữ `--vzn-font-size-sm`; tone `ok` = `--vzn-success`, `warning` = `--vzn-warning` | Không |

## 4. Thành phần và hành động

### Thẻ "Dịch nhanh vùng chọn" (`HotkeySection.tsx`, `part="quickTranslate"`)

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | Công tắc bật Dịch nhanh (header thẻ) | `ToggleSwitch` (`role="switch"`, `aria-label` = "Bật Dịch nhanh") | Click, Space/Enter khi focus | `hotkey.update({ enabled })` — main đăng ký hoặc gỡ phím toàn cục | Công tắc đổi ngay (lạc quan). Nếu main từ chối: toast lỗi (khoá `settings-hotkey-register`, nội dung bản địa hoá theo mã lỗi: `IN_USE`, `CONFLICT`, `INVALID`, còn lại là câu chung) và công tắc quay về giá trị main thực sự giữ | Không có trạng thái disabled; khi module Dịch tắt, công tắc vẫn đổi được nhưng phím không chạy (main không đăng ký) |
| Q2 | Ô bước 2 "Nhấn ⌥ T" | `KeyCap` trong `StepList` (chỉ đọc) | — | Hiển thị phím đang lưu (`shortcutKeyCaps`) | Cập nhật ngay khi ghi phím mới | Ẩn `KeyCap` khi chưa có phím |
| Q3 | Nút xoá phím tắt (✕) | `md · danger · ghost`, icon vuông, `aria-label`/`title` = "Xóa" | Click | Lưu `{ hotkey: '', enabled: false }` — phím bị gỡ và công tắc tắt | Ô ghi phím hiện "Chưa cài", công tắc tắt | Ẩn khi chưa có phím hoặc đang ghi |
| Q4 | Ô ghi phím (`HotkeyRecordButton`) | `md · neutral · outline` (nghỉ) → `md · primary · soft` (đang ghi), chữ monospace | Click để bắt đầu ghi; trong lúc ghi bấm tổ hợp phím | Phím đầu tiên không phải phím bổ trợ chốt tổ hợp, lưu ngay qua `hotkey.update` (`recordHotkey` trong `src/utils/hotkeyRecording.ts`): cần ít nhất `Command`, `Ctrl` hoặc `Alt` (chỉ `Shift` không đủ); F1–F24 được dùng một mình. Phím thiếu bổ trợ không được lưu, dòng mô tả của hàng đổi thành gợi ý "Giữ thêm Command, Control hoặc Option (Alt) cùng với phím." (`role="alert"`). `Tab` không kèm bổ trợ vẫn chuyển focus | Nhãn đổi "Bấm phím… (Esc để hủy)"; sau khi chốt hiện tổ hợp mới (Alt hiển thị "Option" trên macOS). Main từ chối (trùng/không hợp lệ) → toast lỗi và quay về phím cũ | Esc hoặc rời focus (blur) huỷ ghi, giữ phím cũ |
| Q5 | Ngôn ngữ chính | `SelectField` (nhãn "Ngôn ngữ chính") | Click mở menu, chọn | Lưu `targetLang`. Chọn đúng ngôn ngữ phụ hiện tại thì **đảo cặp** thay vì gộp | Giá trị đổi ngay; mô tả hàng đổi theo cặp bật/tắt | — |
| Q6 | Ngôn ngữ phụ | `SelectField`, mục đầu "Tắt — luôn dịch sang ngôn ngữ chính" | Click mở menu, chọn | Lưu `secondaryLang` ('' = tắt cặp). Danh sách loại trừ ngôn ngữ chính | Mô tả hàng: `settings_hotkey_pair_desc` (cặp bật) hoặc `settings_hotkey_pair_off_desc` | — |
| Q7 | Hàng Model | Chữ chỉ đọc "Nhà cung cấp · `model-id`" | — | Dịch nhanh dùng nhà cung cấp/model đang chọn của app (`selectedProvider`, `selectedModels`), tự đẩy sang main mỗi khi đổi | — | Không có nút đổi (xem §10) |
| Q8 | Hàng Quyền Trợ năng (macOS) | `StatusLabel` + nút `sm · primary · solid` "Mở Cài đặt hệ thống" | Click nút | `capabilities.request('input.accessibility')` — macOS mở hộp thoại/trang quyền | Khi cửa sổ lấy lại focus, trạng thái được đọc lại (`focus` listener): "● Chưa cấp" (vàng) → "● Đã cấp" (xanh lá), nút biến mất | Cả hàng ẩn khi quyền `not-required` (Windows/Linux) hoặc chưa đọc được |
| Q9 | Thông báo "Module Dịch đang tắt" | `CapabilityNotice tone="info"`, nút "Bật" `md · primary · solid` | Click "Bật" | `setModuleEnabled('translate', true)` | Thông báo biến mất, phím được đăng ký lại | Chỉ hiện khi `enabledModules.translate === false` |

Phản hồi trong lúc chạy phím (từ main, `hotkey.onTranslating/onTranslated/onError`), hiển thị trong cửa sổ Viezan dạng toast một khoá `settings-hotkey-run`, **và** ngoài cửa sổ bằng chỉ báo nổi cạnh con trỏ (`electron/ipc/hotkeyIndicator.ts`, 304 × 60 px, dưới-phải con trỏ, lật lên trên khi thiếu chỗ):

| Sự kiện | Toast trong app | Chỉ báo cạnh con trỏ |
| --- | --- | --- |
| Đang dịch | info, không tự tắt: "Đang dịch…" | "Đang lấy văn bản đang chọn..." → "Đang dịch sang {lang}..." |
| Xong | success, tự tắt: "Đã dịch sang {lang}" | "Đã thay thế văn bản." |
| Không có chữ | — | warning: "Không có văn bản được chọn." |
| `ACCESSIBILITY_DENIED` | error: `settings_hotkey_error_accessibility`; hàng Q8 chuyển "Chưa cấp" | "Cần cấp quyền Trợ năng cho Viezan trong Cài đặt hệ thống." |
| `COPY_FAILED` | error: `settings_hotkey_error_copy_failed` | "Không gửi được lệnh sao chép tới ứng dụng đang mở." |
| `PASTE_FAILED` / `TRANSLATE_FAILED` | error: `settings_hotkey_error_paste_failed` / `settings_hotkey_error_translate_failed` | "Không thể dịch văn bản." |
| Lỗi khác | error: thông điệp gốc từ main | "Không thể dịch văn bản." |

### Thẻ "Tiện ích Chrome" (`BrowserIntegrationSection.tsx`)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Trạng thái header | `StatusLabel` | — | `ok` "Đã có token" khi danh sách token > 0, `neutral` "Chưa có token" | — | — |
| C2 | "Tải về từ GitHub" (bước 1) | `sm · neutral · outline`, icon GitHub | Click | `openExternal(GITHUB_RELEASES_URL)` | Trình duyệt mặc định mở trang Releases | — |
| C3 | Bước 2 "Nạp vào Chrome" | Chữ hướng dẫn | — | `chrome://extensions → Chế độ dành cho nhà phát triển → Tải tiện ích đã giải nén` (khớp tên trong Chrome bản Việt) | — | — |
| C4 | "Tạo token mới" (bước 3) | `sm · neutral · outline`, icon +, `aria-expanded` | Click (bật/tắt) | Mở/đóng form tạo token trong hàng "Token đang dùng" | Form xuất hiện ngay dưới nhãn | — |
| C5 | Ô "Tên token" | `<input>` thô, placeholder `Chrome Extension - <ngày>` | Gõ | Tên token; để trống dùng placeholder | — | — |
| C6 | Thời hạn | `TokenTtlPicker` (`ButtonGroup`): 7 ngày · 30 ngày (mặc định) · 90 ngày · 1 năm | Click | Chọn TTL | Nút đang chọn nổi bật | — |
| C7 | "Huỷ" | `md · neutral · outline` (`SettingsFormActions`) | Click | Đóng form, đặt lại tên + TTL | — | — |
| C8 | "Tạo token" | `md · primary · solid` | Click | `localServer.createToken({ name, ttlDays })` | Spinner trên nút, nút disabled trong lúc tạo; xong thì form đóng, khung "hiện một lần" xuất hiện, danh sách tải lại. Lỗi → toast (khoá `settings-ext-token-action`) | Disabled khi đang tạo |
| C9 | Khung hiện token một lần | Tiêu đề `Token "{name}": sao chép ngay!`, mô tả "chỉ hiện một lần", mã token monospace `select-all`, ngày hết hạn | — | — | — | — |
| C10 | "Sao chép" token | `md · neutral · outline` → `md · primary · soft` "Đã sao chép" trong 2 s | Click | `clipboard.writeText(token)` | Nhãn đổi "Đã sao chép" 2 giây | — |
| C11 | Đóng khung token (✕) | `md · neutral · ghost`, icon vuông, `aria-label` "Đóng" | Click | Ẩn token vĩnh viễn (không xem lại được) | Khung biến mất | — |
| C12 | "Tạo lại" (mỗi token) | `md · neutral · outline`, icon làm mới, `title` = "Tạo lại token mới (giá trị cũ hết hiệu lực)" | Click | `regenerateToken({ id })` — giá trị cũ mất hiệu lực ngay | Spinner thay icon; xong hiện khung token mới (C9) | Disabled khi token đó đang tạo lại hoặc đang xoá |
| C13 | Xoá token (thùng rác) | `md · danger · soft`, icon vuông, `aria-label` "Xóa token: hết hiệu lực ngay" | Click | `deleteToken({ id })` — **không hỏi xác nhận** | Spinner; hàng biến mất; khung token đang hiện (nếu có) cũng bị đóng | Disabled khi token đó đang xoá/tạo lại |
| C14 | Máy chủ cục bộ | Chữ monospace `127.0.0.1:<port>` hoặc "—" | — | Cổng lấy từ `listTokens()` | — | — |
| C15 | Toast lỗi tải danh sách | Toast error + nút "Thử lại" (khoá `settings-ext-token-list`) | Click "Thử lại" | Gọi lại `listTokens()` | Toast tự biến mất khi tải được hoặc rời trang | — |

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống (Dịch nhanh) | Cài mới: chưa bật | Công tắc tắt; ô ghi phím hiện mặc định `Alt+T` (⌥T trên macOS); cặp ngôn ngữ lấy ngôn ngữ đích của trang Dịch, ngôn ngữ phụ "Tắt" | Bật, ghi phím, đổi cặp |
| Trống (Chrome) | Chưa có token | Header "● Chưa có token" (xám); hàng token: chữ nghiêng giữa "Chưa có token nào. Nhấn "+ Tạo token mới" để bắt đầu." | C2, C4 |
| Đang tải | Đọc danh sách token | Spinner nhỏ + "Đang tải..." trong hàng token | — |
| Có dữ liệu | Có token | Mỗi token một hàng: tên (cắt dòng), hạn "Hết hạn {date} · còn {days} ngày"; ≤ 7 ngày: "Còn {days} ngày ({date})"; quá hạn: "Đã hết hạn" chữ đỏ | C12, C13 |
| Vừa tạo token | Sau C8/C12 | Khung hiện token một lần ở đầu vùng dưới hàng | C10, C11 |
| Đang ghi phím | Sau click Q4 | Nút ghi `primary · soft` "Bấm phím… (Esc để hủy)"; nút ✕ ẩn | Bấm tổ hợp, Esc |
| Lỗi đăng ký phím | Main từ chối (trùng, không hợp lệ) | Toast lỗi; ô ghi phím + công tắc phản ánh giá trị main còn giữ | Ghi phím khác |
| Lỗi tải token | IPC hỏng / không phải Electron | Toast lỗi có "Thử lại"; hàng token **trống** (không có câu trống), header vẫn "Chưa có token" | "Thử lại" trên toast |
| Lỗi tạo/xoá/tạo lại | IPC trả lỗi | Toast lỗi (một khoá, thay nhau) | Thử lại thủ công |
| Thiếu khoá / model | Không xử lý riêng trên trang này | Hàng Model vẫn hiện nhà cung cấp/model đang chọn; lỗi thật chỉ đến khi chạy phím (toast + chỉ báo "Không thể dịch văn bản.") | — (đề xuất ở §10) |
| Module tắt | `enabledModules.translate === false` | `CapabilityNotice` info "Module Dịch đang tắt" + "Phím tắt này vẫn được lưu nhưng không hoạt động…" | "Bật" |
| Không có quyền hệ thống | macOS, `input.accessibility` khác `granted` | Hàng "Quyền Trợ năng (macOS)": "● Chưa cấp" vàng + mô tả lý do + "Mở Cài đặt hệ thống" | Q8 |

## 6. Luồng tương tác chính

**A. Bật Dịch nhanh lần đầu (macOS)**
1. Người dùng mở "Dịch mọi nơi". Thẻ Dịch nhanh: công tắc tắt, bước 2 hiện ⌥T, hàng quyền "● Chưa cấp".
2. Bật công tắc → main đăng ký `Alt+T`. Không có toast nếu thành công.
3. Bấm "Mở Cài đặt hệ thống" → macOS mở Quyền riêng tư & Bảo mật › Trợ năng. Người dùng bật Viezan rồi quay lại cửa sổ.
4. Sự kiện `focus` đọc lại quyền → "● Đã cấp", nút biến mất.
5. Trong ứng dụng khác: bôi đen chữ, nhấn ⌥T → chỉ báo nổi cạnh con trỏ "Đang dịch sang Tiếng Anh..." → chữ được thay → "Đã thay thế văn bản." (tự ẩn sau ~1,5 s). Nếu cửa sổ Viezan đang mở, toast "Đã dịch sang Tiếng Anh".
6. ⌘Z trong ứng dụng đó lấy lại chữ gốc (bước 3 của `StepList`).

**B. Đổi phím tắt**
1. Click ô ghi phím → nhãn "Bấm phím… (Esc để hủy)", nền xanh nhạt.
2. Nhấn ⌃⌥T → ô hiện `Ctrl+Option+T`, lưu ngay, `SHORTCUTS_CHANGED_EVENT` báo cho danh sách "Tất cả phím tắt".
3. Nếu tổ hợp đã bị chiếm: toast lỗi, ô quay về phím cũ.
4. Bấm ✕ → phím bị xoá, công tắc tắt, ô hiện "Chưa cài".

**C. Đặt cặp ngôn ngữ**
1. Ngôn ngữ chính = Tiếng Việt, ngôn ngữ phụ = Tắt → mọi chữ dịch sang Tiếng Việt.
2. Chọn ngôn ngữ phụ = Tiếng Anh → mô tả đổi: chữ đã là Tiếng Việt thì dịch sang Tiếng Anh, còn lại sang Tiếng Việt.
3. Chọn ngôn ngữ chính = Tiếng Anh (đang là phụ) → cặp đảo: chính Tiếng Anh, phụ Tiếng Việt. Trang Dịch không bị ảnh hưởng.

**D. Kết nối tiện ích Chrome**
1. Bước 1: "Tải về từ GitHub" → tải gói, giải nén.
2. Bước 2: làm theo hướng dẫn `chrome://extensions`.
3. Bước 3: "Tạo token mới" → form mở; đặt tên (hoặc để mặc định), chọn 30 ngày, "Tạo token".
4. Khung "Token "…": sao chép ngay!" xuất hiện với token; bấm "Sao chép" → "Đã sao chép" 2 giây; dán vào tiện ích.
5. Đóng khung (✕). Token chỉ còn trong danh sách dưới dạng tên + hạn; header "● Đã có token".
6. Nếu lộ token: "Tạo lại" (giá trị cũ mất hiệu lực, khung hiện token mới) hoặc thùng rác (xoá ngay).

## 7. Responsive

Hai thẻ luôn xếp chồng một cột (`.system-page-stack` không có `data-layout`).

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 900 px | Ba bước nằm một hàng (mỗi ô ≥ 180 px). Hàng cài đặt: chữ trái, điều khiển phải. Hai `SelectField` cạnh nhau. |
| 560–899 px | `StepList` `auto-fit`: 3 ô một hàng khi đủ 3 × 180 px + khoảng cách, nếu không thì 2 + 1 rồi 1 cột. Điều khiển hàng xuống dưới chữ khi cột chữ < 220 px (`flex-wrap`), vẫn dồn phải. Hai ô ngôn ngữ có thể xuống hai dòng. |
| < 560 px | Padding thân 12 px. Bước xếp dọc. Hàng token: tên cắt dòng, "Tạo lại" + thùng rác vẫn một hàng bên phải. Cửa sổ < 900 px: thanh điều hướng thành rail 60 px (xem foundations §8). |

## 8. Bàn phím và trợ năng

- Thứ tự Tab: công tắc Dịch nhanh → (nút "Bật" của thông báo module, nếu có) → ✕ → ô ghi phím → Ngôn ngữ chính → Ngôn ngữ phụ → "Mở Cài đặt hệ thống" → "Tải về từ GitHub" → "Tạo token mới" → (form: tên → thời hạn → Huỷ → Tạo token) → (khung token: ✕ → Sao chép) → từng token: Tạo lại → Xoá.
- Mỗi thẻ là `<section aria-labelledby>` với `<h2>`; `StepList` là `<ol aria-label="Cách hoạt động">` / `"Cài tiện ích"`, số thứ tự `aria-hidden`.
- Công tắc: `role="switch"` + `aria-checked` + `aria-label`. "Tạo token mới" có `aria-expanded`.
- Ô ghi phím chỉ bắt phím khi đang ghi (`onKeyDown` chỉ gắn lúc ghi); Esc huỷ; blur huỷ. `Tab` không kèm phím bổ trợ không bị bắt, focus đi tiếp và blur huỷ ghi.
- Nút chỉ có icon (✕, thùng rác, đóng khung) đều có `aria-label` và `title`.
- `CapabilityNotice` có `role="status"`. Kết quả chạy phím đi qua toast (`NotificationViewport`). Danh sách token không có `aria-live` (xem §10).
- Màu không phải tín hiệu duy nhất: trạng thái quyền và token luôn có chữ ("Đã cấp", "Đã hết hạn").

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `nav_everywhere` | Dịch mọi nơi |
| `everywhere_subtitle` | Dịch trong ứng dụng khác và trong trình duyệt, không cần mở Viezan |
| `shortcut_quick_translate` | Dịch nhanh vùng chọn |
| `settings_hotkey_section_desc` | Nhấn phím tắt trong bất kỳ ứng dụng nào để dịch ngay văn bản đang chọn và thay thế tại chỗ. |
| `settings_hotkey_enabled` | Bật Dịch nhanh (nhãn ARIA của công tắc) |
| `settings_hotkey_needs_modifier` | Giữ thêm Command, Control hoặc Option (Alt) cùng với phím. |
| `settings_hotkey_error_paste_failed` / `_translate_failed` | Không dán được bản dịch vào ứng dụng đang mở. Kiểm tra quyền Trợ năng rồi thử lại. / Không dịch được đoạn đã chọn. Kiểm tra model và khoá API rồi thử lại. |
| `everywhere_steps_label` | Cách hoạt động |
| `everywhere_step_select` / `_desc` | Bôi đen chữ / Ở ứng dụng bất kỳ. |
| `everywhere_step_press` / `_desc` | Nhấn / Chỉ báo nhỏ hiện cạnh con trỏ trong lúc dịch. |
| `everywhere_step_replace` / `_desc` | Bản dịch thay vào chỗ cũ / {undo} để lấy lại chữ gốc. |
| `settings_hotkey_label` / `_desc` | Phím tắt / Nhấp vào ô rồi bấm tổ hợp phím bạn muốn |
| `settings_hotkey_recording` | Bấm phím… (Esc để hủy) |
| `settings_hotkey_none` | Chưa cài |
| `settings_hotkey_clear` | Xóa |
| `everywhere_language_pair` | Cặp ngôn ngữ |
| `settings_hotkey_primary_lang` / `_secondary_lang` | Ngôn ngữ chính / Ngôn ngữ phụ |
| `settings_hotkey_secondary_off` | Tắt — luôn dịch sang ngôn ngữ chính |
| `settings_hotkey_pair_desc` | Văn bản đang ở ngôn ngữ chính sẽ được dịch sang ngôn ngữ phụ; mọi văn bản khác dịch sang ngôn ngữ chính. … |
| `everywhere_model` / `_desc` | Model / Model đang chọn cho trang Dịch |
| `settings_hotkey_accessibility_title` | Quyền Trợ năng (macOS) |
| `settings_hotkey_accessibility_missing` | Viezan cần quyền Trợ năng để sao chép văn bản đang chọn trong ứng dụng khác và thay thế tại chỗ. |
| `everywhere_permission_granted` / `_missing` | Đã cấp / Chưa cấp |
| `settings_hotkey_accessibility_open` | Mở Cài đặt hệ thống |
| `settings_hotkey_status_translating` | Đang dịch… |
| `settings_hotkey_status_done_into` | Đã dịch sang {lang} |
| `settings_modules_off_title` / `_desc` | Module {module} đang tắt / Phím tắt này vẫn được lưu nhưng không hoạt động cho đến khi bật lại module. |
| `settings_modules_turn_on` | Bật |
| `everywhere_ext_title` / `_desc` | Tiện ích Chrome / Dịch và đọc to trên trang web bằng khoá và model đã cài trong Viezan. Khoá không rời máy. |
| `everywhere_ext_has_token` / `_no_token` | Đã có token / Chưa có token |
| `everywhere_ext_steps_label` | Cài tiện ích |
| `everywhere_ext_step_download` / `_load` / `_token` | Tải tiện ích / Nạp vào Chrome / Dán token |
| `settings_extension_download_btn` | Tải về từ GitHub |
| `settings_token_create` | Tạo token mới |
| `everywhere_ext_tokens` | Token đang dùng |
| `settings_token_name_label` / `_ttl_label` | Tên token / Thời hạn |
| `settings_token_generate` / `_cancel` | Tạo token / Huỷ |
| `settings_token_reveal_title` / `_body` | Token "{name}": sao chép ngay! / Token này chỉ hiện một lần duy nhất. Sau khi đóng sẽ không xem lại được. |
| `settings_token_copy` / `_copied` | Sao chép / Đã sao chép |
| `settings_token_regenerate` | Tạo lại |
| `settings_token_delete_title` | Xóa token: hết hiệu lực ngay |
| `settings_token_empty` | Chưa có token nào. Nhấn "+ Tạo token mới" để bắt đầu. |
| `settings_token_expired` | Đã hết hạn |
| `everywhere_ext_server` / `_desc` | Máy chủ cục bộ / Chỉ nhận kết nối từ máy này, có token |

## 10. Chênh lệch với bản dựng hiện tại

Bản vẽ gốc (`boards/Everywhere.dc.html`) so với mã:

1. **"Nút dịch nổi" và "Bookmarklet"** (thẻ thứ ba trên board, "Tự chèn vào trang", "Lấy bookmarklet") — **đề xuất**, app không có.
2. **Chip cặp ngôn ngữ trong header trang** ("Tiếng Việt ⇄ Tiếng Anh") — **đề xuất**; mã đặt cặp trong hàng "Cặp ngôn ngữ" với hai `SelectField`, header không có hành động.
3. **Công tắc "Tự đảo chiều"** của board được mã thực hiện bằng ô "Ngôn ngữ phụ" (đặt = Tắt để không đảo). Giữ cách của mã; board nên vẽ lại.
4. **Công tắc "Hiện chỉ báo tiến trình"** — **đề xuất**; chỉ báo cạnh con trỏ luôn hiện (`hotkeyIndicator.ts`), không tắt được.
5. **Trạng thái tiện ích "Đã kết nối"** — mã chỉ biết "Đã có token" / "Chưa có token" (đếm token), không biết tiện ích có thực sự kết nối. Trạng thái kết nối thật là **đề xuất**. Ngoài ra khi tải danh sách thất bại, header vẫn nói "Chưa có token" — nên là trạng thái "Không đọc được".
6. **Nút "Thu hồi"** trên mỗi token (board) — mã có "Tạo lại" + nút xoá icon. Board Providers vẽ token dạng `sk-vie-…`, nút "Xong" và câu cảnh báo "Ai có token này dùng được khoá AI của bạn…": mã không có nút "Xong" (chỉ ✕) và không có câu cảnh báo đó.
7. **Xoá token không hỏi xác nhận** và không có toast thành công/hoàn tác. Đề xuất: xác nhận ngắn hoặc toast "Đã xoá" — hành động phá huỷ.
8. **Form tạo token và khung hiện token** dùng lớp Tailwind màu thô (`bg-gray-50`, `dark:bg-gray-800`, `border-gray-200`…) và `<input>` thô thay vì atom `Input` — nợ thiết kế so với luật "mọi giá trị từ `tokens.css`" (AGENTS.md). Nút trong hàng token và khung token là `md`, trong khi nút ở bước là `sm`.
9. **Hàng Model chỉ đọc** — không có cách đổi model riêng cho Dịch nhanh ngay tại đây; mô tả nói "Model đang chọn cho trang Dịch" nhưng giá trị lấy từ lựa chọn nhà cung cấp/model chung của app. Đề xuất: link "Đổi" mở popover cấu hình AI, và hàng cảnh báo vàng khi nhà cung cấp chưa có khoá.
10. **Chỉ báo cạnh con trỏ khi dán lỗi**: board SmallSurfaces vẽ "Không dán được bản dịch — Bản dịch đã được chép vào bộ nhớ tạm" và nút "Cấp quyền" trong chỉ báo — **đề xuất**. (Toast lỗi đăng ký phím và `PASTE_FAILED` / `TRANSLATE_FAILED` đã bản địa hoá.)
11. Vùng danh sách token và kết quả chạy phím không có `aria-live`; trạng thái "Đang tải..." không có `role="status"`.
12. Không có đường dẫn từ "Tất cả phím tắt" (trang Launcher & phím tắt) về thẻ Dịch nhanh, dù board Utilities ghi "tuỳ chọn trong Dịch mọi nơi".
