/** Interactive elements a modal dialog should cycle focus through. */
export const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Keep Tab / Shift+Tab inside `container` by wrapping focus between its first and last
 * focusable controls. Call from a keydown handler; other keys are ignored.
 */
export function trapTabFocus(
  event: KeyboardEvent,
  container: HTMLElement | null,
  selector: string = FOCUSABLE_SELECTOR,
): void {
  if (event.key !== 'Tab') return
  // Selector lists can be matched group by group in some DOM implementations; order by DOM position.
  const controls = Array.from(container?.querySelectorAll<HTMLElement>(selector) ?? []).sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )
  if (controls.length === 0) return
  const firstControl = controls[0]
  const lastControl = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === firstControl) {
    event.preventDefault()
    lastControl.focus()
  } else if (!event.shiftKey && document.activeElement === lastControl) {
    event.preventDefault()
    firstControl.focus()
  }
}
