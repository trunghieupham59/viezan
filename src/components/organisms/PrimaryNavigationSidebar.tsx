import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_MODULES, type CatalogModule } from '../../modules/catalog'
import { useAppStore, useT } from '../../store/useAppStore'
import type { AppPage } from '../../types'
import { AppLogoIcon } from '../AppLogo'
import { Button } from '../ui/atoms'
import { GearIcon, SearchIcon, SidebarPanelIcon } from '../ui/icons'

interface PrimaryNavItemProps {
  icon: ReactNode
  label: string
  active?: boolean
  badge?: boolean
  badgeLabel?: string
  onClick: () => void
}

interface PrimaryNavigationOverlayPosition {
  top: number
  left: number
  height: number
}

const PRIMARY_NAVIGATION_NARROW_BREAKPOINT = 900
const CLOSE_PRIMARY_NAVIGATION_EVENT = 'viezan:close-primary-navigation'
const CLOSE_CONTEXT_SIDEBARS_EVENT = 'viezan:close-context-sidebars'

function PrimaryNavItem({ icon, label, active, badge, badgeLabel, onClick }: PrimaryNavItemProps) {
  const accessibleLabel = badge && badgeLabel ? `${label}: ${badgeLabel}` : label

  return (
    <Button
      size="lg"
      shape="rect"
      variant={active ? 'primary' : 'neutral'}
      appearance={active ? 'soft' : 'ghost'}
      onClick={onClick}
      title={label}
      aria-label={accessibleLabel}
      aria-current={active ? 'page' : undefined}
      className={`sidebar-nav-btn${active ? ' active' : ''}`}
    >
      <span className="sidebar-nav-icon">{icon}</span>
      <span className="sidebar-nav-label">{label}</span>
      {badge && (
        <span className="sidebar-nav-status" aria-hidden="true">
          <span className="sidebar-nav-badge" />
          <span className="sidebar-nav-status-label">{badgeLabel}</span>
        </span>
      )}
    </Button>
  )
}

