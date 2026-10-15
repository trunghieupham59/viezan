import { type RefObject, useMemo } from 'react'
import type { Language } from '../../../types'
import { OptionPickerPanel, type PickerOption } from './OptionPickerPanel'

export interface LanguagePickerPanelProps {
  id?: string
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: (restoreFocus: boolean) => void
  value: string | null
  options: readonly Language[]
  onChange: (language: string) => void
  getLabel: (language: Language) => string
  label: string
  searchPlaceholder: string
  noResultsLabel: string
}

/** Searchable language list: maps `Language` onto the generic option panel. */
export function LanguagePickerPanel({
  options,
  getLabel,
  ...panelProps
}: LanguagePickerPanelProps) {
  const pickerOptions = useMemo<PickerOption[]>(() => options.map((language) => {
    const label = getLabel(language)
    return {
      value: language.code,
      label,
      hint: language.code !== 'auto' && language.nativeName !== label ? language.nativeName : undefined,
      searchText: `${language.name} ${language.nativeName} ${language.code}`,
    }
  }), [getLabel, options])

  return <OptionPickerPanel {...panelProps} options={pickerOptions} />
}
