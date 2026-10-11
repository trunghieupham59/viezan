import { TARGET_LANGUAGES } from '../../constants/providers'
import { useAppStore, useT } from '../../store/useAppStore'
import { LanguageOverflowPicker } from '../ui/molecules'
import { getSmartTopLangs } from './langSelectorUtils'

interface TargetLanguageSelectorProps {
  targetLang: string
  onTargetLangChange: (lang: string) => void
  langNames: Record<string, string>
}

export function TargetLanguageSelector({
  targetLang,
  onTargetLangChange,
  langNames,
}: TargetLanguageSelectorProps) {
  const { langUsage, recordLangUsage } = useAppStore()
  const t = useT()

  const targetTopLangs = getSmartTopLangs(langUsage, targetLang)
  const targetIsOther = !targetTopLangs.includes(targetLang)

  const pillBase =
    'btn-language-tab relative flex-shrink-0 whitespace-nowrap'
  const pillActive = 'text-gray-700 dark:text-gray-200'
  const pillInactive = 'text-gray-500 dark:text-gray-400'

  const handleTargetChange = (lang: string) => {
    recordLangUsage(lang)
    onTargetLangChange(lang)
  }

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-1 min-w-0 items-center overflow-hidden">
        {/* Smart top-3 target language pills */}
        {targetTopLangs.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => handleTargetChange(code)}
            className={`${pillBase} ${targetLang === code ? pillActive : pillInactive}`}
          >
            {langNames[code] ?? code}
            {targetLang === code && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-600 dark:bg-gray-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      <LanguageOverflowPicker
        value={targetLang}
        options={TARGET_LANGUAGES}
        onChange={handleTargetChange}
        getLabel={(l) => langNames[l.code] ?? l.name}
        label={t.language_picker_more}
        searchPlaceholder={t.language_picker_search_placeholder}
        noResultsLabel={t.language_picker_no_results}
        active={targetIsOther}
      />
    </div>
  )
}
