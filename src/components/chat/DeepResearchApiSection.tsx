/**
 * DeepResearchApiSection — Inline API key management for Deep Research providers.
 *
 * Shown inside the AI Config popup on ChatPage AND in the Settings App (ApiKeysSection).
 *
 * Provider priority (highest → lowest quality):
 *   1. Tavily   — Best for LLMs, requires key (app.tavily.com)
 *   2. Brave    — Good quality, requires key (api.search.brave.com)
 *   3. Jina AI  — Free forever, no key needed (default fallback)
 */
import { type ReactNode, useEffect, useState } from 'react'
import { useAppStore, useT } from '../../store/useAppStore'
import { tpl } from '../../utils/tpl'
import { CredentialCard } from '../ui/CredentialCard'
import { BraveSearchIcon, TavilyIcon } from '../ui/icons'

// ─── Provider config ──────────────────────────────────────────────────────────

interface WebSearchProviderConfig {
  id: 'tavily' | 'brave'
  name: string
  docsUrl: string
  icon: ReactNode
}

const WEB_SEARCH_PROVIDERS: WebSearchProviderConfig[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    docsUrl: 'https://app.tavily.com',
    icon: <TavilyIcon size={22} />,
  },
  {
    id: 'brave',
    name: 'Brave Search',
    docsUrl: 'https://api.search.brave.com',
    icon: <BraveSearchIcon size={22} />,
  },
]

// ─── Single provider card ─────────────────────────────────────────────────────

type VerifyStatus = 'idle' | 'verifying' | 'saving' | 'valid' | 'invalid'

interface KeyCardProps {
  provider: WebSearchProviderConfig
  onStatusChange: (exists: boolean) => void
}

function KeyCard({ provider, onStatusChange }: KeyCardProps) {
  const [masked, setMasked] = useState<string | null>(null)
  const [exists, setExists] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle')
  const [verifyMessage, setVerifyMessage] = useState('')

  const t = useT()
  const isVerifying = verifyStatus === 'verifying' || verifyStatus === 'saving'
  const isSuccess = verifyStatus === 'valid'
  const isError = verifyStatus === 'invalid'

  useEffect(() => {
    if (!window.api) return
    window.api.keychain.get(provider.id).then((res) => {
      const e = res.exists ?? false
      setExists(e)
      setMasked(res.masked ?? null)
      onStatusChange(e)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, onStatusChange])

  const handleVerify = async () => {
    const key = inputValue.trim()
    if (!key || !window.api) return
    setVerifyMessage('')

    // Step 1 — Verify the key
    if (typeof window.api.webSearchVerify === 'function') {
      setVerifyStatus('verifying')
      try {
        const verifyResult = await window.api.webSearchVerify({ provider: provider.id, apiKey: key })
        if (!verifyResult.valid) {
          setVerifyStatus('invalid')
          setVerifyMessage(verifyResult.error ?? t.settings_msg_invalid)
          return
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const isIpcMissing =
          msg.includes('not a function') ||
          msg.includes('No handler registered') ||
          msg.includes('undefined') ||
          msg.includes('ERR_IPC')
        if (!isIpcMissing) {
          setVerifyStatus('invalid')
          setVerifyMessage(msg || t.settings_msg_invalid)
          return
        }
        // IPC not available → fall through to save directly
      }
    }

    // Step 2 — Save to secure keychain
    setVerifyStatus('saving')
    try {
      const saved = await window.api.keychain.save(provider.id, key)
      if (!saved.success) {
        setVerifyStatus('invalid')
        setVerifyMessage(saved.error ?? t.settings_key_store_failed)
        return
      }
      const updated = await window.api.keychain.get(provider.id)
      const e = updated.exists ?? false
      setExists(e)
      setMasked(updated.masked ?? null)
      onStatusChange(e)
      setVerifyStatus('valid')
      setVerifyMessage(t.settings_msg_valid)
      setInputValue('')
      const VERIFY_STATUS_RESET_MS = 5_000  // Reset verify badge after 5s
      setTimeout(() => setVerifyStatus('idle'), VERIFY_STATUS_RESET_MS)
    } catch (err) {
      setVerifyStatus('invalid')
      setVerifyMessage(err instanceof Error ? err.message : t.settings_msg_invalid)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`${t.settings_remove} API key for ${provider.name}?`)) return
    setIsDeleting(true)
    setVerifyStatus('idle')
    setVerifyMessage('')
    setInputValue('')
    try {
      const removed = await window.api.keychain.delete(provider.id)
      if (!removed.success) {
        setVerifyStatus('invalid')
        setVerifyMessage(t.settings_key_store_failed)
        return
      }
      setExists(false)
      setMasked(null)
      onStatusChange(false)
    } catch {
      setVerifyStatus('invalid')
      setVerifyMessage(t.settings_key_store_failed)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <CredentialCard
      icon={provider.icon}
      title={provider.name}
      docsLabel={t.settings_get_key}
      labels={{
        saved: t.settings_key_saved,
        empty: t.settings_no_key,
        invalid: t.settings_key_invalid,
        remove: t.settings_remove,
        verifying: t.settings_verifying,
        verified: t.settings_verified,
        tryAgain: t.settings_try_again,
        submit: t.settings_verify_save,
      }}
      inputValue={inputValue}
      maskedValue={masked}
      placeholder={exists ? t.settings_key_placeholder_new : tpl(t.settings_key_placeholder_paste, { name: provider.name })}
      hasSecret={exists}
      isBusy={isVerifying}
      isSuccess={isSuccess}
      isError={isError}
      isDeleting={isDeleting}
      statusMessage={verifyMessage ? { text: verifyMessage, tone: isSuccess ? 'success' : 'error' } : undefined}
      onOpenDocs={() => window.api?.openExternal(provider.docsUrl)}
      onInputChange={setInputValue}
      onSubmit={handleVerify}
      onDelete={handleDelete}
      onStatusReset={() => {
        if (verifyStatus !== 'idle') setVerifyStatus('idle')
      }}
    />
  )
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function DeepResearchApiSection() {
  const { setHasTavilyKey, setHasBraveKey } = useAppStore()

  const statusHandlers: Record<'tavily' | 'brave', (exists: boolean) => void> = {
    tavily: setHasTavilyKey,
    brave: setHasBraveKey,
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Provider cards */}
      {WEB_SEARCH_PROVIDERS.map((provider) => (
        <KeyCard
          key={provider.id}
          provider={provider}
          onStatusChange={statusHandlers[provider.id]}
        />
      ))}

    </div>
  )
}
