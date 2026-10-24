# Kế hoạch triển khai thiết kế "Bàn làm việc yên lặng"

Thiết kế tham chiếu: canvas "Viezan — thiết kế lại UI/UX" (32 bảng),
https://claude.ai/artifact/NmgeWnJaCTqnrdDTo34sE3. Tài liệu này chia việc đưa
thiết kế đó vào mã nguồn thành các giai đoạn, mỗi giai đoạn là một hoặc vài PR
tự đứng được, không làm hỏng ứng dụng ở giữa chừng.

## 1. Mục tiêu và nguyên tắc triển khai

- Đổi kiến trúc thông tin từ "app dịch" sang "trợ lý desktop": thanh bên nhóm
  theo không gian (AI, Ngôn ngữ, Hệ thống, Tiện ích), có Trang chủ, Dịch mọi nơi,
  Launcher & phím tắt, Cài đặt dạng trang.
- Giữ nguyên những gì đang tốt: ba trục theme (sáng/tối, preset, accent),
  `tokens.css` là nguồn duy nhất cho giá trị thiết kế, Atomic Design, ranh giới
  `renderer → preload → main`, i18n EN/VI/JA.
- Mỗi giai đoạn kết thúc ở trạng thái phát hành được. Không dùng cờ tính năng
  dài hạn; nếu cần thì chỉ cờ tạm trong một giai đoạn và xoá ở cuối giai đoạn đó.
- Thứ tự: nền tảng trước (token, thành phần), rồi khung và điều hướng, rồi trang
  mới, rồi từng màn hình. Các màn hình ở giai đoạn 3 làm song song được.

## 2. Hiện trạng liên quan (đã kiểm tra trong mã)

| Chỗ | Hiện tại | Thiết kế mới |
| --- | --- | --- |
| Điều hướng | `PrimaryNavigationSidebar` liệt kê module theo `src/modules/catalog.ts`, bảng lệnh và Cài đặt ở đáy | Nhóm theo không gian, ô ⌘K ở đầu, dải "đang chạy nền" ở đáy |
| Trang | `activePage` (kiểu `PageModuleId`) trong `useAppStore`, `MODULE_PAGES` trong `src/modules/pages.ts` | Thêm `home`, `everywhere`, `utilities`, `settings` là trang |
| Cài đặt | `SettingsModal` bọc `SettingsPage`, `SettingsNavigation` cuộn theo mục | Trang đầy đủ có mục lục và tìm kiếm; Phím tắt và Trình duyệt chuyển ra ngoài |
| Đầu trang | `feature-command-bar` mỗi trang tự dựng | Một template đầu trang 56 px dùng chung |
| Bảng lệnh / Launcher | `CommandPalette` và `QuickLauncher` dựng danh sách lệnh riêng | Một danh mục lệnh dùng chung |
| Toast | `NotificationViewport` + `NotificationToast` | Góc dưới phải, tối đa 3, quy tắc tự tắt theo loại |
| Tiện ích Chrome | `chrome-extension/` (JS/CSS thuần) | Bong bóng dịch theo token mới |

## 3. Các giai đoạn

### Giai đoạn 0 — Nền tảng: token và thành phần dùng chung

Không đổi bố cục nào người dùng thấy; chỉ chuẩn bị vật liệu.

Khi bắt tay làm, kiểm kê cho thấy phần lớn nền tảng đã có trong mã, nên giai
đoạn 0 chỉ thêm phần còn thiếu thay vì tạo bản trùng:

- **Đã có, dùng lại**: `KeyCap` (phím tắt), `ButtonGroup` (segmented control),
  `NotificationToast` (bốn loại, nút hành động), `EmptyPanelState`,
  `RecoverableError`, `CapabilityNotice` (trạng thái trống, lỗi, quyền),
  `ThemePresetPicker`, `AccentPicker`.
- **Token**: không cần thêm. Màu trạng thái đã có bản sáng và tối, thang bo góc
  và bóng đủ dùng; bo 14 px trong mockup được thay bằng `radius-md`/`radius-lg`
  có sẵn theo quy tắc "dùng token gần nhất".
