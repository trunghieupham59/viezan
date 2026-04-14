# 📊 Báo Cáo Chấm Điểm Source Code — Lotus Translate

> **Ngày giờ chấm:** 01:11 SA, Thứ Ba, 15/04/2026 (GMT+7 — Asia/Saigon)
> **Người chấm:** AI Agent (workflow `score-code` v1.0.0)
> **Loại bài:** Project lớn (Electron + React Desktop App)
> **Rubric áp dụng:** Project lớn / Đồ án nhóm

---

## 🗂️ Thông Tin Project

| Mục | Chi tiết |
|-----|---------|
| **Tên project** | Lotus — AI Translation Desktop App |
| **Phiên bản** | v1.0.3 |
| **Stack** | Electron v41, React v18, TypeScript v5, Vite, Tailwind CSS, Zustand v5 |
| **Nền tảng** | macOS & Windows |
| **Tổng số file đọc** | 20+ file (pages, components, store, utils, tests, docs) |

---

## 📋 Bảng Điểm Tổng Hợp

| Tiêu chí | Điểm tối đa | Điểm đạt | % | Nhận xét tóm tắt |
|----------|------------|---------|---|-----------------|
| **Correctness** | 25 | 21 | 84% | Logic đúng, có edge case, còn vài bug nhỏ |
| **Architecture** | 15 | 11 | 73% | Pattern tốt, một số file quá lớn |
| **Code Quality** | 15 | 11 | 73% | Naming tốt, còn duplicate code và hard-code |
| **Maintainability** | 15 | 11 | 73% | Cấu trúc rõ, store/page quá nặng |
| **Testing** | 10 | 7 | 70% | Utils test tốt, thiếu component test |
| **Performance** | 10 | 8 | 80% | Debounce, VAD, memory limit tốt |
| **Security** | 5 | 4 | 80% | OS Keychain tốt, vài điểm bypass type |
| **Documentation** | 5 | 4.5 | 90% | README & CONTRIBUTING đầy đủ, thiếu API docs |
| **🏆 TỔNG** | **100** | **77.5** | **77.5%** | |

---

## 🔍 Chấm Chi Tiết Từng Tiêu Chí

---

### 1. Correctness — 21/25

**Phạm vi:** Kết quả đúng logic, xử lý edge cases, không crash với input hợp lệ.

#### ✅ Điểm mạnh

- **Image translation có 2 path fallback đúng:**
  ```tsx
  // TranslatePage.tsx line 91-113
  if (result.success && result.editedImageBase64) {
    // Gemini image-edit path
  } else if (result.success && result.regions && result.regions.length > 0) {
    // Claude/OpenAI fallback regions
  } else if (result.success) {
    // No text found
  }
  ```

- **`swapLanguages()` xử lý edge case 'auto' đúng:**
  ```ts
  // useAppStore.ts line 165
  const newTargetLang = state.sourceLang === 'auto' ? 'ja' : state.sourceLang
  ```

- **VAD multi-gate pipeline** trong LiveTranslatePage với 3 cổng (RMS, sustained samples, peak threshold) ngăn hallucination Whisper rất chắc.

- **Whisper confidence gate** kiểm tra `noSpeechProb`, `avgLogprob`, `compressionRatio` đúng chuẩn.

- **History limit** `MAX_HISTORY = 100` và `liveSessions` limit 50 được enforce.

- **Auto-translate debounce** skip khi `isVoiceActive` để không spam API.

#### ❌ Điểm trừ

- **`setTranslatedText('✓')` là magic string:**
  ```tsx
  // TranslatePage.tsx line 95
  setTranslatedText('✓') // non-empty so copy/speak buttons appear
  ```
  Nếu user copy kết quả sẽ thấy ký tự '✓' — cần thay bằng empty hoặc sentinel rõ ràng hơn.

