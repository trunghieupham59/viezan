import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import { DeepResearchApiSection } from '../DeepResearchApiSection'

describe('DeepResearchApiSection key removal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    act(() => useAppStore.setState({ locale: 'vi', localeAuto: false, hasTavilyKey: false, hasBraveKey: false }))
    vi.mocked(window.api.keychain.get).mockImplementation(async (provider: string) => (
      provider === 'tavily' ? { exists: true, masked: 'tvly-****' } : { exists: false, masked: null }
    ))
  })

  it('reports the stored key to the store through selectors', async () => {
    render(<DeepResearchApiSection />)
    await waitFor(() => expect(useAppStore.getState().hasTavilyKey).toBe(true))
    expect(useAppStore.getState().hasBraveKey).toBe(false)
  })

  it('asks with the localized templated confirm and does not delete when cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeepResearchApiSection />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sửa' }))
    fireEvent.click(screen.getByTitle('Xóa'))

    expect(confirm).toHaveBeenCalledWith('Xoá khoá API của Tavily?')
    expect(window.api.keychain.delete).not.toHaveBeenCalled()
  })
})
