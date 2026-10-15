import { Button } from '@/components/ui/atoms'
import { useT } from '../../store/useAppStore'
import { tpl } from '../../utils/tpl'
import { AlertTriangleIcon, XIcon } from '../ui/icons'

interface ImageSwitchToastProps {
  model: string
  provider: string
  currentProvider: string
  onDismiss: () => void
  titleLabel: string
  bodyLabel: string
  /** Template: "Using {model}" — from HC-04 fix */
  usingLabel: string
}

export function ImageSwitchToast({
  model, provider, currentProvider, onDismiss,
  titleLabel, bodyLabel, usingLabel,
}: ImageSwitchToastProps) {
  const t = useT()
  return (
    <div className="pointer-events-auto fixed bottom-16 left-1/2 -translate-x-1/2 z-50
                    max-w-sm w-full mx-4 fade-in">
      <div className="ui-alert-toast flex items-start gap-2.5">
        <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-snug">{titleLabel}</p>
          <p className="text-xs opacity-90 leading-snug mt-0.5">
            <strong>{tpl(usingLabel, { model })}</strong>
            {provider !== currentProvider && <> ({provider})</>}
            {' '}— {bodyLabel}
          </p>
        </div>
        <Button
          size="md"
          shape="icon"
          variant="neutral"
          appearance="ghost"
          type="button"
          onClick={onDismiss}
          className="mt-0.5 flex-shrink-0"
          aria-label={t.translate_error_dismiss}
        >
          <XIcon className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
