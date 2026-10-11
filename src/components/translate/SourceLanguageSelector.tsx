import { TARGET_LANGUAGES } from '../../constants/providers'
import { useAppStore, useT } from '../../store/useAppStore'
import { AutoDetectIcon, SpinnerIcon } from '../ui/icons'
import { LanguageOverflowPicker } from '../ui/molecules'
import { getSmartTopLangs } from './langSelectorUtils'

interface SourceLanguageSelectorProps {
  sourceLang: string
  onSourceLangChange: (lang: string) => void
  detectedSourceLang: string | null
  isDetectingLang: boolean
  langNames: Record<string, string>
}

export function SourceLanguageSelector({
  sourceLang,
  onSourceLangChange,
  detectedSourceLang,
  isDetectingLang,
  langNames,
}: SourceLanguageSelectorProps) {
  const { langUsage, recordLangUsage } = useAppStore()
  const t = useT()

  const sourceTopLangs = getSmartTopLangs(langUsage, sourceLang)
  const sourceIsOther = sourceLang !== 'auto' && !sourceTopLangs.includes(sourceLang)

  const pillBase =
    'btn-language-tab relative flex-shrink-0 whitespace-nowrap'
  const pillActive = 'text-gray-700 dark:text-gray-200'
  const pillInactive = 'text-gray-500 dark:text-gray-400'

  const handleSourceChange = (lang: string) => {
    if (lang !== 'auto') recordLangUsage(lang)
    onSourceLangChange(lang)
  }

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-1 min-w-0 items-center overflow-hidden">
        {/* "Tự động nhận dạng" pill — always first */}
        <button
          type="button"
          onClick={() => onSourceLangChange('auto')}
          className={`${pillBase} flex items-center gap-1.5 ${sourceLang === 'auto' ? pillActive : pillInactive}`}
        >
          {isDetectingLang
            ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            : <AutoDetectIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />}
          <span>
            {sourceLang === 'auto' && detectedSourceLang
              ? (langNames[detectedSourceLang] ?? detectedSourceLang)
              : t.lang_auto}
          </span>
          {sourceLang === 'auto' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-600 dark:bg-gray-400 rounded-full" />
          )}
        </button>

        {/* Smart top-3 source language pills */}
        {sourceTopLangs.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => handleSourceChange(code)}
            className={`${pillBase} ${sourceLang === code ? pillActive : pillInactive}`}
          >
            {langNames[code] ?? code}
            {sourceLang === code && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-600 dark:bg-gray-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <LanguageOverflowPicker
        value={sourceLang === 'auto' ? null : sourceLang}
        options={TARGET_LANGUAGES}
        onChange={handleSourceChange}
        getLabel={(l) => langNames[l.code] ?? l.name}
        label={t.language_picker_more}
        searchPlaceholder={t.language_picker_search_placeholder}
        noResultsLabel={t.language_picker_no_results}
        active={sourceIsOther}
      />
    </div>
  )
}
