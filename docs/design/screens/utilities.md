# Launcher & phím tắt

> Bản vẽ gốc: `boards/Utilities.dc.html`, `boards/LauncherStates.dc.html` (thay Spotlight, trùng phím) · Board chi tiết: `specs/utilities.html` · Mã nguồn: `src/pages/UtilitiesPage.tsx`, `src/pages/settings/HotkeySection.tsx` (`part="launcher"`), `src/components/organisms/ShortcutOverview.tsx`, `src/components/ui/molecules/ShortcutList.tsx`, `src/components/organisms/LauncherShortcutNotice.tsx`, `src/components/organisms/LauncherSpotlightPrompt.tsx`, `src/hooks/useShortcutInventory.ts`

Luật chung ở [`../foundations.md`](../foundations.md). Cửa sổ Launcher nổi được đặc tả riêng ở [`launcher.md`](launcher.md).

## 1. Mục đích

Trang này là nơi người dùng **đặt phím mở Launcher** (cửa sổ tìm/hỏi nổi trên mọi ứng dụng) và **nhìn thấy mọi phím tắt Viezan trong một danh sách**, với các phím trùng được gắn nhãn. Trên macOS, trang còn giải quyết xung đột với Spotlight (⌘Space): tắt phím Spotlight, trả lại, hoặc dùng ⌥Space. Thành công là: công tắc Launcher bật, không có thông báo xung đột, danh sách "Tất cả phím tắt" không có hàng "Trùng phím".

## 2. Điểm vào và điểm ra

| Từ | Cách vào | Ghi chú |
| --- | --- | --- |
| Thanh điều hướng | Mục "Launcher & phím tắt" (nhóm TIỆN ÍCH, icon `KeyboardIcon`) | Trang hệ thống (`SYSTEM_PAGES`) |
| Bảng lệnh ⌘K | "Launcher & phím tắt" — "Launcher và mọi phím tắt"; từ khoá launcher, shortcut, hotkey, spotlight, keyboard | |
| Trang chủ | Thẻ "Phím tắt" › link "Sửa" (`HomePage.tsx` → `setActivePage('utilities')`) | |
| Hàng việc chạy nền | "Phím tắt toàn cục · {số}" ở đáy thanh điều hướng | Khi có phím toàn cục đang bật |
| Toast khởi động (macOS) | `LauncherShortcutNotice`: "{owner} đang giữ phím tắt Launcher {hotkey}…" › "Xem cách khắc phục" | Một lần mỗi phiên, khi Launcher bật mà hệ thống giữ phím |
| Hộp thoại lần đầu (macOS) | `LauncherSpotlightPrompt` ở cấp `App.tsx` | Không phải điểm vào trang, nhưng quyết định phím ban đầu |
| Điểm ra | "Mở Cài đặt hệ thống" → `MACOS_KEYBOARD_SHORTCUTS_PREFS` (Bàn phím › Phím tắt) | |

## 3. Bố cục

