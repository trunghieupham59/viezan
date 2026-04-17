# Fix Prompts — split-ui-component
**Dựa theo:** `lotus-agent/report/split-ui-report-20260417-2206.md`  
**Mục đích:** Copy-paste từng prompt vào AI để fix theo thứ tự ưu tiên

---

## Prompt 1 — 🟠 High: Thêm icon mới + Thay SVG inline (HistoryPage + Sidebar)

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần "SVG Icon Hardcode Inline".

Thực hiện các thay đổi sau theo đúng thứ tự:

BƯỚC 1 — Thêm icon mới vào registry:
1. Thêm ChatBubbleIcon vào src/components/ui/icons/navigation.tsx (code mẫu ở [High-SVG-01])
2. Thêm ClockIcon vào src/components/ui/icons/navigation.tsx (code mẫu ở [High-SVG-02])
3. Thêm ReuseIcon vào src/components/ui/icons/actions.tsx (code mẫu ở [High-SVG-06])
   (index.ts tự export * from các file — không cần sửa)

BƯỚC 2 — Thay SVG inline bằng icon component:
- src/components/Sidebar.tsx:74      → ChatBubbleIcon className="w-5 h-5"
- src/components/Sidebar.tsx:103     → ClockIcon className="w-5 h-5"
- src/pages/HistoryPage.tsx:93       → ClockIcon className="w-7 h-7 text-gray-300 dark:text-gray-600"
- src/pages/HistoryPage.tsx:123      → ChevronDownIcon (đã có) — giữ nguyên className động với rotate-180
- src/pages/HistoryPage.tsx:170      → ReuseIcon className="w-3.5 h-3.5"
- src/pages/HistoryPage.tsx:184      → TrashIcon className="w-3.5 h-3.5" (đã có)
- src/pages/HistoryPage.tsx:221      → ChatBubbleIcon className="w-7 h-7 text-gray-300 dark:text-gray-600"
- src/pages/HistoryPage.tsx:257      → ChevronDownIcon (đã có) — giữ nguyên className động
- src/pages/HistoryPage.tsx:309      → ChatBubbleIcon className="w-3.5 h-3.5"
- src/pages/HistoryPage.tsx:323      → TrashIcon className="w-3.5 h-3.5"
- src/pages/HistoryPage.tsx:390      → MicrophoneIcon className="w-7 h-7 text-purple-300 dark:text-purple-700" (đã có)
- src/pages/HistoryPage.tsx:428      → ChevronDownIcon (đã có) — giữ nguyên className động
- src/pages/HistoryPage.tsx:495      → MicrophoneIcon className="w-3.5 h-3.5" (đã có)
- src/pages/HistoryPage.tsx:510      → TrashIcon className="w-3.5 h-3.5"

Thêm import { ChatBubbleIcon, ClockIcon, ReuseIcon, ChevronDownIcon, TrashIcon, MicrophoneIcon } from '../components/ui/icons' vào HistoryPage.tsx.
Thêm import { ChatBubbleIcon, ClockIcon } from './ui/icons' vào Sidebar.tsx.

Không thay đổi logic, chỉ thay SVG inline bằng icon component.
```

---

## Prompt 2 — 🟠 High: Thay SVG inline (ImageTranslator + LiveTranslatePage)

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần [High-SVG-03] và [High-SVG-10].

Thực hiện:

1. src/components/ImageTranslator.tsx — line 157-160:
   Thay <svg className={`w-7 h-7 transition-colors ${isDragging ? 'text-emerald-500' : 'text-gray-400'}`} ...>...</svg>
   bằng <UploadIcon className={`w-7 h-7 transition-colors ${isDragging ? 'text-emerald-500' : 'text-gray-400'}`} />
   Thêm UploadIcon vào import từ './ui/icons'

2. src/pages/LiveTranslatePage.tsx — line 78-80:
   Thay <svg className="flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600" ...>...</svg>
   bằng <ArrowRightIcon className="flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600" />
   Thêm ArrowRightIcon vào import từ '../components/ui/icons'

Không thay đổi logic khác.
```

