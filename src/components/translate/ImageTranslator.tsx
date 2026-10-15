import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/atoms'
import { MAX_TRANSLATE_IMAGE_DIMENSION } from '../../constants/image'
import { useT } from '../../store/useAppStore'
import { resizeImageFile } from '../../utils/imageUtils'
import { AlertTriangleIcon, ImageIcon, SpinnerIcon, UploadIcon, XIcon } from '../ui/icons'

// DUP-05: processImageFile replaced by shared resizeImageFile from imageUtils.ts
// HC-09: MAX_TRANSLATE_IMAGE_DIMENSION imported from constants/image.ts

// HC-11: Named constant for the ping animation duration (processing state spinner)
const PROCESSING_PING_DURATION_S = '1.5s'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ImageAttachment {
  base64: string
  mimeType: string
  width: number
  height: number
  previewDataUrl: string   // full data URL for display
  fileName: string
}

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
        className="absolute inset-0 w-full h-full bg-black/60 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="modal-surface relative z-10 w-full max-w-md overflow-hidden fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5
                        border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
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
                <div className="absolute inset-0 rounded-full bg-gray-100 dark:bg-gray-900/30 animate-ping" style={{ animationDuration: PROCESSING_PING_DURATION_S }} />
                <div className="relative w-14 h-14 rounded-full bg-gray-500 flex items-center justify-center shadow-md">
                  <SpinnerIcon className="w-6 h-6 text-white animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t.image_translate_processing}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t.image_translate_compress_status}</p>
              </div>
            </div>
          ) : (
            /* Upload zone */
            <>
              <label
                htmlFor="img-upload-input"
                className={[
                  'flex flex-col items-center justify-center rounded-lg border-2 border-dashed',
                  'cursor-pointer transition-all duration-200 select-none py-12 px-6 text-center',
                  isDragging
                    ? 'border-gray-400 bg-gray-50 dark:bg-gray-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50',
                ].join(' ')}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center mb-4 transition-colors
                                ${isDragging ? 'bg-gray-100 dark:bg-gray-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  <UploadIcon className={`w-7 h-7 transition-colors ${isDragging ? 'text-gray-500' : 'text-gray-400'}`} />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  {t.image_translate_upload_hint.split('\n')[0]}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
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