```
┌ PageHeader ─────────────────────────────────────────────────────────────────┐
│ Launcher & phím tắt · Mở mọi thứ bằng bàn phím, từ bất cứ đâu               │
├ .system-page-body › .system-page-stack[data-layout="columns"] ──────────────┤
│ ┌ SettingsCard "Launcher" ───────── [công tắc] ┐ ┌ SettingsCard "Tất cả phím tắt" ┐
│ │ Nhấn phím tắt ở bất kỳ đâu để tìm ứng dụng… │ │ Một danh sách để thấy mọi…     │
│ ├──────────────────────────────────────────────┤ ├────────────────────────────────┤
│ │ Phím tắt            [✕] [ Command+Space ]    │ │ Launcher       Toàn hệ thống ⌘ Space │
│ │ (Notice: Module Launcher đang tắt)           │ │ Dịch nhanh…    Toàn hệ thống ⌥ T     │
│ │ (Notice vàng: Spotlight đang giữ ⌘Space      │ │ Bảng lệnh      Trong cửa sổ  ⌘ K     │
│ │   [Tắt phím tắt Spotlight][Mở Cài đặt…]      │ │ Chat mới       Trong cửa sổ  Chưa đặt│
│ │   [Dùng Option+Space thay thế])              │ │ Gửi tin nhắn   Trong ô soạn  ↵       │
│ │ (Notice: Phím tắt Spotlight của macOS        │ │                                │
│ │   [Khôi phục phím tắt Spotlight])            │ └────────────────────────────────┘
│ └──────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

| Vùng | Component | Kích thước / token | Cuộn |
| --- | --- | --- | --- |
| Header | `PageHeader` | 56 px | Không |
| Thân | `.system-page-body` | Padding `--vzn-space-4` (12 px khi < 560) | Có |
| Lưới thẻ | `.system-page-stack[data-layout="columns"]` | `repeat(auto-fit, minmax(min(--vzn-system-card-min = 420px, 100%), 1fr))`, khoảng cách 16, `align-items: start` | — |
| Thẻ Launcher | `HotkeySection part="launcher"` › `SettingsCard` | Như thẻ cài đặt chuẩn | Không |
| Thông báo | `CapabilityNotice` (tone info / warning) | Nút hành động `md` | Không |
| Thẻ Tất cả phím tắt | `SettingsCard` › `.utilities-shortcuts` (padding ngang 16) › `ShortcutOverview` › `ShortcutList` | Hàng cao tối thiểu `--vzn-control-height-lg` (40), kẻ `--vzn-divider` | Không |
| Phím | `KeyCap` (monospace) | | |
| Nhãn trùng | `StatusChip tone="warning"` "Trùng phím" | | |

## 4. Thành phần và hành động

### Thẻ Launcher

| # | Điều khiển | Loại (Button size · variant · appearance) | Kích hoạt | Kết quả | Phản hồi | Khi bị tắt |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | Công tắc Launcher (header) | `ToggleSwitch`, `aria-label` "Bật phím tắt" | Click / Space | `hotkey.chat.update({ enabled })` | Đổi ngay. Lỗi: toast (khoá `settings-chat-hotkey-register`) "Phím tắt đang được sử dụng…" (`IN_USE`/`CONFLICT`) hoặc "Không đăng ký được phím tắt. Hãy chọn tổ hợp khác."; công tắc + phím trở về giá trị main giữ | Không disabled; khi module Launcher tắt, phím được lưu nhưng không chạy |
| L2 | Xoá phím (✕) | `sm · danger · ghost`, icon vuông, `aria-label` "Xóa" | Click | Lưu `{ hotkey: '', enabled: false }` | Ô ghi hiện "Chưa cài", công tắc tắt; danh sách cập nhật "Chưa đặt" | Ẩn khi trống hoặc đang ghi |
| L3 | Ô ghi phím (`HotkeyRecordButton`) | `md · neutral · outline` → `md · primary · soft` khi ghi | Click rồi bấm tổ hợp | Lưu qua `hotkey.chat.update({ hotkey })`, phát `SHORTCUTS_CHANGED_EVENT` | "Bấm phím… (Esc để hủy)" → tổ hợp mới (Alt hiện "Option" trên macOS). Trên macOS kiểm tra lại xung đột hệ thống ngay sau khi đổi | Esc/blur huỷ |
| L4 | Thông báo "Module Launcher đang tắt" | `CapabilityNotice` info + "Bật" `md · primary · solid` | Click | `setModuleEnabled('launcher', true)` | Thông báo biến mất; hàng Launcher xuất hiện lại trong danh sách | Chỉ khi `enabledModules.launcher === false` |
| L5 | Thông báo xung đột hệ thống (macOS) | `CapabilityNotice` warning, tiêu đề "{owner} đang giữ {hotkey}" | — | Hiện khi `hotkey.chat.systemConflict(phím)` báo chủ sở hữu (Spotlight, Tìm kiếm Finder, macOS) | Kiểm tra lại khi phím đổi và khi cửa sổ lấy lại focus | Ẩn trên Windows/Linux |
| L5a | "Tắt phím tắt Spotlight" | `md · primary · solid` | Click | `spotlight.resolve('replace')` → bật Launcher trên phím mặc định (⌘Space) | Toast success "Đã tắt phím tắt Spotlight…" hoặc warning không tự tắt "…chỉ áp dụng sau khi bạn đăng xuất rồi đăng nhập lại."; lỗi: toast "Không thể tắt phím tắt Spotlight…" | Chỉ khi chủ là Spotlight; disabled khi đang xử lý |
| L5b | "Mở Cài đặt hệ thống" | `md · primary · outline` | Click | Mở Bàn phím › Phím tắt bàn phím của macOS | Cửa sổ hệ thống mở; khi quay lại, kiểm tra xung đột lại | — |
| L5c | "Dùng Option+Space thay thế" | `md · neutral · outline` | Click | Lưu phím `Alt+Space` | Thông báo xung đột biến mất nếu phím mới không bị giữ | Ẩn khi phím đã là `Alt+Space` |
| L6 | Thông báo "Phím tắt Spotlight của macOS" + "Khôi phục phím tắt Spotlight" | `CapabilityNotice` info, nút `md · neutral · outline` | Click | `spotlight.restore()` | Toast "Đã bật lại phím tắt Spotlight." (hoặc cảnh báo đăng xuất); nếu Launcher vẫn dùng ⌘Space, thông báo xung đột (L5) quay lại | Chỉ khi Viezan đã tắt Spotlight (`disabledByViezan`); disabled khi đang xử lý |

### Thẻ "Tất cả phím tắt" (chỉ đọc)

| # | Hàng | Phạm vi | Phím | Khi nào bị mờ / ẩn |
| --- | --- | --- | --- | --- |
| S1 | Launcher | Toàn hệ thống | Phím Launcher hoặc mặc định (⌘Space trên macOS, Alt+Space nơi khác) | Ẩn hẳn khi module Launcher tắt; mờ + "· đang tắt" khi công tắc tắt |
| S2 | Dịch nhanh vùng chọn | Toàn hệ thống | Phím Dịch nhanh hoặc mặc định `Alt+T` | Mờ khi công tắc Dịch nhanh tắt |
| S3 | Bảng lệnh | Trong cửa sổ | ⌘K / Ctrl+K | Luôn hoạt động |
| S4 | Chat mới | Trong cửa sổ | `chatNewSessionShortcut` hoặc "Chưa đặt" | Ẩn khi module Chat tắt; mờ khi chưa đặt |
| S5 | Gửi tin nhắn | Trong ô soạn chat | Enter hoặc ⌘↵ theo `chatSendShortcut` | Ẩn khi module Chat tắt; không bao giờ tính trùng |

- Hai hàng **đang bật** cùng tổ hợp → cả hai có chip vàng "Trùng phím" (`findShortcutConflicts`), chữ nói rõ, không chỉ dựa vào màu.
- Danh sách đọc lại từ main khi cửa sổ lấy lại focus và mỗi khi có `SHORTCUTS_CHANGED_EVENT`.
- Không có điều khiển nào trong thẻ này: mỗi phím đổi ở nơi cấu hình tính năng của nó.

### Hộp thoại "Dùng Command+Space cho Viezan Launcher?" (`LauncherSpotlightPrompt`, macOS, lần đầu)

| # | Điều khiển | Loại | Kích hoạt | Kết quả | Phản hồi |
| --- | --- | --- | --- | --- | --- |
| P1 | "Giữ Spotlight, dùng Option+Space" | `md · neutral · outline` | Click hoặc **Esc** | `resolve('keep')` → Launcher bật trên ⌥Space | Hộp thoại đóng, toast "Viezan Launcher mở bằng Option+Space." |
| P2 | "Dùng Command+Space cho Viezan" | `md · primary · solid`, nhận focus khi mở | Click / Enter | `resolve('replace')` | Thành công: đóng + toast success hoặc cảnh báo đăng xuất. Lỗi: hộp thoại **ở lại**, toast lỗi, người dùng vẫn chọn "Giữ" được |

Cả hai nút disabled trong lúc gọi. Hộp thoại không mở khi bảng lệnh đang mở (`blocked`), chỉ hiện một lần (`shouldPrompt` từ main).

## 5. Trạng thái

| Trạng thái | Khi nào | Hiển thị | Hành động có sẵn |
| --- | --- | --- | --- |
| Trống | Chưa ghi phím | Ô ghi hiện phím mặc định (⌘Space / Alt+Space); công tắc theo main | L1, L3 |
| Đang tải | Đọc cài đặt từ main lần đầu | Ô ghi trống "Chưa cài" trong khoảnh khắc; danh sách chưa có phím toàn cục | — (không có skeleton, xem §10) |
| Có dữ liệu | Bình thường | Như sơ đồ §3 | Tất cả |
| Đang ghi phím | Sau click L3 | Ô ghi xanh nhạt "Bấm phím… (Esc để hủy)" | Bấm tổ hợp / Esc |
| Trùng trong app | Hai phím Viezan đang bật trùng nhau | Chip "Trùng phím" trên cả hai hàng | Đổi phím ở nơi của nó |
| Trùng hệ thống (macOS) | Spotlight/Finder/macOS giữ phím Launcher | `CapabilityNotice` vàng L5 + toast khởi động một lần | L5a, L5b, L5c |
| Bị ứng dụng khác chiếm | Main không đăng ký được | Toast lỗi "Phím tắt đang được sử dụng…"; phím quay về giá trị cũ | Ghi phím khác |
| Đã thay Spotlight | Viezan đã tắt ⌘Space của Spotlight | `CapabilityNotice` info L6 | L6 |
| Cần đăng xuất | macOS chưa áp dụng thay đổi | Toast cảnh báo không tự tắt | — |
| Thiếu khoá / model | Không áp dụng ở trang này | — | — |
| Module tắt | `enabledModules.launcher === false` | Notice L4; hàng Launcher biến mất khỏi danh sách | "Bật" |
| Không có quyền hệ thống | Không áp dụng (Launcher không cần quyền Trợ năng) | — | — |

## 6. Luồng tương tác chính

**A. Lần đầu trên macOS: thay Spotlight**
1. App khởi động; main báo `shouldPrompt`. Hộp thoại giữa cửa sổ, focus ở "Dùng Command+Space cho Viezan".
2. Chọn thay → main tắt phím Spotlight trong cài đặt bàn phím macOS, bật Launcher trên ⌘Space. Toast xanh "Đã tắt phím tắt Spotlight…". Nếu macOS cần đăng nhập lại: toast vàng không tự tắt.
3. Mở trang này: thẻ Launcher có thông báo info "Phím tắt Spotlight của macOS" với "Khôi phục phím tắt Spotlight".
4. Chọn giữ (hoặc Esc) → Launcher dùng ⌥Space, toast "Viezan Launcher mở bằng Option+Space.".

**B. Khắc phục xung đột từ toast khởi động**
1. Lần khởi động sau, Spotlight lại giữ ⌘Space (người dùng bật lại trong macOS) → toast vàng không tự tắt: "Spotlight đang giữ phím tắt Launcher Command+Space…" + "Xem cách khắc phục".
2. Bấm → toast đóng, app chuyển sang trang này. Thẻ Launcher hiện notice vàng L5 với ba lựa chọn.
3. Chọn "Dùng Option+Space thay thế" → phím đổi, notice biến mất, danh sách cập nhật.

**C. Đổi phím và thấy trùng**
1. Click ô ghi → bấm ⌥T (đang là phím Dịch nhanh).
2. Main có thể chấp nhận (phím chưa bị app khác giữ ở cấp OS) hoặc từ chối. Nếu chấp nhận và cả hai đang bật, danh sách hiện chip "Trùng phím" ở hàng Launcher và Dịch nhanh.
3. Người dùng ghi lại phím khác → chip biến mất.

**D. Trả lại Spotlight**
1. Bấm "Khôi phục phím tắt Spotlight" → toast "Đã bật lại phím tắt Spotlight.".
2. Nếu Launcher vẫn dùng ⌘Space: notice L5 xuất hiện lại (kiểm tra qua sự kiện `focus`).

## 7. Responsive

| Bề rộng vùng nội dung | Thay đổi |
| --- | --- |
| ≥ 900 px | Hai thẻ cạnh nhau (mỗi thẻ ≥ 420 px), căn trên. |
| 560–899 px | Dưới ~ 856 px (2 × 420 + 16) hai thẻ xếp chồng: Launcher trên, Tất cả phím tắt dưới. Nút của `CapabilityNotice` xuống dòng. |
| < 560 px | Padding 12 px. Hàng phím: nhãn + phạm vi bên trái, `KeyCap` bên phải; chip "Trùng phím" nằm giữa. Ở rail 60 px của thanh điều hướng khi cửa sổ < 900 px. |

## 8. Bàn phím và trợ năng

- Thứ tự Tab: công tắc → ✕ → ô ghi phím → nút trong notice (theo thứ tự hiển thị). Thẻ "Tất cả phím tắt" không có điểm dừng Tab.
- `ShortcutList` là `<ul aria-label="Tất cả phím tắt">`; hàng mờ vẫn nói "· đang tắt" bằng chữ; hàng trùng có chữ "Trùng phím".
- Hộp thoại Spotlight: `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby`, focus vào nút chính khi mở, bẫy Tab (`trapTabFocus`), Esc = "Giữ Spotlight", trả focus về phần tử trước đó khi đóng.
- `CapabilityNotice` có `role="status"`; kết quả hành động đi qua toast.

## 9. Nội dung chữ (vi)

| Khoá | vi |
| --- | --- |
| `nav_utilities` | Launcher & phím tắt |
| `utilities_subtitle` | Mở mọi thứ bằng bàn phím, từ bất cứ đâu |
| `shortcut_launcher` | Launcher |
| `settings_chat_hotkey_section_desc` | Nhấn phím tắt ở bất kỳ đâu để tìm ứng dụng, mở nhanh, tìm web hoặc hỏi AI. |
| `settings_chat_hotkey_enabled` | Bật phím tắt |
| `settings_chat_hotkey_label` / `_desc` | Phím tắt / Nhấp vào ô rồi bấm tổ hợp phím bạn muốn |
| `settings_chat_hotkey_recording` | Bấm phím… (Esc để hủy) |
| `settings_chat_hotkey_none` | Chưa cài |
| `settings_chat_hotkey_status_conflict` | Phím tắt đang được sử dụng. Chọn tổ hợp khác hoặc đổi phím ở ứng dụng kia. … |
| `launcher_hotkey_failed` | Không đăng ký được phím tắt. Hãy chọn tổ hợp khác. |
| `settings_chat_hotkey_system_conflict_title` | {owner} đang giữ {hotkey} |
| `settings_chat_hotkey_system_conflict_desc` | macOS xử lý phím tắt này trước, nên Launcher sẽ không mở được bằng nó. … |
| `settings_chat_hotkey_spotlight_disable` | Tắt phím tắt Spotlight |
| `settings_chat_hotkey_system_conflict_open` | Mở Cài đặt hệ thống |
| `settings_chat_hotkey_system_conflict_use` | Dùng {hotkey} thay thế |
| `settings_chat_hotkey_spotlight_disabled_title` / `_desc` | Phím tắt Spotlight của macOS / Viezan đã tắt Command+Space của Spotlight. … |
| `settings_chat_hotkey_spotlight_restore` | Khôi phục phím tắt Spotlight |
| `settings_chat_hotkey_owner_finder_search` | Tìm kiếm Finder |
| `launcher_hotkey_system_conflict_toast` / `_action` | {owner} đang giữ phím tắt Launcher {hotkey}, nên Viezan không mở được bằng phím này. / Xem cách khắc phục |
| `launcher_spotlight_prompt_title` | Dùng Command+Space cho Viezan Launcher? |
| `launcher_spotlight_prompt_replace` / `_keep` | Dùng Command+Space cho Viezan / Giữ Spotlight, dùng Option+Space |
| `launcher_spotlight_replaced` / `_relogin` / `_kept` / `_replace_failed` | Đã tắt phím tắt Spotlight. … / …đăng xuất rồi đăng nhập lại. / Viezan Launcher mở bằng Option+Space. / Không thể tắt phím tắt Spotlight. … |
| `shortcuts_all_title` / `_description` | Tất cả phím tắt / Một danh sách để thấy mọi phím và tránh trùng. |
| `shortcut_quick_translate`, `shortcut_command_palette`, `shortcut_new_chat`, `shortcut_send_message` | Dịch nhanh vùng chọn, Bảng lệnh, Chat mới, Gửi tin nhắn |
| `shortcut_scope_global` / `_window` / `_composer` | Toàn hệ thống / Trong cửa sổ / Trong ô soạn chat |
| `shortcut_conflict` / `shortcut_unset` / `shortcut_off` | Trùng phím / Chưa đặt / đang tắt |

## 10. Chênh lệch với bản dựng hiện tại

1. **"Kết quả hiển thị"** (board Utilities: công tắc Ứng dụng, Tệp và thư mục, Máy tính/đổi tiền, Lệnh Viezan, Hỏi AI/Dịch/Tra từ, Tìm trên web) — **đề xuất**; Launcher luôn hiện mọi nhóm.
2. **"Tiền tệ mặc định"** trên trang này — **đề xuất**. Mã chỉ cho đổi tiền đích ngay trong Launcher (bộ chọn trên hàng tiền tệ; main ghi nhớ qua `setCurrencyTarget`).
3. **"Bấm vào phím để đổi"** trong danh sách — mã là danh sách **chỉ đọc**, không có link tới nơi đổi. Đề xuất: mỗi hàng có link "Đổi" dẫn tới thẻ tương ứng (Dịch mọi nơi, Cài đặt › Chat).
4. **Dòng "Đang thay cho Spotlight. Trả lại Spotlight" nằm trong hàng Phím tắt** (board) — mã dùng `CapabilityNotice` riêng L6. Giữ cách của mã.
5. Board LauncherStates vẽ thông báo trùng "Không đăng ký được ⌥ Space — Launcher vẫn mở được từ thanh menu" với "Đổi phím" — mã chỉ có toast lỗi; câu "mở được từ thanh menu" chỉ đúng với khay Windows/Linux (board SmallSurfaces), chưa kiểm chứng cho macOS. Đề xuất giữ toast + focus vào ô ghi phím.
6. Câu ghi chú của hộp thoại Spotlight (`launcher_spotlight_prompt_note`) nói "bật lại … trong Cài đặt > Phím tắt", nhưng nút khôi phục nằm ở trang **Launcher & phím tắt**. Cần sửa chữ.
7. Nhãn ARIA của công tắc là "Bật phím tắt" cho cả Launcher và Dịch nhanh — không phân biệt khi đọc màn hình ở hai trang khác nhau; đề xuất "Bật Launcher".
8. Thông báo "Module Launcher đang tắt" đặt **sau** hàng Phím tắt, trong khi thẻ Dịch nhanh đặt thông báo module **trước** hàng Phím tắt. Nên thống nhất (đề xuất: ngay dưới header).
9. Nút ✕ `sm` cạnh ô ghi phím `md` — lệch kích thước như ở Dịch mọi nơi.
10. Không có skeleton khi đọc cài đặt; ô ghi phím chớp "Chưa cài" rồi mới hiện phím thật.
11. `useShortcutInventory` ẩn hàng Launcher khi module Launcher tắt, nhưng **không** ẩn hay làm mờ hàng Dịch nhanh khi module Dịch tắt; nếu công tắc Dịch nhanh vẫn bật, hàng đó vẫn tính là "đang bật" và có thể bị gắn "Trùng phím" dù phím không chạy (xem báo cáo lỗi).
12. Hộp thoại Spotlight dùng lại lớp `update-notification` của popup cập nhật — hợp lệ về hình nhưng tên lớp gây hiểu nhầm.
