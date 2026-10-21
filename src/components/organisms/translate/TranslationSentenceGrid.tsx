import { useEffect, useMemo, useState } from 'react'
import { useT } from '../../../store/useAppStore'
import type { TranslationComparisonResult } from '../../../types'
import { formatModelName, getProviderDisplayName } from '../../../utils/modelDisplay'
import {
  ASSEMBLED_TRANSLATION_KEY,
  alignSentences,
  joinSentences,
  pickDominantColumn,
} from '../../../utils/sentenceSegments'
import { type DiffSegment, highlightTranslationDifferences } from '../../../utils/translationDiff'
import { ProviderIcon } from '../../ProviderIcon'
import { Button } from '../../ui/atoms'
import { CheckIcon, CopyIcon } from '../../ui/icons'

interface TranslationSentenceGridProps {
  /** Source the results were produced from. */
  sourceText: string
  /** Finished translations only, in column order. */
  results: TranslationComparisonResult[]
  selectedResultKey: string | null
  copiedResultKey: string | null
  highlightDifferences: boolean
  canSelect: boolean
  onSelect: (result: TranslationComparisonResult) => void
  onCopy: (result: TranslationComparisonResult) => void
}

/**
 * Sentence-by-sentence comparison: one row per source sentence, one cell per
 * finished model. The reader picks the best sentence in each row; the assembled
 * text lives in a footer that stays visible while the rows scroll. A model whose
 * sentence count differs from the source is shown whole and cannot be picked.
 */
