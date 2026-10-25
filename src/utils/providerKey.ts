import { PROVIDERS } from '../constants/providers'
import type { Provider } from '../types'

/**
 * True only when the selected provider needs an API key and none is stored.
 * A local provider never needs one, so its users are not nagged about keys.
 */
export function selectedProviderMissingKey(selectedProvider: Provider, keyStatus: Partial<Record<Provider, boolean>>): boolean {
  const requiresKey = PROVIDERS.find((provider) => provider.id === selectedProvider)?.requiresApiKey !== false
  return requiresKey && !keyStatus[selectedProvider]
}
