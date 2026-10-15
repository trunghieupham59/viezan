import { useRef } from 'react'
import { ModelSelector } from '../../ModelSelector'
import { Button } from '../../ui/atoms'
import { GearIcon } from '../../ui/icons'
import { ConfigSection } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

export interface DictionaryAIConfigurationProps {
  open: boolean
  title: string
  scopeDescription: string
  closeLabel: string
  modelsLabel: string
  onOpenChange: (open: boolean) => void
}

/** Dictionary lookup configuration, sharing the popover contract used by Chat, Translate and Interpret. */
export function DictionaryAIConfiguration({
  open,
  title,
  scopeDescription,
  closeLabel,
  modelsLabel,
  onOpenChange,
}: DictionaryAIConfigurationProps) {
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
        <ConfigSection title={modelsLabel}>
          <div className="ai-configuration-inline-picker">
            <ModelSelector
              embedded
              inline
              directModelList
              onSelectionChange={() => onOpenChange(false)}
            />
          </div>
        </ConfigSection>
      </AIConfigurationPopover>
    </div>
  )
}
