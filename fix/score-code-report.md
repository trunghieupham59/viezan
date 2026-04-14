# 📊 Báo Cáo Chấm Điểm Source Code — Lotus Translate App

> **Thời gian chấm:** 15/04/2026  
> **Workflow áp dụng:** `lotus-agent/workflow/score-code`  
> **Loại bài:** Project lớn (Electron + React desktop app)  
> **Bộ rubric:** Project lớn / Đồ án nhóm (8 tiêu chí, tổng 100 điểm)

---

## Tổng Quan Dự Án

**Lotus Translate** là ứng dụng desktop đa nền tảng (macOS + Windows) xây dựng trên Electron + React, hỗ trợ dịch thuật AI với 3 nhà cung cấp: Google Gemini, Anthropic Claude, OpenAI GPT. Tính năng bao gồm: dịch văn bản, dịch ảnh, nhận dạng giọng nói, TTS, Live Translate thời gian thực, AI Chat, và quản lý lịch sử.

---

## 🗂️ Bảng Điểm Tổng Hợp

| Tiêu chí         | Điểm tối đa | Điểm đạt | Nhận xét tóm tắt                                                  |
|------------------|:-----------:|:--------:|-------------------------------------------------------------------|
| Correctness      | 25          | **20**   | Logic đúng, xử lý edge case tốt; còn vài catch rỗng, duplicate code |
| Architecture     | 15          | **12**   | Kiến trúc Electron đúng chuẩn; store monolithic, 3 file trang quá lớn |
| Code Quality     | 15          | **11**   | Naming/typing tốt; SVG inline lặp, component files quá dài        |
| Maintainability  | 15          | **11**   | Single source of truth tốt; store + SettingsPage phình to          |
| Testing          | 10          | **0**    | Hoàn toàn không có unit test hay integration test                  |
| Performance      | 10          | **8**    | Debounce, VAD, useCallback, queue đúng chỗ; một số chưa giới hạn  |
| Security         | 5           | **4**    | Keychain + context bridge đúng chuẩn; thiếu input validation      |
| Documentation    | 5           | **4**    | README và code comment rất đầy đủ; thiếu CONTRIBUTING.md          |
| **TỔNG**         | **100**     | **70**   |                                                                   |

---

## 🔍 Phân Tích Chi Tiết Từng Tiêu Chí

---

### 1. Correctness — 20/25

#### ✅ Điểm tốt

- **Logic dịch đúng và đầy đủ luồng:** `handleTranslate` trong `TranslatePage.tsx` xử lý cả 2 mode: image và text, có fallback rõ ràng giữa `editedImageBase64` (Gemini) và `regions` (Claude/OpenAI).
- **Edge case `swapLanguages`:** Xử lý đúng trường hợp `sourceLang === 'auto'` → fallback về `'ja'` thay vì swap ngược về 'auto'.
- **VAD 3-gate system** trong `LiveTranslatePage.tsx`: Gate 1 (RMS amplitude), Gate 2 (sustained samples), Gate 3 (peak RMS) — phòng tránh gửi audio im lặng lên Whisper.
- **Hallucination filter** với 60+ regex pattern cho EN/JA/KO/VI — n-gram repetition detection, character flooding.
- **Whisper confidence gate:** Kiểm tra `noSpeechProb > 0.65`, `avgLogprob < -1.0`, `compressionRatio > 2.4`.
- **Debounce auto-translate** chỉ kích hoạt khi `!isVoiceActive` — tránh spam API khi đang nói.
- **TTS fallback:** Primary → backend TTS (OpenAI/Gemini), Fallback → OS SpeechSynthesis.
- **Giới hạn bộ nhớ:** `MAX_HISTORY = 100`, `MAX_CHAT_SESSIONS = 20`, liveSessions `.slice(0, 50)`.

#### ❌ Điểm chưa tốt

