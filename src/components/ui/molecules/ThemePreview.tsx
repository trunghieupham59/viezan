import '../../../styles/molecules.css'

export interface ThemePreviewLabels {
  /** Accessible description of the whole preview, e.g. "Preview of the Glass style". */
  label: string
  /** Mock header title inside the miniature window. */
  title: string
  assistant: string
  user: string
  placeholder: string
}

export interface ThemePreviewProps {
  /** Style preset id; painted through `data-theme`. */
  preset: string
  /** Mode to render, pinned locally through `data-mode` so it can differ from the window's. */
  dark: boolean
  /** Accent override id; omit or pass 'auto' to keep the preset's own accent. */
  accent?: string
  labels: ThemePreviewLabels
}

/**
 * Miniature Viezan window painted entirely by the preset's own tokens: title
 * bar, primary chrome with an active item, a chat exchange in the reading
 * type, and a composer with the accent send action. No colour lives here;
 * `data-theme` and `data-mode` select the token blocks in tokens.css.
 */
export function ThemePreview({ preset, dark, accent, labels }: ThemePreviewProps) {
  return (
    <div
      className="theme-preview"
      data-theme={preset}
      data-mode={dark ? 'dark' : 'light'}
      data-accent={accent && accent !== 'auto' ? accent : undefined}
      role="img"
      aria-label={labels.label}
    >
      <div className="theme-preview-titlebar">
        <span className="theme-preview-traffic" />
        <span className="theme-preview-traffic" />
        <span className="theme-preview-traffic" />
      </div>
      <div className="theme-preview-body">
        <div className="theme-preview-sidebar">
          <span className="theme-preview-brand" />
          <span className="theme-preview-nav theme-preview-nav-active" />
          <span className="theme-preview-nav" />
          <span className="theme-preview-nav" />
          <span className="theme-preview-nav" />
        </div>
        <div className="theme-preview-canvas">
          <div className="theme-preview-header">
            <span className="theme-preview-header-title">{labels.title}</span>
            <span className="theme-preview-header-action" />
          </div>
          <div className="theme-preview-messages">
            <div className="theme-preview-bubble theme-preview-bubble-assistant">{labels.assistant}</div>
            <div className="theme-preview-bubble theme-preview-bubble-user">{labels.user}</div>
          </div>
          <div className="theme-preview-composer">
            <span className="theme-preview-placeholder">{labels.placeholder}</span>
            <span className="theme-preview-send" />
          </div>
        </div>
      </div>
    </div>
  )
}
