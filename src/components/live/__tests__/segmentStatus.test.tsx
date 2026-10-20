import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BilingualSegmentRow } from '../BilingualSegmentRow'
import { TranslationRow } from '../TranslationRow'

vi.mock('../../../hooks/useTypewriter', () => ({ useTypewriter: (text: string) => text }))

describe('live revision status', () => {
  it('labels a provisional bilingual translation and replaces it in place when settled', () => {
    const props = { speaker: 'Speaker 1', speakerNameMap: {}, onRename: vi.fn() }
    const { rerender } = render(<BilingualSegmentRow {...props} original="Tôi đồng ý" translation="同意します" statusLabel="Tạm dịch — có thể thay đổi" />)
    expect(screen.getByRole('status')).toHaveTextContent('Tạm dịch')
    rerender(<BilingualSegmentRow {...props} original="Tôi đồng ý chỉ khi có bảo hành." translation="保証がある場合にのみ同意します。" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('同意します')).not.toBeInTheDocument()
    expect(screen.getByText('保証がある場合にのみ同意します。')).toBeInTheDocument()
  })

  it('keeps unfinished status visible in split translation view, even after Stop', () => {
    render(<TranslationRow speaker="Speaker 1" speakerNameMap={{}} text="Tôi chỉ đồng ý nếu" statusLabel="Đoạn có thể chưa đủ ý" />)
    expect(screen.getByRole('status')).toHaveTextContent('Đoạn có thể chưa đủ ý')
  })
})
