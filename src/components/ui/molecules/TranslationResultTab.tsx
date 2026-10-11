import type { KeyboardEvent, Ref } from 'react'
import type { Provider, TranslationComparisonStatus } from '../../../types'
import { ProviderIcon } from '../../ProviderIcon'
import { Button } from '../atoms'
import { ModelRunStatus } from './ModelRunStatus'

export interface TranslationResultTabProps {
  id: string
  controls: string
  selected: boolean
  provider: Provider
  modelName: string
  providerName: string
  status: TranslationComparisonStatus
  statusLabel: string
  tabRef?: Ref<HTMLButtonElement>
  onClick: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/** Navigation for an existing result; it never changes the selected model set. */
export function TranslationResultTab({
  id,
  controls,
  selected,
  provider,
  modelName,
  providerName,
  status,
  statusLabel,
  tabRef,
  onClick,
  onKeyDown,
}: TranslationResultTabProps) {
  return (
    <Button
      ref={tabRef}
      id={id}
      size="sm"
      shape="rect"
      variant={selected ? 'primary' : 'neutral'}
      appearance={selected ? 'soft' : 'ghost'}
      role="tab"
      aria-label={`${modelName} · ${providerName} · ${statusLabel}`}
      aria-selected={selected}
      aria-controls={controls}
      aria-busy={status === 'loading'}
      tabIndex={selected ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="translation-result-tab"
    >
      <ProviderIcon provider={provider} />
      <span className="translation-result-tab__label">{modelName}</span>
      <ModelRunStatus status={status} label={statusLabel} compact />
    </Button>
  )
}