---

## Prompt 3 — 🟠 High: Tách DownloadImageButton + HistoryDeleteButton

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần [High-Dup-01] và [High-Dup-02].

Thực hiện:

BƯỚC 1 — Tạo DownloadImageButton:
Tạo file src/components/ui/DownloadImageButton.tsx với nội dung theo code mẫu ở [High-Dup-01].
Cập nhật src/pages/TranslatePage.tsx:
- Import DownloadImageButton
- Line ~823-840: thay download button editedImageUrl bằng <DownloadImageButton title={t.image_translate_download} onClick={() => { const a = document.createElement('a'); a.href = editedImageUrl; a.download = `translated_${Date.now()}.png`; a.click() }} />
- Line ~843-855: thay download button imageRegions bằng <DownloadImageButton title={t.image_translate_download} onClick={handleDownloadTranslatedImage} />

BƯỚC 2 — Tạo HistoryDeleteButton:
Tạo file src/components/ui/HistoryDeleteButton.tsx với nội dung theo code mẫu ở [High-Dup-02].
(Dùng TrashIcon từ import { TrashIcon } from './icons' — không SVG inline)
Cập nhật src/pages/HistoryPage.tsx:
- Import HistoryDeleteButton
- Line ~179-188 (TranslationHistoryTab): thay delete button bằng <HistoryDeleteButton onClick={() => deleteHistoryItem(item.id)} label={t.history_delete} />
- Line ~316-327 (ChatHistoryTab): thay delete button bằng <HistoryDeleteButton onClick={() => deleteChatSession(session.id)} label={t.history_chat_delete} />
- Line ~503-515 (LiveHistoryTab): thay delete button bằng <HistoryDeleteButton onClick={() => deleteLiveSession(session.id)} label={t.history_live_delete} />

Không thay đổi behavior.
```

---

## Prompt 4 — 🟡 Medium: Fix label hardcode AutoTranslateToggle + BookmarkletDragLink

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần [UI-Fix-01] và [UI-Fix-02].

Thực hiện:

BƯỚC 1 — AutoTranslateToggle.tsx:
- Thêm 2 props: labelAuto: string, labelManual: string vào interface
- Thay <span>{autoTranslate ? 'Auto' : 'Manual'}</span> bằng <span>{autoTranslate ? labelAuto : labelManual}</span>
- Cập nhật src/pages/TranslatePage.tsx: thêm labelAuto={t.translate_mode_auto} labelManual={t.translate_mode_manual}
- Thêm key translate_mode_auto và translate_mode_manual vào src/i18n/locales/en.ts, vi.ts, ja.ts:
  * en: translate_mode_auto = "Auto", translate_mode_manual = "Manual"
  * vi: translate_mode_auto = "Tự động", translate_mode_manual = "Thủ công"
  * ja: translate_mode_auto = "自動", translate_mode_manual = "手動"

BƯỚC 2 — BookmarkletDragLink.tsx:
- Thêm prop: label: string vào interface
- Thay hardcode "🌐 Lotus Translate" (line 56) bằng {label}
- Cập nhật src/pages/settings/BrowserIntegrationSection.tsx: thêm label={t.settings_bookmarklet_label}
- Thêm key settings_bookmarklet_label vào tất cả locale files:
  * en/vi/ja: settings_bookmarklet_label = "🌐 Lotus Translate"

Kiểm tra TypeScript compile sau khi xong.
```

---

## Prompt 5 — 🟡 Medium: Tách MessageBubble ra file riêng

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần [Med-Large-01].

Thực hiện:

1. Tạo file src/components/chat/MessageBubble.tsx:
   - Di chuyển toàn bộ function MessageBubble (line 36-148) từ src/pages/ChatPage.tsx vào file mới
   - Di chuyển cả type definition của props (interface ẩn trong function params)
   - Di chuyển các constants DOT_ANIM_DELAY_STEP_S nếu chúng chỉ dùng trong MessageBubble
   - Export: export function MessageBubble(...)
   - Import cần thiết: AppLogoIcon, MarkdownText, ClipboardIcon, RefreshIcon, UserIcon từ đường dẫn tương đối mới

