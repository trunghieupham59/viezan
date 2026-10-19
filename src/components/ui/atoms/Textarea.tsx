import { forwardRef, type TextareaHTMLAttributes } from 'react'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

/** Multi-line sibling of the Input atom: same border, radius, focus and error states. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({
  className = '',
  ...props
}, ref) {
  return (
    <textarea
      ref={ref}
      data-ui-control="textarea"
      className={`ui-input ui-textarea${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
})