- **`MAX_CHAT_SESSIONS = 20` được định nghĩa nhưng không enforce:**
  ```tsx
  // ChatPage.tsx line 12 - định nghĩa nhưng không bao giờ dùng
  const MAX_CHAT_SESSIONS = 20
  ```
  Sessions có thể tăng không giới hạn — memory leak tiềm ẩn.

- **Duplicate function `getSupportedMimeType()`:**
  ```ts
  // LiveTranslatePage.tsx line 119 — định nghĩa riêng
  function getSupportedMimeType(): string { ... }
  // audio.ts line 34 — đã có function tương tự
  export function getSupportedAudioMimeType(): string { ... }
  ```
  Hai function này về cơ bản giống nhau nhưng không dùng chung — dẫn đến risk diverge logic.

---

### 2. Architecture — 11/15

**Phạm vi:** Thiết kế tổng thể, phân lớp, hướng phụ thuộc, pattern suitability.

#### ✅ Điểm mạnh

- **Phân lớp electron (main process) vs src (renderer) rất chuẩn** — renderer không truy cập Node.js trực tiếp.

- **IPC bridge pattern** qua `contextBridge` đúng chuẩn Electron security:
  ```ts
  // window.api → preload.ts → electron/ipc/*
  ```

- **State management với Zustand** tập trung, dùng `persist` + `partialize` để kiểm soát chính xác state nào lưu localStorage.

- **Pure utility extraction:** `canvas.ts`, `live-translate.ts`, `locale.ts` được tách ra riêng để testable.

- **Types tập trung** tại `types/index.ts` — WindowApi contract rõ ràng.

- **IPC handlers** chia theo feature (chat.ts, translate.ts, transcribe.ts...) — dễ tìm và sửa.

#### ❌ Điểm trừ

- **`useAppStore.ts` (358 lines) chứa quá nhiều domains:** translation, chat, live session, history, locale, key status, models — vi phạm Single Responsibility. Nên tách thành `useTranslateStore`, `useChatStore`, `useSettingsStore`.

- **Pages vi phạm guideline "~400 lines"** của CONTRIBUTING.md:
  - `TranslatePage.tsx`: **924 dòng**
  - `ChatPage.tsx`: **821 dòng**
  - `LiveTranslatePage.tsx`: **1231+ dòng**
  - `SettingsPage.tsx`: **1576+ dòng**

  Đặc biệt `LiveTranslatePage.tsx` chứa cả business logic (VAD, processChunk, sentence extraction) lẫn UI — nên extract thành custom hook `useLiveTranslate`.

---

### 3. Code Quality — 11/15

**Phạm vi:** Naming, readability, duplication, hàm/class rõ ràng.

#### ✅ Điểm mạnh

- **Naming convention nhất quán:** `PascalCase` (components), `camelCase` (functions), `SCREAMING_SNAKE_CASE` (constants) — đúng với CONTRIBUTING.md.

- **Magic numbers được đặt constant với comment giải thích:**
  ```ts
  // LiveTranslatePage.tsx
  const CHUNK_DURATION_MS    = 3000  // record 3-second audio windows
  const SPEECH_RMS_THRESHOLD = 6    // sustained sensitivity — slightly above room hum
  const PEAK_RMS_THRESHOLD   = 14   // peak gate: at least one sample must reach this
  ```

- **`useCallback` + `useRef` dùng đúng chỗ** để tránh stale closures và re-render không cần thiết.

- **Biome-ignore với giải thích rõ ràng:**
  ```tsx
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run only once on mount
  ```

- **JSDoc trên utility functions** (canvas.ts, live-translate.ts) với `@param` và `@returns` đầy đủ.

#### ❌ Điểm trừ

- **Duplicate speaker button JSX** trong `TranslatePage.tsx` — block render cho source panel (lines 632–668) và translated panel (lines 775–810) giống hệt nhau (~40 dòng mỗi block). Nên extract thành `<SpeakButton panel="source|translated" />`.

