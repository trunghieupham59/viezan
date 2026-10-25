import type { Provider } from '../types'
import { ClaudeProviderIcon, GeminiProviderIcon, LocalProviderIcon, OpenAIProviderIcon, PROVIDER_BRAND_COLORS } from './ui/icons'

// SPLIT-ICON-01: SVG icon definitions moved to src/components/ui/icons/providers.tsx
// ProviderIcon.tsx now only holds the wrapper component and PROVIDER_COLORS map.

interface ProviderIconProps {
  provider: Provider
  size?: number
  className?: string
}

export function ProviderIcon({ provider, size = 20, className = '' }: ProviderIconProps) {
  return (
    <span className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      {provider === 'gemini' && <GeminiProviderIcon size={size} />}
      {provider === 'claude' && <ClaudeProviderIcon size={size} />}
      {provider === 'openai' && <OpenAIProviderIcon size={size} />}
      {provider === 'local' && <LocalProviderIcon size={size} />}
    </span>
  )
}

// Provider UI metadata. Surfaces stay neutral through the design tokens, so the
// only per-provider value is iconColor, the flat brand mark.
export const PROVIDER_COLORS: Record<Provider, { iconColor: string }> = {
  gemini: { iconColor: PROVIDER_BRAND_COLORS.gemini },
  claude: { iconColor: PROVIDER_BRAND_COLORS.claude },
  openai: { iconColor: PROVIDER_BRAND_COLORS.openai },
  local: { iconColor: PROVIDER_BRAND_COLORS.local },
}