/** Persistent app-wide navigation. Feature-specific navigation belongs elsewhere. */
export function PrimaryNavigationSidebar({ toggleHost }: { toggleHost: HTMLElement | null }) {
  const {
    activePage,
    setActivePage,
    clearTranslation,
    keyStatus,
    openSettings,
    sidebarCollapsed,
    toggleSidebar,
  } = useAppStore()
  const t = useT()
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [responsiveOverlayOpen, setResponsiveOverlayOpen] = useState(false)
  const [overlayPosition, setOverlayPosition] = useState<PrimaryNavigationOverlayPosition | null>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const contentId = useId()
  const hasAnyKey = Object.values(keyStatus).some(Boolean)
  const commandShortcut = window.api?.platform === 'darwin' ? '⌘K' : 'Ctrl K'
  const responsiveCompact = viewportWidth < PRIMARY_NAVIGATION_NARROW_BREAKPOINT
  const effectiveCollapsed = responsiveCompact ? !responsiveOverlayOpen : sidebarCollapsed
  const toggleLabel = effectiveCollapsed ? t.nav_expand_sidebar : t.nav_collapse_sidebar

  const updateOverlayPosition = useCallback(() => {
    const rect = sidebarRef.current?.getBoundingClientRect()
    if (!rect) return
    setOverlayPosition({ top: rect.top, left: rect.left, height: rect.height })
  }, [])

  const handleToggle = () => {
    if (!responsiveCompact) {
      toggleSidebar()
      return
    }
    if (!responsiveOverlayOpen) {
      updateOverlayPosition()
      window.dispatchEvent(new CustomEvent(CLOSE_CONTEXT_SIDEBARS_EVENT))
    }
    setResponsiveOverlayOpen((open) => !open)
  }

  const closeResponsiveOverlay = useCallback(() => setResponsiveOverlayOpen(false), [])

  const navigate = (page: AppPage, extra?: () => void) => {
    extra?.()
    setActivePage(page)
    closeResponsiveOverlay()
  }

  const navigateToModule = (module: CatalogModule) =>
    navigate(module.id, module.navigateEffect === 'clearTranslation' ? clearTranslation : undefined)

  const openCommandPalette = () => {
    closeResponsiveOverlay()
    window.dispatchEvent(new CustomEvent('viezan:open-command-palette'))
  }

  const handleOpenSettings = () => {
    closeResponsiveOverlay()
    openSettings()
  }

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!responsiveCompact) setResponsiveOverlayOpen(false)
  }, [responsiveCompact])

  useEffect(() => {
    const handleClose = () => setResponsiveOverlayOpen(false)
    window.addEventListener(CLOSE_PRIMARY_NAVIGATION_EVENT, handleClose)
    return () => window.removeEventListener(CLOSE_PRIMARY_NAVIGATION_EVENT, handleClose)
  }, [])

  useEffect(() => {
    if (!responsiveOverlayOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (sidebarRef.current?.contains(target) || panelRef.current?.contains(target)
        || toggleRef.current?.contains(target)) return
      closeResponsiveOverlay()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeResponsiveOverlay()
      requestAnimationFrame(() => toggleRef.current?.focus())
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeResponsiveOverlay, responsiveOverlayOpen])

  useEffect(() => {
    if (!responsiveOverlayOpen) return
    updateOverlayPosition()
    window.addEventListener('resize', updateOverlayPosition)
    window.addEventListener('scroll', updateOverlayPosition, true)
    return () => {
      window.removeEventListener('resize', updateOverlayPosition)
      window.removeEventListener('scroll', updateOverlayPosition, true)
    }
  }, [responsiveOverlayOpen, updateOverlayPosition])

  const toggle = (
    <Button
      ref={toggleRef}
      size="sm"
      shape="icon"
      variant="neutral"
      appearance="ghost"
      className="primary-navigation-toggle titlebar-no-drag"
      title={toggleLabel}
      aria-label={toggleLabel}
      aria-expanded={!effectiveCollapsed}
      aria-controls={contentId}
      onClick={handleToggle}
    >
      <SidebarPanelIcon className="h-4 w-4" action={effectiveCollapsed ? 'expand' : 'collapse'} />
    </Button>
  )

  const navigationPanel = (
    <div
      ref={panelRef}
      id={contentId}
      className="primary-navigation-panel"
      data-expanded={!effectiveCollapsed}
      data-overlay-open={responsiveOverlayOpen}
      style={responsiveOverlayOpen && overlayPosition ? {
        top: overlayPosition.top,
        left: overlayPosition.left,
        height: overlayPosition.height,
      } : undefined}
    >
      <div className="sidebar-brand-row">
        <div className="sidebar-brand-surface" title="Viezan">
          <AppLogoIcon size="sm" />
        </div>
        {!effectiveCollapsed && <span className="sidebar-brand-title">Viezan</span>}
      </div>

      <div className="app-sidebar-divider" />

      <div className="sidebar-nav-group">
        {APP_MODULES.map((module) => {
          const Icon = module.icon
          return (
            <PrimaryNavItem
              key={module.id}
              label={t[module.labelKey]}
              active={activePage === module.id}
              onClick={() => navigateToModule(module)}
              icon={<Icon className="h-[18px] w-[18px]" />}
            />
          )
        })}
      </div>

      <div className="sidebar-bottom-group">
        <Button
          size="lg"
          shape="rect"
          variant="neutral"
          appearance="ghost"
          title={`${t.nav_command_palette} (${commandShortcut})`}
          aria-label={t.nav_command_palette}
          className="sidebar-nav-btn"
          onClick={openCommandPalette}
        >
          <span className="sidebar-nav-icon">
            <SearchIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="sidebar-nav-label">{t.nav_command_palette}</span>
          <span className="sidebar-shortcut">{commandShortcut}</span>
        </Button>

        <div className="app-sidebar-divider" />

        <PrimaryNavItem
          label={t.nav_settings}
          badge={!hasAnyKey}
          badgeLabel={t.model_no_key}
          onClick={handleOpenSettings}
          icon={<GearIcon className="h-[18px] w-[18px]" />}
        />
      </div>
    </div>
  )

  return (
    <nav
      ref={sidebarRef}
      className="app-sidebar primary-navigation-sidebar"
      aria-label={t.nav_primary_sidebar}
      aria-owns={responsiveOverlayOpen ? contentId : undefined}
      data-collapsed={effectiveCollapsed}
      data-overlay-open={responsiveOverlayOpen}
      data-responsive-compact={responsiveCompact}
      data-user-collapsed={sidebarCollapsed}
      data-sidebar-scope="primary"
    >
      {toggleHost && createPortal(toggle, toggleHost)}
      {!responsiveOverlayOpen && navigationPanel}
      {responsiveOverlayOpen && overlayPosition && createPortal(
        <>
          <div
            className="primary-navigation-backdrop"
            aria-hidden="true"
            style={{ top: overlayPosition.top }}
          />
          {navigationPanel}
        </>,
        document.body,
      )}
    </nav>
  )
}