- **Catch rỗng ở nhiều chỗ trong `SettingsPage.tsx`:**
  ```typescript
  // Dòng ~315, ~327, ~342 — không báo lỗi cho user
  } catch { /* ignore */ }
  finally { setCreating(false) }
  ```
  Nếu `createToken`, `deleteToken`, `regenerateToken` thất bại, user không nhận được thông báo lỗi.

- **`handleStop` trong `LiveTranslatePage.tsx`:**
  ```typescript
  try { audioCtxRef.current?.close() } catch {}
  ```
  Lỗi close AudioContext bị nuốt hoàn toàn.

- **`_session` không dùng trong `LiveHistoryTab`:**
  ```typescript
  const handleOpenLive = (_session: LiveSession) => {
    setActivePage('live')  // không load lại session cụ thể
  }
  ```
  Mở Live page nhưng không navigate đến session đúng.

- **`detectSystemLocale()` bị duplicate** giữa `App.tsx` và `SettingsPage.tsx` — vi phạm DRY, nên extract ra constants hoặc utils.

- **`handleCopy` trong `ChatPage.tsx` dùng nội dung text làm ID:**
  ```typescript
  setCopiedId(text.slice(0, 20))  // brittle — 2 message khác nhau có thể có cùng 20 ký tự đầu
  ```

---

### 2. Architecture — 12/15

#### ✅ Điểm tốt

- **Main process / Renderer process tách biệt đúng chuẩn Electron:** IPC handlers chia vào từng file `electron/ipc/` (chat, translate, tts, transcribe, keychain...).
- **Context bridge (`preload.ts`)** đúng chuẩn bảo mật: renderer không có direct Node.js access.
- **Phân layer rõ ràng:**
  - `src/pages/` — page-level components
  - `src/components/` — reusable UI
  - `src/hooks/` — custom hooks (`useTTS`)
  - `src/store/` — Zustand state
  - `src/types/` — TypeScript types
  - `src/constants/` — config
  - `src/i18n/` — translations
- **Custom hook `useTTS`** được tách ra đúng cách (comment ghi rõ đây là extract từ 110-line inline function).
- **Zustand với `persist` middleware** phù hợp cho desktop app.

#### ❌ Điểm chưa tốt

- **`useAppStore.ts` quá monolithic (358 dòng):** Chứa state của quá nhiều domain khác nhau trong 1 store: translation, chat, live sessions, history, locale, TTS, fonts, keyStatus, hotkey... Nên tách thành slices hoặc multiple stores.

- **3 page files cực kỳ dài:**
  - `SettingsPage.tsx`: **1555 dòng** — chứa cả logic hotkey, token management, legacy assistant, updater, preset management
  - `LiveTranslatePage.tsx`: **~1367 dòng** — xử lý VAD, MediaRecorder, WebAudio, subtitle overlay, summary
  - `TranslatePage.tsx`: **994 dòng** — bao gồm cả canvas rendering helpers

- **Canvas helpers đặt sai chỗ:** `canvasWrapText` và `renderTranslatedRegions` nên nằm ở `src/utils/canvas.ts` thay vì đầu `TranslatePage.tsx`.

---

### 3. Code Quality — 11/15

#### ✅ Điểm tốt

- **Naming rõ ràng, nhất quán:** `handleTranslate`, `handleVoiceTranscript`, `isVoiceActive`, `speakingPanel`, `debounceRef`, `voicePrefixRef`, `imageAttachmentRef` — tên phản ánh đúng ý nghĩa.
- **TypeScript đầy đủ:** Types cho tất cả interface quan trọng (`ProviderConfig`, `ChatMessage`, `TranscribeResult`...). Dùng `type` và `interface` đúng ngữ cảnh.
- **Constants có tên ý nghĩa + JSDoc** trong `LiveTranslatePage.tsx`:
  ```typescript
  const SPEECH_RMS_THRESHOLD = 6    // sustained sensitivity — slightly above room hum
  const PEAK_RMS_THRESHOLD   = 14   // peak gate: at least one sample must reach this
  ```
