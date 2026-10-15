import type { ReactNode } from 'react'

export interface ConfigSectionProps {
  title: string
  description?: string
  disabled?: boolean
  children: ReactNode
}

export function ConfigSection({ title, description, disabled = false, children }: ConfigSectionProps) {
  return (
    <section className="ai-config-section" aria-disabled={disabled || undefined}>
      <div>
        <h3 className="ai-config-section__heading">{title}</h3>
        {description && <p className="ai-config-section__description">{description}</p>}
      </div>
      {children}
    </section>
  )
}
