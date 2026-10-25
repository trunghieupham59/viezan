# Thiết kế Viezan

Bộ thiết kế đầy đủ của Viezan: nguyên tắc chung, bản vẽ gốc, và đặc tả chi tiết cho từng màn hình (hành động, trạng thái, responsive, trợ năng).

## Cách đọc

| Lớp | Thư mục | Nội dung |
| --- | --- | --- |
| Nền tảng | [`foundations.md`](foundations.md) | Tinh thần thiết kế, ba trục chủ đề, bề mặt, chữ, khoảng cách, hợp đồng Button, khung cửa sổ, responsive, lớp chồng, trợ năng, trạng thái chung |
| Bản vẽ gốc | [`boards/`](boards) | 31 artboard của đợt thiết kế lại ("quiet workbench"), mỗi file một màn hình hoặc nhóm bề mặt |
| Đặc tả màn hình | [`screens/`](screens) | Mỗi màn hình một file Markdown theo [`screens/_template.md`](screens/_template.md) |
| Board trạng thái | [`specs/`](specs) | Mỗi màn hình một trang HTML vẽ từng trạng thái và tương tác, có chú thích đánh số |
| Việc cần làm | [`findings.md`](findings.md) | Lỗi hành vi, trợ năng và nợ quy ước phát hiện khi đối chiếu đặc tả với mã |

Quy tắc rút ra cho agent AI (chữ, bản địa hoá, bố cục, focus, phím tắt, hành vi) nằm ở [`.claude/rules/ui-ux.md`](../../.claude/rules/ui-ux.md); khi chốt một quyết định mới, cập nhật cả file đó.

Thứ tự ưu tiên khi các nguồn mâu thuẫn: `src/styles/tokens.css` (giá trị) → `AGENTS.md` (luật) → `foundations.md` → đặc tả màn hình → bản vẽ.

## Mở bản vẽ

Board dùng chính `src/styles/tokens.css` của app, nên phải mở qua một máy chủ tĩnh tại gốc repo (mở bằng `file://` thì không tải được token):

```bash
python3 -m http.server 5191 --bind 127.0.0.1
```

Sau đó mở <http://127.0.0.1:5191/docs/design/> để xem trang chỉ mục.

- Bản vẽ gốc: `boards/*.dc.html`, chạy bằng `boards/support.js` đi kèm (React dựng sẵn, không cần mạng).
- Board trạng thái: `specs/*.html`, chỉ dùng HTML/CSS và token của app.

## Danh sách màn hình

| Màn hình | Đặc tả | Board trạng thái | Bản vẽ gốc |
| --- | --- | --- | --- |
| Khung ứng dụng, điều hướng, bảng lệnh, toast, cập nhật | [shell.md](screens/shell.md) | [shell.html](specs/shell.html) | Main, Sidebar, Narrow, CommandPalette, Toasts, UpdatePopup, Welcome, WelcomeSteps, SmallSurfaces |
| Trang chủ | [home.md](screens/home.md) | [home.html](specs/home.html) | Home, HomeDark |
| AI Chat | [chat.md](screens/chat.md) | [chat.html](specs/chat.html) | Chat, ChatExtras, Popovers, Histories |
| Dịch | [translate.md](screens/translate.md) | [translate.html](specs/translate.html) | Translate, TranslateModes |
| Phiên dịch | [interpret.md](screens/interpret.md) | [interpret.html](specs/interpret.html) | Interpret, Histories |
| Từ điển | [dictionary.md](screens/dictionary.md) | [dictionary.html](specs/dictionary.html) | Dictionary |
| Dịch mọi nơi | [everywhere.md](screens/everywhere.md) | [everywhere.html](specs/everywhere.html) | Everywhere, Providers |
| Launcher & phím tắt | [utilities.md](screens/utilities.md) | [utilities.html](specs/utilities.html) | Utilities |
| Cửa sổ Launcher | [launcher.md](screens/launcher.md) | [launcher.html](specs/launcher.html) | Launcher, LauncherStates |
| Quick Chat (Hỏi AI trong cửa sổ nổi) | [quick-chat.md](screens/quick-chat.md) | [quick-chat.html](specs/quick-chat.html) | Launcher, LauncherStates |
| Nhiệt độ & quạt | [thermal.md](screens/thermal.md) | [thermal.html](specs/thermal.html) | Thermal, ThermalExtras |
| Cài đặt (8 mục) | [settings.md](screens/settings.md) | [settings.html](specs/settings.html) | Settings, SettingsSections, SettingsAppearance, SettingsAbout, Providers |
| Bố cục EN/JA | [locales.md](locales.md) | [locales.html](specs/locales.html) | — (vẽ lại các màn hình chính bằng chữ thật VI/EN/JA) |
| Biến thể persona (Graphite, Glass, Paper, Corporate, Midnight × sáng/tối; màu nhấn) | [personas.md](personas.md) | [personas.html](specs/personas.html) | SettingsAppearance |

Các bản vẽ dùng chung cho mọi màn hình: `States` (trống, lỗi, đang tải), `Popovers` (popover cấu hình), `Narrow` (cửa sổ 820 px), `HomeDark` (chế độ tối).

## Cập nhật bộ thiết kế

- Đổi một giá trị hình ảnh: sửa `src/styles/tokens.css`. Board tự cập nhật theo.
- Thêm hoặc đổi hành vi một màn hình: sửa đặc tả trong `screens/` cùng commit với mã, và vẽ trạng thái mới trong `specs/`.
- Mục "Chênh lệch với bản dựng hiện tại" ở cuối mỗi đặc tả là danh sách việc còn lại; xoá dòng khi mã đã khớp.
- Không đưa vào bản vẽ tính năng mà app chưa có, trừ khi ghi rõ "đề xuất".