- **Thêm mới**: atom `StatusDot`, `Meter`, `ProgressBar`; molecule `StatusChip`,
  `ProgressSteps`.
- **Mở rộng**: `ButtonGroup` nhận `label` (thành `<fieldset>` có tên) và `size`.
- **Áp dụng thử** ở trang Nhiệt độ, nơi có bản tự dựng của chính các thành phần
  này: thanh RPM dùng `Meter`, tiến trình nhận diện dùng `ProgressBar`, chip
  helper dùng `StatusChip`; CSS riêng tương ứng trong `thermal.css` đã bỏ.
- Toast (vị trí, xếp chồng, thời gian tự tắt, đếm ngược hoàn tác) chuyển sang
  giai đoạn 1 cùng phần khung, vì đó là thay đổi hành vi người dùng thấy.
- Cỡ: S–M. Rủi ro thấp.

### Giai đoạn 1 — Khung ứng dụng và điều hướng

- `src/modules/catalog.ts`:
  - Thêm trường `space` (`'ai' | 'language' | 'system' | 'tools'`) cho mỗi module.
  - Thanh bên đọc catalog để nhóm, không hard-code.
- `PrimaryNavigationSidebar`:
  - Tiêu đề nhóm, nút ⌘K ở đầu.
  - Dải "đang chạy nền" ở đáy: AI local, quạt/profile, phím tắt toàn cục, tiện ích Chrome. Mỗi dòng dẫn tới chỗ chỉnh.
  - Giữ nguyên chính sách thanh bên trong AGENTS.md: cột 60/236 px trên desktop, lớp phủ ở bề rộng hẹp, không ghi đè lựa chọn thu gọn đã lưu.
- Hook `useBackgroundStatus`: gom trạng thái từ các store/hook sẵn có (AI local, `useFanControl`, cài đặt phím tắt, browser bridge). Không thêm IPC mới nếu dữ liệu đã có.
- Template `PageHeader` (templates): khe tiêu đề, trạng thái, một hành động chính, bánh răng. Chuyển các `feature-command-bar` hiện có sang template này.
- Toast: `NotificationViewport` về góc dưới phải, xếp tối đa 3, mới nhất ở dưới, không che ô soạn Chat, dừng khi hover/focus, lỗi không tự tắt.
- Kiểm tra: test thanh bên (nhóm, ẩn module bị tắt, lớp phủ hẹp), test toast, QA ở 1440/900/680 px và ở hai chế độ sáng/tối.
- Cỡ: M. Rủi ro vừa: mọi trang đều qua đây, cần chạy toàn bộ test và `test:web`.

Kết quả thực hiện giai đoạn 1:

- **Thanh bên**:
  - Nhóm theo `space` trong catalog; nhóm không còn trang nào bật thì ẩn.
  - Ô "Tìm hoặc chạy lệnh ⌘K" ở đầu.
  - Dải "đang chạy nền" có ba dòng: quạt và profile, phím tắt toàn cục, tiện ích Chrome. Mỗi dòng mở đúng chỗ chỉnh, nhờ `openSettingsAt` mới trong store. Khi thanh bên thu gọn, dải này còn một chấm có nhãn.
- **Dòng AI local hoãn lại**:
  - `discoverLocalAi` có thể khởi động Ollama do app quản lý (bản Windows có runtime riêng), nên không được gọi chỉ để vẽ một dòng trạng thái.
  - Cần một IPC chỉ đọc bộ đệm, không bao giờ khởi động runtime. Việc này làm ở giai đoạn 5, cùng phần AI local.
- **`PageHeader`**:
  - Áp dụng cho Nhiệt độ và Phiên dịch, hai trang duy nhất đang dùng thanh lệnh chung.
  - Chat, Dịch và Từ điển chuyển sang khi được làm lại ở giai đoạn 3.
  - Thêm token `--vzn-page-header-min-height` (56 px) và `--vzn-tracking-caps`. Token sau thay bốn chỗ đang viết literal `0.06em`.
