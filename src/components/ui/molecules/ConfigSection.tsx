import type { ReactNode } from 'react'

export interface ConfigSectionProps {
  /** When given, the section is a landmark named by its heading (`aria-labelledby`). */
  id?: string
  title: string
  description?: string
  disabled?: boolean
  children: ReactNode
}

export function ConfigSection({ id, title, description, disabled = false, children }: ConfigSectionProps) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section className="ai-config-section" aria-disabled={disabled || undefined} aria-labelledby={headingId}>
      <div>
        <h3 id={headingId} className="ai-config-section__heading">{title}</h3>
        {description && <p className="ai-config-section__description">{description}</p>}
      </div>
      {children}
    </section>
  )
}
