# Bố cục EN/JA: kết quả kiểm tra

Board: [`specs/locales.html`](specs/locales.html). Board vẽ các màn hình chính với chữ thật của VI, EN và JA đặt cạnh nhau: điều hướng + Trang chủ, AI Chat, thanh cặp ngôn ngữ và chân ô của Dịch, Cài đặt (Mô hình AI, Giọng nói), Dịch mọi nơi, bảng lệnh ⌘K + toast. Có thêm một khung JA chế độ tối và các khung 820 px cho EN và JA.

## Cách đo và giới hạn

- Mọi nhãn giao diện trong board được sinh từ `src/i18n/locales/{vi,en,ja}.ts`, theo đúng khoá mà component dùng (tên khoá có trong bảng dưới). Tiêu đề hội thoại và văn bản dịch là dữ liệu mẫu.
- Mock dựng lại CSS của component thật bằng token: ellipsis, `flex-wrap`, các token bề rộng như `--vzn-language-pair-half-max`, `--vzn-model-chip-model-max`, `--vzn-step-min`, `--vzn-settings-select-min`, `--vzn-dialog-md-max-inline`. Bề rộng (px) ghi dưới đây đo trong Chromium (Electron dùng cùng engine) trên macOS, với font hệ thống.
- **Chưa kiểm chứng trong app chạy thật.** Không có mục nào dưới đây được đo trong bản dựng Electron hay web preview (`localhost:5174`); con số lấy từ board. Mục nào cần xác nhận trong app được ghi *(cần xác nhận)*.
- Khung trong board có `lang="vi|en|ja"`. App thật thì không: `index.html` cố định `<html lang="en">` và không đổi theo `locale` (chỉ `UpdatePopupPage` đặt `document.documentElement.lang`). Vì vậy chữ JA trong board có thể hiển thị tốt hơn trong app (xem mục Font).

## Font và chữ Nhật