- **Toast**:
  - Đặt ở góc dưới phải, hiện tối đa 3 toast mới nhất.
  - Toast có nút hành động tự tắt sau 8 giây.
  - Đếm giờ dừng khi rê chuột hoặc focus.
  - Khi đặt ở đáy sẽ đè ô soạn Chat thì chồng toast được nâng lên, dựa trên đo vị trí ô soạn thật: lúc chat trống ô soạn nằm giữa, có tin nhắn thì nằm ở đáy.
- **Tên profile quạt**: chuyển sang `src/utils/fanProfileText.ts` để trang Nhiệt độ và thanh bên dùng chung.

### Giai đoạn 2 — Kiến trúc thông tin: trang mới và Cài đặt dạng trang

Nên chia thành 3–4 PR theo thứ tự dưới.

1. **Mở rộng kiểu trang**:
   - Thêm `home`, `everywhere`, `utilities`, `settings` vào kiểu trang (`shared/modules.d.ts`, `src/types`, `MODULE_PAGES`).
   - Phân biệt "module bật tắt được" với "trang hệ thống luôn có" (Trang chủ, Cài đặt).
   - Di trú `activePage` đã lưu: giá trị cũ vẫn hợp lệ, trang mặc định mới là `home`.
   - Mở rộng whitelist IPC mở trang mà Launcher và quick chat đang dùng.
2. **Trang chủ**:
   - Bắt đầu nhanh, Tiếp tục (gom gần đây từ Chat, Dịch, Phiên dịch, Từ điển, gồm phiên nghiên cứu đang dừng), thẻ Hệ thống, AI local, Phím tắt.
   - Chỉ đọc từ store/hook có sẵn.
3. **Dịch mọi nơi và Launcher & phím tắt**:
   - Tách `HotkeySection` thành phần Dịch nhanh (sang Dịch mọi nơi) và phần Launcher (sang Launcher & phím tắt).
   - `BrowserIntegrationSection` chuyển sang Dịch mọi nơi.
   - Thêm danh sách "Tất cả phím tắt" có phát hiện trùng.
   - Module `browser-bridge` và `launcher` vẫn bật tắt như cũ.
4. **Cài đặt dạng trang**:
   - Bỏ `SettingsModal`, `SettingsPage` thành trang có mục lục: Chung, Giao diện, Mô hình AI, Giọng nói, Chat, Module, Cập nhật, Giới thiệu.
   - Thêm ô tìm kiếm.
   - Giao diện dùng thẻ preset có ảnh thu nhỏ, chấm màu nhấn, khung xem trước.
   - Giới thiệu theo định vị mới.
   - Mọi chỗ đang "mở Cài đặt" (huy hiệu thiếu khoá, bảng lệnh, Launcher) điều hướng tới trang và mục tương ứng.
- Kiểm tra: test điều hướng và di trú `activePage`, test Launcher/quick chat mở đúng trang, test Cài đặt theo mục, `test:web`.
- Cỡ: L. Rủi ro vừa: đổi chỗ của cài đặt người dùng quen; cần ghi chú phát hành.

### Giai đoạn 3 — Từng màn hình (song song được)

Mỗi gạch đầu dòng là một PR độc lập, cùng dùng nền tảng của giai đoạn 0–1.

- **AI Chat**:
  - Đầu trang có chip model và nút ẩn/hiện lịch sử.
  - Ô soạn giữ đúng bất biến "một bề mặt" trong AGENTS.md.
  - Popover tác vụ có Áp dụng; tiến trình nghiên cứu sâu dùng `ProgressSteps`, có Tiếp tục/Thử lại.
  - Đính kèm có cảnh báo model không đọc ảnh, kết quả tạo ảnh, lỗi nhà cung cấp hiện ngay trong cuộc trò chuyện.
- **Dịch**:
  - Đầu trang chỉ còn cặp ngôn ngữ và kiểu nhập.
  - So sánh model chuyển vào panel Kết quả; so sánh theo câu.
  - Chế độ ảnh (trống, đã nhận chữ) và giọng nói.
  - Popover tuỳ chọn, dialog chọn tối đa 3 model, lịch sử có tìm kiếm.
