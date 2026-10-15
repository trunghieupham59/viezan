import { TARGET_LANGUAGES } from '../../constants/providers'
import { useAppStore, useT } from '../../store/useAppStore'
import { Button } from '../ui/atoms'
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

  const handleTargetChange = (lang: string) => {
    recordLangUsage(lang)
    onTargetLangChange(lang)
  }

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-1 min-w-0 items-center overflow-hidden">
        {/* Smart top-3 target language pills */}
        {targetTopLangs.map((code) => (
          <Button
            size="md"
            shape="pill"
            key={code}
            type="button"
            onClick={() => handleTargetChange(code)}
            variant={targetLang === code ? 'primary' : 'neutral'}
            appearance={targetLang === code ? 'soft' : 'ghost'}
            aria-pressed={targetLang === code}
            className="whitespace-nowrap"
          >
            {langNames[code] ?? code}
          </Button>
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
