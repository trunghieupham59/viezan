# Báo Cáo Chấm Điểm Source Code — Viezan

> **Loại bài:** Project lớn (Electron + React desktop app)  
> **Phạm vi đánh giá:** `src/` và `electron/`  
> **Ngày chấm:** 22/04/2026  
> **Công cụ:** skill `score-code` v1.0.0

---

## Tổng Quan

| Tiêu chí | Điểm | Mức |
|---|---|---|
| 1. Correctness | 72 | 🟡 Tốt |
| 2. Code Quality | 68 | 🟡 Trung bình–Tốt |
| 3. Structure | 80 | 🟢 Tốt |
| 4. Maintainability | 62 | 🟡 Trung bình |
| 5. Architecture | 70 | 🟡 Tốt |
| 6. Testing | 45 | 🔴 Yếu |
| 7. Documentation | 75 | 🟡 Tốt |
| 8. Performance | 74 | 🟡 Tốt |
| 9. Security | 78 | 🟢 Tốt |
| 10. Reliability | 65 | 🟡 Trung bình |
| **Tổng cộng** | **68.9 / 100** | 🟡 **Khá** |

---

## Chi Tiết Từng Tiêu Chí

---

### 1. Correctness — 72/100

**Phạm vi:** Kết quả đúng, logic đúng, xử lý edge cases.

#### ✅ Điểm tốt

- **CJK wrapping đúng:** `canvasWrapText()` trong `src/utils/canvas.ts` tách biệt xử lý CJK (mỗi ký tự là một token) vs. ngôn ngữ Latin (split theo whitespace) — đây là edge case phức tạp và đã được xử lý đúng.
  ```ts
  const isCJK = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7...]/
  ```

- **Audio MIME fallback:** `getSupportedAudioMimeType()` trong `src/constants/audio.ts` thử theo thứ tự ưu tiên và trả về `null` nếu không hỗ trợ — không crash.

- **Chunked translation:** `electron/ipc/translate.ts` chia văn bản dài thành chunks để tránh vượt context limit của model.

- **TTS fallback chain:** Nếu OpenAI TTS lỗi → thử Gemini → Edge TTS (WebSocket miễn phí) → ElevenLabs. Bảo đảm user luôn nhận được âm thanh.

- **Image validation:** `ACCEPTED_IMAGE_MIME_TYPES`, `MAX_IMAGE_SIZE` được check trước khi gửi lên API.

#### ❌ Điểm yếu

- **`IMAGE_TRANSLATED_SENTINEL`** là một magic string (`"__IMAGE_TRANSLATED__"` hoặc tương tự) dùng để phân biệt trạng thái — nếu AI model vô tình trả về chuỗi này thì logic bị sai.

- **Thiếu boundary check** trong một số async flows: ví dụ `useLiveTranslate.ts` không rõ có cleanup khi component unmount giữa chừng trong lúc đang stream hay không.

- **Language detect** chỉ dùng heuristic prompt AI — không có fallback nếu model trả về tên ngôn ngữ không khớp danh sách `LANGUAGES`.

**Kết luận:** Đúng phần lớn, còn sót vài edge case nhỏ → **72/100**

---

### 2. Code Quality — 68/100

**Phạm vi:** Naming, clean code, hàm ngắn, DRY, magic number.

#### ✅ Điểm tốt

- **Naming nhất quán:** `useLiveTranslate`, `useTranslate`, `canvasWrapText`, `getRecommendedModel` — tên hàm/hook đều rõ ràng.

- **Constants tách riêng:** `COPY_FEEDBACK_DURATION_MS`, `IMAGE_AUTO_TRANSLATE_DELAY_MS`, `MAX_INPUT_CHARS` — không có magic number trực tiếp trong component/page.

- **Store slices:** `chatSlice`, `historySlice`, `settingsSlice` — mỗi slice một file, tập trung đúng trách nhiệm.

