import { LANGUAGES, TARGET_LANGUAGES } from '../constants/providers'
import { useT } from '../store/useAppStore'
import { LanguagePicker } from './ui/molecules'

interface LanguageSelectorProps {
  value: string
  onChange: (lang: string) => void
  includeAuto?: boolean
  label?: string
  labelVisuallyHidden?: boolean
  disabled?: boolean
  status?: string
  statusBusy?: boolean
  variant?: 'field' | 'inline'
  className?: string
}

export function LanguageSelector({
  value,
  onChange,
  includeAuto = false,
  label,
  labelVisuallyHidden = false,
  disabled = false,
  status,
  statusBusy = false,
  variant,
  className,
}: LanguageSelectorProps) {
  const t = useT()
  const options = includeAuto ? LANGUAGES : TARGET_LANGUAGES

  return (
    <LanguagePicker
      value={value}
      options={options}
      onChange={onChange}
      getLabel={(language) => t.lang_names[language.code] ?? language.name}
      label={label}
      labelVisuallyHidden={labelVisuallyHidden}
      searchPlaceholder={t.language_picker_search_placeholder}
      noResultsLabel={t.language_picker_no_results}
      status={status}
      statusBusy={statusBusy}
      disabled={disabled}
      variant={variant}
      className={className}
    />
  )
}