- **Single Responsibility khá tốt:** `useTTS`, `VoiceRecorder`, `LanguageSelector`, `ModelSelector` là những component nhỏ gọn làm đúng một việc.
- **DRY tốt:** `useT()` hook cho i18n, `ProviderBadge` component tái dùng trong 3 tabs của HistoryPage.

#### ❌ Điểm chưa tốt

- **SVG inline lặp lại nhiều lần:** Spinner SVG (vòng tròn + path) xuất hiện hơn 10 lần khắp codebase. Nên tạo `<Spinner />` component tái dùng.
  ```tsx
  // Xuất hiện lặp trong TranslatePage, ChatPage, SettingsPage...
  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" ... />
    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0..." />
  </svg>
  ```

- **Magic strings không qua i18n trong `SettingsPage.tsx`:**
  ```typescript
  setExtTokensError('Không thể kết nối — đảm bảo app đang chạy qua Electron.')
  setExtTokensError('Không thể tải danh sách token.')
  ```
  Những string này bỏ qua hệ thống i18n.

- **Component files quá dài:** Theo nguyên tắc Single Responsibility, mỗi file component nên dưới 300-400 dòng. `SettingsPage.tsx` (1555 dòng) vi phạm nặng.

---

### 4. Maintainability — 11/15

#### ✅ Điểm tốt

- **Single source of truth:** `PROVIDERS`, `LANGUAGES`, `LANG_TO_BCP47`, `DEFAULT_SETTINGS` — toàn bộ config tập trung, dễ cập nhật.
- **`getRecommendedModel()` có maintenance instructions:**
  ```typescript
  // MAINTENANCE: When a provider releases a new, faster/better translation model,
  // update the PROVIDERS array above:
  //   1. Set the new model's tag to 'recommended'
  //   2. Change the previous recommended model's tag to 'balanced' or 'powerful'
  ```
- **Zustand `partialize`** rõ ràng: chỉ persist những gì cần thiết, không persist transient state.
- **i18n system** tách biệt hoàn toàn: `src/i18n/index.ts`, `useT()` hook dễ thêm ngôn ngữ mới.

#### ❌ Điểm chưa tốt

- **`useAppStore.ts` sẽ ngày càng phình to:** Mỗi feature mới đều thêm vào 1 file duy nhất. Nên dùng Zustand slices pattern.

- **`SettingsPage.tsx` quá nhiều concerns:** 5 sections độc lập (API keys, preferences, hotkey, extension tokens, updater) cùng local state riêng biệt — khó debug khi có bug trong 1 section vì code lẫn lộn.

- **`handleTranslateRef` / `styleInitRef` / `langInitRef` / `modelInitRef` pattern** trong `TranslatePage.tsx` khó hiểu cho người mới đọc. Cần comment chi tiết hơn hoặc extract hook:
  ```typescript
  const styleInitRef = useRef(false)
  const langInitRef = useRef(false)
  const modelInitRef = useRef(false)
  const handleTranslateRef = useRef(handleTranslate)
  // pattern này không intuitive
  ```

- **Magic values còn sót:**
  - Port `39875` hard-coded trong `SettingsPage.tsx`
  - JPEG quality `0.85` trong `ChatPage.tsx`
  - Textarea max-height `160` inline style trong `ChatPage.tsx`

---

### 5. Testing — 0/10

#### ❌ Hoàn toàn không có test

- Không có file test nào trong toàn bộ project.
- Không có test framework nào trong `package.json` (không thấy jest, vitest, @testing-library/react, playwright...).
- Một số logic rất phức tạp và cần được test kỹ:
  - `isHallucination()` trong `LiveTranslatePage.tsx` — 60+ regex patterns, n-gram detection
  - `extractCompleteSentences()` — sentence boundary detection
  - `jaccardSimilarity()` — duplicate detection
  - `canvasWrapText()` — text wrapping algorithm
  - `useAppStore` — CRUD actions cho sessions, presets, history

#### Ghi chú về Testability

