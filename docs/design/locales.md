# Bố cục EN/JA: kết quả kiểm tra

Board: [`specs/locales.html`](specs/locales.html). Board vẽ các màn hình chính với chữ thật của VI, EN và JA đặt cạnh nhau: điều hướng + Trang chủ, AI Chat, thanh cặp ngôn ngữ và chân ô của Dịch, Cài đặt (Mô hình AI, Giọng nói), Dịch mọi nơi, bảng lệnh ⌘K + toast. Có thêm một khung JA chế độ tối và các khung 820 px cho EN và JA.

## Cách đo và giới hạn

- Mọi nhãn giao diện trong board được sinh từ `src/i18n/locales/{vi,en,ja}.ts`, theo đúng khoá mà component dùng (tên khoá có trong bảng dưới). Tiêu đề hội thoại và văn bản dịch là dữ liệu mẫu.
- Mock dựng lại CSS của component thật bằng token: ellipsis, `flex-wrap`, các token bề rộng như `--vzn-language-pair-half-max`, `--vzn-model-chip-model-max`, `--vzn-step-min`, `--vzn-settings-select-min`, `--vzn-dialog-md-max-inline`. Bề rộng (px) ghi dưới đây đo trong Chromium (Electron dùng cùng engine) trên macOS, với font hệ thống.
- **Chưa kiểm chứng trong app chạy thật.** Không có mục nào dưới đây được đo trong bản dựng Electron hay web preview (`localhost:5174`); con số lấy từ board. Mục nào cần xác nhận trong app được ghi *(cần xác nhận)*.
- Khung trong board có `lang="vi|en|ja"`. App thật cũng vậy: `index.html` khởi đầu `<html lang="en">`, rồi `App.tsx`, `QuickLauncher.tsx` và `UpdatePopupPage` đặt `document.documentElement.lang` theo `locale`.

## Font và chữ Nhật

- `--vzn-font-sans` của mọi persona chèn `var(--vzn-font-cjk)` (`"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP"`) sau các font Latin, trước `sans-serif`, nên chữ Hán lấy glyph Nhật thay vì glyph Trung bất kể ngôn ngữ hệ điều hành *(cần xác nhận trên máy thật)*.
- `codex.css` có khối `:lang(ja) { line-break: strict; word-break: auto-phrase }`; vì `<html lang>` theo `locale`, giao diện JA ngắt theo cụm từ thay vì từng ký tự (board từng cho thấy "ローカル・クラウドAIとチャット" để rơi một ký tự "ト").
- Nhãn nhóm viết hoa (`text-transform: uppercase` + `--vzn-tracking-caps`): chữ Nhật không có chữ hoa, nên `tokens.css` đặt `:root:lang(ja) { --vzn-tracking-caps: normal }` để "今日", "言語" không bị giãn chữ.
- Baseline trộn chữ: tên lệnh trong bảng lệnh và hàng Tiếp tục căn `baseline` giữa chữ JA và chữ Latin nhỏ hơn một cỡ; "AI翻訳", "Chrome拡張機能", phím `m-kbd` trong câu JA đặt hai font khác nhau trên cùng một dòng. Chênh lệch nhỏ, nhìn được ở cỡ 12–13 px.

## Chuỗi rủi ro theo khoá

Độ dài = số ký tự. Một ký tự JA rộng khoảng gấp đôi ký tự Latin, nên chuỗi JA ngắn hơn về số ký tự nhưng không ngắn bằng tỉ lệ đó về px. Cột px là bề rộng đo trong board.