export function TranslationSentenceGrid({
  sourceText,
  results,
  selectedResultKey,
  copiedResultKey,
  highlightDifferences,
  canSelect,
  onSelect,
  onCopy,
}: TranslationSentenceGridProps) {
  const t = useT()
  const textsKey = results.map((result) => result.translatedText).join('\u0000')
  const keysKey = results.map((result) => result.key).join('\u0000')
  const alignment = useMemo(
    () => alignSentences(sourceText, textsKey ? textsKey.split('\u0000') : []),
    [sourceText, textsKey],
  )
  const { rows, columns } = alignment

  // Explicit per-row choices, keyed by row index; everything else follows the default column.
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [pickedAssembledText, setPickedAssembledText] = useState<string | null>(null)
  // A new run (or an edited source) invalidates the sentence choices made for the old rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the inputs of the alignment
  useEffect(() => {
    setChoices({})
    setPickedAssembledText(null)
  }, [sourceText, textsKey, keysKey])

  const columnIndexByKey = new Map(results.map((result, index) => [result.key, index]))
  const isAlignedKey = (key: string | null) => {
    const column = key === null ? undefined : columnIndexByKey.get(key)
    return column !== undefined && columns[column].aligned
  }
  const firstAlignedKey = results.find((_, index) => columns[index].aligned)?.key ?? null
  const defaultKey = isAlignedKey(selectedResultKey) ? selectedResultKey : firstAlignedKey
  const chosenKeyForRow = (rowIndex: number) => {
    const explicit = choices[rowIndex]
    return explicit !== undefined && isAlignedKey(explicit) ? explicit : defaultKey
  }

  const chosenColumns = defaultKey === null
    ? []
    : rows.map((row) => columnIndexByKey.get(chosenKeyForRow(row.index) ?? defaultKey) as number)
  const assembledText = joinSentences(rows.map((row, index) => (
    chosenColumns.length ? row.cells[chosenColumns[index]].text : ''
  )))
  const dominantColumn = pickDominantColumn(
    chosenColumns,
    defaultKey === null ? null : columnIndexByKey.get(defaultKey) ?? null,
  )
  const dominantResult = dominantColumn === null ? null : results[dominantColumn]
  const contributingCount = new Set(chosenColumns).size
  const isAssembledPicked = selectedResultKey === ASSEMBLED_TRANSLATION_KEY
    && pickedAssembledText === assembledText
  const isAssembledCopied = copiedResultKey === ASSEMBLED_TRANSLATION_KEY

  const segmentsByRow = useMemo(() => {
    const map = new Map<number, Map<number, DiffSegment[]>>()
    if (!highlightDifferences) return map
    rows.forEach((row) => {
      const alignedColumns = row.cells
        .map((cell, column) => (cell.aligned ? column : -1))
        .filter((column) => column >= 0)
      if (alignedColumns.length < 2) return
      const segments = highlightTranslationDifferences(alignedColumns.map((column) => row.cells[column].text))
      const byColumn = new Map<number, DiffSegment[]>()
      alignedColumns.forEach((column, index) => {
        byColumn.set(column, segments[index])
      })
      map.set(row.index, byColumn)
    })
    return map
  }, [rows, highlightDifferences])

  const assembledResult = (): TranslationComparisonResult | null => (
    dominantResult && assembledText
      ? { ...dominantResult, key: ASSEMBLED_TRANSLATION_KEY, translatedText: assembledText }
      : null
  )
  const handlePickAssembled = () => {
    const result = assembledResult()
    if (!result) return
    setPickedAssembledText(assembledText)
    onSelect(result)
  }
  const handleCopyAssembled = () => {
    const result = assembledResult()
    if (result) onCopy(result)
  }

  const modelLabel = (result: TranslationComparisonResult) => formatModelName(result.provider, result.model)
  const summary = dominantResult === null
    ? t.translate_compare_sentences_unavailable
    : contributingCount > 1
      ? t.translate_compare_assembly_mixed(contributingCount, modelLabel(dominantResult))
      : t.translate_compare_assembly_single(modelLabel(dominantResult))
  const pickLabel = isAssembledPicked ? t.translate_compare_picked : t.translate_compare_pick
  const copyLabel = isAssembledCopied ? t.translate_copied : t.translate_copy

  return (
    <div className="translate-comparison-sentences">
      <div className="translate-comparison-sentences-scroll">
        <table className="translate-comparison-sentence-table" aria-label={t.translate_compare_sentences_label}>
          <thead>
            <tr>
              <th scope="col" className="translate-comparison-sentence-source">
                {t.translate_compare_sentence_source}
              </th>
              {results.map((result, column) => {
                const modelName = modelLabel(result)
                const providerName = getProviderDisplayName(result.provider)
                const isSelected = selectedResultKey === result.key
                const columnPickLabel = isSelected ? t.translate_compare_picked : t.translate_compare_pick
                return (
                  <th key={result.key} scope="col" data-selected={isSelected}>
                    <span className="translate-comparison-sentence-head">
                      <span className="translate-comparison-sentence-head-icon" aria-hidden="true">
                        <ProviderIcon provider={result.provider} size={16} />
                      </span>
                      <strong>{modelName}</strong>
                      {columns[column].aligned ? (
                        <Button
                          size="xs"
                          shape="rect"
                          variant={isSelected ? 'primary' : 'neutral'}
                          appearance={isSelected ? 'soft' : 'ghost'}
                          aria-pressed={isSelected}
                          aria-label={`${columnPickLabel}: ${modelName} · ${providerName}`}
                          disabled={!canSelect && !isSelected}
                          onClick={() => onSelect(result)}
                        >
                          {isSelected && <CheckIcon />}
                          {columnPickLabel}
                        </Button>
                      ) : (
                        <span className="translate-comparison-sentence-notice">
                          {t.translate_compare_sentence_misaligned(columns[column].sentenceCount, rows.length)}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const chosenKey = chosenKeyForRow(row.index)
              const rowLabel = t.translate_compare_sentence_row(row.index + 1)
              return (
                <tr key={row.index}>
                  <th scope="row" className="translate-comparison-sentence-source">
                    <span className="translate-comparison-sentence-row-head">
                      <span className="translate-comparison-sentence-number" aria-hidden="true">
                        {row.index + 1}
                      </span>
                      <span className="translate-comparison-sentence-text">{row.source}</span>
                    </span>
                  </th>
                  {row.cells.map((cell, column) => {
                    const result = results[column]
                    const isChosen = cell.aligned && chosenKey === result.key
                    const segments = segmentsByRow.get(row.index)?.get(column) ?? null
                    const useLabel = isChosen ? t.translate_compare_sentence_used : t.translate_compare_sentence_use
                    return (
                      <td key={result.key} data-chosen={isChosen} data-aligned={cell.aligned}>
                        {cell.text && (
                          <div className="translate-comparison-sentence-cell">
                            <p className="translate-comparison-sentence-text">
                              {segments
                                ? segments.map((segment, index) => (
                                  segment.changed
                                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional slices of one string
                                    ? <mark key={index}>{segment.text}</mark>
                                    // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional slices of one string
                                    : <span key={index}>{segment.text}</span>
                                ))
                                : cell.text}
                            </p>
                            {cell.aligned && (
                              <Button
                                size="xs"
                                shape="rect"
                                variant={isChosen ? 'primary' : 'neutral'}
                                appearance={isChosen ? 'soft' : 'ghost'}
                                aria-pressed={isChosen}
                                aria-label={`${useLabel}: ${rowLabel} · ${modelLabel(result)}`}
                                onClick={() => setChoices((current) => ({ ...current, [row.index]: result.key }))}
                              >
                                {isChosen && <CheckIcon />}
                                {useLabel}
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section
        className="translate-comparison-assembly"
        aria-label={t.translate_compare_assembly_label}
        data-selected={isAssembledPicked}
      >
        <div className="translate-comparison-assembly-copy">
          <span className="translate-comparison-assembly-title">{t.translate_compare_assembly_label}</span>
          <span className="translate-comparison-assembly-summary">{summary}</span>
          {dominantResult && (
            <p className="translate-comparison-assembly-text">{assembledText}</p>
          )}
        </div>
        {dominantResult && (
          <div className="translate-comparison-assembly-actions">
            <Button
              size="sm"
              shape="icon"
              variant={isAssembledCopied ? 'primary' : 'neutral'}
              appearance={isAssembledCopied ? 'soft' : 'ghost'}
              aria-label={`${copyLabel}: ${t.translate_compare_assembly_label}`}
              title={copyLabel}
              onClick={handleCopyAssembled}
            >
              {isAssembledCopied ? <CheckIcon /> : <CopyIcon />}
            </Button>
            <Button
              size="sm"
              shape="rect"
              variant={isAssembledPicked ? 'primary' : 'neutral'}
              appearance={isAssembledPicked ? 'soft' : 'outline'}
              aria-pressed={isAssembledPicked}
              aria-label={`${pickLabel}: ${t.translate_compare_assembly_label}`}
              disabled={!canSelect && !isAssembledPicked}
              onClick={handlePickAssembled}
            >
              {isAssembledPicked && <CheckIcon />}
              {pickLabel}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
