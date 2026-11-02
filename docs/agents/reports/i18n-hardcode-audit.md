# i18n Hardcoded UI String Audit — Viezan

> Skill: `viezan-i18n-audit` · Scope: `src/**/*.tsx`, `src/services/**/*.ts`, `chrome-extension/**`
> Generated: 2026-02-05 · Locales: `vi` (default), `en`, `ja`

## Coverage Summary

- Renderer locales: `src/i18n/locales/{vi,en,ja}.ts` — chỉ kiểm hardcode (không re-audit symmetry trong lần này).
- Strategy: i18n qua object `t: Translations` lấy từ store (`TRANSLATIONS[locale]`), không dùng `t('key.path')`.
- Helper: `tpl(template, vars)` cho interpolation `{name}`.
- Chrome Extension: **chưa có cơ chế i18n** — toàn bộ surface đang hardcode tiếng Anh (xem mục 4).

## Hardcoded Strings — Renderer (`src/`)

| Severity | File:Line | Snippet | Suggested key |
|---|---|---|---|
| medium | `src/components/AppLogo.tsx:12` | `alt="Viezan App Logo Icon"` | `app.logo_alt` (hoặc giữ brand-only) |
| high | `src/services/deepResearchService.ts:277` | `onStepStart('Phân tích câu hỏi')` | `chat_deep_research_step_analyze` |
| high | `src/services/deepResearchService.ts:304` | `'Lỗi phân tích'` | `chat_deep_research_error_analyze` |
| high | `src/services/deepResearchService.ts:309` | `'**Real-time mode** — Tìm kiếm web thực tế cho mỗi bước'` | `chat_deep_research_mode_realtime` |
| high | `src/services/deepResearchService.ts:309` | `'**AI-only mode** — Không có Tavily key. Thêm key trong Settings → API Keys để bật web search.'` | `chat_deep_research_mode_ai_only` |
| high | `src/services/deepResearchService.ts:311` | `` `**Sẽ nghiên cứu ${aspects.length} khía cạnh, qua nhiều vòng lặp:**` `` | `chat_deep_research_will_study` (template `{count}`) |
| high | `src/services/deepResearchService.ts:313` | `` `**Ngữ cảnh ảnh:** ${imageContext}` `` | `chat_deep_research_image_context` |
| high | `src/services/deepResearchService.ts:314` | `` `**Từ khóa từ ảnh:** ${imageSearchTerms.join(', ')}` `` | `chat_deep_research_image_terms` |
| high | `src/services/deepResearchService.ts:323` | `` `Vòng 1 — Nghiên cứu: ${aspect}` `` | `chat_deep_research_step_round1` |
| high | `src/services/deepResearchService.ts:333` | `` `[Không thể phân tích: ${...}]` `` | `chat_deep_research_cannot_analyze` |
| high | `src/services/deepResearchService.ts:337,411` | `'Lỗi'` (fallback message) | `common_error_label` |
| high | `src/services/deepResearchService.ts:339,413` | `` `[Lỗi: ${e}]` `` | `chat_deep_research_error_inline` |
| high | `src/services/deepResearchService.ts:350` | `` `Đánh giá khoảng trống — Vòng ${iteration}` `` | `chat_deep_research_step_gap` |
| high | `src/services/deepResearchService.ts:377` | `` `**Nghiên cứu đã đầy đủ** — Không phát hiện khoảng trống đáng kể. Tiến hành tổng hợp.` `` | `chat_deep_research_complete` |
| high | `src/services/deepResearchService.ts:379` | `` `**Phát hiện ${gapResult.gaps.length} khoảng trống cần bổ sung:**` `` | `chat_deep_research_gaps_found` |
| high | `src/services/deepResearchService.ts:385` | `'Lỗi đánh giá'` | `chat_deep_research_error_eval` |
| high | `src/services/deepResearchService.ts:396` | `` `Nghiên cứu sâu: ${gapLabel}` `` | `chat_deep_research_step_deep` |
| high | `src/services/deepResearchService.ts:407` | `` `[Không thể nghiên cứu: ${...}]` `` | `chat_deep_research_cannot_research` |
| high | `src/services/deepResearchService.ts:419` | `'Kiểm chứng chéo'` | `chat_deep_research_step_cross` |
| high | `src/services/deepResearchService.ts:433` | `` `Không thể thực hiện cross-reference: ${...}` `` | `chat_deep_research_cross_failed` |
| high | `src/services/deepResearchService.ts:436` | `'Lỗi cross-reference'` | `chat_deep_research_error_cross` |
| high | `src/services/deepResearchService.ts:438` | `` `[Cross-reference thất bại: ${e}]` `` | `chat_deep_research_cross_failed_inline` |
| high | `src/services/deepResearchService.ts:442` | `'Tổng hợp cuối cùng'` | `chat_deep_research_step_synth` |
| high | `src/services/deepResearchService.ts:469` | `` `Không thể tổng hợp (${...}).` `` | `chat_deep_research_synth_failed` |
| high | `src/services/deepResearchService.ts:473` | `'Lỗi tổng hợp'` | `chat_deep_research_error_synth` |
| medium | `src/services/chatService.ts:71` | `'Image editing bridge is unavailable. Restart Viezan and try again.'` | `chat_error_image_edit_bridge` |
| low | `src/pages/settings/BrowserIntegrationSection.tsx:28,56` | `DEFAULT_TOKEN_NAME_PREFIX = 'Chrome Extension'` → placeholder dạng `Chrome Extension - <date>` | giữ (token name là dữ liệu, không phải UI) hoặc thêm `settings_token_default_prefix` |
| low | `src/pages/ChatPage.tsx:97` | `throw new Error('Invalid image dimensions')` | dev-only error nhưng có thể leak ra toast → `chat_error_invalid_image` |
| low | `src/pages/ChatPage.tsx:103` | `throw new Error('Canvas is unavailable')` | `chat_error_canvas_unavailable` |
| low | `src/pages/settings/ApiKeysSection.tsx:607,620` | `throw new Error('App API not available')` | `settings_error_app_api_unavailable` |

