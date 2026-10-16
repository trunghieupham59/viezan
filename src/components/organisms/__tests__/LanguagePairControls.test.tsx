import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { LanguagePairControls } from '../translate/LanguagePairControls'

beforeEach(() => useAppStore.setState({ locale: 'en', sourceLang: 'vi', targetLang: 'ja', liveSourceLang: 'auto', liveTargetLang: 'vi', liveLanguagesLocked: false, pinnedLanguagePairs: [], languagePairDirections: { translate: {}, live: {} } }))
describe('shared pair controls', () => {
  it.each(['en', 'vi', 'ja'] as const)('pins and selects a complete pair in %s', locale => {
    useAppStore.setState({ locale })
    const t = TRANSLATIONS[locale]
    render(<LanguagePairControls scope="translate" sourceHeadingId="source" resultHeadingId="target" />)
    fireEvent.click(screen.getByRole('button', { name: t.language_pairs_manage }))
    fireEvent.click(screen.getByRole('button', { name: t.language_pairs_pin }))
    fireEvent.click(screen.getByRole('button', { name: t.translate_swap }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'ja', targetLang: 'vi' })
    fireEvent.click(screen.getByRole('button', { name: t.language_pairs_manage }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: `${t.lang_names.vi}–${t.lang_names.ja}` }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'ja', targetLang: 'vi' })
  })
  it('never resolves Auto from audio detection or permits changing a running session', () => {
    useAppStore.setState({ liveLanguagesLocked: true })
    render(<LanguagePairControls scope="live" sourceHeadingId="source" resultHeadingId="target" detectedSourceLang="ja" />)
    expect(screen.queryByRole('button', { name: 'Swap languages' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Translate from/ })).toBeDisabled()
    expect(document.querySelector('.language-pair-notice')).toHaveTextContent(TRANSLATIONS.en.language_pairs_locked)
  })
  it('swaps an explicit live pair and keeps feature actions on the language row', () => {
    useAppStore.setState({ liveSourceLang: 'ja', liveTargetLang: 'vi' })
    render(<LanguagePairControls scope="live" sourceHeadingId="source" resultHeadingId="target"
      actions={<button type="button">Start</button>} />)
    const row = document.querySelector('.language-pair-fields') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Start' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }))
    expect(useAppStore.getState()).toMatchObject({ liveSourceLang: 'vi', liveTargetLang: 'ja' })
  })
  it('resolves text Auto explicitly without replacing the input', () => {
    useAppStore.setState({ sourceLang: 'auto', targetLang: 'vi', sourceText: 'Hello' })
    render(<LanguagePairControls scope="translate" sourceHeadingId="source" resultHeadingId="target" detectedSourceLang="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap languages' }))
    expect(useAppStore.getState()).toMatchObject({ sourceLang: 'vi', targetLang: 'en', sourceText: 'Hello' })
  })
})


it('opens in a portal and restores focus on Escape; outside click dismisses', async () => {
  const { container } = render(<LanguagePairControls scope="translate" sourceHeadingId="source" resultHeadingId="target" />)
  const trigger = screen.getByRole('button', { name: 'Language pairs' })
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(container).not.toContainElement(screen.getByRole('dialog'))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('removes a saved pair without changing the working languages', () => {
  useAppStore.getState().pinLanguagePair({ source: 'vi', target: 'en' })
  render(<LanguagePairControls scope="translate" sourceHeadingId="source" resultHeadingId="target" />)
  fireEvent.click(screen.getByRole('button', { name: 'Language pairs' }))
  fireEvent.click(screen.getByRole('button', { name: /Unpin pair:/ }))
  expect(useAppStore.getState()).toMatchObject({ pinnedLanguagePairs: [], sourceLang: 'vi', targetLang: 'ja' })
  expect(screen.getByRole('button', { name: 'Pin pair' })).toBeEnabled()
})