- **Hard-coded strings không qua i18n** trong `SettingsPage.tsx`:
  ```tsx
  // line 580-585 — tiếng Việt hard-code
  {autoTranslate ? 'Tự động dịch (Auto)' : 'Dịch thủ công (Manual)'}
  // line 583-586
  'Tự động dịch khi bạn nhập...'
  'Nhấn nút Dịch để thực hiện dịch...'
  ```

- **`(window as any)` trong `App.tsx` line 51:**
  ```tsx
  const isMac = (window as any).api?.platform === 'darwin'
  ```
  `window.api` đã có type đầy đủ trong `types/index.ts` — không cần `any`.

- **Magic string `'✓'`** (đã đề cập ở Correctness).

---

### 4. Maintainability — 11/15

**Phạm vi:** Coupling, extensibility, dễ debug, config vs hard-code.

#### ✅ Điểm mạnh

- **`getRecommendedModel()` auto-resolve từ tag** → thêm model mới chỉ cần update `PROVIDERS` array, function tự pick up.

- **i18n system `useT()` hook** → thay đổi text UI không ảnh hưởng logic.

- **CONTRIBUTING.md step-by-step** hướng dẫn cụ thể:
  - Cách thêm provider mới (5 bước rõ ràng)
  - Cách thêm UI language mới (4 bước rõ ràng)

- **Persist store với `partialize`** → kiểm soát chính xác state nào được persist, tránh lưu runtime state.

- **`paramsRef` pattern trong LiveTranslatePage** để tránh stale closure trong callbacks mà không cần re-subscribe:
  ```ts
  const paramsRef = useRef({ sourceLang, targetLang, selectedProvider, selectedModels })
  useEffect(() => {
    paramsRef.current = { sourceLang, targetLang, selectedProvider, selectedModels }
  }, [sourceLang, targetLang, selectedProvider, selectedModels])
  ```

#### ❌ Điểm trừ

- **`useAppStore.ts` monolith** → tìm và sửa action cho một feature phải scroll qua state của features khác.

- **`LiveTranslatePage.tsx` có 15+ `useRef`** — rất khó trace state flow khi debug:
  ```ts
  pendingBufferRef, pendingChunkCountRef, recentSentencesRef,
  fullRawForSummaryRef, fullTxForSummaryRef, lastChunkTextRef,
  streamRef, recorderRef, audioChunksRef, activeRef, queueRef,
  audioCtxRef, analyserRef, hasSpeechRef, speechCountRef,
  vadTimerRef, silentChunkCountRef, rawEndRef, txEndRef,
  sessionIdRef, sessionStartRef
  ```

- **Duplicate `getSupportedMimeType()`** → nếu sửa phải sửa 2 chỗ.

- **`SettingsPage.tsx` 1576+ dòng** với nhiều useState local (hotkey, token, legacy assistant, updater...) → nên tách thành sub-sections.

---

### 5. Testing — 7/10

**Phạm vi:** Chất lượng test, coverage case quan trọng, testability.

#### ✅ Điểm mạnh

- **`live-translate.test.ts` rất comprehensive** — 30+ test cases cho `isHallucination` bao phủ:
  - English, Japanese, Korean, Vietnamese patterns
  - Character flooding, n-gram repetition
  - Boundary cases (< 4 chars)

- **`canvas.test.ts`** test `canvasWrapText` đúng cách, có mock `CanvasRenderingContext2D`, cover CJK vs non-CJK.

- **`useAppStore.test.ts`** test CRUD operations với state management, edge cases như `MAX_HISTORY`, `swapLanguages` fallback.

- **Test structure chuẩn** — `describe/it`, `beforeEach` reset state, mock pattern rõ ràng.

- **Vitest + @testing-library/react** — tooling phù hợp.

#### ❌ Điểm trừ

- **Không có test cho components** (TranslatePage, ChatPage, LiveTranslatePage, SettingsPage) — phần lớn UI logic chưa được test.

- **`MAX_CHAT_SESSIONS = 20` không có test** kiểm tra enforcement (và thực tế cũng không enforce).