- **Custom hooks tách biệt:** `useTTS`, `useVoiceInput`, `useTypewriter` — mỗi hook một concern.

#### ❌ Điểm yếu

- **File cực dài:** `electron/ipc/translate.ts` có **778 dòng**, `tts.ts` **511 dòng**, `chat.ts` **389 dòng** — vi phạm Single Responsibility rõ ràng.

- **Lặp pattern provider:** Trong mỗi IPC handler (`translate.ts`, `chat.ts`, `tts.ts`) đều có cùng cấu trúc:
  ```ts
  if (provider === 'gemini') { ... }
  else if (provider === 'claude') { ... }
  else if (provider === 'openai') { ... }
  ```
  Logic này lặp 3 lần ở 3 file khác nhau — vi phạm DRY nghiêm trọng.

- **`preload.ts` 283 dòng** chứa toàn bộ context bridge API — nên tách theo domain (translate, tts, chat...).

**Kết luận:** Tốt ở mức component/hook, nhưng IPC layer có vấn đề nghiêm trọng về file size và DRY → **68/100**

---

### 3. Structure — 80/100

**Phạm vi:** Tổ chức module, file, layer trong codebase.

#### ✅ Điểm tốt

- **Phân tầng rõ ràng:**
  ```
  src/
  ├── components/    (UI thuần)
  │   ├── chat/
  │   ├── live/
  │   ├── translate/
  │   └── ui/
  ├── pages/         (page-level logic)
  ├── hooks/         (business logic UI)
  ├── services/      (API call wrappers)
  ├── store/         (global state)
  │   └── slices/
  ├── utils/         (pure functions)
  ├── constants/     (config/constants)
  ├── types/         (TypeScript types)
  └── i18n/          (localization)
  ```
  Cấu trúc này rất rõ ràng, dễ điều hướng.

- **Electron layer tách biệt hoàn toàn:**
  ```
  electron/
  ├── main.ts
  ├── preload.ts
  └── ipc/          (mỗi domain một file)
  ```

- **Components đã được tách theo domain:** `src/components/translate/`, `chat/`, `live/` — dễ tìm component thuộc feature nào.

- **Tests đặt cạnh code:** `__tests__/` đặt trong `src/utils/`, `src/store/`, `src/pages/`, `electron/ipc/` — đúng convention.

#### ❌ Điểm yếu

- **`electron/ipc/translate.ts` 778 dòng** nên được tách thành `translate/gemini.ts`, `translate/claude.ts`, `translate/openai.ts` và một `translate/index.ts` điều phối.

- **`src/services/`** chỉ có 2 file là `chatService.ts` và `translationService.ts` — nhưng logic thực sự nằm ở `hooks/` và `electron/ipc/` — vai trò của services layer chưa đủ rõ.

**Kết luận:** Cấu trúc tổng thể rất tốt, tắc nghẽn chính là IPC files quá dài → **80/100**

---

### 4. Maintainability — 62/100

**Phạm vi:** Coupling, extensibility, dễ sửa, dễ mở rộng.

#### ✅ Điểm tốt

- **Thêm provider mới có 1 điểm khởi đầu rõ:** `src/constants/providers.ts` khai báo `PROVIDERS` array — đây là nguồn sự thật duy nhất cho danh sách provider.

- **IPC constants tập trung:** `electron/ipc/ipcConstants.ts` — channel names không bị scatter.

- **`errorUtils.ts`** tập trung logic parse lỗi từ các provider — dễ cập nhật khi provider đổi error format.

- **Config tách khỏi logic:** Settings (API key, model, language) lưu trong store và keychain, không hard-code trong business logic.

#### ❌ Điểm yếu

- **Thêm 1 provider mới phải sửa N file:** `translate.ts`, `chat.ts`, `tts.ts`, `models.ts`, `providers.ts`, `preload.ts` — không có abstraction nào giúp cô lập sự thay đổi. Đây là vấn đề Open/Closed Principle.

