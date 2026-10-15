import { type ElementType, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SettingsNavigation } from '../components/organisms'
import { SettingsTemplate } from '../components/templates'
import {
  ChatBubbleIcon,
  GearIcon,
  InfoCircleIcon,
  KeyIcon,
  MicrophoneIcon,
  MonitorIcon,
  RefreshIcon,
  SpeakerIcon,
  UploadIcon,
} from '../components/ui/icons'
import { useT } from '../store/useAppStore'
import { AboutSection } from './settings/AboutSection'
import { ApiKeysSection } from './settings/ApiKeysSection'
import { BrowserIntegrationSection } from './settings/BrowserIntegrationSection'
import { ChatPresetsSection } from './settings/ChatPresetsSection'
import { HotkeySection } from './settings/HotkeySection'
import { PreferencesSection } from './settings/PreferencesSection'
import { SttSection } from './settings/SttSection'
import { TtsSection } from './settings/TtsSection'
import { UpdaterSection } from './settings/UpdaterSection'

type SettingsSectionId =
  | 'preferences'
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

const MemoPreferencesSection = memo(PreferencesSection)
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

  const updateActiveSection = useCallback((id: SettingsSectionId) => {
    if (activeSectionRef.current === id) return
    activeSectionRef.current = id
    setActiveSection(id)
  }, [])

  const sections = useMemo<SettingsSection[]>(() => ([
    {
      id: 'preferences',
      label: t.settings_prefs,
      description: t.settings_translate_mode_desc,
      Icon: GearIcon,
      Component: MemoPreferencesSection,
    },
    {
      id: 'api',
      label: t.settings_api_keys,
      description: t.settings_subtitle,
      Icon: KeyIcon,
      Component: MemoApiKeysSection,
    },
    {
      id: 'stt',
      label: t.settings_stt_section,
      description: t.settings_stt_provider_desc,
      Icon: MicrophoneIcon,
      Component: MemoSttSection,
    },
    {
      id: 'tts',
      label: t.settings_tts_section,
      description: t.settings_tts_priority_desc,
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
      label: t.settings_hotkey_section,
      description: t.settings_hotkey_section_desc,
      Icon: UploadIcon,
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
      description: t.settings_about_footer,
      Icon: InfoCircleIcon,
      Component: MemoAboutSection,
    },
  ]), [t])

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

      const id = visible?.target.getAttribute('data-settings-section') as SettingsSectionId | null
      if (id) updateActiveSection(id)
    }, {
      root,
      rootMargin: '-18% 0px -62% 0px',
      threshold: [0.1, 0.3, 0.6],
    })

    sections.forEach((section) => {
      const node = sectionRefs.current[section.id]
      if (node) observer.observe(node)
    })

    return () => observer.disconnect()
  }, [sections, updateActiveSection])

  const scrollToSection = (id: SettingsSectionId) => {
    updateActiveSection(id)
    const root = scrollRef.current
    const section = sectionRefs.current[id]
    if (!root || !section) return
    const contentOrigin = sectionRefs.current.preferences?.offsetTop ?? 0
    const top = Math.max(0, section.offsetTop - contentOrigin)
    section.focus({ preventScroll: true })
    requestAnimationFrame(() => {
      if (scrollRef.current === root) root.scrollTop = top
    })
  }

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
