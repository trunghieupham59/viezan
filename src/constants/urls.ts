/**
 * External URL constants — centralised so repo renames or domain changes
 * only need to be updated in one place.
 */

/** GitHub Releases page — used on the "Download Extension" button. */
export const GITHUB_RELEASES_URL =
  'https://github.com/trunghieupham59/Viezan/releases/latest'

/**
 * macOS System Preferences deep-link to Screen Recording privacy settings.
 * HC-NEW-07: Moved from LiveTranslatePage.tsx inline constant to centralized urls.ts.
 */
export const MACOS_SCREEN_RECORDING_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

/** macOS System Settings deep-link to Accessibility privacy settings (Quick Translate keystrokes). */
export const MACOS_ACCESSIBILITY_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

/** macOS System Settings deep-link to Keyboard > Keyboard Shortcuts (where Spotlight's shortcut is turned off). */
export const MACOS_KEYBOARD_SHORTCUTS_PREFS =
  'x-apple.systempreferences:com.apple.Keyboard-Settings.extension?Shortcuts'

/** Jina AI homepage — used in ApiKeysSection for the web search docs link. */
export const JINA_DOCS_URL = 'https://jina.ai'

/** ElevenLabs — used in TtsSection for the API key link. */
export const ELEVENLABS_DOCS_URL = 'https://elevenlabs.io'

/** Groq Console — used in SttSection for the API key link. */
export const GROQ_CONSOLE_URL = 'https://console.groq.com'

/** Ollama download page — used by Local AI model install flow. */
export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'
