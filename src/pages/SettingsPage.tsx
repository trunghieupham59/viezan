import { type ElementType, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SettingsNavigation } from '../components/organisms'
import { PageHeader, SettingsTemplate } from '../components/templates'
import {
  ChatBubbleIcon,
  GearIcon,
  InfoCircleIcon,
  KeyIcon,
  LayersIcon,
  MicrophoneIcon,
  PaletteIcon,
  RefreshIcon,
} from '../components/ui/icons'
import { FilterInput } from '../components/ui/molecules'
import { useAppStore, useT } from '../store/useAppStore'
import { AboutSection } from './settings/AboutSection'
import { ApiKeysSection } from './settings/ApiKeysSection'
import { AppearanceSection } from './settings/AppearanceSection'
import { ChatPresetsSection } from './settings/ChatPresetsSection'
import { ModulesSection } from './settings/ModulesSection'
import { PreferencesSection } from './settings/PreferencesSection'
import { UpdaterSection } from './settings/UpdaterSection'
import { VoiceSection } from './settings/VoiceSection'

type SettingsSectionId =
  | 'preferences'
  | 'appearance'
  | 'api'
  | 'voice'
  | 'chat'
  | 'modules'
  | 'updates'
  | 'about'

interface SettingsSection {
  id: SettingsSectionId
  label: string
  description: string
  Icon: ElementType<{ className?: string }>
  Component: ElementType
}

/** Fraction of the viewport height below which a section's top counts as "being read". */
const ACTIVE_SECTION_LINE_RATIO = 0.25
/** How long a nav click pins its entry while the viewport scrolls to it. */
const SCROLL_LOCK_MS = 600

const MemoPreferencesSection = memo(PreferencesSection)
const MemoAppearanceSection = memo(AppearanceSection)
const MemoModulesSection = memo(ModulesSection)
const MemoApiKeysSection = memo(ApiKeysSection)
const MemoVoiceSection = memo(VoiceSection)
const MemoChatPresetsSection = memo(ChatPresetsSection)
const MemoUpdaterSection = memo(UpdaterSection)
const MemoAboutSection = memo(AboutSection)

