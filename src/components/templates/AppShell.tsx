import type { ReactNode } from 'react'

export interface AppShellProps {
  /** Persistent app-wide navigation rail. */
  primaryNavigation: ReactNode
  /** Interactive controls hosted in the draggable window header. */
  headerControls?: ReactNode
  /** Keeps header controls clear of native macOS traffic lights. */
  macWindowControls?: boolean
  /** Optional feature-specific navigation, such as AI Chat conversations. */
  contextSidebar?: ReactNode
  /** Feature controls remain visible when contextual navigation is hidden. */
  featureHeader?: ReactNode
  /** Page content selected by the application layer. */
  children: ReactNode
  /** Portals, dialogs, and command surfaces rendered above the page. */
  overlays?: ReactNode
  /**
   * Renders the app-owned title bar strip. The Electron window hides its
   * native title bar on macOS (traffic lights) and Windows (caption-button
   * overlay), so this strip is the draggable area behind those controls.
   */
  showTitlebar?: boolean
  /** Reveals the native macOS material behind chrome while the system theme is active. */
  useNativeMaterial?: boolean
}

/**
 * Layout-only template for the main Electron window.
 * State and feature selection stay in the page/application layer.
 */
export function AppShell({
  primaryNavigation,
  headerControls,
  macWindowControls = false,
  contextSidebar,
  featureHeader,
  children,
  overlays,
  showTitlebar = false,
  useNativeMaterial = false,
}: AppShellProps) {
  return (
    <div
      className="app-shell"
      data-window-material={useNativeMaterial ? 'native' : 'opaque'}
      data-titlebar={showTitlebar || headerControls ? 'app' : 'none'}
    >
      {(showTitlebar || headerControls) && (
        <>
          <div
            className="titlebar-drag app-titlebar-drag flex-shrink-0 w-full"
            data-mac-window-controls={macWindowControls}
          >
            {headerControls}
          </div>
          <div
            aria-hidden="true"
            className="app-titlebar-divider flex-shrink-0 w-full border-b"
          />
        </>
      )}

      <div className="app-body">
        {primaryNavigation}
        {featureHeader ? (
          // Contextual navigation runs the full height beside the feature; the
          // header covers only the feature column it controls.
          <div className="app-feature-workspace">
            {contextSidebar}
            <div className="app-feature-body">
              {featureHeader}
              <main className="app-main">{children}</main>
            </div>
          </div>
        ) : (
          <>
            {contextSidebar}
            <main className="app-main">{children}</main>
          </>
        )}
      </div>

      {overlays}
    </div>
  )
}
