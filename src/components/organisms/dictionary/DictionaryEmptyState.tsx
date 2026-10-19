import type { Translations } from '../../../i18n'
import { Button } from '../../ui/atoms'
import { BookIcon, LightbulbIcon, TranslateIcon } from '../../ui/icons'
import { EmptyPanelState } from '../../ui/molecules'

export interface DictionaryEmptyStateProps {
  t: Translations
  /** Fills the term field with a sample word; without it the hints are plain text. */
  onHintSelect?: (hint: string) => void
}

const HINT_ICONS = [BookIcon, TranslateIcon, LightbulbIcon] as const

/**
 * Empty state shown in the result panel before any lookup has been
 * performed. Sample-term chips orient new users and, when the page wires
 * `onHintSelect`, fill the search field in one click.
 */
export function DictionaryEmptyState({ t, onHintSelect }: DictionaryEmptyStateProps) {
  return (
    <EmptyPanelState
      icon={<BookIcon />}
      title={t.dictionary_empty_title}
      description={t.dictionary_empty_desc}
    >
      <ul className="dictionary-hint-row" aria-label={t.dictionary_empty_title}>
        {t.dictionary_empty_hints.map((hint, idx) => {
          const HintIcon = HINT_ICONS[idx % HINT_ICONS.length]
          return (
            <li key={hint}>
              {onHintSelect ? (
                <Button
                  size="xs"
                  shape="pill"
                  variant="neutral"
                  appearance="outline"
                  onClick={() => onHintSelect(hint)}
                  className="dictionary-hint-chip"
                >
                  <HintIcon />
                  <span className="dictionary-hint-text">{hint}</span>
                </Button>
              ) : (
                <span className="dictionary-hint-chip dictionary-hint-chip--static">
                  <HintIcon />
                  <span className="dictionary-hint-text">{hint}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </EmptyPanelState>
  )
}