- **3 file IPC siêu dài** tạo ra high coupling nội tại — sửa logic Gemini translation dễ vô tình ảnh hưởng logic Claude/OpenAI cùng file.

- **`useAppStore.ts` chứa cả CoreSlice** inline thay vì tách thành `coreSlice` — khi cần sửa phải mở file root store.

- **Không có feature flag / toggle** — khó disable một provider hoặc một feature khi có lỗi production.

**Kết luận:** Trung bình, sửa chỗ này dễ vỡ chỗ khác, đặc biệt khi thêm/sửa provider → **62/100**

---

### 5. Architecture — 70/100

**Phạm vi:** Thiết kế tổng thể, pattern, dependency direction.

#### ✅ Điểm tốt

- **Electron IPC pattern đúng chuẩn:** `main` ↔ `preload` (contextBridge) ↔ `renderer` — không expose Node APIs trực tiếp ra renderer.

- **Zustand + Slices:** Phù hợp với quy mô project này — không over-engineer với Redux, nhưng vẫn có tổ chức.

- **React Custom Hooks** tách business logic ra khỏi component tree — testable và reusable.

- **Không có circular dependency rõ ràng** giữa các layer (renderer không gọi thẳng IPC, phải qua `window.api`).

- **TypeScript types centralized** tại `src/types/index.ts` — dễ tìm và nhất quán.

#### ❌ Điểm yếu

- **Thiếu Provider Adapter Pattern:** Cả 3 IPC handlers (`translate`, `chat`, `tts`) đều implement provider switching bằng `if/else` thay vì dùng strategy pattern hoặc provider factory:
  ```ts
  // Nên có:
  interface TranslationProvider { translate(params): Promise<string> }
  class GeminiProvider implements TranslationProvider { ... }
  class ClaudeProvider implements TranslationProvider { ... }
  ```

- **`src/services/`** không thực sự là service layer — `chatService.ts` và `translationService.ts` chỉ là thin wrappers gọi `window.api`. Các hooks như `useTranslate` mới thực sự chứa business logic.

- **Local HTTP server** trong `electron/ipc/localServer.ts` — không rõ mục đích trong kiến trúc tổng thể (subtitle? chrome extension bridge?). Nếu là để giao tiếp với chrome extension, nên document rõ hơn.

**Kết luận:** Architecture ổn, nhưng thiếu abstraction ở tầng provider → **70/100**

---

### 6. Testing — 45/100

**Phạm vi:** Chất lượng test, coverage, testability.

#### ✅ Điểm tốt

- **Test infrastructure đầy đủ:** `vitest.config.ts`, `src/test/setup.ts`, `biome.json` cho linting.

- **Test directories tồn tại** ở đúng vị trí: `src/utils/__tests__/`, `src/store/__tests__/`, `src/pages/__tests__/`, `electron/ipc/__tests__/`.

- **`canvas.ts` được tách ra** với mục đích rõ ràng là "independently testable" (có comment trong file).

- **Pure functions** trong `utils/` (tpl.ts, locale.ts, imageUtils.ts) dễ unit test.

#### ❌ Điểm yếu

- **Coverage ước lượng thấp:** Với 778 dòng trong `translate.ts` và 511 dòng `tts.ts`, khả năng test coverage của IPC layer rất thấp nếu không có extensive mocking.

- **IPC handlers khó test:** Tất cả business logic nằm trong IPC handlers phụ thuộc vào `electron`, API key, network — cần nhiều setup để test đúng cách.

- **Không thấy integration test** cho toàn bộ luồng translate → result → copy.

- **Hooks có side effects** (gọi `window.api.*`) — cần mock phức tạp, không rõ đã được test đầy đủ.

- **Thiếu snapshot test** cho UI components.

**Kết luận:** Có hạ tầng test nhưng coverage thực tế ước tính thấp, IPC layer gần như không testable một cách tự động → **45/100**

---

### 7. Documentation — 75/100

**Phạm vi:** README, comment, hướng dẫn developer.

