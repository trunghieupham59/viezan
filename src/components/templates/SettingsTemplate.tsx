import type { ReactNode, RefObject } from 'react'

export interface SettingsTemplateProps {
  sidebarNavigation: ReactNode
  compactNavigation: ReactNode
  scrollRef: RefObject<HTMLDivElement>
  children: ReactNode
}

/** Layout-only shell for settings navigation and independently scrollable content. */
export function SettingsTemplate({
  sidebarNavigation,
  compactNavigation,
  scrollRef,
  children,
}: SettingsTemplateProps) {
  return (
    <div className="settings-shell flex flex-col md:grid">
      <aside className="hidden md:flex min-h-0 flex-col">{sidebarNavigation}</aside>
      <div className="flex min-h-0 flex-col">
        <div className="md:hidden border-b">{compactNavigation}</div>
        <div ref={scrollRef} className="settings-scroll-viewport flex-1 min-h-0 overflow-auto">
          <div className="max-w-3xl mx-auto px-4 py-5 md:px-6 md:py-6 space-y-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