- **Phiên dịch**:
  - Chip trạng thái thu, nguồn âm thanh dạng segmented, mức âm, nút Phụ đề nổi, Dừng màu nguy hiểm.
  - Panel "Phiên này", tóm tắt sau phiên, danh sách các phiên trước, popover phụ đề.
- **Từ điển**:
  - Cột tra cứu có ngữ cảnh, Gần đây/Yêu thích.
  - Kết quả dạng trang đọc với nghĩa theo ngữ cảnh, ví dụ, sắc thái.
- **Nhiệt độ & quạt**:
  - Phần lớn đã làm ở PR #149 và #150.
  - Còn lại: profile và "Về tự động" vào toolbar panel Quạt; restyle các dialog theo bảng "Quạt".
- Kiểm tra mỗi PR:
  - test trang;
  - trạng thái trống, lỗi, đang tải, có dữ liệu;
  - QA ở bề rộng hẹp và dark mode;
  - giữ các bất biến Chat trong AGENTS.md.
- Cỡ: mỗi màn hình M; tổng L.

### Giai đoạn 4 — Bề mặt ngoài cửa sổ

- **Danh mục lệnh dùng chung**:
  - Tách định nghĩa lệnh (mở trang, Hỏi AI, Dịch, Tra từ, Tìm web, máy tính) thành một registry.
  - `CommandPalette` và `QuickLauncher` cùng đọc registry này.
  - Hai bề mặt vẫn có phần riêng: Launcher có ứng dụng/tệp, bảng lệnh có điều hướng nội bộ.
- **Launcher**:
  - trạng thái trống, câu trả lời AI có hỏi tiếp và nguồn;
  - lời mời thay Spotlight, cảnh báo trùng phím;
  - tiền tệ mặc định chỉnh trong trang Launcher & phím tắt.
- **Chỉ báo Dịch nhanh** (`electron/ipc/hotkeyIndicator.ts`): trạng thái xong (⌘Z), thiếu quyền, không dán được, không có chữ chọn. Dùng token qua HTML nội tuyến, không literal mới.
- **Phụ đề nổi** (`public/subtitle.html`): theo kiểu trong popover phụ đề.
- **Popup cập nhật**: ba trạng thái, menu "Nhắc sau", cảnh báo khi đang có phiên phiên dịch.
- **Khay và thanh menu**:
  - macOS: menu có dòng số đo đầu menu.
  - Windows/Linux: thêm mục Launcher.
- **Tiện ích Chrome** (`chrome-extension/`): bong bóng dịch theo thiết kế. Tiện ích không đọc được `tokens.css`, nên cần một bản token nhỏ sinh ra từ `tokens.css` lúc build, tránh literal tay.
- Kiểm tra:
  - test registry lệnh;
  - test `QuickLauncher` và `CommandPalette`;
  - QA máy thật bằng harness Playwright `_electron` cho Launcher, thanh menu, chỉ báo;
  - nạp thử tiện ích trong Chrome.
- Cỡ: L. Rủi ro vừa: Launcher và phím tắt toàn cục là đường nóng.

### Giai đoạn 5 — Onboarding và luồng nhà cung cấp

- **Màn hình chào mừng lần đầu**, 3 bước:
  - AI local hoặc khoá đám mây, kèm đánh giá máy;
  - phím tắt và quyền;
  - chọn module.
- Cờ "đã xem chào mừng" lưu ở main. Xem lại được từ Cài đặt › Giới thiệu.
- **AI local**: tiến trình cài theo `ProgressSteps`, bảng hiệu năng GPU so với kết hợp, chọn chế độ.
- **Dialog**:
  - khoá API có kiểm tra khoá và chi phí;
  - tạo token Chrome theo thời hạn, chỉ hiện một lần;
  - sửa preset lời nhắc hệ thống.