#### ✅ Điểm tốt

- **README.md** có đầy đủ: mô tả project, features, screenshots, hướng dẫn build/run.

- **ARCHITECTURE.md** giải thích cấu trúc tổng thể — điểm rất hiếm thấy ở personal project.

- **CONTRIBUTING.md** hướng dẫn contributor — cho thấy project mature.

- **JSDoc tốt trong `canvas.ts`:**
  ```ts
  /**
   * Split `text` into lines that fit within `maxWidth` pixels on the given canvas context.
   * CJK characters (Chinese, Japanese, Korean) have no word boundaries...
   * @param ctx    - A CanvasRenderingContext2D with `font` already set
   * @param text   - The text to wrap.
   * @param maxWidth - Maximum width in pixels for each line.
   * @returns An array of line strings.
   */
  ```

- **`SECURITY.md`** tồn tại — project quan tâm đến security documentation.

#### ❌ Điểm yếu

- **IPC handlers thiếu comment:** `translate.ts` (778 dòng) và `tts.ts` (511 dòng) có rất ít comment giải thích "tại sao" — đặc biệt logic phức tạp như chunking, fallback chain, streaming.

- **Không có API docs** cho `window.api` surface (preload.ts 283 dòng) — developer mới phải đọc toàn bộ preload để biết interface.

- **i18n types và locales** không có hướng dẫn cách thêm ngôn ngữ mới.

**Kết luận:** Docs ở level project rất tốt, thiếu ở level code trong các file phức tạp → **75/100**

---

### 8. Performance — 74/100

**Phạm vi:** Độ phức tạp, bottleneck, cấu trúc dữ liệu phù hợp.

#### ✅ Điểm tốt

- **Debounce image auto-translate:** `IMAGE_AUTO_TRANSLATE_DELAY_MS = 300` — tránh trigger liên tục khi paste.

- **Streaming translation:** `translate:live-stream` dùng IPC streaming thay vì chờ toàn bộ response — UX tốt hơn và cảm giác nhanh hơn.

- **Typewriter effect** (`useTypewriter`) — display text dần dần thay vì dump toàn bộ text ngay lập tức, giảm DOM re-render.

- **Chunked translation** cho văn bản dài — tránh timeout và vượt context window.

- **Edge TTS qua WebSocket** — zero cost, low latency cho TTS fallback.

#### ❌ Điểm yếu

- **Canvas re-render toàn bộ** mỗi khi cần update overlay text — không có dirty tracking, với ảnh nhiều vùng text có thể tốn kém.

- **Zustand store** chứa `translationHistory` (array) — khi history lớn, serialize/deserialize toàn bộ vào localStorage mỗi lần có thể chậm. Không thấy pagination hay lazy loading.

- **`LANG_TO_BCP47` map** là plain object — OK với 50-100 ngôn ngữ, nhưng không phải Map.

**Kết luận:** Performance ổn với use-case thực tế, còn vài điểm có thể tối ưu nhưng không nghiêm trọng → **74/100**

---

### 9. Security — 78/100

**Phạm vi:** API key handling, input validation, injection.

#### ✅ Điểm tốt

- **API key trong Keychain hệ thống:** `electron/ipc/keychain.ts` dùng macOS Keychain — không lưu plaintext.

- **`safeStorage` encryption:** `electron/ipc/storage.ts` dùng `electron.safeStorage.encryptString()` cho backup storage — mã hóa tại rest.

- **Context Bridge hạn chế surface:** `preload.ts` chỉ expose các hàm cụ thể qua `contextBridge.exposeInMainWorld` — renderer không có quyền truy cập Node.js/Electron APIs trực tiếp.

- **Không có API key trong source code:** Toàn bộ keys được lưu runtime qua keychain/storage.

- **`nodeIntegration: false`** (default trong Electron modern) — an toàn hơn.

#### ❌ Điểm yếu

