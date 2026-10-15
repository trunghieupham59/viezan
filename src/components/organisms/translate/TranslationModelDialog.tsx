import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAppStore, useT } from '../../../store/useAppStore'
import type { TranslationModelSelection } from '../../../types'
import { trapTabFocus } from '../../../utils/focusTrap'
import { Button } from '../../ui/atoms'
import { InfoCircleIcon, XIcon } from '../../ui/icons'
import { TranslationModelPicker } from './TranslationModelPicker'

interface TranslationModelDialogProps {
  id: string
  models: TranslationModelSelection[]
  onApply: (models: TranslationModelSelection[]) => void
  onCancel: () => void
  onOpenSettings: () => void
}

const modelKey = ({ provider, model }: TranslationModelSelection) => `${provider}:${model}`
const modelsKey = (models: TranslationModelSelection[]) => models.map(modelKey).join('|')

/** Modal draft boundary for choosing translation models without mutating a live run. */
export function TranslationModelDialog({
  id,
  models,
  onApply,
  onCancel,
  onOpenSettings,
}: TranslationModelDialogProps) {
  const t = useT()
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [draftModels, setDraftModels] = useState(models)
  const recordModelUsage = useAppStore((state) => state.recordModelUsage)
  const initialKeys = useMemo(() => new Set(models.map(modelKey)), [models])
  const hasChanges = modelsKey(draftModels) !== modelsKey(models)
  const canApply = draftModels.length > 0 && hasChanges

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>('[data-model-search]')?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      trapTabFocus(event, dialogRef.current)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused && previouslyFocused !== document.body) previouslyFocused.focus()
    }
  }, [onCancel])

  const handleApply = () => {
    if (!canApply) return
    for (const selection of draftModels) {
      if (!initialKeys.has(modelKey(selection))) {
        recordModelUsage(selection.provider, selection.model)
      }
    }
    onApply(draftModels)
    onCancel()
  }

  const handleOpenSettings = () => {
    onCancel()
    requestAnimationFrame(onOpenSettings)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer dismissal complements Escape and focus trapping handled above.
    <div
      className="modal-backdrop translate-model-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <section
        id={id}
        ref={dialogRef}
        className="modal-surface translate-model-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="translate-model-dialog-header">
          <div>
            <h2 id={titleId}>{t.translate_models_title}</h2>
            <p id={descriptionId}>{t.translate_models_description}</p>
          </div>
          <Button
            size="sm"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            aria-label={t.translate_models_close}
            onClick={onCancel}
          >
            <XIcon />
          </Button>
        </header>

        <TranslationModelPicker
          models={draftModels}
          onChange={setDraftModels}
          onOpenSettings={handleOpenSettings}
        />

        <footer className="translate-model-dialog-footer">
          <p>
            <InfoCircleIcon />
            {t.translate_models_manual_notice}
          </p>
          <div>
            <Button
              size="md"
              shape="rect"
              variant="neutral"
              appearance="outline"
              onClick={onCancel}
            >
              {t.translate_models_cancel}
            </Button>
            <Button
              size="md"
              shape="rect"
              variant="primary"
              appearance="solid"
              disabled={!canApply}
              onClick={handleApply}
            >
              {t.translate_models_apply(draftModels.length)}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
