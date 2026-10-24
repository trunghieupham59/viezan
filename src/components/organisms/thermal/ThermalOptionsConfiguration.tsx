import { type ReactNode, useRef } from 'react'
import { Button, GearIcon } from '../../ui/atoms'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

export interface ThermalOptionsConfigurationProps {
  open: boolean
  title: string
  scopeDescription: string
  closeLabel: string
  onOpenChange: (open: boolean) => void
  /** The option controls (the menu bar / tray reading). */
  children: ReactNode
}

/**
 * The Thermal page's gear: the same trigger + anchored popover the other features
 * use for their configuration, holding the page's few options.
 */
export function ThermalOptionsConfiguration({ open, title, scopeDescription, closeLabel, onOpenChange, children }: ThermalOptionsConfigurationProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="ai-configuration-anchor">
      <Button
        ref={triggerRef}
        size="md"
        shape="icon"
        variant={open ? 'primary' : 'neutral'}
        appearance={open ? 'soft' : 'ghost'}
        aria-label={title}
        title={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        <GearIcon />
      </Button>
      <AIConfigurationPopover
        open={open}
        title={title}
        scopeDescription={scopeDescription}
        closeLabel={closeLabel}
        triggerRef={triggerRef}
        onClose={() => onOpenChange(false)}
      >
        {children}
      </AIConfigurationPopover>
    </div>
  )
}
