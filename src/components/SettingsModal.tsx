import { lazy, type KeyboardEvent as ReactKeyboardEvent, Suspense, useEffect, useRef } from 'react'
import { useAppStore, useT } from '../store/useAppStore'
import { Button } from './ui/atoms'
import { XIcon } from './ui/icons'
import { FeatureLoadingState } from './ui/molecules'

const SettingsPage = lazy(() => import('../pages/SettingsPage').then(module => ({ default: module.SettingsPage })))

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
}

export function SettingsModal() {
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const closeSettings = useAppStore((state) => state.closeSettings)
  const t = useT()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Close on Escape key (window-level — works for all keyboard users)
  useEffect(() => {
    if (!settingsOpen) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      const previousFocus = previousFocusRef.current
      previousFocusRef.current = null
      previousFocus?.focus()
    }
  }, [settingsOpen, closeSettings])

  if (!settingsOpen) return null

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = getFocusableElements(dialog)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: modal backdrop — Escape handled via window useEffect above
    <div
      className="modal-backdrop fixed inset-0 flex items-center justify-center"
      onClick={closeSettings}
    >
      <div
        ref={dialogRef}
        className="settings-modal-surface relative flex flex-col modal-surface overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        {/* Modal header */}
        <div className="modal-header flex items-center justify-between gap-4 px-5 py-3 border-b flex-shrink-0">
          <div className="min-w-0">
            <h1 id="settings-modal-title" className="reliability-page-title text-sm font-bold">{t.settings_title}</h1>
            <p className="reliability-page-subtitle mt-0.5 text-xs truncate">{t.settings_subtitle}</p>
          </div>
          <Button
            ref={closeButtonRef}
            size="sm"
            shape="icon"
            variant="neutral"
            appearance="ghost"
            onClick={closeSettings}
            aria-label={t.settings_close}
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0">
          <Suspense
            fallback={(
              <FeatureLoadingState
                label={t.route_loading(t.settings_title)}
                layout="list"
              />
            )}
          >
            <SettingsPage />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