2. Cập nhật src/pages/ChatPage.tsx:
   - Xóa function MessageBubble cũ
   - Thêm: import { MessageBubble } from '../components/chat/MessageBubble'
   - Kiểm tra constants DOT_ANIM_DELAY_STEP_S còn dùng ở ChatPage không — nếu không thì di chuyển luôn

Sau khi xong kiểm tra TypeScript compile không có lỗi.
```

---

## Prompt 6 — 🟡 Medium: Tách 3 HistoryTab ra file riêng

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần [Med-Large-02], [Med-Large-03], [Med-Large-04].

Thực hiện:

1. Tạo thư mục src/pages/history/

2. Tạo src/pages/history/TranslationHistoryTab.tsx:
   - Di chuyển function TranslationHistoryTab (line 42-201) từ HistoryPage.tsx
   - Mang theo các imports cần thiết (useAppStore, useT, HistoryItem, v.v.)
   - Export: export function TranslationHistoryTab()

3. Tạo src/pages/history/ChatHistoryTab.tsx:
   - Di chuyển function ChatHistoryTab (line 204-339)
   - Mang theo các imports cần thiết
   - Export: export function ChatHistoryTab()

4. Tạo src/pages/history/LiveHistoryTab.tsx:
   - Di chuyển function LiveHistoryTab (line 342-527)
   - Mang theo các imports cần thiết
   - Export: export function LiveHistoryTab()

5. Cập nhật src/pages/HistoryPage.tsx:
   - Thêm imports từ ./history/
   - Xóa 3 function lớn đã tách
   - GIỮ LẠI trong HistoryPage.tsx: ProviderBadge (8 dòng), formatTime, langLabel — chúng nhỏ và dùng trong các tab mới

   LƯU Ý: ProviderBadge, formatTime, langLabel cần được export từ HistoryPage.tsx hoặc tạo file shared src/pages/history/historyUtils.ts nếu các tab mới cần import chúng.

Kiểm tra TypeScript compile sau mỗi file tạo mới.
```

---

## Prompt 7 — 🟡 Medium: Di chuyển DragOverlay + Thay emoji

```
Đọc file lotus-agent/report/split-ui-report-20260417-2206.md phần [Med-Misplaced-01], [Med-Emoji-01], [Med-Emoji-02].

Thực hiện:

BƯỚC 1 — Di chuyển DragOverlay:
- Copy nội dung src/components/translate/DragOverlay.tsx → src/components/ui/DragOverlay.tsx
- Cập nhật import trong DragOverlay mới: UploadIcon từ './icons' (thay vì '../ui/icons')
- Cập nhật src/pages/TranslatePage.tsx: đổi import DragOverlay từ '../components/translate/DragOverlay' → '../components/ui/DragOverlay'
- Cập nhật src/pages/ChatPage.tsx: đổi import DragOverlay từ '../components/translate/DragOverlay' → '../components/ui/DragOverlay'
- Xóa src/components/translate/DragOverlay.tsx (sau khi đã cập nhật tất cả imports)

BƯỚC 2 — Thay emoji ⚠:
- src/pages/TranslatePage.tsx line ~706:
  Thay: ⚠ {charCount...}
  Bằng: <AlertTriangleIcon className="w-3 h-3 flex-shrink-0" /> (bọc trong flex span — xem code mẫu [Med-Emoji-01])
  Thêm AlertTriangleIcon vào import từ icon registry

- src/pages/settings/BrowserIntegrationSection.tsx line ~400 và ~411:
  Thay: <span>⚠</span>
  Bằng: <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
  Thêm AlertTriangleIcon vào import từ '../../components/ui/icons'

Kiểm tra TypeScript compile sau khi xong.
```
