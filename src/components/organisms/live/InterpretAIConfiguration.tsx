import { type ReactNode, useRef } from 'react'
import { Button } from '../../ui/atoms'
import { GearIcon } from '../../ui/icons'
import { ConfigSection } from '../../ui/molecules'
import { AIConfigurationPopover } from '../AIConfigurationPopover'

export interface InterpretAIConfigurationProps {
  open: boolean
  active: boolean
  title: string
  scopeDescription: string
  closeLabel: string
  translationLabel: string
  transcriptionLabel?: string
  outputLabel: string
  modelControl: ReactNode
  /** Omit when the feature shows its audio source outside this popover. */
  audioSourceControl?: ReactNode
  subtitleControl: ReactNode
  onOpenChange: (open: boolean) => void
}

/**
 * Feature configuration for an interpretation session.
 *
 * Session actions such as clearing and exporting the transcript deliberately
 * remain outside this organism; this surface only configures future output.
 */
export function InterpretAIConfiguration({
  open,
  active,
  title,
  scopeDescription,
  closeLabel,
  translationLabel,
  transcriptionLabel,
  outputLabel,
  modelControl,
  audioSourceControl,
  subtitleControl,
  onOpenChange,
}: InterpretAIConfigurationProps) {
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
        <ConfigSection title={translationLabel}>{modelControl}</ConfigSection>
        {audioSourceControl && transcriptionLabel && (
          <ConfigSection title={transcriptionLabel} disabled={active}>
            {audioSourceControl}
          </ConfigSection>
        )}
        <ConfigSection title={outputLabel}>{subtitleControl}</ConfigSection>
      </AIConfigurationPopover>
    </div>
  )
}
