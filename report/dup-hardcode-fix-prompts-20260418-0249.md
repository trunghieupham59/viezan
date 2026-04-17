# Fix Prompts — TranslatePage.tsx
**Dựa theo:** `lotus-agent/fix/dup-hardcode-report-20260418-0249.md`  
**Mục đích:** Copy-paste từng prompt vào AI để fix theo thứ tự ưu tiên  
**Thứ tự:** Sprint 1 (High quick wins) → Sprint 2 (Medium) → Sprint 3 (Extract components) → Sprint 4 (Low)

---

## Prompt 1 — 🟠 High: HC-01 — Fix fragile error string matching

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần HC-01.

Vấn đề: TranslatePage.tsx line 368-369 kiểm tra loại lỗi bằng cách substring-match
4 hardcoded strings đa ngôn ngữ ('API key', 'Settings', 'Cài đặt', '設定').
Cực kỳ fragile — thay đổi error message ở service sẽ break logic này.

Thực hiện:

BƯỚC 1 — Thêm isApiKeyError vào useTranslate.ts:
Mở src/hooks/useTranslate.ts.
Sau dòng `const charCount = sourceText.length` (line 56), thêm:

  /**
   * True when the current error is due to a missing or invalid API key.
   * Computed once here instead of via fragile substring matching in the view.
   */
  const isApiKeyError = !!(translateError && (
    !hasKey ||
    translateError === t.translate_error_no_key ||
    translateError.toLowerCase().includes('api key') ||
    translateError.toLowerCase().includes('apikey') ||
    translateError.toLowerCase().includes('unauthorized') ||
    translateError.toLowerCase().includes('invalid key')
  ))

Tambahkan isApiKeyError ke return object (akhir useTranslate):
  isApiKeyError,

BƯỚC 2 — Cập nhật TranslatePage.tsx:
Tambahkan isApiKeyError ke destructure từ useTranslate():
  isApiKeyError,