- **Dễ test:** `isHallucination`, `jaccardSimilarity`, `extractCompleteSentences`, `canvasWrapText` là pure functions, không phụ thuộc external state.
- **Khó test:** Các pages phụ thuộc nặng vào `window.api` (Electron IPC) — cần mock lớp này.
- **Zustand store:** Có thể test khá dễ với `useAppStore.getState()` / `useAppStore.setState()`.

---

### 6. Performance — 8/10

#### ✅ Điểm tốt

- **Auto-translate debounce (800ms):** Tránh gọi API sau mỗi keystroke.
- **VAD tránh gửi audio im lặng lên Whisper:** Tiết kiệm API cost đáng kể.
- **Serial queue `queueRef`:** Đảm bảo chunks được xử lý theo thứ tự, không race condition.
- **`useCallback` + `useRef` đúng chỗ:** Tránh recreate functions không cần thiết.
- **Image resize trước khi gửi API:** `MAX_IMAGE_SIZE = 1200` trong `ChatPage.tsx`.
- **Tính `lastAssistantIdx` 1 lần:**
  ```typescript
  // Comment trong ChatPage.tsx: "avoid O(n²) per-render .map().lastIndexOf()"
  const lastAssistantIdx = messages.reduce((acc, m, i) => ...)
  ```
- **Scroll sync dùng `requestAnimationFrame`** để tránh layout thrashing.
- **Giới hạn kích thước data persist:** `MAX_HISTORY = 100`, `liveSessions.slice(0, 50)`.

#### ❌ Điểm chưa tốt

- **`fullRawForSummaryRef.current` không có giới hạn kích thước:** Đối với live sessions dài (hàng giờ), string này có thể tăng không giới hạn, gây memory pressure.
- **`SettingsPage.tsx` gọi nhiều API khi mount:** `loadKeys()`, `window.api.hotkey.get()`, `loadTokenList()`, `loadBookmarklet()` đồng thời — có thể gây chậm khi mở Settings.

---

### 7. Security — 4/5

#### ✅ Điểm tốt

- **API keys lưu trong OS Keychain** (`keytar`) — không hard-code, không lưu vào file, không expose ra renderer.
- **Context bridge đúng chuẩn Electron:** Renderer chỉ truy cập qua `window.api` — không có Node.js/Electron direct access.
- **Masked key display:** API keys được mask khi hiển thị trong Settings.
- **Tokens có TTL:** Extension tokens có thời hạn (7/30/90/365 ngày).
- **Không có SQL injection risk:** App không dùng SQL database.

#### ❌ Điểm chưa tốt

- **Không validate độ dài input trước khi gửi API:** Người dùng có thể nhập text cực dài, gây tốn token/cost cao mà không có cảnh báo.
- **`(window as any).api?.platform`** trong `App.tsx` — type-unsafe cast, dù có lý do là cross-process boundary.
- **Local server port `39875` cố định:** Nếu port bị chiếm dụng không có fallback mechanism rõ ràng trong renderer.

---

### 8. Documentation — 4/5

#### ✅ Điểm tốt

- **README rất đầy đủ:** Features, download links, getting started, API keys setup, development guide, build instructions, project structure, tech stack, changelog — đủ cho cả user và developer.
- **JSDoc chi tiết cho hằng số phức tạp:**
  ```typescript
  /**
   * Voice Activity Detection (VAD) — three-gate system:
   * Gate 1 — RMS amplitude threshold (sustained)...
   * Gate 2 — sustained speech requirement...
   * Gate 3 — peak RMS confirmation...
   */
  ```
- **`useTTS` hook có header comment** giải thích mục đích, usage example.
- **Maintenance comments trong `providers.ts`** hướng dẫn cách cập nhật model mới.
- **`biome-ignore` comments** đều có giải thích lý do.
- **TypeScript types tự documenting:** `WindowApi`, `TranscribeResult`, `SubtitleSettings`...

#### ❌ Điểm chưa tốt

