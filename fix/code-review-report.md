# 📊 Code Review Report — Lotus Translate

> Ngày: 14/04/2026 | Reviewer: AI Code Analyst

---

## 🏆 Điểm tổng thể: **62 / 100**

| Tiêu chí | Điểm | Ghi chú |
|----------|------|---------|
| Code Quality / DRY | 55 | Duplication nặng (LANG_TO_BCP47, Spinner SVG, Toggle pattern) |
| Maintainability | 50 | File quá lớn: SettingsPage 1587 dòng, LiveTranslatePage 1367, TranslatePage 1140 |
| Logic / Correctness | 65 | Bug trong `swapLanguages`, dead code, console.log production |
| Performance | 70 | Một số tính toán thừa trong render, nhưng dùng useCallback/useRef đúng |
| Architecture | 60 | Business logic nhúng thẳng trong component, không có custom hooks |
| TypeScript Safety | 75 | Types tốt ở types/index.ts, nhưng có một số `as Record<string, unknown>` casts |
| Readability | 65 | Comment tốt nhưng file quá lớn rất khó navigate |

---

## 🐛 Bugs Tìm Thấy

### Bug 1 — `swapLanguages` Dead Code (useAppStore.ts:165)
```ts
// BUG: cả 2 nhánh của ternary đều trả về cùng 1 giá trị!
const newSourceLang = state.sourceLang === 'auto' ? state.targetLang : state.targetLang
//                                                  ^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^
//                                                  IDENTICAL — ternary vô nghĩa
```

### Bug 2 — Dead Code trong `handleNewChat` (ChatPage.tsx:440)
```ts
const sessions = useAppStore.getState().chatSessions
if (sessions.length > MAX_CHAT_SESSIONS) {
  // handled by store — no-op here   ← ĐÂY LÀ DEAD CODE, làm gì đâu
}
```

### Bug 3 — Console.log debug trong production (TranslatePage.tsx)
```ts
// Có 7 console.log/warn/error debug statements trong handleSpeak
console.log('[tts] handleSpeak called! panel:', panel, '...')
console.log('[tts] Calling speakText, panel:', panel, 'voice:', ttsVoice)
console.log('[tts] Result:', result.success, 'provider:', ...)
// v.v.
```

---

## 🔴 Vấn Đề Nghiêm Trọng

### 1. File quá lớn — Vi phạm Single Responsibility Principle

| File | Dòng | Vấn đề |
|------|------|---------|
| `SettingsPage.tsx` | **1587** | 5 feature areas khác nhau trong 1 file |
| `LiveTranslatePage.tsx` | **1367** | VAD logic + UI + streaming trong 1 component |
| `TranslatePage.tsx` | **1140** | TTS logic + image + voice + scroll trong 1 component |
| `ChatPage.tsx` | **822** | Chấp nhận được nhưng có thể tách |

### 2. Code Duplication

**`LANG_TO_BCP47`** định nghĩa 2 lần:
- `src/pages/TranslatePage.tsx` (dòng 93–99)
- `src/components/VoiceRecorder.tsx` (dòng 36–41)

**`getSupportedMimeType()`** định nghĩa 2 lần:
- `src/components/VoiceRecorder.tsx` (dòng 50–62)
- `src/pages/LiveTranslatePage.tsx` (dòng 260–263)

**Toggle Switch UI** lặp lại **6+ lần** trong SettingsPage với code giống hệt nhau:
```jsx
<button className={`... ${enabled ? 'bg-blue-600' : 'bg-gray-300'}`}>
  <span className={`... ${enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
</button>
```

**Spinner SVG** được copy-paste **15+ lần** trên toàn bộ codebase.

### 3. Hardcoded Strings (Không qua i18n)

`SettingsPage.tsx` có nhiều string tiếng Việt hardcoded:
```ts
setExtTokensError('Không thể kết nối — đảm bảo app đang chạy qua Electron.')
setExtTokensError('Không thể tải danh sách token.')
'Kéo vào thanh bookmark của trình duyệt'
'Quản lý Token'
'Tạo Token Mới'
// ... và nhiều hơn nữa
```

### 4. TTS Logic Phức Tạp Nhúng Trong Component

`handleSpeak` trong `TranslatePage.tsx` (dòng 148–257) là một hàm 110 dòng xử lý:
- Web Audio API setup
- Base64 decoding
- PCM manual decoding
- OS fallback speech synthesis
- Error handling

→ Nên được extract thành custom hook `useTTS`.

### 5. Performance Issue trong Render (ChatPage.tsx:649)
```ts
// Tạo array mới trên MỖI render để tìm lastIndexOf
const isLastAssistant =
  msg.role === 'assistant' &&
  idx === messages.map((m) => m.role).lastIndexOf('assistant')
```

→ Nên tính một lần bên ngoài `.map()`.

---

## 🟡 Vấn Đề Trung Bình

### 6. useAppStore gọi 2 lần trong SettingsPage (dòng 17 và 130)
```ts
// Lần 1
const { setKeyStatus, autoTranslate, ... } = useAppStore()
// ...
// Lần 2 (dòng 130)
const { selectedProvider, selectedModels, targetLang } = useAppStore()
```

### 7. Type được định nghĩa trong component (SettingsPage.tsx:234)
```ts
// Type định nghĩa trong function body — nên ở module level
type ExtTokenInfo = { id: string; name: string; createdAt: number; expiresAt: number }
```

### 8. `defaultTokenName()` hardcode locale 'vi-VN'
```ts
const today = new Date().toLocaleDateString('vi-VN', ...)
// Không respect app locale setting của user
```

---

## ✅ Điểm Tốt

- TypeScript types đầy đủ và rõ ràng trong `types/index.ts`
- Store Zustand được thiết kế tốt với `partialize` cho persistence
- Comments giải thích kỹ thuật rất tốt (đặc biệt LiveTranslatePage VAD)
- `useCallback` và `useRef` được dùng đúng để tránh stale closures
- Cleanup trong `useEffect` (removeEventListener, clearTimeout)
- Accessible: `aria-hidden`, `aria-label` được sử dụng
- i18n system tốt qua `useT()` hook

---

## 📋 Kế Hoạch Refactor

### Phase 1 — Fix Bugs (Ưu tiên cao nhất)
1. Fix `swapLanguages` ternary bug
2. Xóa dead code `handleNewChat`
3. Xóa console.log debug statements

### Phase 2 — Extract Shared Code
4. Tạo `src/constants/audio.ts` (LANG_TO_BCP47, getSupportedMimeType)
5. Tạo `src/components/ui/ToggleSwitch.tsx`
6. Tạo `src/components/ui/Spinner.tsx`

### Phase 3 — Extract Custom Hooks
7. Tạo `src/hooks/useTTS.ts` (từ TranslatePage)
8. Tạo `src/hooks/useVoiceInput.ts` (shared giữa ChatPage và TranslatePage)

### Phase 4 — Decompose Large Files
9. Split SettingsPage thành các section components
10. Fix performance issue trong ChatPage render
