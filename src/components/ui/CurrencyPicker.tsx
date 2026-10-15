/**
 * CurrencyPicker — compact app-owned dropdown used by the cost dashboard,
 * replacing the OS-native select so it matches every other picker.
 */
import { useMemo } from 'react'
import type { UsageCurrency } from '../../types'
import { USAGE_CURRENCY_OPTIONS } from '../../utils/usageCost'
import { OptionPicker } from './molecules'

interface CurrencyPickerProps {
  value: UsageCurrency
  onChange: (next: UsageCurrency) => void
  ariaLabel: string
  className?: string
}

export function CurrencyPicker({ value, onChange, ariaLabel, className }: CurrencyPickerProps) {
  const options = useMemo(
    () => USAGE_CURRENCY_OPTIONS.map((option) => ({ value: option.code, label: option.label })),
    [],
  )

  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={(next) => onChange(next as UsageCurrency)}
      label={ariaLabel}
      className={className}
    />
  )
}