- **Không có test cho electron IPC handlers** (`electron/ipc/*`).

- **Không có integration test** — luồng end-to-end (type → debounce → translate → display) chưa được verify.

- **`src/utils/__tests__/locale.test.ts`** tồn tại nhưng không đọc được để confirm coverage.

---

### 6. Performance — 8/10

**Phạm vi:** Bottleneck, memory, thuật toán, cấu trúc dữ liệu.

#### ✅ Điểm mạnh

- **Debounce auto-translate** (default 800ms) tránh spam API khi user đang nhập.

- **VAD filter trước Whisper** — chỉ gửi chunk có speech, tiết kiệm API call và giảm latency.

- **Memory bound rõ ràng:**
  - `MAX_HISTORY = 100`
  - `liveSessions` limit 50
  - `MAX_RAW_TRANSCRIPT_CHARS = 50_000`

- **Phonetic (furigana) lazy** — chỉ request sau khi translation xong, không block main result.

- **O(n) tìm `lastAssistantIdx`** trong ChatPage với comment giải thích thay vì O(n²):
  ```tsx
  // ChatPage.tsx — tốt hơn so với .lastIndexOf() bên trong .map()
  const lastAssistantIdx = messages.reduce(
    (acc, m, i) => (m.role === 'assistant' ? i : acc), -1
  )
  ```

- **`requestAnimationFrame`** cho scroll sync flag reset.

- **Image resize trước khi gửi API** (`MAX_IMAGE_SIZE = 1200`).

#### ❌ Điểm trừ

- **`queueRef.current.then()` serial queue** trong LiveTranslatePage — nếu một chunk xử lý lâu, các chunk sau xếp hàng đợi → latency tăng dần. Cần timeout/discard strategy.

- **`chatSessions` không có hard limit** — chỉ `MAX_CHAT_SESSIONS = 20` được define nhưng không enforce → memory leak dài hạn.

---

### 7. Security — 4/5

**Phạm vi:** API key, validate input, không lộ secret.

#### ✅ Điểm mạnh

- **OS Keychain** — API keys lưu trong macOS Keychain/Windows Credential Manager, không trong file.

- **IPC bridge với contextBridge** — renderer không có Node.js access trực tiếp.

- **Security notice UI** trong SettingsPage giải thích cho user.

- **CONTRIBUTING.md** nhắc nhở: "Never hard-code API keys", "New IPC handlers must validate inputs".

- **API keys không lưu vào localStorage** — chỉ `keyStatus` (boolean) được persist.

#### ❌ Điểm trừ

- **`(window as any)` trong App.tsx** bypass TypeScript type safety — risk nhỏ nhưng là bad practice.

- **Token management** cho Chrome Extension không thấy rõ validation ở phía renderer trước khi gửi IPC.

---

### 8. Documentation — 4.5/5

**Phạm vi:** README, comment, hướng dẫn cho developer.

#### ✅ Điểm mạnh

- **README.md rất đầy đủ:** download links, features table, getting started, API keys table, project structure, tech stack, changelog.

- **CONTRIBUTING.md** có: setup, project structure, hướng dẫn thêm provider, thêm language, running tests, code style, commit convention, PR checklist, security notes.

- **JSDoc trên utility functions:**
  ```ts
  /**
   * Split `text` into lines that fit within `maxWidth` pixels on the given canvas context.
   * CJK characters... @param ctx @param text @param maxWidth @returns
   */
  ```

- **Constants có comment engineering-level** giải thích từng magic number (VAD thresholds, Whisper gates).

- **Inline comments cho logic phức tạp** (`biome-ignore` với reason, `processChunk` flow...).

#### ❌ Điểm trừ

- **Không có API docs cho IPC handlers** (`electron/ipc/*.ts`) — các function nhận params nào, trả về gì không có JSDoc.

- **Một số functions trong components thiếu comment** cho đoạn logic phức tạp như scroll sync, styleInitRef pattern.

---

