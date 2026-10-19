import { Button } from '../atoms'
import '../../../styles/molecules.css'

export interface DictionaryEntryChip {
  key: string
  text: string
  pronunciation?: string
}

export interface DictionaryEntryParagraph {
  key: string
  label: string
  text: string
}

export interface DictionaryEntrySectionsProps {
  meaningLabel: string
  meaning: string
  translationsLabel?: string
  translations?: DictionaryEntryChip[]
  selectedTranslationKey?: string | null
  /** When provided, translation chips become toggle buttons; otherwise they are static tokens. */
  onTranslationToggle?: (key: string) => void
  /** Accessible name for a chip button, e.g. "Translation detail: word /reading/". */
  translationChipLabel?: (chip: DictionaryEntryChip) => string
  /** Free-text sections such as usage or nuance, rendered after the chips. */
  paragraphs?: DictionaryEntryParagraph[]
  examplesLabel?: string
  examples?: string[]
  /** Short phrase tokens such as collocations. */
  phrasesLabel?: string
  phrases?: string[]
  notesLabel?: string
  notes?: string[]
}

/**
 * Pair each text item with a unique, order-independent key (the text, plus an occurrence
 * counter for repeats) so list rows don't depend on the array index.
 */
function withStableKeys(items: string[], prefix: string): Array<{ key: string; item: string }> {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const occurrence = (seen.get(item) ?? 0) + 1
    seen.set(item, occurrence)
    return { key: `${prefix}-${item}-${occurrence}`, item }
  })
}

/**
 * The body of a dictionary entry: a quoted meaning, translation chips, free
 * paragraphs, numbered examples, phrase tokens and bulleted notes. Every
 * section is optional so the main result and both pop-ups share one layout.
 */
export function DictionaryEntrySections({
  meaningLabel,
  meaning,
  translationsLabel,
  translations = [],
  selectedTranslationKey = null,
  onTranslationToggle,
  translationChipLabel,
  paragraphs = [],
  examplesLabel,
  examples = [],
  phrasesLabel,
  phrases = [],
  notesLabel,
  notes = [],
}: DictionaryEntrySectionsProps) {
  return (
    <div className="entry-sections">
      <section className="entry-section">
        <h3 className="entry-section-label">{meaningLabel}</h3>
        <p className="entry-meaning">{meaning}</p>
      </section>

      {translations.length > 0 && (
        <section className="entry-section">
          {translationsLabel && <h3 className="entry-section-label">{translationsLabel}</h3>}
          <div className="entry-chip-row">
            {translations.map((chip) => {
              const content = (
                <>
                  <span className="entry-chip-text">{chip.text}</span>
                  {chip.pronunciation && (
                    <span className="entry-chip-pronunciation">{chip.pronunciation}</span>
                  )}
                </>
              )
              if (!onTranslationToggle) {
                return (
                  <span key={chip.key} className="entry-chip entry-chip--static">
                    {content}
                  </span>
                )
              }
              const selected = selectedTranslationKey === chip.key
              return (
                <Button
                  key={chip.key}
                  size="sm"
                  shape="pill"
                  variant={selected ? 'primary' : 'neutral'}
                  appearance={selected ? 'soft' : 'outline'}
                  aria-pressed={selected}
                  aria-label={translationChipLabel?.(chip)}
                  onClick={() => onTranslationToggle(chip.key)}
                  className="entry-chip"
                >
                  {content}
                </Button>
              )
            })}
          </div>
        </section>
      )}

      {paragraphs.map((paragraph) => (
        <section key={paragraph.key} className="entry-section">
          <h3 className="entry-section-label">{paragraph.label}</h3>
          <p className="entry-paragraph">{paragraph.text}</p>
        </section>
      ))}

      {examples.length > 0 && (
        <section className="entry-section">
          {examplesLabel && <h3 className="entry-section-label">{examplesLabel}</h3>}
          <ol className="entry-list">
            {withStableKeys(examples, 'example').map(({ key, item }, index) => (
              <li key={key} className="entry-list-item">
                <span aria-hidden="true" className="entry-list-index">{index + 1}</span>
                <span className="entry-list-text">{item}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {phrases.length > 0 && (
        <section className="entry-section">
          {phrasesLabel && <h3 className="entry-section-label">{phrasesLabel}</h3>}
          <div className="entry-chip-row">
            {withStableKeys(phrases, 'phrase').map(({ key, item }) => (
              <span key={key} className="entry-phrase">{item}</span>
            ))}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section className="entry-section">
          {notesLabel && <h3 className="entry-section-label">{notesLabel}</h3>}
          <ul className="entry-list">
            {withStableKeys(notes, 'note').map(({ key, item }) => (
              <li key={key} className="entry-list-item">
                <span aria-hidden="true" className="entry-list-bullet" />
                <span className="entry-list-text">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
