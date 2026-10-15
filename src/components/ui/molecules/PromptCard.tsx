import type { ReactNode } from 'react'
import { Button } from '../atoms/Button'

export type PromptCardTone = 'blue' | 'violet' | 'green' | 'orange'

export interface PromptCardProps {
  icon: ReactNode
  title: string
  description: string
  tone: PromptCardTone
  onClick: () => void
}

/** A quiet, Codex-style starter card used to seed a new AI task. */
export function PromptCard({
  icon,
  title,
  description,
  tone,
  onClick,
}: PromptCardProps) {
  return (
    <Button
      size="lg"
      shape="rect"
      variant="neutral"
      appearance="outline"
      className={`prompt-card prompt-card-${tone}`}
      onClick={onClick}
    >
      <span className="prompt-card-icon">{icon}</span>
      <span className="prompt-card-copy">
        <span className="prompt-card-title">{title}</span>
        <span className="prompt-card-description">{description}</span>
      </span>
    </Button>
  )
}
