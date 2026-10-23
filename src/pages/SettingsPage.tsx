import { type ElementType, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SettingsNavigation } from '../components/organisms'
import { SettingsTemplate } from '../components/templates'
import {
  ChatBubbleIcon,
  GearIcon,
  InfoCircleIcon,
  KeyboardIcon,
  KeyIcon,
  LayersIcon,
  MicrophoneIcon,
  MonitorIcon,
  PaletteIcon,
  RefreshIcon,
  SpeakerIcon,
} from '../components/ui/icons'
import { useAppStore, useT } from '../store/useAppStore'
import { AboutSection } from './settings/AboutSection'
import { ApiKeysSection } from './settings/ApiKeysSection'
import { AppearanceSection } from './settings/AppearanceSection'
import { BrowserIntegrationSection } from './settings/BrowserIntegrationSection'
import { ChatPresetsSection } from './settings/ChatPresetsSection'
import { HotkeySection } from './settings/HotkeySection'
import { ModulesSection } from './settings/ModulesSection'
import { PreferencesSection } from './settings/PreferencesSection'
import { SttSection } from './settings/SttSection'
import { TtsSection } from './settings/TtsSection'
import { UpdaterSection } from './settings/UpdaterSection'

type SettingsSectionId =
  | 'preferences'
  | 'modules'
  | 'appearance'
  | 'api'
  | 'stt'
  | 'tts'
  | 'chat'
  | 'hotkeys'
  | 'browser'
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
const MemoSttSection = memo(SttSection)
const MemoTtsSection = memo(TtsSection)
const MemoChatPresetsSection = memo(ChatPresetsSection)
const MemoHotkeySection = memo(HotkeySection)
const MemoBrowserIntegrationSection = memo(BrowserIntegrationSection)
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
    stt: null,
    tts: null,
    hotkeys: null,
    browser: null,
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
      id: 'modules',
      label: t.settings_modules_section,
      description: t.settings_modules_section_desc,
      Icon: LayersIcon,
      Component: MemoModulesSection,
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
      id: 'stt',
      label: t.settings_stt_section,
      description: t.settings_stt_section_desc,
      Icon: MicrophoneIcon,
      Component: MemoSttSection,
    },
    {
      id: 'tts',
      label: t.settings_tts_section,
      description: t.settings_tts_section_desc,
      Icon: SpeakerIcon,
      Component: MemoTtsSection,
    },
    {
      id: 'chat',
      label: t.settings_chat_section,
      description: t.settings_chat_section_desc,
      Icon: ChatBubbleIcon,
      Component: MemoChatPresetsSection,
    },
    {
      id: 'hotkeys',
      label: t.settings_hotkeys_nav,
      description: t.settings_hotkeys_nav_desc,
      Icon: KeyboardIcon,
      Component: MemoHotkeySection,
    },
    {
      id: 'browser',
      label: t.settings_extension_section,
      description: t.settings_extension_section_desc,
      Icon: MonitorIcon,
      Component: MemoBrowserIntegrationSection,
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
      const contentOrigin = sectionRefs.current.preferences?.offsetTop ?? 0
      const readingLine = root.scrollTop + root.clientHeight * ACTIVE_SECTION_LINE_RATIO
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 1
      let current = sections[0]?.id
      if (atBottom && root.scrollHeight > root.clientHeight) {
        current = sections[sections.length - 1]?.id
      } else {
        for (const section of sections) {
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
  }, [sections, updateActiveSection])

  const scrollToSection = useCallback((id: SettingsSectionId) => {
    updateActiveSection(id)
    const root = scrollRef.current
    const section = sectionRefs.current[id]
    if (!root || !section) return
    const contentOrigin = sectionRefs.current.preferences?.offsetTop ?? 0
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
    <SettingsTemplate
      scrollRef={scrollRef}
      sidebarNavigation={(
        <SettingsNavigation
          items={sections}
          activeId={activeSection}
          label={t.settings_title}
          mode="sidebar"
          onSelect={scrollToSection}
        />
      )}
      compactNavigation={(
        <SettingsNavigation
          items={sections}
          activeId={activeSection}
          label={t.settings_title}
          mode="tabs"
          onSelect={scrollToSection}
        />
      )}
    >
      {sections.map(({ id, label, Component }) => (
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
  )
}
