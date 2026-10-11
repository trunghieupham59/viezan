/**
 * Public API for app-level and feature-level UI sections.
 * Feature organisms remain in their existing folders while migration is in progress.
 */
export { AIChatSidebar } from './AIChatSidebar'
export { AIConfigurationPopover, type AIConfigurationPopoverProps } from './AIConfigurationPopover'
export { AIModelPickerField } from './AIModelPickerField'
export { CommandPalette } from './CommandPalette'
export { ChatAIConfiguration, type ChatAIConfigurationProps } from './chat/ChatAIConfiguration'
export {
  DictionaryAIConfiguration,
  type DictionaryAIConfigurationProps,
} from './dictionary/DictionaryAIConfiguration'
export {
  HistoryNavigation,
  type HistoryNavigationItem,
  type HistoryNavigationProps,
} from './HistoryNavigation'
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
export { PrimaryNavigationSidebar, PrimaryNavigationSidebar as Sidebar } from './PrimaryNavigationSidebar'
export {
  SettingsNavigation,
  type SettingsNavigationItem,
  type SettingsNavigationProps,
} from './SettingsNavigation'
export { TranslationComparisonPane } from './translate/TranslationComparisonPane'
export { TranslationControlsHeader } from './translate/TranslationControlsHeader'
export { TranslationLanguageControls } from './translate/TranslationLanguageControls'
export { TranslationModelPicker } from './translate/TranslationModelPicker'
export { TranslationResultPane } from './translate/TranslationResultPane'
export { TranslationSourcePane } from './translate/TranslationSourcePane'
export { TranslationSwapControl } from './translate/TranslationSwapControl'
