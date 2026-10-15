import { Button } from './atoms'
/**
 * ImagePreviewThumbnail — reusable 32×32 image preview with hover-to-reveal remove button.
 *
 * SPLIT-DUP-01: Extracted from ChatPage.tsx inline JSX and ImageAttachmentPreview.tsx
 * to eliminate near-duplicate UI pattern. Both now delegate to this component.
 *
 * Visual: 128x128 px thumbnail with a compact radius and an absolutely-positioned
 * × button that appears on hover.
 */
import { XIcon } from './icons'

interface ImagePreviewThumbnailProps {
  /** Image src URL (data URL, object URL, etc.) */
  src: string
  /** Alt text for the image */
  alt: string
  /** Tooltip / aria-label for the remove button */
  removeTitle: string
  /** Called when user clicks the remove button */
  onRemove: () => void
}

export function ImagePreviewThumbnail({ src, alt, removeTitle, onRemove }: ImagePreviewThumbnailProps) {
  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-1 flex items-start">
      <div className="relative group">
        <img
          src={src}
          alt={alt}
          className="w-32 h-32 object-cover rounded-lg shadow-sm
                     border border-gray-200 dark:border-gray-700"
        />
        {/* × remove button — visible on hover */}
        <Button
          size="xs"
          shape="icon"
          variant="danger"
          appearance="soft"
          aria-label={removeTitle}
          type="button"
          onClick={onRemove}
          title={removeTitle}
          className="absolute -top-2 -right-2 z-10 opacity-0 group-hover:opacity-100"
        >
          <XIcon className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