| Khoá | VI | EN | JA | Bề rộng đo (VI / EN / JA) |
| --- | --- | --- | --- | --- |
| `nav_utilities` | Launcher & phím tắt (19) | Launcher & shortcuts (20) | ランチャー (5) | 131 / 139 / chưa đo lại (trước: **181** trên khoảng 180 px); tiêu đề trang dùng `utilities_title` với tên đầy đủ |
| `nav_everywhere` | Dịch mọi nơi (12) | Translate everywhere (20) | どこでも翻訳 (6) | 80 / 138 / 84 |
| `nav_search_or_run` | Tìm hoặc chạy lệnh (18) | Search or run a command (23) | 検索またはコマンドを実行 (12) | 163 / 163 / 161, vừa |
| `home_resume_description` | (42) | Recent chats, translations, interpreting and lookups (52) | (16) | 234 / 292 / 192 |
| `home_kind_live` | Phiên dịch (10) | Interpreting (12) | 通訳 (2) | thẻ 69 / 77 / 34 |
| `home_ai_missing_key` | Cần API key (11) | API key needed (14) | APIキーが必要 (8) | vừa |
| `chat_task_simple` (trong nút Tác vụ) | Dễ hiểu, có ví dụ (17) | Simple, with examples (21) | 初心者向け・具体例付き (11) | chưa đo lại (trước: nút 277 / **349** / 285) |
| `chat_task_simple` (dòng phụ lịch sử) | | | | 208 / **233 trên 208** / 208 |
| `translate_detected_language` + `lang_names.zh` | Đã nhận diện: Tiếng Trung (Giản thể) (36) | Detected: Chinese (Simplified) (30) | 判定結果: 中国語（簡体字） (14) | chữ **228 / 190 / 163** trên 125 / 144 / 148 (đo với câu đầy đủ; nút nay chỉ hiện tên ngôn ngữ, câu đầy đủ nằm trong `title`/`aria-label`) |
| `translate_manual_shortcut` | Enter để dịch (13) | Enter to translate (18) | Enterで翻訳 (7) | chưa đo lại (trước khi rút: 204 / 223 / 162) |
| `translate_long_text_label` | Có thể dịch lâu hơn (19) | May take longer (15) | 時間がかかる場合あり (10) | cả cụm bộ đếm 190 / 175 / 191 |
| `translate_char_count` | {count} ký tự | {count} chars | {count}文字 | |
| `settings_api_keys` | Mô hình AI (10) | AI models (9) | AIモデル (5) | vừa |
| `settings_key_saved` | Đã có khoá (10) | Key saved (9) | キー登録済み (6) | vừa |
| `settings_stt_provider_desc` | (33) | Used for Chat, Translate and Interpret. (39) | (14) | chưa đo lại; ba ngôn ngữ cùng nội dung |
| `settings_stt_needs_groq` | Cần Groq key (12) | Needs Groq key (14) | Groqキーが必要 (9) | vừa |
| `settings_tts_voice` | Giọng đọc (9) | Read-aloud voice (16) | 読み上げ音声 (6) | chưa đo lại |
| `everywhere_step_press` (`{key}`) | Nhấn ⌥ T | Press ⌥ T | ⌥ Tを押す | đúng trật tự; `KeyCap` đặt vào chỗ `{key}` |
| `everywhere_ext_step_load_desc` | (70) | (52) | (55) | VI, EN, JA đều 2–3 dòng trong ô 288 px |
| `settings_extension_download_btn` | Tải về từ GitHub (16) | Download from GitHub (20) | GitHubからダウンロード (14) | nút 145 / 187 / 193 |
| `command_palette_everywhere_description` | (39) | Quick Translate and the Chrome extension (40) | (22) | chưa đo lại (trước: 235 / **319 trên 307** / 243) |
| `image_model_switched_message` | Đang dùng {model} vì {previous} không đọc được ảnh. | Using {model} because {previous} can't read images. | {previous} は画像を読み取れないため、{model} を使用しています。 | một câu có chỗ trống |

## Rủi ro và đề xuất

Thứ tự theo mức ảnh hưởng. "Khung" là id khung trong board.

Mười rủi ro đo được trong board đã xử lý trong mã (2026-10-25). Các con số "trước" ở bảng trên là số đo cũ; cần đo lại trên app.

1. **Dịch mọi nơi, bước 2:** `everywhere_step_press` thành khoá có chỗ trống `{key}` (VI "Nhấn {key}", EN "Press {key}", JA "{key}を押す"); `HotkeySection` đặt `KeyCap` vào đúng chỗ.
2. **Điều hướng chính:** nhãn điều hướng JA rút còn "ランチャー"; tiêu đề trang Launcher & phím tắt dùng khoá riêng `utilities_title` với tên đầy đủ ở cả ba ngôn ngữ.
3. **Bảng lệnh:** EN `command_palette_everywhere_description` rút thành "Quick Translate and the Chrome extension".
4. **AI Chat, lịch sử:** nút chọn phiên có `title` (tiêu đề + dòng phụ); EN `chat_task_simple` rút thành "Simple, with examples".
5. **AI Chat, nút Tác vụ:** nhãn là khoá có chỗ trống `chat_task_trigger_label` (JA "タスク：{label}" với dấu "：" toàn độ rộng); `title` và `aria-label` mang toàn văn.
6. **Trang chủ, bắt đầu nhanh:** mô tả thẻ dùng `text-wrap: balance` (`.ui-quick-card__description`).
7. **Cài đặt, Giọng nói:** chế độ ElevenLabs gọi thống nhất là "Chất lượng cao" / "High Quality" / "高品質" (`settings_tts_elevenlabs_for_premium`).
8. **Khoảng trắng JA:** `ja.ts` viết liền chữ Latin với kana/kanji ở mọi chuỗi ("AIチャット", "Chrome拡張機能", "APIキー", "{name}のAPIキー"); "key" trong câu JA đổi thành "キー".
9. **Dịch mọi nơi, cài tiện ích:** đường dẫn menu Chrome ngắt dòng giữa các bước "→", không ngắt giữa một bước (`.ui-step-list__path-step`). Chuỗi menu Chrome bản VI/JA vẫn chưa đối chiếu với Chrome thật.
10. **Thời gian tương đối:** sau 7 ngày, ngày định dạng theo ngôn ngữ app (`formatDateForLocale`); VI `time_h_ago` thành "{n} giờ trước".

