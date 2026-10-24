/**
 * Public API for app-level and feature-level UI sections.
 * Feature organisms remain in their existing folders while migration is in progress.
 */
export { AIChatSidebar } from './AIChatSidebar'
export { AIConfigurationPopover, type AIConfigurationPopoverProps } from './AIConfigurationPopover'
export { AIModelPickerField } from './AIModelPickerField'
export { CommandPalette } from './CommandPalette'
export { ChatAIConfiguration, type ChatAIConfigurationProps } from './chat/ChatAIConfiguration'
export { ChatTaskConfiguration } from './chat/ChatTaskConfiguration'
export {
  DictionaryAIConfiguration,
  type DictionaryAIConfigurationProps,
} from './dictionary/DictionaryAIConfiguration'
export { DictionaryEmptyState, type DictionaryEmptyStateProps } from './dictionary/DictionaryEmptyState'
export { DictionaryHistoryPanel, type DictionaryHistoryPanelProps } from './dictionary/DictionaryHistoryPanel'
export { DictionaryResultPanel, type DictionaryResultPanelProps } from './dictionary/DictionaryResultPanel'
export { DictionarySearchPanel, type DictionarySearchPanelProps } from './dictionary/DictionarySearchPanel'
export { LanguagePairBar, type LanguagePairBarDensity, type LanguagePairBarProps, type LanguagePairBarScope } from './LanguagePairBar'
export { LauncherShortcutNotice, type SystemShortcutOwner, systemShortcutOwnerLabel } from './LauncherShortcutNotice'
export { LauncherSpotlightPrompt } from './LauncherSpotlightPrompt'
export {
  InterpretAIConfiguration,
  type InterpretAIConfigurationProps,
} from './live/InterpretAIConfiguration'
export {
  InterpretSubtitleConfiguration,
  type InterpretSubtitleConfigurationProps,
  type SubtitleColorOption,
  type SubtitleFontSizeOption,
} from './live/InterpretSubtitleConfiguration'
export { LiveSessionHistoryPanel, type LiveSessionHistoryPanelProps } from './live/LiveSessionHistoryPanel'
export { LiveSessionStatus, type LiveSessionStatusProps } from './live/LiveSessionStatus'
export { NotificationViewport } from './NotificationViewport'
export { PrimaryNavigationSidebar, PrimaryNavigationSidebar as Sidebar } from './PrimaryNavigationSidebar'
export {
  SettingsNavigation,
  type SettingsNavigationItem,
  type SettingsNavigationProps,
} from './SettingsNavigation'
export { ThermalFanDisclaimer, type ThermalFanDisclaimerProps } from './thermal/ThermalFanDisclaimer'
export {
  DEFAULT_SENSOR_RULE,
  FAN_RPM_STEP,
  ThermalFanPanel,
  type ThermalFanPanelLabels,
  type ThermalFanPanelProps,
  type ThermalFanRawSensor,
  type ThermalFanSourceOption,
  type ThermalFanSources,
} from './thermal/ThermalFanPanel'
export { ThermalOptionsConfiguration, type ThermalOptionsConfigurationProps } from './thermal/ThermalOptionsConfiguration'
export { ThermalSensorTable, type ThermalSensorTableLabels, type ThermalSensorTableProps } from './thermal/ThermalSensorTable'
export { ThermalTrayOptions, type ThermalTrayOptionsLabels, type ThermalTrayOptionsProps } from './thermal/ThermalTrayOptions'
export { TranslationComparisonPane } from './translate/TranslationComparisonPane'
export { TranslationControlsHeader } from './translate/TranslationControlsHeader'
export { TranslationHistoryPanel, type TranslationHistoryPanelProps } from './translate/TranslationHistoryPanel'
export { TranslationModelPicker } from './translate/TranslationModelPicker'
export { TranslationResultPane } from './translate/TranslationResultPane'
export { TranslationSourcePane } from './translate/TranslationSourcePane'
export { UpdateNotification } from './UpdateNotification'