> Brand-name xuất hiện trong JSX (`<div>Viezan</div>` ở `Sidebar.tsx:68`, `AboutSection.tsx:26`) **không phải hardcode UI string** — đây là tên sản phẩm cố định, OK.

## Hardcoded Strings — Smart Thinking Service

`src/services/smartThinkingService.ts` đã dùng object `uiText` cho các label động (`webSearchNoResults`, `webSearchErrorFallback`, `stepLabel`…), tốt. Tuy nhiên ở dòng **161–167** có một mảng từ khoá đa ngôn ngữ dùng để **detect** section title trong AI output, đây là **logic detection**, KHÔNG phải UI render → OK, không cần i18n.

## Hardcoded Strings — Chrome Extension (parity audit)

Chrome extension hiện **không có lớp i18n**. Toàn bộ surface (popup, options, content tooltip) hardcode tiếng Anh. Nếu policy là "extension chỉ hỗ trợ EN" → cần document trong `chrome-extension/README.md`. Nếu muốn parity với app → cần build i18n riêng (tối thiểu lưu locale ưu tiên trong `chrome.storage` rồi map các const `COPY_LABEL`, `LISTEN_LABEL`…).

| Severity | File:Line | Snippet |
|---|---|---|
| medium | `chrome-extension/popup.html:6` | `<title>Viezan Translate</title>` |
| medium | `chrome-extension/popup.html:15-16` | `Viezan is not connected` / `Paste the connection API key from the desktop app before translating in the browser.` |
| medium | `chrome-extension/popup.html:31` | `Browser translate` |
| medium | `chrome-extension/popup.html:35` | `Connecting...` |
| medium | `chrome-extension/popup.html:45-46` | `Provider` / `Model` (placeholders) |
| medium | `chrome-extension/popup.html:51-68` | Option labels: `English`, `Vietnamese`, `Japanese`, … (UI label, không phải code) |
| medium | `chrome-extension/popup.html:72-79` | `Style` + General/Formal/Casual/Business/Technical/Natural |
| medium | `chrome-extension/popup.html:86,91,93` | `Original` / `Translation` / `Translation appears here...` |
| medium | `chrome-extension/options.html:6,17,18,26` | `Viezan - Options`, `Viezan Extension`, `Local browser bridge for the desktop app`, `Connect` |
| medium | `chrome-extension/popup.js:6-10` | Const labels: `Copy`, `Replace`, `Listen`, `Copy translation (Cmd+C)`, … |
| medium | `chrome-extension/popup.js:112,186,198,213,215,217` | `Stop`, `Connecting...`, `Active`, `App not running`, `Provider unavailable`, `Model unavailable` |
| medium | `chrome-extension/popup.js:243` | `<span class="result-placeholder">Translation appears here...</span>` |
| medium | `chrome-extension/popup.js:299,326-330,345,350,371,380,383,393-398,411,450,455,458` | Status/error toasts: `Translating...`, `Unknown error`, `Invalid API key. Update it in Options.`, `Cannot reach Viezan app. Is it running?`, `Copied`, `Failed to copy`, `Loading...`, `Failed to play audio`, `TTS failed`, `No active tab found`, `Replaced`, `No text selected on page`, `Cannot replace. Try selecting text first.` |
| medium | `chrome-extension/content.js:23-27` | Dup label const: `Copy`, `Replace`, `Listen`, `Copy translation (Cmd+C)`, … |
| medium | `chrome-extension/content.js:42-46` | `btn.title = 'Viezan Translate'`, `btnImg.alt = 'Viezan'` |
| medium | `chrome-extension/content.js:52-110` | Toàn bộ tooltip innerHTML: `Connecting...`, `Close`, `Provider`, `Model`, `To`, `Style`, option list, panel labels `Original`/`Translation`, `Target language`, `Translation style` |
| medium | `chrome-extension/content.js:249,261,264,269,352,379` | `Active`, `Offline`, `Provider unavailable`, `Model unavailable`, `Stop`, `Listen` |

