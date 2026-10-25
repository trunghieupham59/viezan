/**
 * SttSection — Speech-to-Text settings section.
 *
 * Lets users choose between four STT engines:
 *   - Auto (recommended) — Whisper → Gemini STT → Groq (free) smart routing
 *   - OpenAI Whisper      — highest accuracy, requires OpenAI key
 *   - Gemini STT          — uses Gemini API key, no extra GCP setup
 *   - Groq Whisper (Free) — whisper-large-v3-turbo, 28,800 sec/day, no credit card
 *
 * The selected provider is persisted in the Zustand store (sttProvider field).
 * The Groq API key is stored in the OS keychain — add it in the card below the selector.
 */
import { useEffect, useState } from 'react'
import { CredentialCard } from '../../components/ui/CredentialCard'
import { SelectField, SettingsRow, StatusLabel } from '../../components/ui/molecules'
import { GROQ_CONSOLE_URL } from '../../constants/urls'
import { useAppStore, useT } from '../../store/useAppStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import type { SttProvider } from '../../types'
import { tpl } from '../../utils/tpl'

// ─── Provider card definitions ────────────────────────────────────────────────

interface ProviderOption {
  id: SttProvider
  label: string
  description: string
  ready: boolean
  needsLabel: string
  note?: string
}

/**
 * The speech-recognition rows of Settings › Voice: the engine and the optional
 * Groq key. Rendered inside the Voice card next to the read-aloud rows.
 */
export function SttSection() {
  const keyStatus = useAppStore((state) => state.keyStatus)
  const sttProvider = useAppStore((state) => state.sttProvider)
  const setSttProvider = useAppStore((state) => state.setSttProvider)
  const bumpSttCredentialsRevision = useAppStore((state) => state.bumpSttCredentialsRevision)
  const t = useT()
  const hasOpenAIKey = keyStatus.openai
  const hasGeminiKey = keyStatus.gemini

  // ── Groq key state (optional free fallback — not in main keyStatus) ────────
  const [groqKeyExists,  setGroqKeyExists]  = useState(false)
  const [groqMasked,     setGroqMasked]     = useState<string | null>(null)
  const [groqInput,      setGroqInput]      = useState('')
  const [groqSaving,     setGroqSaving]     = useState(false)
  const notify = useNotificationStore((state) => state.notify)
  /** Save/delete outcomes go to the toast stack; one key so results never pile up. */
  const reportGroq = (message: string, ok: boolean) =>
    notify({ key: 'settings-groq-key', tone: ok ? 'success' : 'error', message })
  const [groqDeleting,   setGroqDeleting]   = useState(false)

  // Load Groq key status on mount
  useEffect(() => {
    if (!window.api) return
    window.api.keychain.get('groq')
      .then((result) => {
        setGroqKeyExists(result.exists ?? false)
        setGroqMasked(result.masked ?? null)
      })
      .catch(() => {/* ignore */})
  }, [])

  const handleSaveGroq = async () => {
    if (!groqInput.trim() || !window.api) return
    setGroqSaving(true)
    try {
      const saved = await window.api.keychain.save('groq', groqInput.trim())
      if (!saved.success) {
        reportGroq(saved.error ?? t.settings_stt_groq_failed, false)
        return
      }
      const updated = await window.api.keychain.get('groq')
      setGroqKeyExists(updated.exists ?? false)
      setGroqMasked(updated.masked ?? null)
      setGroqInput('')
      bumpSttCredentialsRevision()
      reportGroq(t.settings_stt_groq_saved, true)
    } catch (err) {
      reportGroq(err instanceof Error ? err.message : t.settings_stt_groq_failed, false)
    } finally {
      setGroqSaving(false)
    }
  }

  const handleDeleteGroq = async () => {
    if (!window.api || !window.confirm(tpl(t.settings_remove_key_confirm, { name: 'Groq' }))) return
    setGroqDeleting(true)
    try {
      const removed = await window.api.keychain.delete('groq')
      if (!removed.success) {
        reportGroq(t.settings_key_store_failed, false)
        return
      }
      setGroqKeyExists(false)
      setGroqMasked(null)
      setGroqInput('')
      bumpSttCredentialsRevision()
    } catch {
      reportGroq(t.settings_key_store_failed, false)
    } finally {
      setGroqDeleting(false)
    }
  }

  const providers: ProviderOption[] = [
    {
      id: 'auto',
      label: t.settings_stt_auto,
      description: t.settings_stt_auto_desc,
      ready: hasOpenAIKey || hasGeminiKey || groqKeyExists,
      needsLabel: t.settings_stt_needs_key,
    },
    {
      id: 'whisper',
      label: t.settings_stt_whisper,
      description: t.settings_stt_whisper_desc,
      ready: hasOpenAIKey,
      needsLabel: t.settings_stt_needs_key,
    },
    {
      id: 'google',
      label: t.settings_stt_google,
      description: t.settings_stt_google_desc,
      note: t.settings_stt_google_note,
      ready: hasGeminiKey,
      needsLabel: t.settings_stt_needs_gemini,
    },
    {
      id: 'groq',
      label: t.settings_stt_groq,
      description: t.settings_stt_groq_desc,
      ready: groqKeyExists,
      needsLabel: t.settings_stt_needs_groq,
    },
  ]
  const selected = providers.find((provider) => provider.id === sttProvider) ?? providers[0]

  return (
    <>
      <SettingsRow
        label={t.settings_stt_section}
        description={(
          <>
            {t.settings_stt_provider_desc}
            <span className="settings-row-hint">
              {selected.description}{selected.note ? ` ${selected.note}` : ''}
            </span>
          </>
        )}
      >
        <StatusLabel tone={selected.ready ? 'ok' : 'warning'}>
          {selected.ready ? t.settings_stt_ready : selected.needsLabel}
        </StatusLabel>
        <SelectField
          label={t.settings_stt_select_provider}
          value={sttProvider}
          options={providers.map((provider) => ({ value: provider.id, label: provider.label }))}
          onChange={(value) => setSttProvider(value as SttProvider)}
          className="settings-select-field"
        />
      </SettingsRow>

      <CredentialCard
        title={t.settings_stt_groq_key}
        docsLabel={t.settings_get_key}
        labels={{
          saved: t.settings_key_saved,
          edit: t.settings_key_edit,
          add: t.settings_key_add,
          empty: t.settings_no_key,
          invalid: t.settings_key_invalid,
          remove: t.settings_remove,
          verifying: t.settings_verifying,
          verified: t.settings_verified,
          tryAgain: t.settings_try_again,
          // The Groq key is stored as-is, never verified.
          submit: t.settings_key_save,
        }}
        inputValue={groqInput}
        maskedValue={groqMasked}
        placeholder={tpl(t.settings_key_placeholder_paste, { name: 'Groq' })}
        hasSecret={groqKeyExists}
        isBusy={groqSaving}
        isDeleting={groqDeleting}
        onOpenDocs={() => window.api?.openExternal(GROQ_CONSOLE_URL)}
        onInputChange={setGroqInput}
        onSubmit={handleSaveGroq}
        onDelete={handleDeleteGroq}
      />
    </>
  )
}