## Quy tắc viết chữ EN/JA cho Viezan

**Chung**

- Không ghép câu trong mã. Mỗi câu hoàn chỉnh là một khoá, phần thay đổi là chỗ trống `{name}`. Trật tự từ khác nhau giữa ba ngôn ngữ (mục 1).
- Ba ngôn ngữ phải nói cùng một điều. VI là bản gốc của bộ thiết kế; EN/JA dịch nghĩa VI, không viết thêm ý (mục 7).
- Một khái niệm, một tên, trên mọi màn hình và trong mọi ngôn ngữ (chế độ đọc to, mục Mô hình AI).
- Nhãn trong điều khiển một dòng (nút, chip, tab, hàng điều hướng) phải vừa với bề rộng ở cửa sổ 820 px. Thứ bị cắt phải có `title` hoặc `aria-label` chứa toàn văn.
- Chỉ đặt bề rộng tối đa cho điều khiển khi nó có ellipsis và `title`; không dùng bề rộng cố định cho nút có chữ.

**EN**

- Sentence case cho nhãn và tiêu đề ("Quick start", không "Quick Start"); hiện còn lẫn "New Chat"/"New chat", "TTS Mode", "Generate API Key".
- Nhãn điều hướng tối đa khoảng 20 ký tự, nhãn nút tối đa khoảng 18 ký tự, mô tả lệnh trong bảng lệnh tối đa khoảng 45 ký tự, dòng phụ trong lịch sử tối đa khoảng 28 ký tự.
- Bỏ chữ thừa khi icon hoặc ngữ cảnh đã nói thay ("Detected:" khi đã có tag Auto). Nút Tác vụ giữ tiền tố "Task:" vì nhãn tác vụ đứng một mình ("Chat", "Image") không cho biết đây là nút chọn tác vụ.

**JA**

- Nhãn điều hướng tối đa 10 ký tự toàn độ rộng; nhãn nút tối đa 8; trạng thái tối đa 6.
- Dùng dấu câu toàn độ rộng trong câu Nhật: "：", "（）", "。". Không để ". " hay ": " ASCII sau chữ Nhật.
- Không chèn khoảng trắng giữa chữ Latin và kana/kanji, trừ tên riêng có sẵn khoảng trắng (thống nhất mục 8). Không viết lẫn từ tiếng Anh thường ("key") vào câu JA; dùng katakana ("キー").
- Số và đơn vị viết liền: "62文字", "5分前".
- Động từ đứng cuối: phím tắt, tên model, tên nhà cung cấp là tân ngữ đứng trước ("{key}を押す", "{model}を使用中").
- Chuỗi JA ngắn hơn về số ký tự nhưng mỗi ký tự rộng gấp đôi chữ Latin: kiểm tra theo bề rộng px, không theo số ký tự.

**Việc cần ở tầng app (để chữ JA hiển thị đúng)**

- Đã làm: `document.documentElement.lang` theo `locale` (`App.tsx`, `QuickLauncher.tsx`, `UpdatePopupPage`); `lang` theo ngôn ngữ nguồn/đích trên ô nguồn và vùng kết quả của Dịch; `--vzn-font-cjk` trong `--vzn-font-sans`; khối `:lang(ja)` với `line-break: strict` và `word-break: auto-phrase` (`codex.css`).
- Đã làm thêm: bỏ giãn chữ `--vzn-tracking-caps` khi locale là JA; ngày sau 7 ngày định dạng theo ngôn ngữ app (`formatDateForLocale`).
