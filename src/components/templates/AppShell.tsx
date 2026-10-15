import type { ReactNode } from 'react'

export interface AppShellProps {
  /** Persistent app-wide navigation rail. */
  primaryNavigation: ReactNode
  /** Optional feature-specific navigation, such as AI Chat conversations. */
  contextSidebar?: ReactNode
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
  contextSidebar,
  children,
  overlays,
  showTitlebar = false,
  useNativeMaterial = false,
}: AppShellProps) {
  return (
    <div
      className="app-shell"
      data-window-material={useNativeMaterial ? 'native' : 'opaque'}
      data-titlebar={showTitlebar ? 'app' : 'none'}
    >
      {showTitlebar && (
        <>
          <div
            aria-hidden="true"
            className="titlebar-drag app-titlebar-drag flex-shrink-0 w-full"
          />
          <div
            aria-hidden="true"
            className="app-titlebar-divider flex-shrink-0 w-full border-b"
          />
        </>
      )}

      <div className="app-body">
        {primaryNavigation}
        {contextSidebar}
        <main className="app-main">{children}</main>
      </div>

      {overlays}
    </div>
  )
}