## Unused or Duplicate Keys

Không scan trong lần này. Khuyến nghị chạy thêm `viezan-i18n-audit` với prompt khác để detect missing-keys & unused-keys.

## Required Fixes (đề xuất ưu tiên)

1. **HIGH — `src/services/deepResearchService.ts`**: Toàn bộ step label, error message, prefix Markdown đang hardcode tiếng Việt. User dùng locale `en`/`ja` sẽ thấy lẫn ngôn ngữ. Tách thành `chat_deep_research_step_*` + truyền `t: Translations` vào hàm `run({…})` (giống `smartThinkingService` đã làm với `uiText`). Hỗ trợ `{count}`, `{aspect}`, `{round}`, `{error}` qua `tpl()`.
2. **MEDIUM — `src/services/chatService.ts:71`**: i18n hoá fallback `'Image editing bridge is unavailable…'` (đã có `chat_error_image_edit_reload_required` rất gần — có thể tái dùng).
3. **MEDIUM — Chrome Extension**: Quyết định chính sách i18n cho extension. Tối thiểu:
   - Document trong `chrome-extension/README.md` rằng extension chỉ EN.
   - Hoặc thêm cơ chế `chrome.i18n` (`_locales/<lang>/messages.json`) và `chrome.i18n.getMessage('copy_label')`.
   - DRY cặp const lặp giữa `popup.js` và `content.js`.
4. **LOW — `src/pages/ChatPage.tsx:97,103` & `src/pages/settings/ApiKeysSection.tsx:607,620`**: Dev-error message bằng tiếng Anh hardcode. Nếu các error này được hiển thị qua toast/banner trên UI thì cần i18n; nếu chỉ là internal guard thì OK.
5. **LOW — `src/components/AppLogo.tsx:12`**: `alt="Viezan App Logo Icon"` — accessibility text. Có thể thêm `app_logo_alt` hoặc giữ vì brand-only.

## Notes

- Các trường hợp `<title>…</title>` trong `src/components/ui/icons/providers.tsx` (Local AI, Google Gemini, Anthropic Claude, OpenAI, Groq, ElevenLabs, Microsoft Edge, Tavily, Brave Search) là **tên thương hiệu** trong SVG `<title>` — KHÔNG cần i18n.
- `<KeyCap>Esc</KeyCap>`, `<KeyCap>⇧</KeyCap>` (`src/components/AIChatPopup.tsx`) là tên phím — universal, không cần i18n.
- Mảng locale-detection tokens trong `smartThinkingService.ts:161-167` là logic, không phải UI — OK.

## Fix Status (2026-02-05)

| Finding | Status | Note |
|---|---|---|
| `deepResearchService.ts` — toàn bộ step label, error fallback, Markdown prefix tiếng Việt (24 finding HIGH) | ✅ Fixed | Refactor: thêm `DeepResearchUiText` + 27 i18n key `chat_deep_research_*` (vi/en/ja). `ChatPage.tsx` truyền `uiText` vào `deepResearchService.run()`. Test cập nhật. |
| `chatService.ts:71` — fallback `'Image editing bridge is unavailable…'` | ✅ Documented | Đã thêm comment giải thích: errorCode `PRELOAD_OUTDATED` được map sang `t.chat_error_image_edit_reload_required` qua `localizeChatError`, nên string EN không bao giờ surface tới user; chỉ còn defensive fallback. |
| `BrowserIntegrationSection.tsx` — `DEFAULT_TOKEN_NAME_PREFIX = 'Chrome Extension'` | ⏭️ Skipped | Token name là dữ liệu định danh extension (cùng giá trị qua mọi locale), không phải UI string thuần. |
| `ChatPage.tsx:97,103` — `throw new Error('Invalid image dimensions' / 'Canvas is unavailable')` | ⏭️ Skipped | Internal guard, không hiển thị qua toast — `localizeChatException` xử lý fallback nếu leak. |
| `ApiKeysSection.tsx:607,620` — `throw new Error('App API not available')` | ⏭️ Skipped | Như trên — guard nội bộ, được unwrap qua localize layer. |
| `AppLogo.tsx:12` — `alt="Viezan App Logo Icon"` | ⏭️ Skipped | Brand-name accessibility text, ít cần dịch. |
| Chrome Extension i18n parity (popup.html/options.html, popup.js, content.js) | ⏭️ Out-of-scope | Cần quyết định policy (EN-only vs `chrome.i18n` + `_locales/`); fix riêng task. |

**Verification:** `tsc --noEmit` ✅ · `biome check` ✅ · `vitest run` ✅ 597/597 test passed.
