import type { HTMLAttributes } from 'react'

export type KeyCapProps = HTMLAttributes<HTMLElement>

/** Small visual key cap for keyboard hints, e.g. ⌘, ↵, Tab, Esc. */
export function KeyCap({ className = '', ...props }: KeyCapProps) {
  return <kbd className={`keyboard-key${className ? ` ${className}` : ''}`} {...props} />
}
