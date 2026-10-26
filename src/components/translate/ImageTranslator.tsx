import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { MAX_TRANSLATE_IMAGE_DIMENSION } from '../../constants/image'
import { useT } from '../../store/useAppStore'
import { resizeImageFile } from '../../utils/imageUtils'
import { AlertTriangleIcon, ImageIcon, SpinnerIcon, UploadIcon, XIcon } from '../ui/icons'
import '../../styles/translate.css'

// DUP-05: processImageFile replaced by shared resizeImageFile from imageUtils.ts
// HC-09: MAX_TRANSLATE_IMAGE_DIMENSION imported from constants/image.ts

// ─── Types ────────────────────────────────────────────────────────────────────
import type { ImageAttachment } from '../../types/workbench'

export type { ImageAttachment } from '../../types/workbench'

// ─── Props ────────────────────────────────────────────────────────────────────
interface ImageTranslatorProps {
  onImageReady: (attachment: ImageAttachment) => void
  onClose: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────
export function ImageTranslator({ onImageReady, onClose }: ImageTranslatorProps) {
  const t = useT()
  const [isDragging,   setIsDragging  ] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg,     setErrorMsg    ] = useState<string | null>(null)

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg(t.image_translate_type_error)  // HC-10
      return
    }
    setIsProcessing(true)
    setErrorMsg(null)
    try {
      // DUP-05: use shared resizeImageFile with quality loop for ImageTranslator
      const result = await resizeImageFile(file, MAX_TRANSLATE_IMAGE_DIMENSION, { useQualityLoop: true })
      const attachment: ImageAttachment = {
        base64: result.base64,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        previewDataUrl: result.previewUrl,
        fileName: result.fileName,
      }
      onImageReady(attachment)
      onClose()
    } catch (err) {
      setIsProcessing(false)
      setErrorMsg(err instanceof Error ? err.message : t.image_translate_error_failed)
    }
  }, [onImageReady, onClose, t])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.image_translate_title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Native full-surface dismiss target; fixed-size Button would constrain the backdrop. */}
      <button
        type="button"
        aria-label={t.translate_error_dismiss}
        className="image-translator-backdrop absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="modal-surface relative z-10 w-full max-w-md overflow-hidden fade-in">

        {/* Header */}
        <div className="image-translator-header flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="image-translator-icon w-8 h-8 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <h2 className="image-translator-title text-sm font-semibold">
              {t.image_translate_title}
            </h2>
          </div>
          <Button
            size="md"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            type="button"
            onClick={onClose}
            aria-label={t.translate_error_dismiss}
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-5">
          {isProcessing ? (
            /* Processing state */
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative w-14 h-14">
                <div className="image-translator-ping absolute inset-0 rounded-full animate-ping" />
                <div className="image-translator-spinner relative w-14 h-14 rounded-full flex items-center justify-center shadow-md">
                  <SpinnerIcon className="w-6 h-6 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="image-translator-text text-sm font-semibold">{t.image_translate_processing}</p>
                <p className="image-translator-hint text-xs mt-1">{t.image_translate_compress_status}</p>
              </div>
            </div>
          ) : (
            /* Upload zone */
            <>
              <label
                htmlFor="img-upload-input"
                data-dragging={isDragging || undefined}
                className="image-translator-dropzone flex flex-col items-center justify-center rounded-lg cursor-pointer select-none py-12 px-6 text-center"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <div className="image-translator-drop-icon w-14 h-14 rounded-lg flex items-center justify-center mb-4">
                  <UploadIcon className="w-7 h-7" />
                </div>
                <p className="image-translator-text text-sm font-medium mb-1">
                  {t.image_translate_upload_hint.split('\n')[0]}
                </p>
                <p className="image-translator-hint text-xs">
                  {t.image_translate_upload_hint.split('\n')[1]}
                </p>
              </label>

              <input
                id="img-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileInput}
              />

              {errorMsg && (
                <div className="ui-error-box mt-3 flex items-start gap-2">
                  <AlertTriangleIcon className="ui-error-icon w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs">{errorMsg}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
