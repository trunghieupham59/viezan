import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from '../../ui/atoms'
import { InterpretAIConfiguration } from '../live/InterpretAIConfiguration'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <InterpretAIConfiguration
      open={open}
      active={false}
      title="AI configuration"
      scopeDescription="Applies when the next live session starts."
      closeLabel="Close"
      translationLabel="Translation"
      transcriptionLabel="Transcription"
      outputLabel="Output"
      modelControl={<Button>Model choice</Button>}
      audioSourceControl={<Button>Audio source</Button>}
      subtitleControl={<Button>Subtitles</Button>}
      onOpenChange={setOpen}
    />
  )
}

describe('InterpretAIConfiguration', () => {
  it('contains configuration fields but no transcript session actions', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'AI configuration' }))

    const dialog = screen.getByRole('dialog', { name: 'AI configuration' })
    expect(dialog).toHaveTextContent('Translation')
    expect(dialog).toHaveTextContent('Transcription')
    expect(dialog).toHaveTextContent('Output')
    expect(dialog).not.toHaveTextContent(/Clear|TXT|SRT/)
  })
})