export function SettingsPage() {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<SettingsSectionId, HTMLElement | null>>({
    api: null,
    preferences: null,
    modules: null,
    appearance: null,
    voice: null,
    chat: null,
    updates: null,
    about: null,
  })
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('preferences')
  const activeSectionRef = useRef<SettingsSectionId>('preferences')
  const scrollLockUntilRef = useRef(0)

  const updateActiveSection = useCallback((id: SettingsSectionId) => {
    if (activeSectionRef.current === id) return
    activeSectionRef.current = id
    setActiveSection(id)
  }, [])

  const sections = useMemo<SettingsSection[]>(() => ([
    {
      id: 'preferences',
      label: t.settings_prefs,
      description: t.settings_prefs_desc,
      Icon: GearIcon,
      Component: MemoPreferencesSection,
    },
    {
      id: 'appearance',
      label: t.settings_appearance,
      description: t.settings_appearance_desc,
      Icon: PaletteIcon,
      Component: MemoAppearanceSection,
    },
    {
      id: 'api',
      label: t.settings_api_keys,
      description: t.settings_api_keys_desc,
      Icon: KeyIcon,
      Component: MemoApiKeysSection,
    },
    {
      id: 'voice',
      label: t.settings_voice_section,
      description: t.settings_voice_section_desc,
      Icon: MicrophoneIcon,
      Component: MemoVoiceSection,
    },
    {
      id: 'chat',
      label: t.settings_chat_section,
      description: t.settings_chat_section_desc,
      Icon: ChatBubbleIcon,
      Component: MemoChatPresetsSection,
    },
    {
      id: 'modules',
      label: t.settings_modules_section,
      description: t.settings_modules_section_desc,
      Icon: LayersIcon,
      Component: MemoModulesSection,
    },
    {
      id: 'updates',
      label: t.settings_update_section,
      description: t.settings_update_section_desc,
      Icon: RefreshIcon,
      Component: MemoUpdaterSection,
    },
    {
      id: 'about',
      label: t.settings_about,
      description: t.settings_about_desc,
      Icon: InfoCircleIcon,
      Component: MemoAboutSection,
    },
  ]), [t])

  // Search filters both the section list and the content; an empty query shows everything.
  const [query, setQuery] = useState('')
  const visibleSections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return sections
    return sections.filter((section) => `${section.label} ${section.description}`.toLocaleLowerCase().includes(needle))
  }, [query, sections])

  /**
   * Scroll-spy. The active entry is the last section whose top has crossed a
   * reading line a fixed fraction down the viewport, so the highlight follows
   * what the reader is looking at instead of whichever section happens to
   * intersect a narrow band the most. At the very bottom the last section wins
   * even when it is too short to reach the line.
   */
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    let frame = 0
    const syncActiveSection = () => {
      frame = 0
      if (scrollLockUntilRef.current > performance.now()) return
      const contentOrigin = (visibleSections[0] && sectionRefs.current[visibleSections[0].id]?.offsetTop) ?? 0
      const readingLine = root.scrollTop + root.clientHeight * ACTIVE_SECTION_LINE_RATIO
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1
      let current = visibleSections[0]?.id
      if (atBottom && root.scrollHeight > root.clientHeight) {
        current = visibleSections[visibleSections.length - 1]?.id
      } else {
        for (const section of visibleSections) {
          const node = sectionRefs.current[section.id]
          if (node && node.offsetTop - contentOrigin <= readingLine) current = section.id
        }
      }
      if (current) updateActiveSection(current)
    }
    const handleScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(syncActiveSection)
    }

    root.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', handleScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [visibleSections, updateActiveSection])

  const scrollToSection = useCallback((id: SettingsSectionId) => {
    updateActiveSection(id)
    const root = scrollRef.current
    const section = sectionRefs.current[id]
    if (!root || !section) return
    const first = scrollRef.current?.querySelector<HTMLElement>('[data-settings-section]')
    const contentOrigin = first?.offsetTop ?? 0
    const top = Math.max(0, section.offsetTop - contentOrigin)
    // Keep the chosen entry highlighted while the programmatic scroll settles,
    // otherwise a short target near the end would be re-assigned mid-scroll.
    scrollLockUntilRef.current = performance.now() + SCROLL_LOCK_MS
    section.focus({ preventScroll: true })
    requestAnimationFrame(() => {
      if (scrollRef.current === root) root.scrollTop = top
    })
  }, [updateActiveSection])

  const initialSection = useAppStore((state) => state.settingsInitialSection)
  useEffect(() => {
    if (initialSection) {
      scrollToSection(initialSection)
      useAppStore.setState({ settingsInitialSection: null })
    }
  }, [initialSection, scrollToSection])

  return (
    <div className="app-page relative">
      <div className="app-workspace">
        <div className="glass-panel flex-1 min-h-0 flex flex-col overflow-hidden">
          <PageHeader
            title={t.settings_title}
            actions={(
              <FilterInput
                size="sm"
                value={query}
                onValueChange={setQuery}
                placeholder={t.settings_search_placeholder}
                aria-label={t.settings_search_placeholder}
                clearLabel={t.settings_search_clear}
                wrapperClassName="settings-search"
              />
            )}
          />
          <div className="flex flex-1 min-h-0 flex-col">
            <SettingsTemplate
              scrollRef={scrollRef}
              sidebarNavigation={(
                <SettingsNavigation
                  items={visibleSections}
                  activeId={activeSection}
                  label={t.settings_title}
                  mode="sidebar"
                  onSelect={scrollToSection}
                />
              )}
              compactNavigation={(
                <SettingsNavigation
                  items={visibleSections}
                  activeId={activeSection}
                  label={t.settings_title}
                  mode="tabs"
                  onSelect={scrollToSection}
                />
              )}
            >
              {visibleSections.length === 0 && (
                <p className="settings-search-empty" role="status">{t.settings_search_empty}</p>
              )}
              {visibleSections.map(({ id, label, Component }) => (
                <section
                  key={id}
                  ref={(node) => { sectionRefs.current[id] = node }}
                  data-settings-section={id}
                  aria-label={label}
                  tabIndex={-1}
                >
                  <Component />
                </section>
              ))}
            </SettingsTemplate>
          </div>
        </div>
      </div>
    </div>
  )
}