- `--vzn-font-sans` = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, emoji`. **Không có font tiếng Nhật nào được khai báo**, và cũng không có rule `:lang(ja)` nào trong `src/styles`. Chữ JA rơi về font dự phòng của hệ điều hành: macOS thường là Hiragino Sans; Windows là Yu Gothic UI hoặc Meiryo, tuỳ máy.
- Vì `lang` luôn là `en`, Chromium chọn font dự phòng cho chữ Hán theo ngôn ngữ hệ thống chứ không theo ngôn ngữ app. Trên máy đặt tiếng Việt hoặc tiếng Anh, chữ Hán có thể lấy glyph tiếng Trung (PingFang SC, Microsoft YaHei) thay vì glyph Nhật *(cần xác nhận)*.
- `word-break: auto-phrase` (ngắt theo cụm từ JA) và `line-break: strict` chỉ có tác dụng khi phần tử có `lang="ja"`. App hiện ngắt CJK theo từng ký tự: board cho thấy JA "ローカル・クラウドAIとチャット" để rơi một ký tự "ト" xuống dòng hai.
- Nhãn nhóm viết hoa (`text-transform: uppercase` + `--vzn-tracking-caps`) áp lên chữ Hán ("今日", "言語") chỉ còn tác dụng giãn khoảng cách chữ.
- Baseline trộn chữ: tên lệnh trong bảng lệnh và hàng Tiếp tục căn `baseline` giữa chữ JA và chữ Latin nhỏ hơn một cỡ; "AI翻訳", "Chrome 拡張機能", phím `m-kbd` trong câu JA đặt hai font khác nhau trên cùng một dòng. Chênh lệch nhỏ, nhìn được ở cỡ 12–13 px.

## Chuỗi rủi ro theo khoá

Độ dài = số ký tự. Một ký tự JA rộng khoảng gấp đôi ký tự Latin, nên chuỗi JA ngắn hơn về số ký tự nhưng không ngắn bằng tỉ lệ đó về px. Cột px là bề rộng đo trong board.

| Khoá | VI | EN | JA | Bề rộng đo (VI / EN / JA) |
| --- | --- | --- | --- | --- |
| `nav_utilities` | Launcher & phím tắt (19) | Launcher & shortcuts (20) | ランチャーとショートカット (13) | 131 / 139 / **181** trên khoảng 180 px |
| `nav_everywhere` | Dịch mọi nơi (12) | Translate everywhere (20) | どこでも翻訳 (6) | 80 / 138 / 84 |
| `nav_search_or_run` | Tìm hoặc chạy lệnh (18) | Search or run a command (23) | 検索またはコマンドを実行 (12) | 163 / 163 / 161, vừa |
| `home_resume_description` | (42) | Recent chats, translations, interpreting and lookups (52) | (16) | 234 / 292 / 192 |
| `home_kind_live` | Phiên dịch (10) | Interpreting (12) | 通訳 (2) | thẻ 69 / 77 / 34 |
| `home_ai_missing_key` | Cần API key (11) | API key needed (14) | API キーが必要 (9) | vừa |
| `chat_task_simple` (trong nút Tác vụ) | Dễ hiểu, có ví dụ (17) | Beginner-friendly with examples (31) | 初心者向け・具体例付き (11) | nút 277 / **349** / 285 |
| `chat_task_simple` (dòng phụ lịch sử) | | | | 208 / **233 trên 208** / 208 |
| `translate_detected_language` + `lang_names.zh` | Đã nhận diện: Tiếng Trung (Giản thể) (36) | Detected: Chinese (Simplified) (30) | 判定結果: 中国語（簡体字） (14) | chữ **228 / 190 / 163** trên 125 / 144 / 148 |
| `translate_manual_shortcut` | Enter để dịch · Shift+Enter xuống dòng (38) | Enter to translate · Shift+Enter for new line (45) | Enterで翻訳 · Shift+Enterで改行 (25) | 204 / **223** / 162 |
| `translate_long_text_label` | Có thể dịch lâu hơn (19) | May take longer (15) | 時間がかかる場合あり (10) | cả cụm bộ đếm 190 / 175 / 191 |
| `translate_chars` | ký tự (5) | chars (5) | 文字 (2) | |
| `settings_api_keys` | Mô hình AI (10) | AI Providers (12) | AIプロバイダー (8) | vừa, lệch nghĩa |
| `settings_key_saved` | Đã có khoá (10) | Verified (8) | 確認済み (4) | vừa, lệch nghĩa |
| `settings_stt_provider_desc` | (33) | Used for voice input and live meeting transcription. Supports 99 languages with high accuracy. (94) | (37) | VI 1 dòng; EN, JA 2 dòng |
| `settings_stt_needs_groq` | Cần Groq key (12) | Needs Groq key (14) | Groq keyが必要 (11) | vừa |
| `settings_tts_voice` | Giọng đọc (9) | Voice (5) | 音声 (2) | trùng tên mục |
| `everywhere_step_press` + phím | Nhấn ⌥ T | Press ⌥ T | 押す ⌥ T | sai trật tự từ JA |
| `everywhere_ext_step_load_desc` | (70) | (52) | (55) | VI, EN, JA đều 2–3 dòng trong ô 288 px |
| `settings_extension_download_btn` | Tải về từ GitHub (16) | Download from GitHub (20) | GitHubからダウンロード (14) | nút 145 / 187 / 193 |
| `command_palette_everywhere_description` | (39) | Quick Translate for selections and the Chrome extension (55) | (24) | 235 / **319 trên 307** / 243 |
| `image_model_switched_using` + `image_model_switched_body` | Đang dùng {model} … không hỗ trợ nhận ảnh làm đầu vào. | Using {model} … doesn't support image input. | {model} を使用中. 画像入力をサポートしていません。 | ghép câu sai ở cả ba |

## Rủi ro và đề xuất

Thứ tự theo mức ảnh hưởng. "Khung" là id khung trong board.

| # | Màn hình | Khoá / vị trí | Rủi ro | Đề xuất |
| --- | --- | --- | --- | --- |
| 1 | Dịch, header | `translate_detected_language` trong `LanguagePairBar` | Nửa nguồn tối đa 216 px chứa cả chữ lẫn tag "Tự động". Với ngôn ngữ có tên dài, chữ bị cắt ở **cả ba** ngôn ngữ; VI tệ nhất. Đã có `title`. | Khi tag "Tự động" đang hiện, chỉ hiển thị tên ngôn ngữ (bỏ tiền tố "Đã nhận diện:"/"Detected:"/"判定結果:") và giữ câu đầy đủ trong `title`/`aria-label`. Không viết tắt `lang_names`; phần tên ngôn ngữ còn dài thì để ellipsis. |
| 2 | Dịch, chân ô nguồn | `translate_manual_shortcut`, `translate_long_text_label`, tóm tắt phong cách, nút Dịch | Ở cửa sổ 1200 px (lịch sử đóng), ô nguồn rộng 442 px nhưng phần nộp cần 651 / 624 / 593 px, nên chân ô xuống **ba hàng** (121 px) và lấy chỗ của vùng nhập. Xảy ra ở cả ba ngôn ngữ; gợi ý phím EN dài nhất. Gợi ý phím chỉ ẩn khi vùng chứa dưới 760 px. | Ẩn gợi ý phím khi vùng chứa nguồn dưới khoảng 680 px (không phải 760), hoặc chuyển nó vào `title` của nút Dịch. Rút EN còn "Enter to translate", JA "Enterで翻訳"; dòng Shift+Enter đã là hành vi mặc định của ô nhập. Tóm tắt phong cách có thể chỉ hiện khi khác "Chung". |
| 3 | Dịch, header ở 820 px | Cụm cặp ngôn ngữ + kiểu nhập | EN cần 548 px nên hai nút lịch sử/cấu hình xuống hàng thứ hai (header 91 px); JA, VI vẫn một hàng. Đặc tả Dịch ghi "header vẫn một dòng ở 760 px": chỉ đúng với VI/JA. | Cho `.translate-header-leading` co trước (nửa nguồn co về khoảng `--vzn-picker-min-inline`) rồi mới xuống dòng; hoặc cập nhật đặc tả để thừa nhận hai hàng ở EN. *(cần xác nhận trong app)* |
| 4 | Thông báo (Dịch, ảnh) | `TranslatePage`: `${image_model_switched_using}${provider}. ${image_model_switched_body}` | Câu ghép bằng mã: "Using Gemini 2.5 Flash (gemini). doesn't support image input." Câu thứ hai thiếu chủ ngữ (model cũ) ở cả ba ngôn ngữ; JA có ". " ASCII giữa câu Nhật. | Một khoá duy nhất có chỗ trống, ví dụ `image_model_switched_message: "{previous} doesn't support image input, so Viezan is using {model}."`, JA "{previous} は画像入力に対応していないため、{model} を使用しています。". Không ghép câu ngoài file ngôn ngữ. |
| 5 | Dịch mọi nơi, bước 2 | `everywhere_step_press` + `KeyCap` trong `HotkeySection` | Tiêu đề ghép `{press} {phím}`: JA ra "押す ⌥ T", sai trật tự (tiếng Nhật đặt động từ sau tân ngữ). | Đổi thành khoá có chỗ trống: VI "Nhấn {key}", EN "Press {key}", JA "{key} を押す", và render `KeyCap` vào chỗ `{key}`. |
| 6 | Cài đặt, Mô hình AI | `settings_key_saved` | VI "Đã có khoá", EN "Verified", JA "確認済み". Khoá Groq và ElevenLabs chỉ lưu, không xác minh, nhưng EN/JA vẫn báo "đã xác minh". | EN "Key saved", JA "キー登録済み". Giữ "Verified" cho một khoá riêng chỉ dùng sau khi xác minh thành công. |
| 7 | Điều hướng chính | `nav_utilities` (JA) | "ランチャーとショートカット" rộng khoảng 181 px trên khoảng 180 px của cột chữ trong mock; app thật dùng đệm 10 px và khoảng cách icon 10 px nên nhiều khả năng đã bị cắt. Nhãn có `title`. *(cần xác nhận)* | Cần một khoá nhãn điều hướng ngắn riêng, ví dụ JA "ランチャー" (tiêu đề trang vẫn dùng tên đầy đủ). Nhãn điều hướng JA tối đa 10 ký tự toàn độ rộng. |
| 8 | Bảng lệnh | `command_palette_everywhere_description` (EN) | Tên lệnh không co (`flex: 0 0 auto`), nên tên dài "Translate everywhere" đẩy mô tả bị cắt (319 / 307 px). | Rút EN: "Quick Translate and the Chrome extension" (khoảng 40 ký tự). Mô tả lệnh EN tối đa khoảng 45 ký tự. |
| 9 | AI Chat, lịch sử | Tiêu đề phiên; dòng phụ `{task} · {option}` | EN cắt dòng phụ "Explain · Beginner-friendly with ex…" và tiêu đề dài. Hàng không có `title`: phần bị cắt chỉ nằm trong `aria-label`. | Thêm `title` cho nút chọn phiên (tiêu đề + dòng phụ). Rút EN `chat_task_simple` còn "Simple, with examples". |
| 10 | AI Chat, ô soạn | Nút Tác vụ `chat_task_configuration: {task} · {option}` | EN rộng 349 px (VI 277, JA 285). Vừa ở 1200 và 820 px; dưới 480 px vùng chứa thanh công cụ xếp dọc nên vẫn an toàn. `title` thiếu tiền tố. JA dùng dấu ":" ASCII sau "タスク". | Giữ ellipsis + `title` đầy đủ. Với JA dùng "：" toàn độ rộng hoặc bỏ tiền tố, vì icon đã cho biết đây là nút Tác vụ. |
| 11 | Trang chủ, bắt đầu nhanh | `command_palette_*_description` | Mô tả xuống hai dòng ở cả ba ngôn ngữ, thẻ cao không đều. JA ngắt từng ký tự, để rơi "ト" một mình. | Đặt `lang` đúng locale lên `<html>` (xem Quy tắc), rồi mới dùng `word-break: auto-phrase` cho JA. Có thể đặt `text-wrap: balance` cho mô tả ngắn hai dòng. |
| 12 | Cài đặt, Giọng nói | `settings_stt_provider_desc`, `settings_tts_voice`, `settings_tts_elevenlabs_for_premium` | EN/JA mô tả STT dài gấp đôi VI và nói khác nội dung. "Voice"/"音声" vừa là tên mục vừa là tên hàng. "High Quality" (nút) và "Premium mode" (hàng ElevenLabs) là cùng một chế độ. | Đồng bộ nội dung ba ngôn ngữ theo VI (ngắn). EN hàng giọng đọc "Read-aloud voice", JA "読み上げの声". Gọi chế độ thống nhất: EN "High Quality", JA "高品質", VI "Chất lượng cao". |
| 13 | Cài đặt, tên mục | `settings_api_keys` (+ `home_ai_title`, `home_ai_manage`) | VI "Mô hình AI", EN "AI Providers", JA "AIプロバイダー"; Trang chủ EN nói "AI models" / "Manage models" rồi dẫn tới "AI Providers". | Chọn một tên cho cả ba ngôn ngữ: EN "AI models", JA "AIモデル" (khớp thẻ Trang chủ). |
| 14 | Dịch, chân ô | `{số} {translate_chars}`; ô kết quả | JA "62 文字" có khoảng trắng; tiếng Nhật viết liền. Ô kết quả không đặt `lang={targetLang}`, nên chữ Nhật trong app EN/VI chịu cùng vấn đề font như mục Font. | Dùng một khoá có chỗ trống: `translate_char_count: "{n} chars"` / `"{n}文字"` / `"{n} ký tự"`. Đặt `lang` theo ngôn ngữ nguồn/đích lên vùng văn bản. |
| 15 | Mọi màn hình | Khoảng trắng giữa chữ Latin và JA | Trong `ja.ts` lẫn lộn "AI チャット" / "AI翻訳" / "AIプロバイダー", "API キー" / "APIキー", "Chrome 拡張機能" / "GitHubから". JA cũng trộn từ tiếng Anh: "Groq keyが必要". | Chọn một quy ước (đề xuất: không chèn khoảng trắng, "AIチャット", "APIキー"), và dùng "キー" thay cho "key". |
| 16 | Dịch mọi nơi, bước cài tiện ích | `everywhere_ext_step_load_desc` | Đường dẫn menu Chrome JA dài 55 ký tự, xuống ba dòng trong ô 288 px và ngắt giữa cụm. Nút "Download from GitHub" 187 px sẽ chật khi ô về 180 px (`--vzn-step-min`). | Đặt đường dẫn trong `<code>` có `overflow-wrap: anywhere` tại dấu "→", hoặc tách thành danh sách ba bước nhỏ. Kiểm tra lại các chuỗi này khớp với menu Chrome bản VI/JA *(chưa kiểm chứng)*. |
| 17 | Thời gian tương đối | `formatTimeAgo`, `formatSessionTime` | Sau 7 ngày, ngày được định dạng bằng `toLocaleDateString()` không truyền locale, nên theo ngôn ngữ hệ điều hành chứ không theo app. VI `time_h_ago` "{n}h trước" khác kiểu với "{n} phút trước". | Truyền `NUMBER_FORMAT_TAGS[locale]` (như `formatNumberForLocale`). VI "{n} giờ trước". |

## Quy tắc viết chữ EN/JA cho Viezan

**Chung**

- Không ghép câu trong mã. Mỗi câu hoàn chỉnh là một khoá, phần thay đổi là chỗ trống `{name}`. Trật tự từ khác nhau giữa ba ngôn ngữ (mục 4, 5, 14).
- Ba ngôn ngữ phải nói cùng một điều. VI là bản gốc của bộ thiết kế; EN/JA dịch nghĩa VI, không viết thêm ý (mục 6, 12, 13).
- Một khái niệm, một tên, trên mọi màn hình và trong mọi ngôn ngữ (chế độ đọc to, mục Mô hình AI).
- Nhãn trong điều khiển một dòng (nút, chip, tab, hàng điều hướng) phải vừa với bề rộng ở cửa sổ 820 px. Thứ bị cắt phải có `title` hoặc `aria-label` chứa toàn văn.
- Chỉ đặt bề rộng tối đa cho điều khiển khi nó có ellipsis và `title`; không dùng bề rộng cố định cho nút có chữ.

**EN**

- Sentence case cho nhãn và tiêu đề ("Quick start", không "Quick Start"); hiện còn lẫn "New Chat"/"New chat", "TTS Mode", "Enable Hotkey", "Generate API Key".
- Nhãn điều hướng tối đa khoảng 20 ký tự, nhãn nút tối đa khoảng 18 ký tự, mô tả lệnh trong bảng lệnh tối đa khoảng 45 ký tự, dòng phụ trong lịch sử tối đa khoảng 28 ký tự.
- Bỏ chữ thừa khi icon hoặc ngữ cảnh đã nói thay: "Detected:" khi đã có tag Auto, "Task:" khi đã có icon tác vụ.

**JA**

- Nhãn điều hướng tối đa 10 ký tự toàn độ rộng; nhãn nút tối đa 8; trạng thái tối đa 6.
- Dùng dấu câu toàn độ rộng trong câu Nhật: "：", "（）", "。". Không để ". " hay ": " ASCII sau chữ Nhật.
- Không chèn khoảng trắng giữa chữ Latin và kana/kanji, trừ tên riêng có sẵn khoảng trắng (thống nhất mục 15). Không viết lẫn từ tiếng Anh thường ("key") vào câu JA; dùng katakana ("キー").
- Số và đơn vị viết liền: "62文字", "5分前".
- Động từ đứng cuối: phím tắt, tên model, tên nhà cung cấp là tân ngữ đứng trước ("{key} を押す", "{model} を使用中").
- Chuỗi JA ngắn hơn về số ký tự nhưng mỗi ký tự rộng gấp đôi chữ Latin: kiểm tra theo bề rộng px, không theo số ký tự.

**Việc cần ở tầng app (để chữ JA hiển thị đúng)**

- Đặt `document.documentElement.lang` theo `locale` trong `App.tsx` (như `UpdatePopupPage` đã làm), và `lang` theo ngôn ngữ nguồn/đích lên vùng văn bản dịch.
- Thêm font Nhật vào `--vzn-font-sans` trong `tokens.css` sau font Latin (ví dụ `"Hiragino Sans"`, `"Yu Gothic UI"`, `Meiryo`), hoặc thêm một khối `:lang(ja)` trong `tokens.css` đặt lại `--vzn-font-sans`. Chưa làm: đây là đề xuất, board không thêm rule nào mà app không có.
- Sau khi có `lang`, cân nhắc `word-break: auto-phrase` cho mô tả JA ngắn (thẻ, toast) và bỏ `--vzn-tracking-caps` khỏi nhãn nhóm khi locale là JA.
