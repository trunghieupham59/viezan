import { useEffect, useRef } from 'react'
import { trapTabFocus } from '../../../utils/focusTrap'
import { Button, CopyIcon, DownloadIcon, XIcon } from '../atoms'

export interface ImageLightboxProps {
  src: string
  alt: string
  previewLabel: string
  toolbarLabel: string
  copyLabel?: string
  downloadLabel?: string
  closeLabel: string
  onCopy?: () => void
  onDownload?: () => void
  onClose: () => void
}

/**
 * Accessible, props-driven image preview.
 *
 * Utility actions share one neutral toolbar. The component owns modal focus,
 * Escape/backdrop dismissal, focus trapping, and restoring the trigger focus.
 */
export function ImageLightbox({
  src,
  alt,
  previewLabel,
  toolbarLabel,
  copyLabel,
  downloadLabel,
  closeLabel,
  onCopy,
  onDownload,
  onClose,
}: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      trapTabFocus(event, dialogRef.current, 'button:not(:disabled)')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      className="image-lightbox fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={previewLabel}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="image-lightbox-content">
        <div className="image-lightbox-toolbar" role="toolbar" aria-label={toolbarLabel}>
          {onCopy && copyLabel && (
            <Button
              size="md"
              shape="icon"
              variant="neutral"
              appearance="ghost"
              onClick={onCopy}
              title={copyLabel}
              aria-label={copyLabel}
            >
              <CopyIcon className="h-4 w-4" />
            </Button>
          )}
          {onDownload && downloadLabel && (
            <Button
              size="md"
              shape="icon"
              variant="neutral"
              appearance="ghost"
              onClick={onDownload}
              title={downloadLabel}
              aria-label={downloadLabel}
            >
              <DownloadIcon className="h-4 w-4" />
            </Button>
          )}
          {(onCopy || onDownload) && <span className="image-lightbox-toolbar-divider" aria-hidden="true" />}
          <Button
            ref={closeButtonRef}
            size="md"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            onClick={onClose}
            title={closeLabel}
            aria-label={closeLabel}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
        <img src={src} alt={alt} className="image-lightbox-image" />
      </div>
    </div>
  )
}