Line 368-369: Thay toàn bộ điều kiện:
  Cũ:
    {(translateError.includes('API key') || translateError.includes('Settings') ||
      translateError.includes('Cài đặt') || translateError.includes('設定')) && (

  Mới:
    {isApiKeyError && (

Không thay đổi logic khác. Kiểm tra TypeScript compile sau khi xong.
```

---

## Prompt 2 — 🟠 High: DUP-01 — Gộp 2 scroll sync handlers bằng factory

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần DUP-01.

Vấn đề: TranslatePage.tsx lines 66-82 có 2 hàm syncFromSource và syncFromTranslated
là near duplicate — cùng logic, chỉ đổi vai trò source/translated.

Thực hiện trong src/pages/TranslatePage.tsx:

BƯỚC 1 — Thay toàn bộ useEffect scroll-sync (lines 61-91) bằng version dùng factory:

  useEffect(() => {
    const source = sourceScrollRef.current
    const translated = translatedScrollRef.current
    if (!source || !translated) return

    const makeSyncHandler = (
      from: HTMLDivElement,
      to: HTMLDivElement,
      flag: React.MutableRefObject<boolean>
    ) => () => {
      if (flag.current) return
      flag.current = true
      const maxFrom = from.scrollHeight - from.clientHeight
      const ratio = maxFrom > 0 ? from.scrollTop / maxFrom : 0
      to.scrollTop = ratio * (to.scrollHeight - to.clientHeight)
      requestAnimationFrame(() => { flag.current = false })
    }

    const syncFromSource = makeSyncHandler(source, translated, isSyncingScrollRef)
    const syncFromTranslated = makeSyncHandler(translated, source, isSyncingScrollRef)

    source.addEventListener('scroll', syncFromSource, { passive: true })
    translated.addEventListener('scroll', syncFromTranslated, { passive: true })

    return () => {
      source.removeEventListener('scroll', syncFromSource)
      translated.removeEventListener('scroll', syncFromTranslated)
    }
  }, [])

Không thay đổi bất kỳ logic nào khác. Kiểm tra TypeScript compile.
```

---

## Prompt 3 — 🟠 High: HC-02 + HC-03 + HC-05 — Fix 3 magic strings nhỏ

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần HC-02, HC-03, HC-05.

Thực hiện 3 fix độc lập:

PHẦN A — HC-02: Constant cho MIME types (src/constants/image.ts)

Mở src/constants/image.ts, thêm vào cuối file:

  /**
   * Accepted MIME types string for <input type="file" accept="..."> on image pickers.
   * Used in TranslatePage and any other file-input that accepts images.
   */
  export const ACCEPTED_IMAGE_MIME_TYPES = 'image/jpeg,image/png,image/webp,image/gif'

Mở src/pages/TranslatePage.tsx:
- Thêm ACCEPTED_IMAGE_MIME_TYPES vào import từ '../constants/image'
- Line 279: Thay accept="image/jpeg,image/png,image/webp,image/gif"
  bằng: accept={ACCEPTED_IMAGE_MIME_TYPES}

PHẦN B — HC-03: Constant cho default TTS fallback lang (src/constants/providers.ts)

Mở src/constants/providers.ts, thêm vào cuối file:

  /**
   * Fallback language code for TTS when source language is set to 'auto'.
   * 'auto' is not a valid BCP-47 tag for speech synthesis, so we fall back to English.
   */
  export const DEFAULT_TTS_FALLBACK_LANG = 'en'

Mở src/pages/TranslatePage.tsx:
- Thêm DEFAULT_TTS_FALLBACK_LANG vào import từ '../constants/providers'
- Line 303: Thay lang={sourceLang === 'auto' ? 'en' : sourceLang}
  bằng: lang={sourceLang === 'auto' ? DEFAULT_TTS_FALLBACK_LANG : sourceLang}

PHẦN C — HC-05: Bỏ fallback 'Dịch' tiếng Việt (src/pages/TranslatePage.tsx)

Line 254: Thay labelTranslate={t.translate_btn ?? 'Dịch'}
bằng: labelTranslate={t.translate_btn}

Lý do: t.translate_btn đã được định nghĩa trong tất cả locale files (src/i18n/types.ts line 14 không có ?).
Fallback 'Dịch' không cần thiết và sai ngôn ngữ với English locale.

Không thay đổi logic khác. Kiểm tra TypeScript compile.
```

---

## Prompt 4 — 🟡 Medium: HC-04 + HC-06 + HC-07 — Fix hardcode UI text

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần HC-04, HC-06, HC-07.

Thực hiện:

PHẦN A — HC-04: "Using" text trong model-switch toast

Vấn đề: Line 468 TranslatePage.tsx có "Using" hardcode tiếng Anh không qua i18n.

BƯỚC 1 — Kiểm tra src/i18n/types.ts: đã có image_model_switched_body (line 138).
Thêm key mới vào cuối section "Image translation — model switch notice":
  /** Template: "Using {model}" — shown before the body in the model-switch toast */
  image_model_switched_using: string

BƯỚC 2 — Thêm vào src/i18n/locales/en.ts:
  image_model_switched_using: 'Using {model}',

BƯỚC 3 — Thêm vào src/i18n/locales/vi.ts:
  image_model_switched_using: 'Đang dùng {model}',

BƯỚC 4 — Thêm vào src/i18n/locales/ja.ts (nếu tồn tại):
  image_model_switched_using: '{model} を使用中',

BƯỚC 5 — Thêm import tpl vào TranslatePage.tsx (nếu chưa có):
  import { tpl } from '../utils/tpl'

BƯỚC 6 — Line 468 TranslatePage.tsx: Thay
  Cũ:
    Using <strong>{imageSwitchNotice.model}</strong>
    {imageSwitchNotice.provider !== selectedProvider && (
      <> ({imageSwitchNotice.provider})</>
    )}
    {' '}— {t.image_model_switched_body}.
  Mới:
    <strong>{tpl(t.image_model_switched_using, { model: imageSwitchNotice.model })}</strong>
    {imageSwitchNotice.provider !== selectedProvider && (
      <> ({imageSwitchNotice.provider})</>
    )}
    {' '}— {t.image_model_switched_body}

(Bỏ dấu chấm cuối vì nên nằm trong i18n string — xem phần C)

PHẦN B — HC-06: alt="Translated" trên image kết quả

Line 381 TranslatePage.tsx: Thay alt="Translated"
bằng: alt={t.image_translate_title}

PHẦN C — HC-07: Dấu câu hardcode trong toast

Cập nhật i18n để gộp dấu chấm vào cuối string image_model_switched_body:
- src/i18n/locales/en.ts: Kiểm tra giá trị image_model_switched_body, thêm dấu chấm vào cuối nếu chưa có.
- src/i18n/locales/vi.ts: Tương tự.
- src/i18n/locales/ja.ts: Tương tự.

Line 472 TranslatePage.tsx: Thay {' '}— {t.image_model_switched_body}.
bằng: {' '}— {t.image_model_switched_body}

Kiểm tra TypeScript compile sau khi xong.
```

---

## Prompt 5 — 🟡 Medium: DUP-02 — Gộp bottom bar className thành constant

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần DUP-02.

Vấn đề: Cùng className layout "panel footer bar" xuất hiện 2 lần trong TranslatePage.tsx
(line 245 và line 394), chỉ khác nhau 'relative z-20' ở source panel.

Thực hiện trong src/pages/TranslatePage.tsx:

BƯỚC 1 — Thêm constant ở đầu component (trước return, sau các useRef):

  /** Shared Tailwind classes for both panel footer bars */
  const PANEL_FOOTER_CLS =
    'flex-shrink-0 flex items-center justify-between px-4 h-12 ' +
    'border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'

BƯỚC 2 — Line 245-246 (source panel footer): Thay
  Cũ: className="flex-shrink-0 flex items-center justify-between px-4 h-12
                  border-t border-gray-100 dark:border-gray-800 relative z-20 bg-white dark:bg-gray-900"
  Mới: className={`${PANEL_FOOTER_CLS} relative z-20`}

BƯỚC 3 — Line 394-395 (result panel footer): Thay
  Cũ: className="flex-shrink-0 flex items-center justify-between px-4 h-12
                  border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
  Mới: className={PANEL_FOOTER_CLS}

Không thay đổi bất kỳ logic nào khác. Kiểm tra TypeScript compile.
```

---

## Prompt 6 — 🟠 High (Split): SPLIT-04 — Tách TranslateError component

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần SPLIT-04 và HC-01.

Vấn đề: Khối hiển thị lỗi (lines 341-374, ~34 dòng) nên được tách thành component riêng.

Thực hiện:

BƯỚC 1 — Tạo file src/components/translate/TranslateError.tsx:

  import { AlertTriangleIcon, XIcon } from '../ui/icons'

  interface TranslateErrorProps {
    error: string
    /** True when error is due to missing/invalid API key — shows "Open Settings" button */
    isApiKeyError: boolean
    /** True when there is source text or image to retry */
    canRetry: boolean
    onRetry: () => void
    onDismiss: () => void
    onOpenSettings: () => void
    labelRetry: string
    labelOpenSettings: string
    labelDismiss: string
  }

  export function TranslateError({
    error, isApiKeyError, canRetry,
    onRetry, onDismiss, onOpenSettings,
    labelRetry, labelOpenSettings, labelDismiss,
  }: TranslateErrorProps) {
    return (
      <div className="fade-in flex flex-col gap-2">
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30
                        border border-red-200 dark:border-red-900 rounded-lg">
          <AlertTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="flex-1 text-sm text-red-700 dark:text-red-300 break-words">{error}</p>
          <button
            type="button"
            onClick={onDismiss}
            title={labelDismiss}
            className="flex-shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300
                       cursor-pointer transition-colors mt-0.5"
            aria-label={labelDismiss}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onRetry}
            disabled={!canRetry}
            className="btn-secondary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {labelRetry}
          </button>
          {isApiKeyError && (
            <button type="button" onClick={onOpenSettings} className="btn-primary text-xs">
              {labelOpenSettings}
            </button>
          )}
        </div>
      </div>
    )
  }

BƯỚC 2 — Cập nhật src/pages/TranslatePage.tsx:

Thêm import:
  import { TranslateError } from '../components/translate/TranslateError'

Thêm isApiKeyError vào destructure từ useTranslate() (xem Prompt 1).

Lines 341-374: Thay toàn bộ khối translateError ? (...) bằng:

  ) : translateError ? (
    <TranslateError
      error={translateError}
      isApiKeyError={isApiKeyError}
      canRetry={!!(sourceText.trim() || imageAttachment)}
      onRetry={handleTranslate}
      onDismiss={handleDismissError}
      onOpenSettings={() => setActivePage('settings')}
      labelRetry={t.translate_error_retry}
      labelOpenSettings={t.translate_error_open_settings}
      labelDismiss={t.translate_error_dismiss}
    />

Kiểm tra TypeScript compile. Đảm bảo không còn AlertTriangleIcon/XIcon imports
dư thừa trong TranslatePage (chúng vẫn dùng ở chỗ khác — giữ nguyên).
```

---

## Prompt 7 — 🟠 High (Split): SPLIT-02 — Tách TranslateLanguageBar component

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần SPLIT-02.

Vấn đề: Language Bar (lines 157-194, ~38 dòng) nên tách thành component riêng.

Thực hiện:

BƯỚC 1 — Tạo file src/components/translate/TranslateLanguageBar.tsx:

  import { LanguageSelector } from '../LanguageSelector'
  import { AutoDetectIcon, SpinnerIcon, SwapIcon } from '../ui/icons'

  interface TranslateLanguageBarProps {
    targetLang: string
    onTargetLangChange: (lang: string) => void
    detectedSourceLang: string | null
    /** Whether the swap button is enabled */
    canSwap: boolean
    isDetectingLang: boolean
    onSwap: () => void
    langAutoLabel: string
    langNames: Record<string, string>
    swapTitle: string
  }

  export function TranslateLanguageBar({
    targetLang, onTargetLangChange,
    detectedSourceLang, canSwap, isDetectingLang, onSwap,
    langAutoLabel, langNames, swapTitle,
  }: TranslateLanguageBarProps) {
    return (
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2
                      bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        {/* Source: auto-detect badge */}
        <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                        bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                        text-sm text-gray-500 dark:text-gray-400 select-none overflow-hidden">
          <AutoDetectIcon className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" />
          <span className="truncate">{langAutoLabel}</span>
          {detectedSourceLang && (
            <span className="ml-auto pl-1.5 text-xs font-medium text-blue-500 dark:text-blue-400 shrink-0 truncate">
              {langNames[detectedSourceLang] ?? detectedSourceLang}
            </span>
          )}
        </div>

        {/* Swap button */}
        <button
          type="button"
          onClick={onSwap}
          disabled={!canSwap}
          title={swapTitle}
          className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full
                      transition-all duration-200
                      ${!canSwap
                        ? 'text-gray-200 dark:text-gray-700 cursor-not-allowed'
                        : 'cursor-pointer text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/50 dark:hover:text-blue-400'}`}
        >
          {isDetectingLang
            ? <SpinnerIcon className="w-4 h-4 animate-spin" />
            : <SwapIcon className="w-4 h-4" />}
        </button>

        {/* Target language selector */}
        <div className="flex-1">
          <LanguageSelector value={targetLang} onChange={onTargetLangChange} includeAuto={false} />
        </div>
      </div>
    )
  }

BƯỚC 2 — Cập nhật src/pages/TranslatePage.tsx:

Thêm import:
  import { TranslateLanguageBar } from '../components/translate/TranslateLanguageBar'
  import { IMAGE_TRANSLATED_SENTINEL } from '../hooks/useTranslate'  // đã có

Lines 157-194: Thay toàn bộ "Language bar" section bằng:

      {/* Language bar */}
      <TranslateLanguageBar
        targetLang={targetLang}
        onTargetLangChange={setTargetLang}
        detectedSourceLang={detectedSourceLang}
        canSwap={!!(translatedText && translatedText !== IMAGE_TRANSLATED_SENTINEL && !imageAttachment)}
        isDetectingLang={isDetectingLang}
        onSwap={handleSwapLanguages}
        langAutoLabel={t.lang_auto}
        langNames={t.lang_names}
        swapTitle={t.translate_swap}
      />

Kiểm tra có thể xóa AutoDetectIcon, SpinnerIcon, SwapIcon khỏi import TranslatePage
nếu không còn dùng ở chỗ nào khác trong file. Kiểm tra TypeScript compile.
```

---

## Prompt 8 — 🟠 High (Split): SPLIT-01 — Tách TranslateToolbar component

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần SPLIT-01.

Vấn đề: Toolbar row (lines 96-155, ~60 dòng) nên tách thành component riêng.

Thực hiện:

BƯỚC 1 — Tạo file src/components/translate/TranslateToolbar.tsx:

  import { ModelSelector } from '../ModelSelector'
  import { AutoTranslateToggle } from '../ui/AutoTranslateToggle'
  import { PhoneticToggle } from '../ui/PhoneticToggle'
  import { ChevronDownIcon } from '../ui/icons'
  import type { TranslationStyle } from '../../types'
  import { IMAGE_TRANSLATED_SENTINEL } from '../../hooks/useTranslate'

  interface TranslateToolbarProps {
    translationStyle: TranslationStyle
    onStyleChange: (style: TranslationStyle) => void
    autoTranslate: boolean
    onAutoTranslateChange: (v: boolean) => void
    showFurigana: boolean
    onShowFuriganaChange: (v: boolean) => void
    isPhoneticLoading: boolean
    // i18n
    labelStyleLabel: string
    labelStyleFriendly: string
    labelStyleNeutral: string
    labelStyleProfessional: string
    labelStyleBusiness: string
    labelStyleSlack: string
    labelStylePolite: string
    labelStyleTechnical: string
    labelPhonetic: string
    titleAutoMode: string
    titleManualMode: string
    labelAutoMode: string
    labelManualMode: string
  }

  export function TranslateToolbar({
    translationStyle, onStyleChange,
    autoTranslate, onAutoTranslateChange,
    showFurigana, onShowFuriganaChange, isPhoneticLoading,
    labelStyleLabel, labelStyleFriendly, labelStyleNeutral,
    labelStyleProfessional, labelStyleBusiness, labelStyleSlack,
    labelStylePolite, labelStyleTechnical,
    labelPhonetic, titleAutoMode, titleManualMode, labelAutoMode, labelManualMode,
  }: TranslateToolbarProps) {
    return (
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 overflow-hidden
                      bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex-1 min-w-0 overflow-hidden">
          <ModelSelector />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Style dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 whitespace-nowrap">{labelStyleLabel}</span>
            <div className="relative">
              <select
                value={translationStyle}
                onChange={(e) => onStyleChange(e.target.value as TranslationStyle)}
                className={`text-xs font-medium px-2.5 py-1.5 pr-6 rounded-full border appearance-none cursor-pointer
                            transition-colors duration-200 outline-none
                            ${translationStyle !== 'neutral'
                              ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-400'
                              : 'bg-gray-100 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                            }`}
              >
                <option value="friendly">{labelStyleFriendly}</option>
                <option value="neutral">{labelStyleNeutral}</option>
                <option value="professional">{labelStyleProfessional}</option>
                <option value="business">{labelStyleBusiness}</option>
                <option value="slack">{labelStyleSlack}</option>
                <option value="polite">{labelStylePolite}</option>
                <option value="technical">{labelStyleTechnical}</option>
              </select>
              <div className="pointer-events-none absolute right-2 inset-y-0 flex items-center">
                <ChevronDownIcon className="w-3 h-3 text-gray-400" />
              </div>
            </div>
          </div>

          <AutoTranslateToggle
            autoTranslate={autoTranslate}
            onChange={onAutoTranslateChange}
            titleAuto={titleAutoMode}
            titleManual={titleManualMode}
            labelAuto={labelAutoMode}
            labelManual={labelManualMode}
          />

          <PhoneticToggle
            showFurigana={showFurigana}
            onChange={onShowFuriganaChange}
            label={labelPhonetic}
            isLoading={isPhoneticLoading}
          />
        </div>
      </div>
    )
  }

BƯỚC 2 — Cập nhật src/pages/TranslatePage.tsx:

Thêm import:
  import { TranslateToolbar } from '../components/translate/TranslateToolbar'
  import { IMAGE_TRANSLATED_SENTINEL } from '../hooks/useTranslate'  // đã có

Lines 94-155: Thay toàn bộ "Toolbar" section bằng:

      {/* Toolbar */}
      <TranslateToolbar
        translationStyle={translationStyle}
        onStyleChange={setTranslationStyle}
        autoTranslate={autoTranslate}
        onAutoTranslateChange={setAutoTranslate}
        showFurigana={showFurigana}
        onShowFuriganaChange={setShowFurigana}
        isPhoneticLoading={
          showFurigana &&
          !phoneticText &&
          (isTranslating || (!!translatedText && translatedText !== IMAGE_TRANSLATED_SENTINEL))
        }
        labelStyleLabel={t.translate_style_label}
        labelStyleFriendly={t.translate_style_friendly}
        labelStyleNeutral={t.translate_style_neutral}
        labelStyleProfessional={t.translate_style_professional}
        labelStyleBusiness={t.translate_style_business}
        labelStyleSlack={t.translate_style_slack}
        labelStylePolite={t.translate_style_polite}
        labelStyleTechnical={t.translate_style_technical}
        labelPhonetic={t.translate_phonetic}
        titleAutoMode={t.translate_mode_auto_title}
        titleManualMode={t.translate_mode_manual_title}
        labelAutoMode={t.translate_mode_auto}
        labelManualMode={t.translate_mode_manual}
      />

Kiểm tra có thể xóa ChevronDownIcon khỏi import TranslatePage nếu không còn dùng.
Kiểm tra TypeScript compile.
```

---

## Prompt 9 — 🟠 High (Split): SPLIT-03 + SPLIT-05 — Tách SourcePanelActions và ResultPanelActions

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần SPLIT-03 và SPLIT-05.

Vấn đề: 2 bottom action bars (source 82 dòng + result 59 dòng) nên tách ra component riêng.

PHẦN A — Tạo src/components/translate/SourcePanelActions.tsx:

  import { VoiceRecorder } from '../VoiceRecorder'
  import { ClearButton } from '../ui/ClearButton'
  import { ImageTranslateButton } from '../ui/ImageTranslateButton'
  import { RewriteButton } from '../ui/RewriteButton'
  import { SpeakButton } from '../ui/SpeakButton'
  import { TranslateButton } from '../ui/TranslateButton'
  import { AlertTriangleIcon } from '../ui/icons'
  import { MAX_INPUT_CHARS } from '../../constants/providers'
  import { DEFAULT_TTS_FALLBACK_LANG } from '../../constants/providers'

  interface SourcePanelActionsProps {
    // Mode
    autoTranslate: boolean
    isTranslating: boolean
    isVoiceActive: boolean
    isVoiceInterim: boolean
    isRewriting: 'source' | 'translated' | null
    // Content state
    sourceText: string
    sourceLang: string
    charCount: number
    hasImage: boolean
    useWhisper: boolean
    // TTS state
    speakingPanel: string | null
    speakLoading: string | null
    // Handlers
    onTranslate: () => void
    onVoiceTranscript: (text: string, isFinal: boolean) => void
    onVoiceRecordingChange: (isRecording: boolean) => void
    onImageButtonClick: () => void
    onSpeak: (panel: 'source' | 'translated', text: string, lang: string) => void
    onRewrite: (panel: 'source' | 'translated') => void
    onClear: () => void
    // i18n
    labelTranslate: string
    labelTranslating: string
    labelVoiceRecord: string
    labelVoiceStop: string
    labelVoiceTranscribing: string
    labelVoiceRecording: string
    labelImageTranslate: string
    labelCharLimit: string
    labelChars: string
    labelSpeak: string
    labelSpeakStop: string
    labelRewrite: string
    labelRewriting: string
    labelClear: string
  }

  export function SourcePanelActions({
    autoTranslate, isTranslating, isVoiceActive, isVoiceInterim,
    isRewriting, sourceText, sourceLang, charCount, hasImage, useWhisper,
    speakingPanel, speakLoading,
    onTranslate, onVoiceTranscript, onVoiceRecordingChange, onImageButtonClick,
    onSpeak, onRewrite, onClear,
    labelTranslate, labelTranslating, labelVoiceRecord, labelVoiceStop,
    labelVoiceTranscribing, labelVoiceRecording, labelImageTranslate,
    labelCharLimit, labelChars, labelSpeak, labelSpeakStop,
    labelRewrite, labelRewriting, labelClear,
  }: SourcePanelActionsProps) {
    return (
      <div className="flex items-center gap-2">
        {!autoTranslate && (
          <TranslateButton
            isTranslating={isTranslating}
            disabled={!sourceText.trim() && !hasImage}
            onClick={onTranslate}
            labelTranslate={labelTranslate}
            labelLoading={labelTranslating}
          />
        )}
        <VoiceRecorder
          sourceLang={sourceLang}
          onTranscript={onVoiceTranscript}
          onRecordingChange={onVoiceRecordingChange}
          titleRecord={labelVoiceRecord}
          titleStop={labelVoiceStop}
          labelTranscribing={labelVoiceTranscribing}
          labelRecording={labelVoiceRecording}
          useWhisper={useWhisper}
        />
        <ImageTranslateButton
          onClick={onImageButtonClick}
          title={labelImageTranslate}
        />
        {!isVoiceActive && (
          charCount > MAX_INPUT_CHARS ? (
            <span className="flex items-center gap-1 text-xs tabular-nums text-amber-500 font-medium" title={labelCharLimit}>
              <AlertTriangleIcon className="w-3 h-3 flex-shrink-0" />
              {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
            </span>
          ) : (
            <span className="text-xs tabular-nums text-gray-400">
              {charCount.toLocaleString()} {labelChars}
            </span>
          )
        )}
      </div>
    )
  }

  // Right side sub-section — only shown when sourceText is present and not voice active
  interface SourcePanelActionsRightProps {
    sourceText: string
    sourceLang: string
    speakingPanel: string | null
    speakLoading: string | null
    isRewriting: 'source' | 'translated' | null
    onSpeak: (panel: 'source' | 'translated', text: string, lang: string) => void
    onRewrite: (panel: 'source' | 'translated') => void
    onClear: () => void
    labelSpeak: string
    labelSpeakStop: string
    labelRewrite: string
    labelRewriting: string
    labelClear: string
  }

  export function SourcePanelActionsRight({
    sourceText, sourceLang, speakingPanel, speakLoading, isRewriting,
    onSpeak, onRewrite, onClear,
    labelSpeak, labelSpeakStop, labelRewrite, labelRewriting, labelClear,
  }: SourcePanelActionsRightProps) {
    return (
      <div className="flex items-center gap-2">
        <SpeakButton
          panel="source"
          text={sourceText}
          lang={sourceLang === 'auto' ? DEFAULT_TTS_FALLBACK_LANG : sourceLang}
          speakingPanel={speakingPanel}
          speakLoading={speakLoading}
          onSpeak={onSpeak}
          labelSpeak={labelSpeak}
          labelStop={labelSpeakStop}
        />
        <RewriteButton
          panel="source"
          isRewriting={isRewriting}
          onRewrite={onRewrite}
          labelRewrite={labelRewrite}
          labelRewriting={labelRewriting}
        />
        <ClearButton
          onClick={onClear}
          label={labelClear}
        />
      </div>
    )
  }

PHẦN B — Tạo src/components/translate/ResultPanelActions.tsx:

  import { CopyButton } from '../ui/CopyButton'
  import { DownloadImageButton } from '../ui/DownloadImageButton'
  import { RewriteButton } from '../ui/RewriteButton'
  import { SpeakButton } from '../ui/SpeakButton'

  interface ResultPanelActionsProps {
    translatedText: string
    targetLang: string
    editedImageUrl: string | null
    hasImageRegions: boolean
    hasImageAttachment: boolean
    copied: boolean
    isRewriting: 'source' | 'translated' | null
    speakingPanel: string | null
    speakLoading: string | null
    charLabel: string
    onSpeak: (panel: 'source' | 'translated', text: string, lang: string) => void
    onDownloadEdited: () => void
    onDownloadTranslated: () => void
    onRewrite: (panel: 'source' | 'translated') => void
    onCopy: () => void
    labelChars: string
    labelSpeak: string
    labelSpeakStop: string
    labelDownload: string
    labelRewrite: string
    labelRewriting: string
    labelCopy: string
    labelCopied: string
  }

  export function ResultPanelActions({
    translatedText, targetLang, editedImageUrl,
    hasImageRegions, hasImageAttachment,
    copied, isRewriting, speakingPanel, speakLoading,
    onSpeak, onDownloadEdited, onDownloadTranslated, onRewrite, onCopy,
    labelChars, labelSpeak, labelSpeakStop, labelDownload,
    labelRewrite, labelRewriting, labelCopy, labelCopied,
  }: ResultPanelActionsProps) {
    return (
      <>
        <span className="text-xs text-gray-400 tabular-nums">
          {translatedText && !editedImageUrl
            ? `${translatedText.length.toLocaleString()} ${labelChars}`
            : ''}
        </span>
        {(translatedText || editedImageUrl) && (
          <div className="flex items-center gap-2">
            {!editedImageUrl && (
              <SpeakButton
                panel="translated"
                text={translatedText}
                lang={targetLang}
                speakingPanel={speakingPanel}
                speakLoading={speakLoading}
                onSpeak={onSpeak}
                labelSpeak={labelSpeak}
                labelStop={labelSpeakStop}
              />
            )}
            {editedImageUrl && (
              <DownloadImageButton
                title={labelDownload}
                onClick={onDownloadEdited}
              />
            )}
            {hasImageRegions && hasImageAttachment && !editedImageUrl && (
              <DownloadImageButton
                title={labelDownload}
                onClick={onDownloadTranslated}
              />
            )}
            {!editedImageUrl && (
              <RewriteButton
                panel="translated"
                isRewriting={isRewriting}
                onRewrite={onRewrite}
                labelRewrite={labelRewrite}
                labelRewriting={labelRewriting}
              />
            )}
            {!editedImageUrl && (
              <CopyButton
                copied={copied}
                onClick={onCopy}
                labelCopy={labelCopy}
                labelCopied={labelCopied}
              />
            )}
          </div>
        )}
      </>
    )
  }

PHẦN C — Cập nhật src/pages/TranslatePage.tsx:

Thêm imports:
  import { SourcePanelActions, SourcePanelActionsRight } from '../components/translate/SourcePanelActions'
  import { ResultPanelActions } from '../components/translate/ResultPanelActions'
  import { ACCEPTED_IMAGE_MIME_TYPES } from '../constants/image'  // từ Prompt 3

Lines 245-327 (source panel footer): Thay bằng:

          <div className={`${PANEL_FOOTER_CLS} relative z-20`}>
            <SourcePanelActions
              autoTranslate={autoTranslate}
              isTranslating={isTranslating}
              isVoiceActive={isVoiceActive}
              isVoiceInterim={isVoiceInterim}
              isRewriting={isRewriting}
              sourceText={sourceText}
              sourceLang={sourceLang}
              charCount={charCount}
              hasImage={!!imageAttachment}
              useWhisper={keyStatus.openai}
              speakingPanel={speakingPanel}
              speakLoading={speakLoading}
              onTranslate={handleTranslate}
              onVoiceTranscript={handleVoiceTranscript}
              onVoiceRecordingChange={handleVoiceRecordingChange}
              onImageButtonClick={() => fileInputRef.current?.click()}
              onSpeak={handleSpeak}
              onRewrite={handleRewrite}
              onClear={handleClearSource}
              labelTranslate={t.translate_btn}
              labelTranslating={t.translate_btn_loading}
              labelVoiceRecord={t.voice_record}
              labelVoiceStop={t.voice_stop}
              labelVoiceTranscribing={t.voice_transcribing}
              labelVoiceRecording={t.voice_whisper_mode}
              labelImageTranslate={t.image_translate_title}
              labelCharLimit={t.translate_limit}
              labelChars={t.translate_chars}
              labelSpeak={t.translate_speak}
              labelSpeakStop={t.translate_speak_stop}
              labelRewrite={t.translate_rewrite}
              labelRewriting={t.translate_rewriting}
              labelClear={t.translate_clear}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_MIME_TYPES}
              className="hidden"
              onChange={handleFileInputChange}
            />
            {sourceText && !isVoiceActive && (
              <SourcePanelActionsRight
                sourceText={sourceText}
                sourceLang={sourceLang}
                speakingPanel={speakingPanel}
                speakLoading={speakLoading}
                isRewriting={isRewriting}
                onSpeak={handleSpeak}
                onRewrite={handleRewrite}
                onClear={handleClearSource}
                labelSpeak={t.translate_speak}
                labelSpeakStop={t.translate_speak_stop}
                labelRewrite={t.translate_rewrite}
                labelRewriting={t.translate_rewriting}
                labelClear={t.translate_clear}
              />
            )}
          </div>

Lines 394-453 (result panel footer): Thay bằng:

          <div className={PANEL_FOOTER_CLS}>
            <ResultPanelActions
              translatedText={translatedText}
              targetLang={targetLang}
              editedImageUrl={editedImageUrl}
              hasImageRegions={!!imageRegions}
              hasImageAttachment={!!imageAttachment}
              copied={copied}
              isRewriting={isRewriting}
              speakingPanel={speakingPanel}
              speakLoading={speakLoading}
              onSpeak={handleSpeak}
              onDownloadEdited={handleDownloadEditedImage}
              onDownloadTranslated={handleDownloadTranslatedImage}
              onRewrite={handleRewrite}
              onCopy={handleCopy}
              labelChars={t.translate_chars}
              labelSpeak={t.translate_speak}
              labelSpeakStop={t.translate_speak_stop}
              labelDownload={t.image_translate_download}
              labelRewrite={t.translate_rewrite}
              labelRewriting={t.translate_rewriting}
              labelCopy={t.translate_copy}
              labelCopied={t.translate_copied}
            />
          </div>

Kiểm tra TypeScript compile. TranslatePage.tsx sau khi xong nên còn ~180-200 dòng.
```

---

## Prompt 10 — 🟡 Medium (Split): SPLIT-06 — Tách ImageSwitchToast (optional)

```
Đọc file lotus-agent/fix/dup-hardcode-report-20260418-0249.md phần SPLIT-06.

Vấn đề: Toast cảnh báo model switch (lines 457-485, ~28 dòng) có thể tách để dễ test.
(Optional — 28 dòng ngay ngưỡng, nhưng nên tách vì logic phức tạp)

Thực hiện:

BƯỚC 1 — Tạo file src/components/translate/ImageSwitchToast.tsx:

  import { tpl } from '../../utils/tpl'
  import { AlertTriangleIcon, XIcon } from '../ui/icons'

  interface ImageSwitchToastProps {
    model: string
    provider: string
    currentProvider: string
    onDismiss: () => void
    titleLabel: string
    bodyLabel: string
    usingLabel: string  // template: "Using {model}" — từ HC-04 fix
  }

  export function ImageSwitchToast({
    model, provider, currentProvider, onDismiss,
    titleLabel, bodyLabel, usingLabel,
  }: ImageSwitchToastProps) {
    return (
      <div className="pointer-events-auto fixed bottom-16 left-1/2 -translate-x-1/2 z-50
                      max-w-sm w-full mx-4 fade-in">
        <div className="flex items-start gap-2.5 px-4 py-3
                        bg-red-600 dark:bg-red-700 text-white
                        rounded-xl shadow-lg shadow-red-900/20">
          <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-snug">{titleLabel}</p>
            <p className="text-xs opacity-90 leading-snug mt-0.5">
              <strong>{tpl(usingLabel, { model })}</strong>
              {provider !== currentProvider && <> ({provider})</>}
              {' '}— {bodyLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 text-white/70 hover:text-white cursor-pointer mt-0.5"
            aria-label="Dismiss"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

BƯỚC 2 — Cập nhật src/pages/TranslatePage.tsx:

Thêm import:
  import { ImageSwitchToast } from '../components/translate/ImageSwitchToast'

Lines 457-485: Thay toàn bộ imageSwitchNotice block bằng:

      {imageSwitchNotice && (
        <ImageSwitchToast
          model={imageSwitchNotice.model}
          provider={imageSwitchNotice.provider}
          currentProvider={selectedProvider}
          onDismiss={() => setImageSwitchNotice(null)}
          titleLabel={t.image_model_switched_title}
          bodyLabel={t.image_model_switched_body}
          usingLabel={t.image_model_switched_using}
        />
      )}

Kiểm tra TypeScript compile.
```

---

## Thứ tự thực hiện gợi ý

| Prompt | ID | Effort | Ghi chú |
|---|---|---|---|
| **1** | HC-01 | S | Fix fragile error matching — unblock SPLIT-04 |
| **2** | DUP-01 | S | Factory scroll sync — 2 hàm → 1 |
| **3** | HC-02, HC-03, HC-05 | S | 3 constant fixes đơn giản, cần trước Prompt 9 |
| **4** | HC-04, HC-06, HC-07 | M | i18n fixes cho toast và alt text |
| **5** | DUP-02 | S | Constant className — cần trước Prompt 9 |
| **6** | SPLIT-04 | M | TranslateError — nhỏ nhất, làm trước để quen pattern |
| **7** | SPLIT-02 | M | TranslateLanguageBar |
| **8** | SPLIT-01 | M | TranslateToolbar |
| **9** | SPLIT-03 + SPLIT-05 | L | SourcePanelActions + ResultPanelActions — làm cùng lúc |
| **10** | SPLIT-06 | S | ImageSwitchToast — optional, làm sau cùng |

*S=Small (<1h), M=Medium (1-2h), L=Large (2-4h)*

**Kết quả sau khi hoàn thành tất cả prompts:**
- `TranslatePage.tsx`: ~488 dòng → ~150-180 dòng (layout skeleton + scroll sync + wiring)
- 5 component mới trong `src/components/translate/`
- Error logic type-safe, không còn string matching fragile
- 3 constant mới trong `src/constants/`
- 1 key i18n mới `image_model_switched_using` trong tất cả locale files

---

*Fix prompts được tạo theo báo cáo `dup-hardcode-report-20260418-0249.md` — Lotus Agent*