## 💪 Điểm Mạnh Nổi Bật

1. **Kỹ thuật Live Translation pipeline rất cao cấp** — VAD 3-gate + Whisper confidence gate + n-gram hallucination filter + Jaccard similarity dedup là một pipeline production-ready.

2. **Security architecture chuẩn** — IPC bridge + OS Keychain + không lộ API key là mô hình đúng cho Electron apps.

3. **Test coverage cho utils tốt** — `isHallucination` với 30+ cases phản ánh hiểu biết sâu về Whisper behavior.

4. **Constants & defaults tự tài liệu hóa** — mỗi threshold đều có comment giải thích lý do chọn giá trị đó.

5. **i18n system sạch** — `useT()` hook + `TRANSLATIONS` map, dễ thêm ngôn ngữ mới.

6. **CONTRIBUTING.md production-grade** — commit convention, PR checklist, security notes đầy đủ.

---

## 🔧 Điểm Cần Cải Thiện (Ưu Tiên)

### 🔴 Cao — Cần sửa sớm

1. **Enforce `MAX_CHAT_SESSIONS`** trong `createChatSession()`:
   ```ts
   // Thêm vào useAppStore.ts
   if (state.chatSessions.length >= MAX_CHAT_SESSIONS) {
     // remove oldest session before adding new
   }
   ```

2. **Xóa duplicate `getSupportedMimeType()`** trong `LiveTranslatePage.tsx`, import từ `audio.ts`:
   ```ts
   import { getSupportedAudioMimeType } from '../constants/audio'
   ```

3. **Fix `(window as any)` trong App.tsx**:
   ```tsx
   // Thay
   const isMac = (window as any).api?.platform === 'darwin'
   // Thành
   const isMac = window.api?.platform === 'darwin'
   ```

### 🟡 Trung — Nên sửa trong sprint tới

4. **Extract `SpeakButton` component** để xóa 80 dòng duplicate trong TranslatePage.

5. **Tách `LiveTranslatePage.tsx` thành `useLiveTranslate` hook** — logic VAD/pipeline ra khỏi component.

6. **Fix hard-coded strings trong SettingsPage** — dùng i18n:
   ```tsx
   // Thay 'Tự động dịch (Auto)' bằng t.settings_auto_translate_label
   ```

7. **Add timeout/discard cho serial queue** trong `processChunk` để tránh latency stacking.

### 🟢 Thấp — Backlog

8. **Tách `useAppStore`** thành `useTranslateStore`, `useChatStore`, `useSettingsStore`.

9. **Thêm component tests** cho TranslatePage, ChatPage.

10. **Thêm JSDoc** cho electron IPC handlers.

---

## 📊 Radar Chart (Ước Lượng)

```
Correctness     ████████████████████░░░░  84%
Architecture    ████████████████████░░░░░  73%
Code Quality    ████████████████████░░░░░  73%
Maintainability ████████████████████░░░░░  73%
Testing         ██████████████████░░░░░░░  70%
Performance     ████████████████████░░░░  80%
Security        ████████████████████░░░░  80%
Documentation   █████████████████████░░░  90%
```

---

## 📝 Kết Luận

**Lotus Translate** là một project Electron desktop app chất lượng **tốt** với điểm **77.5/100**.

**Điểm nổi bật nhất** là Live Translation pipeline với VAD + Whisper confidence gate — đây là engineering work cẩn thận, có evidence-based thresholds được comment đầy đủ. Security architecture cũng đúng chuẩn cho Electron app.

**Điểm cần cải thiện nhất** là kích thước file (một số pages vượt 4x guideline), duplicate code giữa panels, và `MAX_CHAT_SESSIONS` được định nghĩa nhưng không enforce. Những vấn đề này không ảnh hưởng tính đúng đắn ngay bây giờ nhưng sẽ gây khó khăn khi scale hoặc onboard developer mới.

---

*Report được tạo bởi workflow `score-code` v1.0.0 — 01:11 SA 15/04/2026*
