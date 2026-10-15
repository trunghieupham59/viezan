import { TARGET_LANGUAGES } from '../../constants/providers'
import { useAppStore, useT } from '../../store/useAppStore'
import { Button } from '../ui/atoms'
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

  const handleSourceChange = (lang: string) => {
    if (lang !== 'auto') recordLangUsage(lang)
    onSourceLangChange(lang)
  }

  return (
    <div className="flex items-center flex-1 min-w-0">
      <div className="flex flex-1 min-w-0 items-center overflow-hidden">
        {/* "Tự động nhận dạng" pill — always first */}
        <Button
          size="md"
          shape="pill"
          type="button"
          onClick={() => onSourceLangChange('auto')}
          variant={sourceLang === 'auto' ? 'primary' : 'neutral'}
          appearance={sourceLang === 'auto' ? 'soft' : 'ghost'}
          aria-pressed={sourceLang === 'auto'}
          className="whitespace-nowrap"
        >
          {isDetectingLang
            ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            : <AutoDetectIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />}
          <span>
            {sourceLang === 'auto' && detectedSourceLang
              ? (langNames[detectedSourceLang] ?? detectedSourceLang)
              : t.lang_auto}
          </span>
        </Button>

        {/* Smart top-3 source language pills */}
        {sourceTopLangs.map((code) => (
          <Button
            size="md"
            shape="pill"
            key={code}
            type="button"
            onClick={() => handleSourceChange(code)}
            variant={sourceLang === code ? 'primary' : 'neutral'}
            appearance={sourceLang === code ? 'soft' : 'ghost'}
            aria-pressed={sourceLang === code}
            className="whitespace-nowrap"
          >
            {langNames[code] ?? code}
          </Button>
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
