import type { ReactNode } from 'react'
import { Button } from '../atoms'
import '../../../styles/molecules.css'

export interface QuickStartCardProps {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}

/** A card that starts a feature: tinted icon tile, name, one line of what it does. */
export function QuickStartCard({ icon, title, description, onClick }: QuickStartCardProps) {
  return (
    <Button size="lg" shape="rect" variant="neutral" appearance="outline" className="ui-quick-card" onClick={onClick}>
      <span className="ui-quick-card__icon" aria-hidden="true">{icon}</span>
      <span className="ui-quick-card__title">{title}</span>
      <span className="ui-quick-card__description">{description}</span>
    </Button>
  )
}