- **Không có `CONTRIBUTING.md`:** Không có hướng dẫn cho developer muốn đóng góp.
- **Thiếu inline comment** ở một số business logic phức tạp trong `SettingsPage.tsx` (hotkey recorder flow, token regeneration flow).

---

## 💪 Điểm Mạnh Nổi Bật

1. **Kiến trúc Electron chuẩn:** IPC separation, context bridge, keychain integration — đây là pattern khó làm đúng và project đã làm rất tốt.

2. **Live Translate pipeline rất kỹ lưỡng:** VAD 3-gate + hallucination filter 60+ patterns + Whisper confidence gate + n-gram repetition detection + rate limiter. Đây là engineering chắc tay, không phải chỉ "cho chạy được".

3. **TypeScript coverage tốt:** Toàn bộ types được định nghĩa rõ ràng, không dùng `any` bừa bãi.

4. **UX flow hoàn chỉnh:** Mỗi tính năng đều có loading states, error states, empty states, edge case handling.

5. **i18n đúng cách:** `useT()` hook, `TRANSLATIONS` object, hỗ trợ 3 ngôn ngữ (EN/VI/JA) nhất quán.

---

## 🔧 Điểm Cần Cải Thiện (Ưu tiên)

### Ưu tiên cao

| # | Vấn đề | Vị trí | Đề xuất |
|---|--------|--------|---------|
| 1 | **Không có test** | Toàn bộ project | Thêm Vitest + Testing Library cho pure functions và store |
| 2 | **SettingsPage.tsx quá lớn (1555 dòng)** | `src/pages/SettingsPage.tsx` | Tách thành `HotkeySection`, `ApiKeySection`, `ExtensionSection`... |
| 3 | **Catch rỗng ở token management** | `SettingsPage.tsx` dòng ~315-342 | Thêm error state và thông báo cho user |

### Ưu tiên trung bình

| # | Vấn đề | Vị trí | Đề xuất |
|---|--------|--------|---------|
| 4 | **Store monolithic** | `useAppStore.ts` | Tách thành Zustand slices: `useTranslateStore`, `useChatStore`, `useLiveStore` |
| 5 | **SVG Spinner lặp lại** | Nhiều files | Tạo `<Spinner />` component tái sử dụng |
| 6 | **`detectSystemLocale` duplicate** | `App.tsx` + `SettingsPage.tsx` | Extract vào `src/utils/locale.ts` |
| 7 | **Magic strings không qua i18n** | `SettingsPage.tsx` | Thêm vào `src/i18n/index.ts` |

### Ưu tiên thấp

| # | Vấn đề | Vị trí | Đề xuất |
|---|--------|--------|---------|
| 8 | **Canvas helpers đặt sai chỗ** | `TranslatePage.tsx` | Chuyển sang `src/utils/canvas.ts` |
| 9 | **`fullRawForSummaryRef` không giới hạn** | `LiveTranslatePage.tsx` | Giới hạn khoảng 10,000 ký tự cho long sessions |
| 10 | **Thiếu input length validation** | `TranslatePage.tsx`, `ChatPage.tsx` | Thêm max char limit cảnh báo user |

---

## 📋 Khuyến Nghị Tổng Thể

1. **Ưu tiên số 1: Thêm test.** Đây là rủi ro lớn nhất. Các pure functions như `isHallucination`, `jaccardSimilarity`, `extractCompleteSentences` rất dễ test và rất quan trọng. Bắt đầu với Vitest.

2. **Tách `SettingsPage.tsx`** thành các sub-components. File 1555 dòng là điểm đau nhất khi maintain.

3. **Tách `useAppStore`** thành slices khi số lượng features tăng thêm. Hiện tại vẫn manageable nhưng đang tiệm cận giới hạn.

4. **Code base nhìn chung rất tốt** cho một sản phẩm production — architecture sạch, performance có tâm, security đúng chuẩn. Điểm trừ lớn nhất là thiếu testing hoàn toàn.

---

*Báo cáo được tạo tự động theo workflow `score-code` v1.0.0*
