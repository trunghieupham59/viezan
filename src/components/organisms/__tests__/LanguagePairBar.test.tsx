import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { LanguagePairBar } from '../LanguagePairBar'

const t = TRANSLATIONS.en

beforeEach(() => useAppStore.setState({
  locale: 'en', sourceLang: 'vi', targetLang: 'ja', liveSourceLang: 'auto', liveTargetLang: 'vi', liveLanguagesLocked: false,
  pinnedLanguagePairs: [], recentLanguagePairs: [], languagePairDirections: { translate: {}, live: {} }, langUsage: {},
}))

const sourceHalf = () => screen.getByRole('button', { name: new RegExp(`^${t.translate_from_label}:`) })
const targetHalf = () => screen.getByRole('button', { name: new RegExp(`^${t.translate_to_label}:`) })
const pairLabel = (source: string, target: string) => `${t.lang_names[source]} → ${t.lang_names[target]}`

describe('LanguagePairBar', () => {
  it('selects source and target through the shared picker and keeps the group labelled', () => {
    render(<LanguagePairBar scope="translate" />)
    expect(screen.getByRole('group', { name: t.language_pairs_label })).toBeInTheDocument()
    expect(sourceHalf()).toHaveTextContent(t.lang_names.vi)
    expect(sourceHalf()).toHaveAttribute('aria-haspopup', 'dialog')

    fireEvent.click(sourceHalf())
    expect(sourceHalf()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('option', { name: t.lang_names.ja }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'ja', targetLang: 'ja' })

    fireEvent.click(targetHalf())
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('option', { name: t.lang_names.en }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'ja', targetLang: 'en' })
    expect(useAppStore.getState().langUsage).toHaveProperty('en')
  })

  it('hands the change to the owner when onPairChange is provided', () => {
    const onPairChange = vi.fn()
    render(<LanguagePairBar scope="translate" onPairChange={onPairChange} />)
    fireEvent.click(screen.getByRole('button', { name: t.translate_swap }))
    expect(onPairChange).toHaveBeenCalledWith({ source: 'ja', target: 'vi' })
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'vi', targetLang: 'ja' })
  })

  it('swaps an explicit pair and explains a disabled swap from the keyboard', () => {
    const { rerender } = render(<LanguagePairBar scope="translate" />)
    const swap = screen.getByRole('button', { name: t.translate_swap })
    expect(swap.parentElement).not.toHaveAttribute('tabindex')
    fireEvent.click(swap)
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'ja', targetLang: 'vi' })

    useAppStore.setState({ sourceLang: 'auto', targetLang: 'vi' })
    rerender(<LanguagePairBar scope="translate" />)
    const disabledSwap = screen.getByRole('button', { name: t.translate_swap })
    const group = screen.getByRole('group', { name: t.translate_swap })
    expect(disabledSwap).toBeDisabled()
    expect(group).toHaveAttribute('tabindex', '0')
    expect(group).toHaveAttribute('aria-disabled', 'true')
    expect(group).toHaveAccessibleDescription(t.translate_swap_disabled_auto)

    rerender(<LanguagePairBar scope="translate" detectedSourceLang="en" />)
    expect(sourceHalf()).toHaveTextContent(t.lang_names.en)
    expect(sourceHalf()).toHaveTextContent(t.translate_auto_indicator)
    fireEvent.click(screen.getByRole('button', { name: t.translate_swap }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'vi', targetLang: 'en' })
  })

  it('shows a static arrow instead of a dead swap when Live keeps Auto', () => {
    render(<LanguagePairBar scope="live" />)
    expect(screen.queryByRole('button', { name: t.translate_swap })).not.toBeInTheDocument()
    expect(document.querySelector('.language-pair-mid--static')).toBeInTheDocument()
    expect(sourceHalf()).toHaveTextContent(t.lang_names.auto)
  })

  it('locks all three controls while a Live session runs and names the reason', () => {
    useAppStore.setState({ liveSourceLang: 'ja', liveTargetLang: 'vi', liveLanguagesLocked: true })
    render(<LanguagePairBar scope="live" lockedReason={t.language_pairs_locked_short} />)
    expect(sourceHalf()).toBeDisabled()
    expect(targetHalf()).toBeDisabled()
    expect(screen.queryByRole('button', { name: t.translate_swap })).not.toBeInTheDocument()
    const lock = screen.getByRole('group', { name: t.language_pairs_locked_short })
    expect(within(lock).getByRole('button', { name: t.language_pairs_locked_short })).toBeDisabled()
    expect(lock).toHaveAccessibleDescription(t.language_pairs_locked_short)
    expect(document.querySelector('.language-pair-bar')).toHaveClass('language-pair-bar--locked')
    fireEvent.click(sourceHalf())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes an open picker the moment the pair becomes locked', () => {
    useAppStore.setState({ liveSourceLang: 'ja' })
    render(<LanguagePairBar scope="live" />)
    fireEvent.click(sourceHalf())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => useAppStore.setState({ liveLanguagesLocked: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['en', 'vi', 'ja'] as const)('sets both languages from a recent chip in %s', (locale) => {
    useAppStore.setState({ locale, recentLanguagePairs: [{ source: 'en', target: 'vi' }] })
    const tr = TRANSLATIONS[locale]
    render(<LanguagePairBar scope="translate" />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${tr.translate_to_label}:`) }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(tr.language_pairs_recent)).toBeInTheDocument()
    const chip = within(dialog).getByRole('button', { name: `${tr.lang_names.en} → ${tr.lang_names.vi}` })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'en', targetLang: 'vi' })
  })

  it('pins and unpins a pair from its chip without closing the picker or changing languages', () => {
    useAppStore.setState({ recentLanguagePairs: [{ source: 'en', target: 'vi' }] })
    render(<LanguagePairBar scope="translate" />)
    fireEvent.click(sourceHalf())
    fireEvent.click(screen.getByRole('button', { name: `${t.language_pairs_pin}: ${pairLabel('en', 'vi')}` }))
    expect(useAppStore.getState().pinnedLanguagePairs).toEqual([{ source: 'en', target: 'vi' }])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const unpin = screen.getByRole('button', { name: `${t.language_pairs_unpin}: ${pairLabel('en', 'vi')}` })
    expect(unpin).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(unpin)
    expect(useAppStore.getState()).toMatchObject({ pinnedLanguagePairs: [], sourceLang: 'vi', targetLang: 'ja' })
  })

  it('lists pinned pairs before recent ones, marks the current pair, and remembers directions per scope', () => {
    useAppStore.setState({
      pinnedLanguagePairs: [{ source: 'en', target: 'ja' }],
      recentLanguagePairs: [{ source: 'vi', target: 'ja' }, { source: 'en', target: 'vi' }],
      languagePairDirections: { translate: { 'en:vi': { source: 'vi', target: 'en' } }, live: {} },
    })
    render(<LanguagePairBar scope="translate" />)
    fireEvent.click(targetHalf())
    const row = document.querySelector('.language-picker-chip-row') as HTMLElement
    const chipButtons = () => within(row).getAllByRole('button').filter((b) => !b.getAttribute('aria-label'))
    expect(chipButtons().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual([pairLabel('vi', 'ja')])
    const labels = chipButtons().map((b) => b.textContent)
    expect(labels).toEqual([pairLabel('en', 'ja'), pairLabel('vi', 'ja'), pairLabel('vi', 'en')])
    fireEvent.click(within(row).getByRole('button', { name: pairLabel('vi', 'en') }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'vi', targetLang: 'en' })
  })

  it('records recently used pairs in the store, newest first and without duplicates', () => {
    const state = useAppStore.getState()
    state.setLanguagePair('translate', { source: 'en', target: 'vi' })
    state.setLanguagePair('live', { source: 'ja', target: 'vi' })
    state.setLanguagePair('translate', { source: 'vi', target: 'en' })
    state.setLanguagePair('translate', { source: 'vi', target: 'vi' })
    expect(useAppStore.getState().recentLanguagePairs).toEqual([{ source: 'vi', target: 'en' }, { source: 'ja', target: 'vi' }])
    expect(useAppStore.persist.getOptions().partialize?.(useAppStore.getState())).toHaveProperty('recentLanguagePairs')
  })

  it('opens in a portal, restores focus on Escape, and dismisses on outside click', async () => {
    const { container } = render(<LanguagePairBar scope="translate" />)
    fireEvent.click(targetHalf())
    expect(container).not.toContainElement(screen.getByRole('dialog'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(targetHalf()).toHaveFocus())
    fireEvent.click(targetHalf())
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(targetHalf()).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches between the halves instead of stacking two panels', () => {
    render(<LanguagePairBar scope="translate" />)
    fireEvent.click(sourceHalf())
    fireEvent.click(targetHalf())
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(t.translate_to_label)
    expect(sourceHalf()).toHaveAttribute('aria-expanded', 'false')
  })

  it('exposes density, fill and single-target variants', () => {
    const { rerender } = render(<LanguagePairBar scope="dictionary" density="compact" fill />)
    const bar = document.querySelector('.language-pair-bar') as HTMLElement
    expect(bar).toHaveClass('language-pair-bar--compact', 'language-pair-bar--fill')
    expect(sourceHalf()).toHaveTextContent('VI')
    expect(targetHalf()).toHaveTextContent('JA')
    rerender(<LanguagePairBar scope="translate" density="inline" single="target" />)
    expect(screen.queryByRole('button', { name: new RegExp(`^${t.translate_from_label}:`) })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.translate_swap })).not.toBeInTheDocument()
    expect(targetHalf()).toBeInTheDocument()
  })
})

describe('LanguagePairBar detected source and size', () => {
  it.each(['en', 'vi', 'ja'] as const)('shows only the detected language name beside the Auto tag in %s', (locale) => {
    const lt = TRANSLATIONS[locale]
    useAppStore.setState({ locale, sourceLang: 'auto', targetLang: 'vi' })
    render(<LanguagePairBar scope="translate" detectedSourceLang="zh" />)
    const source = screen.getByRole('button', { name: new RegExp(`^${lt.translate_from_label}:`) })
    const label = source.querySelector('.language-pair-half-label')
    expect(label).toHaveTextContent(new RegExp(`^${lt.lang_names.zh.replace(/[()（）]/g, '.')}$`))
    expect(within(source).getByText(lt.translate_auto_indicator)).toBeInTheDocument()
    const sentence = lt.translate_detected_language(lt.lang_names.zh)
    expect(source).toHaveAttribute('title', sentence)
    expect(source).toHaveAccessibleName(`${lt.translate_from_label}: ${sentence}`)
  })

  it('sizes halves and the swap with the size prop, md by default', () => {
    const { rerender } = render(<LanguagePairBar scope="translate" />)
    expect(sourceHalf()).toHaveAttribute('data-control-size', 'md')
    rerender(<LanguagePairBar scope="translate" size="sm" />)
    expect(sourceHalf()).toHaveAttribute('data-control-size', 'sm')
    expect(targetHalf()).toHaveAttribute('data-control-size', 'sm')
    expect(screen.getByRole('button', { name: t.translate_swap })).toHaveAttribute('data-control-size', 'sm')
    expect(screen.getByRole('group', { name: t.language_pairs_label })).toHaveClass('language-pair-bar--sm')
  })
})
