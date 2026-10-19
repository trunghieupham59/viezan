import { type RefObject, useMemo } from 'react'
import type { Language } from '../../../types'
import { OptionPickerPanel, type OptionPickerPanelProps, type PickerOption } from './OptionPickerPanel'

export interface LanguagePickerPanelProps extends Omit<OptionPickerPanelProps, 'options' | 'searchPlaceholder' | 'noResultsLabel'> {
  anchorRef: RefObject<HTMLElement | null>
  options: readonly Language[]
  getLabel: (language: Language) => string
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