- Kiểm tra: test luồng lần đầu (bỏ qua, hoàn tất, xem lại), test dialog, QA với hồ sơ người dùng trống.
- Cỡ: M.

### Giai đoạn 6 — Hoàn thiện và khoá chất lượng

- **QA ma trận**:
  - 5 preset × sáng/tối × accent;
  - bề rộng 1440/900/680 px;
  - macOS, và Windows/Linux cho phần khay và tooltip.
- **Rà a11y**:
  - tên cho nút chỉ có biểu tượng;
  - `aria-pressed`/`aria-expanded`/`aria-current`;
  - vai trò `alert` cho toast lỗi;
  - tương phản 4.5:1;
  - điều hướng bàn phím trong popover và dialog.
- **Dọn mã**: xoá `ChatPageV2.tsx` (không được dùng), `Sidebar.tsx` cũ, `SettingsModal` và CSS mồ côi.
- **Cập nhật rule agent**: `viezanagent/rule/viezan-product-engineering/rules.json`
  vẫn mô tả Viezan là app dịch và từ chối "dashboard không liên quan trực tiếp
  tới dịch thuật". Cần cập nhật định vị sản phẩm (trợ lý desktop local-first
  gồm AI, ngôn ngữ, hệ thống, tiện ích) trước khi agent review các trang mới
  như Trang chủ hay Nhiệt độ.
- **Cập nhật tài liệu**:
  - `AGENTS.md`: kiến trúc thông tin theo không gian, template đầu trang, quy tắc toast và thông báo trong panel;
  - `src/components/README.md`: thành phần mới;
  - mock web-preview cho trang mới.
- Chạy đủ bộ kiểm tra phát hành: `npm test -- --run`, `npm run build`, `npm run test:web`, `check:atomic`, `check:design`.

## 4. Thứ tự, phụ thuộc và song song

```text
GĐ0 nền tảng ──► GĐ1 khung ──► GĐ2 IA (trang mới, Cài đặt) ──► GĐ6 hoàn thiện
                      │                 │
                      ├──► GĐ3 màn hình (5 PR song song) ─────────┤
                      └──► GĐ4 ngoài cửa sổ ──► GĐ5 onboarding ───┘
```

- GĐ3 và GĐ4 bắt đầu được ngay sau GĐ1; không cần chờ GĐ2.
- GĐ5 cần GĐ2 (trang Cài đặt, Dịch mọi nơi) và registry lệnh của GĐ4 nếu chào mừng gợi ý phím tắt.
- Hai PR không được sửa cùng một file cùng lúc; chia việc theo trang để tránh xung đột.

## 5. Quyết định cần chốt trước khi bắt đầu

| Quyết định | Đề xuất |
| --- | --- |
| Trang mặc định khi mở app | Trang chủ cho người mới; người cũ mở lại trang dùng gần nhất |
| Cài đặt: modal hay trang | Trang đầy đủ (theo thiết kế) |
| Phím tắt và Trình duyệt rời khỏi Cài đặt | Có; Cài đặt giữ đường dẫn tới hai trang mới để người quen tìm thấy |
| Trang chủ có tắt được không | Không, như Cài đặt |
| Hợp nhất danh mục lệnh ⌘K và Launcher | Có, ở GĐ4 |
| Font mockup Inter | Không đưa vào app; giữ font hệ thống như hiện tại |

## 6. Rủi ro

- **Di trú trạng thái đã lưu**: `activePage`, vị trí cài đặt, phím tắt. Cần test di trú và giữ giá trị cũ hợp lệ.
- **Người dùng quen chỗ cũ**: ghi chú phát hành, và một lối tắt tạm "Phím tắt đã chuyển sang…" trong Cài đặt một phiên bản.
- **Khối lượng CSS**: mỗi PR chỉ dùng token, không literal mới. `check:design` không quét `src/pages` và `.css` nên phải rà tay như AGENTS.md yêu cầu.
- **Bề mặt ngoài cửa sổ khó test tự động**: dựa vào harness Playwright `_electron` và QA máy thật cho mỗi PR ở GĐ4.