- **Local HTTP server** (`localServer.ts`) — cần kiểm tra có validate request origin không. Nếu bất kỳ process nào trên localhost đều có thể gọi, đây là potential attack surface.

- **IPC handlers không validate input type:** Ví dụ `translate.ts` nhận params từ renderer — nếu renderer bị XSS/injection, có thể gửi payload bất thường. Cần thêm input validation/sanitization ở IPC layer.

- **Image data từ clipboard/file** — không rõ có sanitize trước khi xử lý không, potential for malicious SVG/image exploits.

**Kết luận:** Security tốt ở key management, cần cải thiện input validation ở IPC boundary → **78/100**

---

### 10. Reliability — 65/100

**Phạm vi:** Error handling, robustness, không crash với input bất thường.

#### ✅ Điểm tốt

- **`errorUtils.ts`** centralize parsing lỗi từ các AI provider — dễ cập nhật khi provider đổi format error.

- **TTS fallback chain** — nếu một provider fail, tự động thử provider tiếp theo.

- **`translateError` state** trong store — UI nhận biết lỗi và hiển thị cho user thay vì crash.

- **`useTranslate` hook** có try/catch và set error state.

- **`COPY_FEEDBACK_DURATION_MS`** — timeout cho copy feedback tránh state stuck.

#### ❌ Điểm yếu

- **Nhiều async operations thiếu cleanup:** Hooks như `useLiveTranslate` có stream đang chạy — nếu component unmount giữa chừng, có thể có memory leak hoặc setState on unmounted component.

- **`translate.ts` 778 dòng** — với nhiều `try/catch` nested và nhiều provider paths, khó đảm bảo tất cả error paths đều được handle.

- **Không có retry logic** cho translation (chỉ TTS có fallback). Nếu translate fail lần đầu do timeout, user phải thủ công retry.

- **Local server (`localServer.ts`)** — nếu port đã bị chiếm, behavior không rõ.

- **Stream translation:** Nếu stream bị ngắt giữa chừng, không rõ partial result được handle thế nào.

**Kết luận:** Error handling có ở nhiều chỗ nhưng không đồng đều — critical paths (streaming, live translate) cần thêm robustness → **65/100**

---

## Tổng Kết

### Điểm mạnh nổi bật

1. **Cấu trúc thư mục xuất sắc** — phân tầng rõ ràng, dễ điều hướng.
2. **Security ở tầng key management rất tốt** — Keychain + safeStorage.
3. **TTS fallback chain thông minh** — UX resilient.
4. **Documentation level project** (README + ARCHITECTURE + CONTRIBUTING) rất hiếm.
5. **TypeScript strict** với types tập trung — ít lỗi runtime.

### Điểm cần cải thiện ưu tiên cao

1. **🔴 Testing (45/100)** — Cần viết test coverage, đặc biệt cho utility functions và store slices.
2. **🟡 IPC layer quá dài** — `translate.ts` 778 dòng, `tts.ts` 511 dòng cần tách theo provider.
3. **🟡 Maintainability (62/100)** — Áp dụng Strategy/Adapter pattern cho provider switching.
4. **🟡 Reliability (65/100)** — Thêm cleanup trong hooks, retry logic cho translate.

### Khuyến nghị hành động

| Ưu tiên | Action | Impact |
|---|---|---|
| P1 | Tách `translate.ts` → `translate/gemini.ts`, `translate/claude.ts`, `translate/openai.ts` | Maintainability + Code Quality |
| P1 | Viết unit test cho `src/utils/`, `src/store/slices/` | Testing |
| P2 | Implement `TranslationProvider` interface / strategy pattern | Architecture + Maintainability |
| P2 | Thêm cleanup (`AbortController`) trong streaming hooks | Reliability |
| P3 | Validate input ở IPC layer | Security + Reliability |
| P3 | Tách `preload.ts` theo domain | Code Quality |

---

*Báo cáo được tạo tự động bởi workflow `score-code` — viezanagent*
